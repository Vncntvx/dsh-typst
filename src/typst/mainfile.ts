/**
 * Main-file discovery: scan the workspace for `.typ` files and pick the one
 * the user would pass to `typst compile`. Ported from the ZCode
 * typst-workbench server (0.2.0) `src/domain/project.ts`. Host half only.
 *
 * The index is bounded (directories, entries, realpath-visited directories)
 * and yields per-directory additions instead of ever-growing copies. A
 * symlinked directory is followed once when its real target is inside the
 * workspace; a symlinked `.typ` file is a candidate only when its real target
 * is inside the workspace, so an external link cannot become a candidate.
 * @module dsh-typst/typst/mainfile
 */

import { readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { isWithin } from "../workspace/containment.js";

const SKIP = new Set([
  "node_modules",
  "target",
  "__pycache__",
  "venv",
  "build",
  "dist",
]);

/** Directory and entry budgets; a pathological tree stops with `truncated`. */
const MAX_DIRS = 5_000;
const MAX_ENTRIES = 100_000;

/**
 * Pick the main file: a remembered choice, `main.typ`, the only top-level
 * file, the shallowest `main.typ`, or — when there is exactly one candidate —
 * that file. `null` means the panel should ask.
 * @param candidates - workspace-relative `.typ` paths.
 * @param remembered - the previously chosen main file for this workspace.
 */
export function chooseMain(
  candidates: string[],
  remembered: string | null,
): string | null {
  if (remembered && candidates.includes(remembered)) return remembered;
  if (candidates.includes("main.typ")) return "main.typ";
  const top = candidates.filter((path) => !path.includes("/"));
  if (top.length === 1) return top[0];
  const mains = candidates.filter(
    (path) => path.split("/").pop() === "main.typ",
  );
  if (mains.length) {
    const shallowest = Math.min(...mains.map((path) => path.split("/").length));
    const atDepth = mains.filter(
      (path) => path.split("/").length === shallowest,
    );
    if (atDepth.length === 1) return atDepth[0];
  }
  if (candidates.length === 1) return candidates[0];
  return null;
}

/** One directory's contribution to the index. */
export interface IndexBatch {
  /** `.typ` files discovered in this directory. */
  added: string[];
  /** Entries inspected so far. */
  visited: number;
  /** Read errors so far (directory-relative). */
  errors: string[];
  /** True on the final batch (budget reached or the tree is exhausted). */
  done: boolean;
}

/**
 * Cancellable, bounded complete index.
 * @param root - workspace root to scan.
 * @param includeExcluded - reveal hidden directories and every skipped name.
 * @param signal - aborts the scan when the session is closed or superseded.
 * @param excludeDirs - extra directory names to skip, matched without case at any depth.
 */
export async function* indexTypFiles(
  root: string,
  includeExcluded: boolean,
  signal: AbortSignal,
  excludeDirs: readonly string[] = [],
): AsyncIterable<IndexBatch> {
  const realRoot = await realpath(root).catch(() => root);
  const skipped = new Set([
    ...SKIP,
    ...excludeDirs.map((name) => name.toLowerCase()),
  ]);
  const excluded = (name: string): boolean =>
    !includeExcluded &&
    (name.startsWith(".") || skipped.has(name.toLowerCase()));
  const visitedDirs = new Set<string>();
  const errors: string[] = [];
  const queue = [{ dir: root, rel: "" }];
  let head = 0;
  let visited = 0;
  let truncated = false;
  while (head < queue.length) {
    signal.throwIfAborted();
    if (queue.length > MAX_DIRS) {
      truncated = true;
      break;
    }
    const current = queue[head++]!;
    const realDir = await realpath(current.dir).catch(() => current.dir);
    if (visitedDirs.has(realDir)) continue;
    visitedDirs.add(realDir);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(current.dir, { withFileTypes: true });
    } catch (error) {
      errors.push(`${current.rel || "."}: ${String(error)}`);
      yield { added: [], visited, errors: [...errors], done: false };
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const added: string[] = [];
    for (const entry of entries) {
      signal.throwIfAborted();
      visited++;
      if (visited > MAX_ENTRIES) {
        truncated = true;
        break;
      }
      const path = current.rel ? `${current.rel}/${entry.name}` : entry.name;
      const absolute = join(current.dir, entry.name);
      if (entry.isDirectory()) {
        if (!excluded(entry.name)) queue.push({ dir: absolute, rel: path });
        continue;
      }
      if (entry.isSymbolicLink()) {
        const target = await stat(absolute).catch(() => null);
        const real = await realpath(absolute).catch(() => null);
        if (target?.isDirectory()) {
          if (
            real !== null &&
            isWithin(realRoot, real) &&
            !excluded(entry.name)
          )
            queue.push({ dir: absolute, rel: path });
        } else if (
          target?.isFile() &&
          entry.name.endsWith(".typ") &&
          real !== null &&
          isWithin(realRoot, real)
        ) {
          added.push(path);
        }
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".typ")) added.push(path);
    }
    yield { added, visited, errors: [...errors], done: truncated };
    if (truncated) return;
  }
  yield { added: [], visited, errors: [...errors], done: true };
}
