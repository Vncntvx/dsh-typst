/**
 * Locating and version-checking the typst binary: the configured path, then
 * PATH, then common install locations, then the login shell (version
 * managers). Ported from the ZCode typst-workbench server (0.2.0)
 * `src/typst/locate.ts`. Host half only.
 * @module dsh-typst/typst/locate
 */

import { spawn } from "node:child_process";
import { access, constants, stat } from "node:fs/promises";
import { delimiter, isAbsolute, join, sep } from "node:path";
import { MIN_TYPST } from "../constants.js";
import type { TypstSource } from "../contract.js";

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

async function executable(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    await access(
      path,
      process.platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Run a short-lived command to completion, capturing both streams. */
export function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let child: import("node:child_process").ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        code: null,
        stdout,
        stderr: error instanceof Error ? error.message : String(error),
        timedOut,
      });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs ?? 10_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk;
    });
    child.on("error", (error: Error) => {
      stderr += error.message;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** Ask the login shell where typst is (mise/asdf and friends). */
async function fromShell(env: NodeJS.ProcessEnv): Promise<string | null> {
  const shell = env.SHELL;
  if (!shell || process.platform === "win32") return null;
  for (const flags of ["-lc", "-ilc"]) {
    const result = await run(shell, [flags, "command -v typst"], {
      env,
      timeoutMs: 4_000,
    });
    const line = result.stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .reverse()
      .find((entry) => isAbsolute(entry));
    if (line && (await executable(line))) return line;
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
}

/**
 * Locate a usable typst and check its version.
 * @returns the toolchain state; `ready` carries path/source/version.
 */
export async function locateTypst(
  options: LocateOptions = {},
): Promise<Toolchain> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? env.HOME ?? env.USERPROFILE ?? "";
  const names =
    platform === "win32" ? ["typst.exe", "typst.cmd", "typst"] : ["typst"];
  let found: { path: string; source: TypstSource } | null = null;
  if (options.setting) {
    if (!(await executable(options.setting))) {
      return {
        state: "error",
        path: options.setting,
        source: "setting",
        error: `The Typst path in the plugin settings (${options.setting}) is not an executable file.`,
      };
    }
    found = { path: options.setting, source: "setting" };
  }
  const search = async (
    dirs: string[],
    source: TypstSource,
  ): Promise<typeof found> => {
    for (const dir of dirs) {
      for (const name of names) {
        const path = join(dir, name);
        if (dir && (await executable(path))) return { path, source };
      }
    }
    return null;
  };
  found ??= await search(
    (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean),
    "path",
  );
  found ??= await search(
    options.common ?? commonDirs(platform, env, home),
    "common",
  );
  if (!found && options.shell !== false) {
    const path = await fromShell(env);
    if (path) found = { path, source: "shell" };
  }
  if (!found) return { state: "missing" };
  const result = await run(found.path, ["--version"], {
    env,
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
