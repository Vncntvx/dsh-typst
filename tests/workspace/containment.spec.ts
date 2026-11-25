/**
 * Canonical workspace containment: `..`-prefixed names, symlinked directories,
 * dangling symlinks, and absolute aliases resolve to the canonical path the
 * caller must use.
 * @module tests/workspace/containment
 */

import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isWithin, resolveInside } from "../../src/workspace/containment.js";

let base: string;
let root: string;
let outside: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "dsh-typst-containment-"));
  root = join(base, "workspace");
  outside = join(base, "outside");
  await mkdir(root, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(root, "main.typ"), "Hello");
  await writeFile(join(root, "..drafts.typ"), "dot dot");
  await writeFile(join(outside, "secret.typ"), "secret");
  await symlink(outside, join(root, "linked-dir"));
  await symlink(join(outside, "secret.typ"), join(root, "linked-file.typ"));
  await symlink(join(outside, "missing.pdf"), join(root, "dangling.pdf"));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("resolveInside", () => {
  it("returns the canonical path for an existing workspace file", async () => {
    const canonicalRoot = await realpath(root);
    const resolved = await resolveInside(canonicalRoot, join(root, "main.typ"));
    expect(resolved).toBe(join(canonicalRoot, "main.typ"));
  });

  it("accepts a filename that starts with two dots", async () => {
    const canonicalRoot = await realpath(root);
    const resolved = await resolveInside(
      canonicalRoot,
      join(root, "..drafts.typ"),
    );
    expect(isWithin(canonicalRoot, resolved)).toBe(true);
  });

  it("refuses a lexical parent escape", async () => {
    const canonicalRoot = await realpath(root);
    await expect(
      resolveInside(canonicalRoot, join(root, "..", "outside", "secret.typ")),
    ).rejects.toThrow(/outside the workspace/);
  });

  it("refuses a file through a symlinked directory outside the root", async () => {
    const canonicalRoot = await realpath(root);
    await expect(
      resolveInside(canonicalRoot, join(root, "linked-dir", "secret.typ")),
    ).rejects.toThrow(/outside the workspace/);
  });

  it("returns a dangling symlink's lexical in-root location", async () => {
    const canonicalRoot = await realpath(root);
    const resolved = await resolveInside(
      canonicalRoot,
      join(root, "dangling.pdf"),
    );
    expect(resolved).toBe(join(canonicalRoot, "dangling.pdf"));
  });

  it("accepts a nonexistent child of the root", async () => {
    const canonicalRoot = await realpath(root);
    const resolved = await resolveInside(
      canonicalRoot,
      join(root, "new", "file.pdf"),
    );
    expect(resolved).toBe(join(canonicalRoot, "new", "file.pdf"));
  });
});
