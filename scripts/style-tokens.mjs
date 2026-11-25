/**
 * Regenerate the style-token snapshot the client style guard checks against.
 *
 * The browser half of this plugin owns no tokens: `ui-theme` publishes
 * `--dsw-*` (static palette, semantic aliases, typography, elevation, radius),
 * and feature CSS only consumes them. That contract is only enforceable
 * against a list of names, and the list lives upstream, so it is snapshotted
 * into `tests/fixtures/style-tokens.json` instead of being read at test time:
 * CI has no sibling checkout, and a missing list would turn the guard into a
 * no-op.
 *
 * The snapshot carries four facts:
 *
 * 1. `harness` — the pinned harness version the names were read from, so a
 *    version bump without a refresh fails the guard instead of silently
 *    validating against a stale palette.
 * 2. `dsw` — every `--dsw-*` the theme sheets define. Generated here.
 * 3. `dsh` — the runtime user-preference seams this plugin consumes. Host
 *    published, not statically defined, so hand-maintained: `--write` carries
 *    it over untouched. An entry is added deliberately, together with the host
 *    code that publishes it.
 * 4. `ds` — the host's base tokens (`--ds-*`, defined in `ui-theme/src/styles/
 *    base.css`). The motion and code-font families live here rather than in
 *    `--dsw-*`; generating them keeps `style-guard.mjs` from silently passing
 *    a misspelt `--ds-*` reference.
 *
 * Usage:
 *
 *   node scripts/style-tokens.mjs           # check the snapshot against upstream
 *   node scripts/style-tokens.mjs --write   # rewrite the `dsw` and `ds` halves
 *
 * The sheets come from the installed pinned `@deepseek-ai/dsh-client-ui-theme`
 * by default; a sibling checkout is used only when its version matches the
 * pin. `DSH_THEME_DIR` overrides the theme sheet directory explicitly. A
 * missing directory fails the check rather than writing an empty snapshot: an
 * empty allowlist would reject every token at once.
 * @module dsh-typst/scripts/style-tokens
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(root, "tests", "fixtures", "style-tokens.json");
const manifest = join(root, "package.json");
const require = createRequire(import.meta.url);
const harnessRoot =
  process.env.DSH_HARNESS_ROOT ?? join(root, "..", "deepseek-harness");
const siblingThemeDir = join(
  harnessRoot,
  "packages",
  "client",
  "ui-theme",
  "src",
  "styles",
);
const installedThemeDir = (() => {
  try {
    return join(
      dirname(require.resolve("@deepseek-ai/dsh-client-ui-theme/package.json")),
      "src",
      "styles",
    );
  } catch {
    return undefined;
  }
})();

/**
 * The version of the theme package the sheets actually come from. The pin is
 * what the manifest declares; this is the version on disk that supplied the
 * tokens. Recording the former under tokens read from the latter is how the
 * snapshot's version anchor silently becomes false.
 * @param themeDir - the theme's `src/styles` directory.
 * @returns the package version, or null when it cannot be read.
 */
