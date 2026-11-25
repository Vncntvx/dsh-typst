/**
 * Build-directory ownership. A workspace session's scratch tree lives under
 * `<dataDir>/build/<harness-pid>-<nonce>/` and carries an `owner.json` naming
 * the harness process that created it. Cleanup removes only directories whose
 * recorded owner is gone; a directory without a valid owner record stays in
 * place.
 *
 * The build root is shared across workspaces, so ownership is recorded per
 * directory and cleanup operates one directory at a time.
 * @module dsh-typst/typst/owners
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";

interface OwnerRecord {
  /** The harness process that created the directory. */
  pid: number;
  /** Creation time, for diagnostics only. */
  startedAt: string;
}

/** Whether a pid names a live process (EPERM still means it exists). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readOwner(path: string): Promise<OwnerRecord | null> {
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Partial<OwnerRecord>;
    if (
      typeof record.pid !== "number" ||
      !Number.isInteger(record.pid) ||
      record.pid <= 0
    )
      return null;
    return {
      pid: record.pid,
      startedAt:
        typeof record.startedAt === "string" ? record.startedAt : "unknown",
    };
  } catch {
    return null;
  }
}

/**
 * Remove build directories whose owner harness is gone. A directory owned by
 * this process or by another live process is never touched; a directory
 * without a valid owner record is left in place.
 * @param base - the shared `<dataDir>/build` root.
 * @param log - optional narration for a removed directory.
 */
export async function cleanupDeadBuildDirs(
  base: string,
  log?: (message: string) => void,
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    const owner = await readOwner(join(dir, "owner.json"));
    if (owner === null) continue;
    if (owner.pid === process.pid || alive(owner.pid)) continue;
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    log?.(`removed stale typst build directory ${entry.name}`);
  }
}

/**
 * Create this session's build directory under the shared root, after pruning
 * directories whose previous owners are gone.
 * @param dataDir - the plugin's private cache directory.
 * @param log - optional narration.
 * @returns the new directory, mode 0700, with a 0600 owner record.
 */
export async function makeBuildDir(
  dataDir: string,
  log?: (message: string) => void,
): Promise<string> {
  const base = join(dataDir, "build");
  await mkdir(base, { recursive: true, mode: 0o700 });
  await cleanupDeadBuildDirs(base, log);
  const dir = join(base, `${process.pid}-${randomBytes(6).toString("hex")}`);
  await mkdir(dir, { recursive: false, mode: 0o700 });
  const record: OwnerRecord = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  await writeFileAtomic(join(dir, "owner.json"), JSON.stringify(record), {
    mode: 0o600,
  });
  return dir;
}
