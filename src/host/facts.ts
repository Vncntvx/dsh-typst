/**
 * Host facts for the setup page: OS name, architecture, and the package
 * managers that could install Typst. Probed once per session (and refreshed
 * when the setup page re-checks with the shell). Ported from the ZCode
 * typst-workbench server (0.2.0) `src/host/facts.ts`. Host half only.
 * @module dsh-typst/host/facts
 */

import { execFile } from "node:child_process";
import { access, constants, readFile, stat } from "node:fs/promises";
import { homedir, release } from "node:os";
import { delimiter, join, sep } from "node:path";
import type { HostFactsView, PackageManagerView } from "../contract.js";

function output(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout = 5_000,
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        command,
        args,
        { env, timeout, windowsHide: true },
        (error, stdout) => resolve(error ? null : String(stdout)),
      );
    } catch {
      resolve(null);
    }
  });
}

async function isExecutable(path: string, platform: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false;
    await access(path, platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(
  bin: string,
  dirs: string[],
  options: { env?: NodeJS.ProcessEnv; platform?: string } = {},
): Promise<string | null> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const names =
    platform === "win32" ? [`${bin}.exe`, `${bin}.cmd`, bin] : [bin];
  const path = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
  for (const dir of [...path, ...dirs]) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (await isExecutable(candidate, platform)) return candidate;
    }
  }
  return null;
}

function tilde(path: string, home: string): string {
  if (!home) return path;
  if (path === home) return "~";
  return path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path;
}

async function osName(
  platform: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (platform === "darwin") {
    const version = (
      await output("/usr/bin/sw_vers", ["-productVersion"], env)
    )?.trim();
    return version ? `macOS ${version}` : "macOS";
  }
  if (platform === "win32") {
    const [major, , build] = release().split(".").map(Number);
    return major === 10
      ? build >= 22_000
        ? "Windows 11"
        : "Windows 10"
      : `Windows ${release()}`;
  }
  if (platform === "linux") {
    const text = await readFile("/etc/os-release", "utf8").catch(() => "");
    const pretty = /^PRETTY_NAME="?([^"\n]+)"?/m.exec(text)?.[1];
    return pretty ?? "Linux";
  }
  return platform;
}

async function archName(
  platform: string,
  arch: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (platform === "darwin") {
    if (arch === "arm64") return "Apple silicon";
    const arm = (
      await output("/usr/sbin/sysctl", ["-n", "hw.optional.arm64"], env)
    )?.trim();
    return arm === "1" ? "Apple silicon" : "Intel";
  }
  return arch;
}

interface PmSpec {
  name: string;
  bin: string;
  dirs: string[];
  version?: { args: string[]; pattern: RegExp };
}

function packageManagers(
  platform: string,
  env: NodeJS.ProcessEnv,
  home: string,
): PmSpec[] {
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [
      {
        name: "winget",
        bin: "winget",
        dirs: [join(local, "Microsoft", "WindowsApps")],
      },
      { name: "Scoop", bin: "scoop", dirs: [join(home, "scoop", "shims")] },
      {
        name: "Chocolatey",
        bin: "choco",
        dirs: [join(env.ProgramData ?? "C:\\ProgramData", "chocolatey", "bin")],
      },
    ];
  }
  const brew: PmSpec = {
    name: "Homebrew",
    bin: "brew",
    dirs: [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/home/linuxbrew/.linuxbrew/bin",
      join(home, ".linuxbrew", "bin"),
    ],
    version: { args: ["--version"], pattern: /Homebrew\s+(\d+\.\d+\.\d+)/ },
  };
  if (platform !== "linux") return [brew];
  return [
    brew,
    { name: "apt", bin: "apt-get", dirs: ["/usr/bin"] },
    { name: "dnf", bin: "dnf", dirs: ["/usr/bin"] },
    { name: "pacman", bin: "pacman", dirs: ["/usr/bin"] },
    { name: "zypper", bin: "zypper", dirs: ["/usr/bin"] },
    { name: "snap", bin: "snap", dirs: ["/usr/bin", "/snap/bin"] },
    { name: "Flatpak", bin: "flatpak", dirs: ["/usr/bin"] },
  ];
}

/** Extra specs to probe alongside the platform defaults (cargo, for typst). */
export function cargoSpec(env: NodeJS.ProcessEnv): PmSpec {
  const home = env.HOME ?? env.USERPROFILE ?? "";
  return { name: "cargo", bin: "cargo", dirs: [join(home, ".cargo", "bin")] };
}

/**
 * Detect the host facts the setup page shows: OS, architecture, and every
 * package manager that could install Typst.
 */
export async function detectFacts(
  extra: PmSpec[] = [],
  options: {
    env?: NodeJS.ProcessEnv;
    platform?: string;
    home?: string;
    arch?: string;
  } = {},
): Promise<HostFactsView> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? env.HOME ?? env.USERPROFILE ?? homedir();
  const specs: PmSpec[] = [...packageManagers(platform, env, home), ...extra];
  const [name, arch, tools] = await Promise.all([
    osName(platform, env),
    archName(platform, options.arch ?? process.arch, env),
    Promise.all(
      specs.map(async (spec): Promise<PackageManagerView | null> => {
        const path = await findExecutable(spec.bin, spec.dirs, {
          env,
          platform,
        });
        if (!path) return null;
        const probe = spec.version;
        const text = probe ? await output(path, probe.args, env) : null;
        const version = text ? probe?.pattern.exec(text)?.[1] : undefined;
        return {
          name: spec.name,
          ...(version ? { version } : {}),
          path: tilde(path, home),
        };
      }),
    ),
  ]);
  const os =
    platform === "darwin"
      ? "macos"
      : platform === "win32"
        ? "windows"
        : platform === "linux"
          ? "linux"
          : "other";
  return {
    os,
    osName: name,
    arch,
    tools: tools.filter((tool) => tool !== null),
  };
}