export function themeVersion(themeDir) {
  try {
    const value = JSON.parse(
      readFileSync(join(themeDir, "..", "..", "package.json"), "utf8"),
    ).version;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The harness version the snapshot describes: the exact pin on the client
 * primitives, which is also the pin `scripts/harness-state.mjs` enforces for
 * every other `@deepseek-ai/dsh-*` line.
 * @param pkg - parsed `package.json`.
 * @returns the pinned version, or `''` when the line is absent.
 */
export function pinnedHarness(pkg) {
  return (
    pkg?.dependencies?.["@deepseek-ai/dsh-client-ui-theme"] ??
    pkg?.devDependencies?.["@deepseek-ai/dsh-client-ui-theme"] ??
    pkg?.dependencies?.["@deepseek-ai/dsh-client-ui-primitives"] ??
    pkg?.devDependencies?.["@deepseek-ai/dsh-client-ui-primitives"] ??
    ""
  );
}

/**
 * The theme sheet directories to try. An explicit `DSH_THEME_DIR` is the only
 * candidate then: a typo must fail instead of silently reading another
 * checkout. Otherwise a sibling checkout comes first, with the installed
 * pinned package as the fallback.
 * @param options - overrides for the environment, sibling and installed paths.
 * @returns the candidate directories, in priority order.
 */
export function themeDirCandidates({
  env = process.env.DSH_THEME_DIR,
  sibling = siblingThemeDir,
  installed = installedThemeDir,
} = {}) {
  if (env) return [env];
  return [sibling, installed].filter((dir) => dir !== undefined);
}

/**
 * The first candidate that exists on disk.
 * @param candidates - directories, in priority order.
 * @param exists - existence probe, for tests.
 * @returns the first existing directory, or undefined.
 */
export function firstExisting(candidates, exists = existsSync) {
  return candidates.find((dir) => exists(dir));
}

/**
 * The theme directory the check should read.
 *
 * A sibling checkout is a development convenience, not an authority: when it
 * is ahead of the pin its sheets would describe a palette the plugin is not
 * pinned to, so such a sibling is skipped and the installed pinned package
 * supplies the names. An explicit `DSH_THEME_DIR` is never version-filtered —
 * the pin-drift guard below still refuses to record a mismatched source.
 * @param options - the pin, path overrides, and probes for tests.
 * @returns the directory to read, or undefined when none exists.
 */
export function resolveThemeDir({
  pin = "",
  env = process.env.DSH_THEME_DIR,
  sibling = siblingThemeDir,
  installed = installedThemeDir,
  exists = existsSync,
  version = themeVersion,
} = {}) {
  if (env) return firstExisting([env], exists);
  for (const dir of themeDirCandidates({ env, sibling, installed })) {
    if (!exists(dir)) continue;
    if (dir === sibling && pin !== "" && version(dir) !== pin) continue;
    return dir;
  }
  return undefined;
}

/**
 * Every custom property a stylesheet defines under one prefix.
 *
 * Commented-out definitions are not definitions: the sheets carry retired
 * tokens behind `/* … *\/` in a few places, and a name that only survives in a
 * comment would widen the allowlist for a token nothing publishes.
 * @param css - stylesheet source.
 * @param prefix - the namespace to collect, e.g. `--dsw-` or `--ds-`.
 * @returns the token names, `--` prefix included.
 */
export function collectThemeTokens(css, prefix = "--dsw-") {
  const live = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  return [...live.matchAll(new RegExp(`(${prefix}[a-z0-9-]+)\\s*:`, "g"))].map(
    (match) => match[1],
  );
}

/**
 * The sorted, de-duplicated token list across a directory of stylesheets.
 * @param read - one sheet's source by file name.
 * @param files - sheet file names.
 * @param prefix - the namespace to collect.
 * @returns every token the theme defines under that prefix.
 */
export function mergeThemeTokens(read, files, prefix = "--dsw-") {
  const tokens = new Set();
  for (const file of files)
    for (const token of collectThemeTokens(read(file), prefix))
      tokens.add(token);
  return [...tokens].sort();
}

/**
 * Compare the snapshot with upstream.
 * @param snapshotTokens - the committed list.
 * @param upstreamTokens - the list read from the theme sheets.
 * @returns missing and extra names, both empty when they agree.
 */
export function diffTokens(snapshotTokens, upstreamTokens) {
  const committed = new Set(snapshotTokens);
  const upstream = new Set(upstreamTokens);
  return {
    missing: [...upstream].filter((token) => !committed.has(token)).sort(),
    removed: [...committed].filter((token) => !upstream.has(token)).sort(),
  };
}

/**
 * The snapshot to write: the two generated token families, the pin they were
 * read under, and the hand-maintained seam list carried over from the current
 * file.
 * @param current - the committed snapshot, absent on first write.
 * @param facts - the pin and the freshly read token families.
 * @returns the snapshot object, keys in a stable order.
 */
export function snapshotOf(current, { harness, dsw, ds = [] }) {
  return { harness, dsw, dsh: [...(current?.dsh ?? [])], ds };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pin = pinnedHarness(JSON.parse(readFileSync(manifest, "utf8")));
  const candidates = themeDirCandidates();
  const themeDir = resolveThemeDir({ pin });
  let files;
  try {
    if (themeDir === undefined) throw new Error("no theme directory");
    files = readdirSync(themeDir)
      .filter((name) => name.endsWith(".css"))
      .sort();
  } catch {
    console.error(
      `style-tokens: no theme sheets; tried ${candidates.join(", ")}`,
    );
    console.error(
      "style-tokens: install @deepseek-ai/dsh-client-ui-theme or set DSH_THEME_DIR",
    );
    process.exit(1);
  }
  console.log(`style-tokens: theme sheets from ${themeDir}`);
  const actual = themeVersion(themeDir);
  const harness = actual ?? pin;
  if (
    actual !== null &&
    pin !== "" &&
    actual !== pin &&
    process.argv.includes("--write") &&
    !process.argv.includes("--allow-pin-drift")
  ) {
    console.error(
      `style-tokens: the theme on disk is ${actual}, the manifest pin is ${pin};` +
        " pass --allow-pin-drift to record the actual source version",
    );
    process.exit(1);
  }
  const read = (name) => readFileSync(join(themeDir, name), "utf8");
  const dsw = mergeThemeTokens(read, files);
  const ds = mergeThemeTokens(read, files, "--ds-");
  const current = (() => {
    try {
      return JSON.parse(readFileSync(fixture, "utf8"));
    } catch {
      return undefined;
    }
  })();
  if (process.argv.includes("--write")) {
    writeFileSync(
      fixture,
      `${JSON.stringify(snapshotOf(current, { harness, dsw, ds }), null, 2)}\n`,
    );
    console.log(
      `style-tokens: wrote ${dsw.length} dsw + ${ds.length} ds tokens from ${files.length} sheets`,
    );
  } else {
    const problems = [];
    if (current === undefined)
      problems.push("no snapshot; run node scripts/style-tokens.mjs --write");
    else {
      if (current.harness !== harness) {
        problems.push(
          `snapshot describes harness ${current.harness}, the pin is ${harness}`,
        );
      }
      for (const [label, committed, upstream] of [
        ["dsw", current.dsw ?? [], dsw],
        ["ds", current.ds ?? [], ds],
      ]) {
        const { missing, removed } = diffTokens(committed, upstream);
        if (missing.length > 0)
          problems.push(
            `${label}: ${missing.length} token(s) not in the snapshot: ${missing.join(", ")}`,
          );
        if (removed.length > 0)
          problems.push(
            `${label}: ${removed.length} token(s) gone upstream: ${removed.join(", ")}`,
          );
      }
    }
    if (problems.length > 0) {
      for (const problem of problems) console.error(`style-tokens: ${problem}`);
      console.error("style-tokens: run node scripts/style-tokens.mjs --write");
      process.exit(1);
    }
    console.log(
      `style-tokens ok: ${dsw.length} dsw + ${ds.length} ds tokens, harness ${harness}`,
    );
  }
}
