/**
 * Real client-discovery smoke: proves that a clean install of the packed
 * tarball into a fresh dsh profile makes the web composition serve the
 * plugin's browser bundle (package resolution, `dsh.client` discovery,
 * `exports["./client"]`, tarball contents, and the ClientModuleRegistry)
 * without a browser.
 *
 * Steps: npm pack → temp profile → `dsh plugin --profile <name> add <tarball>` → `dsh web
 * --port 0` → read the boot token the CLI prints → exchange it for the page
 * cookie (instance auth gates the composition) → GET /
 * → parse the `globalThis["__DSH_BOOT__"]` manifest → assert the dsh-typst
 * → assert 200 and the __ModuleLoader__.load handoff → shutdown.
 *
 * Usage: node scripts/discovery-smoke.mjs [--dsh <dsh-binary>] [--home <dir>]
 * @module scripts/discovery-smoke
 */

import { execFile, execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  openSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { resolveHarnessRoot } from "./shared/harness-packages.mjs";
import { chromium } from "playwright";

/** The plugin id the boot graph must carry, derived from the package manifest. */
const PLUGIN_ID = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).name;

const execFileAsync = promisify(execFile);

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function argAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function resolveDsh() {
  const explicit = argAfter("--dsh");
  if (explicit !== undefined) return explicit;

  const harnessRoot = resolveHarnessRoot(PACKAGE_DIR);
  const siblingCli = join(harnessRoot, "apps/cli/lib/bin.js");
  if (existsSync(siblingCli)) {
    return siblingCli;
  }
  return "dsh";
}

const DSH = resolveDsh();
const artifactHome = argAfter("--home");
if (artifactHome) mkdirSync(artifactHome, { recursive: true });
// Every run installs into a fresh profile: a same-version tarball must never reuse npm's prior plugin tree.
const HOME = mkdtempSync(join(artifactHome ?? tmpdir(), "dsh-typst-home-"));
const PROFILE = "web"; // `dsh web` always boots the web profile
const ENV = { ...process.env, DSH_HOME: HOME };

function dshCommand(args) {
  if (DSH.endsWith(".js")) {
    return { command: process.execPath, args: [DSH, ...args] };
  }
  return { command: DSH, args };
}

function packPath() {
  const output = execFileSync(
    "npm",
    [
      "pack",
      "--silent",
      "--offline",
      "--ignore-scripts",
      "--pack-destination",
      HOME,
    ],
    {
      cwd: PACKAGE_DIR,
      encoding: "utf8",
    },
  );
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return resolve(HOME, lines[lines.length - 1]);
}

function sleep(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

async function fetchText(url, cookie) {
  const response = await fetch(url, {
    headers: cookie === undefined ? {} : { cookie },
  });
  if (!response.ok) throw new Error(`GET ${url} → HTTP ${response.status}`);
  return await response.text();
}

function extractBootGraph(html) {
  // The webserver injects the boot graph as `globalThis["__DSH_BOOT__"] = …`
  // (the `window.` spelling is only a browser-side read alias).
  const match = /globalThis\["__DSH_BOOT__"\]\s*=\s*(\{[\s\S]*?\})\s*<\//.exec(
    html,
  );
  if (match === null)
    throw new Error("index HTML carries no __DSH_BOOT__ manifest");
  // The host escapes '<' inside the injected script as '\\u003c' so plugin
  // strings cannot break out of the script element; JSON.parse expects the
  // raw character.
  return JSON.parse(match[1].replaceAll("\\u003c", "<"));
}

/** Poll the boot log for the one-time token the web CLI prints on startup. */
async function waitForBootToken(home, attempts = 240) {
  const logPath = join(home, "dsh-web.log");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const match = /token=([A-Za-z0-9_-]+)/.exec(
        readFileSync(logPath, "utf8"),
      );
      if (match !== null) return match[1];
    } catch {
      // The log appears with the first boot output; retry until then.
    }
    await sleep(250);
  }
  throw new Error("dsh web printed no boot token within the probe window");
}

/** Exchange the one-time boot token for the page cookie every request carries. */
async function exchangeTokenForCookie(port, token) {
  const response = await fetch(`http://127.0.0.1:${port}/?token=${token}`, {
    redirect: "manual",
  });
  if (response.status !== 303) {
    throw new Error(`the boot token exchange returned HTTP ${response.status}`);
  }
  const [setCookie] = response.headers.getSetCookie();
  if (setCookie === undefined) {
    throw new Error("the boot token exchange set no page cookie");
  }
  return setCookie.split(";")[0];
}

