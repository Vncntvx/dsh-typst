/**
 * Main-file discovery: workspace scan and the chooser.
 * @module tests/unit/mainfile
 */

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
    let files: string[] = [];
    for await (const batch of indexTypFiles(
      root,
      false,
      new AbortController().signal,
    ))
      files = batch.files;
    expect(files).toEqual(["main.typ", "slides.typ", "chapters/a.typ"]);
  });
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
