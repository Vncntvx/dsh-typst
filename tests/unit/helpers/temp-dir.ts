import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Run one case in a fresh directory and remove it afterwards.
 * @param run the case body, given the directory path.
 * @returns whatever the case body returns.
 */
export async function withTempDir<T>(
  run: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "dsh-typst-test-"));
  try {
    return await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