async function waitForIndex(port, cookie, attempts = 240) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const text = await fetchText(`http://127.0.0.1:${port}/`, cookie);
      if (text.includes("__DSH_BOOT__")) return text;
    } catch {
      // The server is not listening yet; retry after a short delay.
    }
    await sleep(250);
  }
  throw new Error(
    `dsh web did not serve an index within the probe window on port ${port}`,
  );
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const port = server.address().port;
  await new Promise((resolveClose) => {
    server.close(resolveClose);
  });
  return port;
}

async function main() {
  const tarball = packPath();
  console.log(`packed: ${tarball}`);
  console.log(`home: ${HOME} (profile ${PROFILE})`);

  const add = dshCommand(["plugin", "--profile", PROFILE, "add", tarball]);
  await execFileAsync(add.command, add.args, { env: ENV });
  const documents = join(HOME, "Documents");
  const workspace = join(documents, "deepseek-harness", "default-workspace");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(
    join(workspace, "main.typ"),
    "= Preview smoke\nReadable selection text.\n#v(80mm)\n== Lower heading\nLower paragraph.\n#pagebreak()\n= Second page\nSecond page text.\n",
  );
  writeFileSync(
    join(workspace, "slides.typ"),
    "= Slides smoke\nA separate document.\n",
  );
  writeFileSync(
    join(HOME, "profiles", PROFILE, "cordis.patch.yml"),
    `- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(documents)}\n`,
  );

  // The reserved port can be stolen between reserve and bind; retry the whole
  // serve on EADDRINUSE instead of failing the run on a TOCTOU loss.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await serveOnce(await reservePort());
      break;
    } catch (error) {
      if (error?.code !== "EADDRINUSE" || attempt === 3) throw error;
      console.log(`port stolen (attempt ${attempt}); retrying on a fresh port`);
    }
  }

  try {
    rmSync(tarball, { force: true });
    if (artifactHome === undefined)
      rmSync(HOME, { recursive: true, force: true });
  } catch {
    // Best effort cleanup: a failed smoke run must not mask its own error.
  }
  console.log("discovery-smoke: passed");
}

