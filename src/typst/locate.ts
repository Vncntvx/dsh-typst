/**
 * Locating and version-checking the typst binary: the configured path, then
 * PATH, then common install locations, then the login shell (version
 * managers). Ported from the ZCode typst-workbench server (0.2.0)
 * `src/typst/locate.ts`. Host half only.
 * @module dsh-typst/typst/locate
 */

import { isAbsolute, join, resolve, sep } from "node:path";
import { MIN_TYPST } from "../constants.js";
import type { TypstSource } from "../contract.js";
import { findExecutable, isExecutable } from "../host/which.js";
import type { ProcessRunner } from "./process.js";

/** Parse `typst 0.13.1`-style version output. */
export function parseVersion(text: string): [number, number, number] | null {
  const match =
    /(?:^|\s)typst\s+v?(\d+)\.(\d+)\.(\d+)/i.exec(text) ??
    /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersion(
  a: readonly number[],
  b: readonly number[],
): number {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export const versionText = (version: readonly number[]): string =>
  version.join(".");

export function atLeast(version: string, required: readonly number[]): boolean {
  const parsed = version ? parseVersion(version) : null;
  return !!parsed && compareVersion(parsed, required) >= 0;
}

/** Common typst install directories per platform. */
export function commonDirs(
  platform: string,
  env: NodeJS.ProcessEnv,
  home: string,
): string[] {
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [
      join(local, "Microsoft", "WinGet", "Links"),
      join(local, "Programs", "typst"),
      join(home, ".cargo", "bin"),
      join(home, "scoop", "shims"),
      join(env.ProgramData ?? "C:\\ProgramData", "chocolatey", "bin"),
    ];
  }
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(home, ".cargo", "bin"),
    join(home, ".local", "bin"),
    join(home, "bin"),
    join(home, ".nix-profile", "bin"),
    "/run/current-system/sw/bin",
    "/nix/var/nix/profiles/default/bin",
    "/snap/bin",
    "/usr/bin",
  ];
}

/**
 * The directories the lookup covers, in report order (for the setup page's
 * "where we looked" list), `~`-abbreviated.
 */
export function searchedDirs(
  platform: string,
  env: NodeJS.ProcessEnv,
  home: string,
  arch: string = process.arch,
): string[] {
  const dirs = commonDirs(platform, env, home);
  const first =
    platform === "win32"
      ? [dirs[0], join(home, ".cargo", "bin")]
      : platform === "darwin"
        ? [
            arch === "arm64" ? "/opt/homebrew/bin" : "/usr/local/bin",
            join(home, ".cargo", "bin"),
          ]
        : [join(home, ".cargo", "bin"), join(home, ".local", "bin")];
  const ordered = [...new Set([...first, ...dirs])];
  return ordered.map((dir) =>
    home && dir.startsWith(home + sep) ? `~${dir.slice(home.length)}` : dir,
  );
}

/** Ask the login shell where typst is (mise/asdf and friends). */
async function fromShell(
  env: NodeJS.ProcessEnv,
  runner: ProcessRunner,
  cwd: string,
): Promise<string | null> {
  const shell = env.SHELL;
  if (!shell || process.platform === "win32") return null;
  for (const flags of ["-lc", "-ilc"]) {
    const result = await runner.run([shell, flags, "command -v typst"], {
      cwd,
      env: { SHELL: shell },
      timeoutMs: 4_000,
    });
    const line = result.stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .reverse()
      .find((entry) => isAbsolute(entry));
    if (line && (await isExecutable(line))) return line;
  }
  return null;
}

export type Toolchain =
  | { state: "ready"; path: string; source: TypstSource; version: string }
  | { state: "missing" }
  | {
      state: "too_old";
      path: string;
      source: TypstSource;
      version: string;
      error: string;
    }
  | { state: "error"; path?: string; source?: TypstSource; error: string };

export interface LocateOptions {
  /** The configured "Typst path" setting; wins when executable. */
  setting?: string;
  env?: NodeJS.ProcessEnv;
  platform?: string;
  home?: string;
  /** Directory list overriding the common defaults (tests). */
  common?: string[];
  /** Skip the login-shell probe (the panel's periodic recheck does). */
  shell?: boolean;
  /** The harness subprocess runner used for the version and login-shell probes. */
  process: ProcessRunner;
  /** Child working directory for those probes. */
  cwd?: string;
}

/**
 * Locate a usable typst and check its version.
 * @returns the toolchain state; `ready` carries path/source/version.
 */
export async function locateTypst(options: LocateOptions): Promise<Toolchain> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? env.HOME ?? env.USERPROFILE ?? "";
  let found: { path: string; source: TypstSource } | null = null;
  if (options.setting) {
    // A relative setting means "relative to this workspace", the directory
    // the typst child runs in, not to whatever cwd the Host process started in.
    const setting = isAbsolute(options.setting)
      ? options.setting
      : resolve(options.cwd ?? process.cwd(), options.setting);
    if (!(await isExecutable(setting, platform))) {
      return {
        state: "error",
        path: setting,
        source: "setting",
        error: `The Typst path in the plugin settings (${setting}) is not an executable file.`,
      };
    }
    found = { path: setting, source: "setting" };
  }
  const search = async (
    dirs: string[],
    source: TypstSource,
  ): Promise<typeof found> => {
    const path = await findExecutable("typst", dirs, { env, platform });
    return path === null ? null : { path, source };
  };
  found ??= await search([], "path");
  found ??= await search(
    options.common ?? commonDirs(platform, env, home),
    "common",
  );
  if (!found && options.shell !== false) {
    const path = await fromShell(
      env,
      options.process,
      options.cwd ?? process.cwd(),
    );
    if (path) found = { path, source: "shell" };
  }
  if (!found) return { state: "missing" };
  const result = await options.process.run([found.path, "--version"], {
    cwd: options.cwd ?? process.cwd(),
    timeoutMs: 10_000,
  });
  const version = parseVersion(`${result.stdout}\n${result.stderr}`);
  if (result.code !== 0 || !version) {
    return {
      state: "error",
      ...found,
      error: `\`${found.path} --version\` failed: ${(result.stderr || result.stdout).trim().slice(0, 300) || `exit code ${result.code}`}`,
    };
  }
  if (compareVersion(version, MIN_TYPST) < 0) {
    return {
      state: "too_old",
      ...found,
      version: versionText(version),
      error: `Typst ${versionText(version)} is older than ${versionText(MIN_TYPST)}.`,
    };
  }
  return { state: "ready", ...found, version: versionText(version) };
}
