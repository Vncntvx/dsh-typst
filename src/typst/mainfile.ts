/**
 * Main-file discovery: scan the workspace for `.typ` files and pick the one
 * the user would pass to `typst compile`. Ported from the ZCode
 * typst-workbench server (0.2.0) `src/domain/project.ts`. Host half only.
 * @module dsh-typst/typst/mainfile
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKIP = new Set([
  "node_modules",
  "target",
  "__pycache__",
  "venv",
  "build",
  "dist",
]);

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

/** Cancellable complete index; exclusions are explicit rather than hidden scan limits. */
export async function* indexTypFiles(
  root: string,
  includeExcluded: boolean,
  signal: AbortSignal,
): AsyncIterable<{ files: string[]; visited: number; errors: string[] }> {
  const files: string[] = [];
  const errors: string[] = [];
  const queue = [{ dir: root, rel: "" }];
  let visited = 0;
  while (queue.length) {
    signal.throwIfAborted();
    const current = queue.shift()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(current.dir, { withFileTypes: true });
    } catch (error) {
      errors.push(`${current.rel || "."}: ${String(error)}`);
      yield { files: [...files], visited, errors: [...errors] };
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      signal.throwIfAborted();
      visited++;
      const path = current.rel ? `${current.rel}/${entry.name}` : entry.name;
      if (
        entry.isDirectory() &&
        (includeExcluded ||
          (!entry.name.startsWith(".") && !SKIP.has(entry.name)))
      )
        queue.push({ dir: join(current.dir, entry.name), rel: path });
      else if (
        (entry.isFile() || entry.isSymbolicLink()) &&
        entry.name.endsWith(".typ")
      )
        files.push(path);
      if (visited % 128 === 0)
        yield { files: [...files], visited, errors: [...errors] };
    }
    yield { files: [...files], visited, errors: [...errors] };
  }
}
