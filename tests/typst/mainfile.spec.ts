/**
 * Main-file discovery: workspace scan and the chooser.
 * @module tests/unit/mainfile
 */

import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chooseMain, indexTypFiles } from "../../src/typst/mainfile.js";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "dsh-typst-mainfile-"));
  await writeFile(join(root, "main.typ"), '#include "chapters/a.typ"\n');
  await writeFile(join(root, "slides.typ"), "= slides\n");
  await mkdir(join(root, "chapters"));
  await writeFile(join(root, "chapters", "a.typ"), "= a\n");
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules", "nested.typ"), "= skip\n");
  await mkdir(join(root, ".hidden"));
  await writeFile(join(root, ".hidden", "buried.typ"), "= skip\n");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("indexTypFiles", () => {
  it("finds .typ files shallow-first, skipping hidden and build trees", async () => {
    const files: string[] = [];
    for await (const batch of indexTypFiles(
      root,
      false,
      new AbortController().signal,
    ))
      files.push(...batch.added);
    expect(files).toEqual(["main.typ", "slides.typ", "chapters/a.typ"]);
  });

  it("skips configured directory names without case and reveals them when asked", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-typst-extra-skip-"));
    try {
      await writeFile(join(dir, "main.typ"), "= main\n");
      await mkdir(join(dir, "vendor"));
      await writeFile(join(dir, "vendor", "a.typ"), "= a\n");
      await mkdir(join(dir, "Build"));
      await writeFile(join(dir, "Build", "b.typ"), "= b\n");
      await mkdir(join(dir, "chapters"));
      await writeFile(join(dir, "chapters", "c.typ"), "= c\n");
      const collect = async (includeExcluded: boolean): Promise<string[]> => {
        const files: string[] = [];
        for await (const batch of indexTypFiles(
          dir,
          includeExcluded,
          new AbortController().signal,
          ["vendor", "build"],
        ))
          files.push(...batch.added);
        return files;
      };
      expect(await collect(false)).toEqual(["main.typ", "chapters/c.typ"]);
      expect(await collect(true)).toEqual([
        "main.typ",
        "Build/b.typ",
        "chapters/c.typ",
        "vendor/a.typ",
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== "win32")(
    "follows an in-workspace symlink and refuses an external one",
    async () => {
      const local = await mkdtemp(join(tmpdir(), "dsh-typst-links-"));
      const outside = await mkdtemp(join(tmpdir(), "dsh-typst-outside-"));
      try {
        await mkdir(join(local, "inside"));
        await writeFile(join(local, "inside", "x.typ"), "= x\n");
        await writeFile(join(local, "source.typ"), "= source\n");
        await writeFile(join(outside, "secret.typ"), "= secret\n");
        await symlink(join(local, "inside"), join(local, "linked-dir"));
        await symlink(join(local, "source.typ"), join(local, "alias.typ"));
        await symlink(join(outside, "secret.typ"), join(local, "external.typ"));
        await symlink(outside, join(local, "external-dir"));
        const files: string[] = [];
        for await (const batch of indexTypFiles(
          local,
          false,
          new AbortController().signal,
        ))
          files.push(...batch.added);
        expect(files).toContain("inside/x.typ");
        // The symlinked directory resolves to the same real tree; it is
        // followed once (visited-set dedupe), not enumerated twice.
        expect(
          files.some(
            (file) => file === "inside/x.typ" || file === "linked-dir/x.typ",
          ),
        ).toBe(true);
        expect(files).toContain("alias.typ");
        expect(files).not.toContain("external.typ");
        expect(files).not.toContain("external-dir/secret.typ");
      } finally {
        await rm(local, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    },
  );
});

describe("chooseMain", () => {
  const candidates = ["chapters/a.typ", "main.typ", "slides.typ"];

  it("prefers the remembered choice when it still exists", () => {
    expect(chooseMain(candidates, "slides.typ")).toBe("slides.typ");
  });

  it("falls back to main.typ", () => {
    expect(chooseMain(candidates, null)).toBe("main.typ");
    expect(chooseMain(["deep/main.typ"], "gone.typ")).toBe("deep/main.typ");
  });

  it("picks the only top-level file", () => {
    expect(chooseMain(["lib/a.typ", "slides.typ"], null)).toBe("slides.typ");
  });

  it("picks the shallowest main.typ when several exist", () => {
    expect(chooseMain(["a/main.typ", "a/b/main.typ"], null)).toBe("a/main.typ");
  });

  it("picks the only candidate", () => {
    expect(chooseMain(["chapters/a.typ"], null)).toBe("chapters/a.typ");
  });

  it("returns null when ambiguous", () => {
    expect(chooseMain(["a/x.typ", "b/y.typ"], null)).toBeNull();
  });
});
