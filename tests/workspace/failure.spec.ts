/**
 * The simulated CLI's failure path: the fixture used by every session spec
 * must be able to produce a real typst-shaped error, and the session must
 * surface it with location and trace.
 * @module tests/workspace/failure
 */

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { sessionFixture } from "./helpers/session.js";

const run = promisify(execFile);
const fake = fileURLToPath(
  new URL("../fixtures/typst-fake.cjs", import.meta.url),
);

describe("typst failure path", () => {
  it("the fake CLI exits 1 with a location and a while-calling trace", async () => {
    const root = await mkdtemp(join(tmpdir(), "dsh-typst-fail-"));
    try {
      const main = join(root, "main.typ");
      await writeFile(main, "FAIL_ME");
      const failure = await run(process.execPath, [
        fake,
        "compile",
        main,
        join(root, "out.pdf"),
      ]).catch((error: unknown) => error as { code: number; stderr: string });
      expect(failure).toMatchObject({ code: 1 });
      expect(failure.stderr).toContain("error: unknown variable");
      expect(failure.stderr).toContain("while calling `f`");
      expect(failure.stderr).toContain("hint: check the spelling");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it(
    "the session reports the compile error with its trace",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture();
      try {
        await writeFile(join(fixture.root, "main.typ"), "FAIL_ME");
        await fixture.session.activate();
        await fixture.session.settle(15_000).catch(() => undefined);
        const state = fixture.session.state();
        expect(state.status.phase).toBe("error");
        expect(state.diagnostics[0]?.severity).toBe("error");
        expect(state.diagnostics[0]?.location).toMatchObject({
          file: "main.typ",
          line: 1,
        });
        expect(state.diagnostics[0]?.trace[0]?.message).toContain(
          "while calling",
        );
        // The frame carries the full count even when the views are capped.
        expect(state.diagnosticsTotal).toBeGreaterThan(0);
        expect(state.diagnosticsTruncated).toBe(false);
        expect(await readFile(join(fixture.root, "main.typ"), "utf8")).toBe(
          "FAIL_ME",
        );
      } finally {
        await fixture.close();
      }
    },
  );
});
