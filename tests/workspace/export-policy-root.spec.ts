/**
 * PDF export policy roots: a policy may widen the session root, but every
 * declared root is canonicalized by the sandbox package and an invalid one
 * fails the export instead of being ignored.
 * @module tests/workspace/export-policy-root
 */

import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sessionFixture } from "./helpers/session.js";

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(
    scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function scratchDir(name: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), `typst-${name}-`));
  scratch.push(path);
  return path;
}

describe("typst_export_pdf policy roots", () => {
  it(
    "allows a target under the policy's workspace root when the session root is nested",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture();
      try {
        const result = await fixture.session.exportPdf(
          "out.pdf",
          {},
          undefined,
          {
            mode: "workspace-write",
            workspaceRoot: join(fixture.root, ".."),
          },
        );
        expect(result.ok).toBe(true);
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "refuses a session root the policy root does not cover (cd outside)",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture();
      const outside = await scratchDir("policy-root");
      try {
        await expect(
          fixture.session.exportPdf("out.pdf", {}, undefined, {
            mode: "workspace-write",
            workspaceRoot: outside,
          }),
        ).rejects.toMatchObject({ code: "TYPST_PATH_OUTSIDE_WORKSPACE" });
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "accepts a canonical additional writable root",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture();
      const outside = await scratchDir("policy-extra");
      try {
        const result = await fixture.session.exportPdf(
          "out.pdf",
          {},
          undefined,
          {
            mode: "workspace-write",
            workspaceRoot: outside,
            additionalWritableRoots: [fixture.root],
          },
        );
        expect(result.ok).toBe(true);
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "refuses a missing extra writable root instead of silently accepting it",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture();
      const missing = join(fixture.root, "missing-extra");
      try {
        await expect(
          fixture.session.exportPdf("out.pdf", {}, undefined, {
            mode: "workspace-write",
            workspaceRoot: fixture.root,
            additionalWritableRoots: [missing],
          }),
        ).rejects.toMatchObject({ code: "TYPST_SANDBOX_INVALID_ROOT" });
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "refuses an extra writable root that is a file",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture();
      const file = join(fixture.root, "not-a-directory");
      await writeFile(file, "x");
      try {
        await expect(
          fixture.session.exportPdf("out.pdf", {}, undefined, {
            mode: "workspace-write",
            workspaceRoot: fixture.root,
            additionalWritableRoots: [file],
          }),
        ).rejects.toMatchObject({ code: "TYPST_SANDBOX_INVALID_ROOT" });
      } finally {
        await fixture.close();
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "refuses an extra writable root that is a symlink",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture();
      const target = join(fixture.root, "real-extra");
      const link = join(fixture.root, "linked-extra");
      await mkdir(target);
      await symlink(target, link);
      try {
        await expect(
          fixture.session.exportPdf("out.pdf", {}, undefined, {
            mode: "workspace-write",
            workspaceRoot: fixture.root,
            additionalWritableRoots: [link],
          }),
        ).rejects.toMatchObject({ code: "TYPST_SANDBOX_INVALID_ROOT" });
      } finally {
        await fixture.close();
      }
    },
  );
});
