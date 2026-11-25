/**
 * The vendored framework floors are compared against the pinned tag, not a
 * sibling worktree that may be ahead of the pin.
 * @module tests/unit/harness-state
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { collectVendorProblems } from "../../scripts/harness-state.mjs";
import { withTempDir } from "./helpers/temp-dir.js";

const manifest = {
  devDependencies: { "@deepseek-ai/cordis": "^4.1.0" },
};

it("accepts a floor that matches the pin tag even when the worktree is ahead", async () => {
  await withTempDir(async (root) => {
    const dir = join(root, "vendor", "cordis");
    mkdirSync(dir, { recursive: true });
    const packages = new Map([["@deepseek-ai/cordis", dir]]);
    expect(
      collectVendorProblems(
        root,
        manifest,
        packages,
        "0.2.2-rc.5",
        () => "4.1.0",
      ),
    ).toEqual([]);
  });
});

it("reports a floor that disagrees with the pin tag", async () => {
  await withTempDir(async (root) => {
    const dir = join(root, "vendor", "cordis");
    mkdirSync(dir, { recursive: true });
    const packages = new Map([["@deepseek-ai/cordis", dir]]);
    expect(
      collectVendorProblems(
        root,
        manifest,
        packages,
        "0.2.2-rc.5",
        () => "4.2.0-alpha.1",
      ),
    ).toHaveLength(1);
  });
});

it("ignores a vendored package the sibling does not carry", async () => {
  await withTempDir(async (root) => {
    const packages = new Map<string, string>();
    expect(
      collectVendorProblems(
        root,
        manifest,
        packages,
        "0.2.2-rc.5",
        () => "4.1.0",
      ),
    ).toEqual([]);
  });
});
