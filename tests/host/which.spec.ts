/**
 * One executable lookup serves both host facts and typst locating.
 * @module tests/host/which
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { findExecutable, isExecutable } from "../../src/host/which.js";
import { withTempDir } from "../unit/helpers/temp-dir.js";

it("searches PATH before the explicit directories", async () => {
  await withTempDir(async (root) => {
    const pathDir = join(root, "path");
    const extraDir = join(root, "extra");
    await mkdir(pathDir);
    await mkdir(extraDir);
    await writeFile(join(pathDir, "typst"), "", { mode: 0o755 });
    await writeFile(join(extraDir, "typst"), "", { mode: 0o755 });
    expect(
      await findExecutable("typst", [extraDir], {
        env: { PATH: pathDir },
        platform: "linux",
      }),
    ).toBe(join(pathDir, "typst"));
  });
});

it("uses the Windows executable suffixes", async () => {
  await withTempDir(async (root) => {
    await writeFile(join(root, "typst.exe"), "", { mode: 0o755 });
    expect(
      await findExecutable("typst", [], {
        env: { Path: root },
        platform: "win32",
      }),
    ).toBe(join(root, "typst.exe"));
  });
});

it("refuses a non-executable file and a directory", async () => {
  await withTempDir(async (root) => {
    const file = join(root, "typst");
    await writeFile(file, "", { mode: 0o644 });
    expect(await isExecutable(file, "linux")).toBe(false);
    expect(await isExecutable(root, "linux")).toBe(false);
    expect(
      await findExecutable("typst", [], {
        env: { PATH: root },
        platform: "linux",
      }),
    ).toBeNull();
  });
});
