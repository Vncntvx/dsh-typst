/**
 * Publish the verified prebuilt artifact without dependency lifecycle code.
 *
 * Why this exists:
 * When users install this plugin from GitHub (`github:Vncntvx/dsh-typst`),
 * pnpm (>=10) executes the package's `prepare` script because source repos do
 * not commit `lib/`. However, pnpm blocks git-hosted dependencies from
 * executing lifecycle scripts by default (supply-chain security) unless
 * allowed in `allowBuilds`.
 *
 * The `release` branch (following main) and the `stable` branch (following
 * tag releases) carry the artifact the quality gate verified: `lib/`,
 * the manifest's declared files, a stripped manifest, and
 * `release-provenance.json`. Installing
 * `github:Vncntvx/dsh-typst#release` therefore requires zero build scripts and
 * zero `allowBuilds` approval, and the bytes on the branch are the bytes that
 * passed the install matrix.
 *
 * Local review: `npm run release:branch -- --dry-run`.
 * Publication: `--push --artifact <checked artifact directory>`.
 * @module scripts/publish-release-branch
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertReleaseAdvance,
  assertReleaseSource,
  assertReleaseTarget,
} from "./release-branch-guard.mjs";
import {
  prepareReleaseArtifact,
  verifyReleaseArtifact,
} from "./release-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string[]} args arguments to `git`.
 * @param {string} [cwd] working directory; defaults to the repo root.
 * @returns {string} trimmed stdout.
 */
function git(args, cwd = root) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  }).trim();
}

const args = process.argv.slice(2);

/**
 * @overload
 * @param {string} flag the flag whose value follows it.
 * @param {string} fallback the value when the flag is absent.
 * @returns {string}
 */
/**
 * @overload
 * @param {string} flag the flag whose value follows it.
 * @returns {string | undefined}
 */
/**
 * @param {string} flag the flag whose value follows it.
 * @param {string} [fallback] the value when the flag is absent.
 * @returns {string | undefined} the option value, when present.
 */
function option(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`Expected a value after ${flag}`);
  return value;
}

const sourceSha = option(
  "--source-sha",
  process.env.GITHUB_SHA ?? git(["rev-parse", "HEAD"]),
);
const branch = option("--branch", "release");
const remote = option("--remote", "origin");
const dryRun = args.includes("--dry-run");
const push = args.includes("--push") && !dryRun;
const artifact = option("--artifact");

assertReleaseTarget({
  branch,
  remote,
  remoteUrl: git(["remote", "get-url", remote]),
});
assertReleaseSource({
  actualSha: git(["rev-parse", "HEAD"]),
  expectedSha: /** @type {string} */ (sourceSha),
  status: git(["status", "--porcelain"]),
});
if (push && artifact === undefined)
  throw new Error(
    "Publication requires the artifact that passed the quality gate and the install matrix",
  );

const temporary = mkdtempSync(join(tmpdir(), "dsh-typst-release-"));

try {
  /** @type {import("./release-artifact.mjs").ReleaseArtifact} */
  let verified;
  if (artifact !== undefined) {
    verified = verifyReleaseArtifact(
      resolve(artifact),
      /** @type {string} */ (sourceSha),
    );
  } else {
    execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
    execFileSync("npm", ["run", "verify:pack"], {
      cwd: root,
      stdio: "inherit",
    });
    verified = prepareReleaseArtifact(
      join(temporary, "artifact"),
      /** @type {string} */ (sourceSha),
    );
  }
  assertReleaseSource({
    actualSha: git(["rev-parse", "HEAD"]),
    expectedSha: /** @type {string} */ (sourceSha),
    status: git(["status", "--porcelain"]),
  });

  if (dryRun) {
    console.log(
      `[release-branch] Verified ${verified.provenance.artifactDigest} from ${sourceSha}; no refs changed`,
    );
    process.exitCode = 0;
  } else {
    // Read the latest remote state before deciding advancement and use that
    // exact commit as the push lease; a concurrent publisher cannot be erased.
    const refs = git([
      "ls-remote",
      "--heads",
      remote,
      "refs/heads/main",
      `refs/heads/${branch}`,
    ]);
    const refMap = new Map(
      refs
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [sha, ref] = line.split(/\s+/);
          return [ref, sha];
        }),
    );
    const oldRelease = refMap.get(`refs/heads/${branch}`);
    const mainSha = refMap.get("refs/heads/main");
    if (!mainSha) throw new Error("The remote main branch is missing");
    git([
      "fetch",
      "--no-tags",
      remote,
      "main",
      ...(oldRelease ? [branch] : []),
    ]);
    let mainDescendsFromSource = false;
    try {
      git([
        "merge-base",
        "--is-ancestor",
        /** @type {string} */ (sourceSha),
        mainSha,
      ]);
      mainDescendsFromSource = true;
    } catch {}
    /** @type {import("./release-branch-guard.mjs").ReleaseChannelState | undefined} */
    let previous;
    if (oldRelease) {
      let present = false;
      try {
        git(["cat-file", "-e", `${oldRelease}:release-provenance.json`]);
        present = true;
      } catch {}
      if (present)
        previous = JSON.parse(
          git(["show", `${oldRelease}:release-provenance.json`]),
        );
    }
    let descends = false;
    if (previous) {
      try {
        git([
          "merge-base",
          "--is-ancestor",
          previous.sourceSha,
          /** @type {string} */ (sourceSha),
        ]);
        descends = true;
      } catch {}
    }
    assertReleaseAdvance({
      branch,
      sourceSha: /** @type {string} */ (sourceSha),
      mainSha,
      previous,
      sourceDescendsFromPrevious: descends,
      mainDescendsFromSource,
      artifactDigest: verified.provenance.artifactDigest,
    });
    if (previous !== undefined && !descends)
      console.log(
        `[release-branch] Reinitialized ${branch} after a main history rewrite`,
      );
    const stage = join(temporary, "repository");
    cpSync(verified.stage, stage, { recursive: true });
    git(["init", `--initial-branch=${branch}`], stage);
    git(["add", "--all"], stage);
    git(
      [
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=github-actions[bot]",
        "-c",
        "user.email=github-actions[bot]@users.noreply.github.com",
        "commit",
        "-m",
        `chore(release): prebuilt ${verified.provenance.packageVersion}\n\nSource: ${sourceSha}\nArtifact: ${verified.provenance.artifactDigest}`,
      ],
      stage,
    );
    if (push) {
      // The token is supplied only to this process by the final workflow step;
      // no install, build or npm command executes in this branch.
      const token = process.env.RELEASE_PUSH_TOKEN;
      const env = token
        ? {
            ...process.env,
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
            GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
          }
        : process.env;
      execFileSync(
        "git",
        [
          "push",
          `--force-with-lease=refs/heads/${branch}:${oldRelease ?? ""}`,
          git(["remote", "get-url", remote]),
          `HEAD:refs/heads/${branch}`,
        ],
        { cwd: stage, env, stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
      );
      console.log(
        `[release-branch] Published ${sourceSha} to ${branch} (${verified.provenance.artifactDigest})`,
      );
    } else
      console.log(
        `[release-branch] Verified commit ${git(["rev-parse", "HEAD"], stage)}; pass --push with the checked artifact to publish`,
      );
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