async function serveOnce(port) {
  const logPath = join(HOME, "dsh-web.log");
  const logFd = openSync(logPath, "w");
  const web = dshCommand(["web", "--port", String(port), "--no-open"]);
  const child = spawn(web.command, web.args, {
    // Both pipes go to the log file: an undrained pipe deadlocks the child
    // once its boot output exceeds the pipe buffer.
    stdio: ["ignore", logFd, logFd],
    env: ENV,
  });
  const closed = new Promise((resolveClosed, rejectClosed) => {
    child.once("exit", resolveClosed);
    child.once("error", rejectClosed);
  });
  try {
    // The web CLI authenticates the composition behind a per-instance
    // token: the log carries the one-time token, the 303 exchanges it for the
    // page cookie, and every probe below rides that cookie.
    const token = await waitForBootToken(HOME);
    const cookie = await exchangeTokenForCookie(port, token);
    const html = await waitForIndex(port, cookie);
    const graph = extractBootGraph(html);
    const entry = graph.entries.find((candidate) => candidate.id === PLUGIN_ID);
    if (entry === undefined) {
      throw new Error(
        `__DSH_BOOT__ has no ${PLUGIN_ID} row; entries: ${graph.entries.map((row) => row.id).join(", ")}`,
      );
    }
    // The boot graph composes content-addressed combo scripts: every
    // entry row carries the revisioned single-resource combo URL, and its id
    // must appear in a scheduling batch.
    if (
      !entry.url
        .replace(/^\//, "")
        .startsWith(`plugins/??${PLUGIN_ID}/client.js&rev=`)
    ) {
      throw new Error(`unexpected bundle url: ${entry.url}`);
    }
    if (
      !Array.isArray(graph.batches) ||
      !graph.batches.some(
        (batch) =>
          Array.isArray(batch.entries) && batch.entries.includes(PLUGIN_ID),
      )
    ) {
      throw new Error(`__DSH_BOOT__ schedules no batch entry for ${PLUGIN_ID}`);
    }
    const baseUrl = new URL(`http://127.0.0.1:${port}/`);
    const bundleUrl = new URL(entry.url, baseUrl);
    if (bundleUrl.origin !== baseUrl.origin) {
      throw new Error(`bundle url leaves the local server: ${entry.url}`);
    }
    const bundle = await fetchText(bundleUrl.href, cookie);
    if (!bundle.includes("__ModuleLoader__.load")) {
      throw new Error(
        "the served bundle does not carry the __ModuleLoader__.load handoff",
      );
    }
    if (process.argv.includes("--browser")) await verifyBrowser(port, cookie);
    console.log(`discovery ok: ${entry.url}`);
  } finally {
    try {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGTERM");
    } catch {
      // The child already failed to spawn; `closed` below carries the error.
    }
    try {
      await closed;
    } finally {
      try {
        closeSync(logFd);
      } catch {
        // Best effort: the log fd must not leak even when the child failed.
      }
    }
  }
  // Attribute a dead child: a stolen port reads as EADDRINUSE in the log and
  // retries on a fresh port; anything else fails the run as-is.
  if (child.exitCode !== null && child.exitCode !== 0) {
    let log = "";
    try {
      log = readFileSync(logPath, "utf8");
    } catch {
      // No log to attribute with; fall through to the generic failure below.
    }
    if (log.includes("EADDRINUSE")) {
      const stolen = new Error(
        `dsh web could not bind port ${port} (EADDRINUSE)`,
      );
      stolen.code = "EADDRINUSE";
      throw stolen;
    }
    throw new Error(
      `dsh web exited with code ${child.exitCode} before serving`,
    );
  }
}

async function verifyBrowser(port, cookie) {
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext();
  const [cookieName, ...cookieParts] = cookie.split("=");
  await browserContext.addCookies([
    {
      name: cookieName,
      value: cookieParts.join("="),
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
  const page = await browserContext.newPage();
  const pageErrors = [];
  const requests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("request", (request) => requests.push(request.url()));
  try {
    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "domcontentloaded",
    });
    const notice = page.getByRole("button", { name: "Continue", exact: true });
    await notice.waitFor({ state: "visible", timeout: 20_000 });
    await notice.click();
    await notice.waitFor({ state: "hidden" });
    const welcome = page.getByRole("dialog").filter({
      has: page.getByRole("button", { name: "Add API Key", exact: true }),
    });
    await welcome.waitFor({ state: "visible", timeout: 20_000 });
    await welcome.getByRole("button", { name: "Close", exact: true }).click();
    await page.screenshot({ path: join(HOME, "browser-initial.png") });
    const body = await page.locator("body").innerText();
    console.log(`browser initial: ${body.slice(0, 3000)}`);
    // The sidebar guide is the registered page-type entry, shared by every plugin tab.
    const workspace = page
      .getByText("Default workspace", { exact: true })
      .first();
    if (await workspace.count()) await workspace.click();
    await workspace.hover();
    await page
      .getByRole("button", {
        name: "New session in Default workspace",
        exact: true,
      })
      .click();
    const show = page.getByRole("button", {
      name: /open.*(panel|sidebar)|show.*(panel|sidebar)|expand.*(panel|sidebar)|展开.*侧|显示.*侧/i,
    });
    if (await show.count()) await show.first().click();
    console.log(
      "browser controls: " +
        JSON.stringify(
          await page.getByRole("button").evaluateAll((buttons) =>
            buttons.map((button) => ({
              text: button.textContent,
              aria: button.getAttribute("aria-label"),
              title: button.getAttribute("title"),
            })),
          ),
        ),
    );
    const typst = page.getByRole("button", { name: /Typst/ }).first();
    await typst.waitFor({ timeout: 20_000 });
    await typst.click();
    await page
      .locator("[data-preview-identity] canvas")
      .first()
      .waitFor({ timeout: 20_000 });
    await page.waitForFunction(() =>
      [...document.querySelectorAll("[data-preview-identity] canvas")].some(
        (canvas) => canvas.width > 0,
      ),
    );
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-preview-identity] span").length > 0,
    );
    if (!requests.some((url) => url.includes(`${PLUGIN_ID}/client.js`)))
      throw new Error("The browser did not load the packed Typst bundle.");
    await page.screenshot({ path: join(HOME, "browser-preview.png") });
    if (pageErrors.length > 0) {
      throw new Error(`browser page errors: ${pageErrors.join("; ")}`);
    }
    console.log(
      "browser composition ok: packed Typst bundle, Worker, canvas and text layer",
    );
  } catch (error) {
    await page.screenshot({ path: join(HOME, "browser-failure.png") });
    console.log(
      "browser failure body: " +
        (await page.locator("body").innerText()).slice(0, 5000),
    );
    console.log("browser errors: " + JSON.stringify(pageErrors));
    throw error;
  } finally {
    await browserContext.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`discovery-smoke: FAILED: ${error.message}`);
  process.exitCode = 1;
});
