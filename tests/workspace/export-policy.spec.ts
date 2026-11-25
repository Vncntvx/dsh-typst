/**
 * PDF export policy and target validation: read-only sessions cannot write,
 * symlink targets are refused, and page selections are checked against the
 * freshly compiled document.
 * @module tests/workspace/export-policy
 */

import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sessionFixture } from "./helpers/session.js";

describe("typst_export_pdf policy", () => {
  it("refuses a read-only session before compiling", async () => {
    const fixture = await sessionFixture();
    try {
      await expect(
        fixture.session.exportPdf("out.pdf", {}, undefined, {
          mode: "read-only",
          workspaceRoot: fixture.root,
        }),
      ).rejects.toMatchObject({ code: "TYPST_SANDBOX_READ_ONLY" });
    } finally {
      await fixture.close();
    }
  });

  it(
    "writes inside the workspace under workspace-write",
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
            workspaceRoot: fixture.root,
          },
        );
        expect(result.ok).toBe(true);
        expect(result.path).toBe("out.pdf");
      } finally {
        await fixture.close();
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "refuses a symlink target",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture();
      try {
        const outside = join(fixture.root, "..", "outside.pdf");
        await writeFile(outside, "not a pdf");
        await symlink(outside, join(fixture.root, "out.pdf"));
        await expect(
          fixture.session.exportPdf("out.pdf", {}, undefined, {
            mode: "workspace-write",
            workspaceRoot: fixture.root,
          }),
        ).rejects.toMatchObject({ code: "TYPST_PATH_OUTSIDE_WORKSPACE" });
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "rejects a page selection outside the compiled document",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture();
      try {
        await expect(
          fixture.session.exportPdf("out.pdf", { pages: "99" }, undefined, {
            mode: "workspace-write",
            workspaceRoot: fixture.root,
          }),
        ).rejects.toMatchObject({ code: "TYPST_PAGE_OUT_OF_RANGE" });
      } finally {
        await fixture.close();
      }
    },
  );
});
