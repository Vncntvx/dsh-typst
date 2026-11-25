/**
 * Watch lifecycle, main-file switching, export and teardown: every case owns a
 * fresh workspace and closes it.
 * @module tests/workspace/session-lifecycle
 */

import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TypstError } from "../../src/errors.js";
import { LIMITS } from "../../src/constants.js";
import { sessionFixture } from "./helpers/session.js";

const MAIN = "#heading[Hello]\nHello preview world.\n";
const WRITE_POLICY = (root: string) => ({
  mode: "workspace-write" as const,
  workspaceRoot: root,
});

/** One case's fully isolated session, always closed by the caller. */
async function activeFixture() {
  const fixture = await sessionFixture({
    roots: { "other.typ": "= other\n" },
    main: MAIN,
    log: () => undefined,
  });
  await fixture.session.activate();
  await fixture.session.settle(15_000);
  return fixture;
}

describe("WorkspaceSession lifecycle against the fake typst", () => {
  it(
    "renderPages renders the fake PNG through a one-shot compile",
    { timeout: 30_000 },
    async () => {
      const fixture = await activeFixture();
      try {
        const result = await fixture.session.renderPages(
          "1",
          LIMITS.ppiDefault,
        );
        expect(result.ok).toBe(true);
        expect(result.pages).toEqual([1]);
        expect(result.images).toHaveLength(1);
        expect(result.images[0].png.subarray(0, 4)).toEqual(
          new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        );
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "setMain switches the watcher to the named file",
    { timeout: 30_000 },
    async () => {
      const fixture = await activeFixture();
      try {
        const main = await fixture.session.setMain("other.typ");
        expect(main).toBe("other.typ");
        await fixture.session.settle(15_000);
        expect(fixture.session.state().main).toBe("other.typ");
        await fixture.session.setMain("main.typ");
        await fixture.session.settle(15_000);
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "exportPdf writes into the workspace and refuses outside paths",
    { timeout: 30_000 },
    async () => {
      const fixture = await activeFixture();
      try {
        const policy = WRITE_POLICY(fixture.root);
        const result = await fixture.session.exportPdf(
          "out/exported.pdf",
          {},
          undefined,
          policy,
        );
        expect(result.ok).toBe(true);
        expect(result.path).toBe("out/exported.pdf");
        expect(result.pages).toBe(1);
        await expect(
          fixture.session.exportPdf("../outside.pdf", {}, undefined, policy),
        ).rejects.toThrow(TypstError);
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "sourceFiles lists workspace sources and locateSource matches them",
    { timeout: 30_000 },
    async () => {
      const fixture = await activeFixture();
      try {
        const files = await fixture.session.sourceFiles();
        expect(files.map((file) => file.path)).toContain("main.typ");
        const matches = await fixture.session.locateSource(
          "Hello preview world",
        );
        expect(matches[0]?.file).toBe("main.typ");
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "process groups: the watcher dies with the session",
    { timeout: 30_000 },
    async () => {
      const eventRoot = await mkdtemp(join(tmpdir(), "dsh-typst-events-"));
      const eventLog = join(eventRoot, "events.log");
      const fixture = await sessionFixture({
        roots: { "other.typ": "= other\n" },
        main: MAIN,
        eventLog,
        log: () => undefined,
      });
      try {
        await fixture.session.activate();
        await fixture.session.settle(15_000);
        expect(fixture.session.state().status.phase).toBe("ok");
        const events = await readFile(eventLog, "utf8");
        const spawn = events
          .split("\n")
          .find((line) => line.startsWith("spawn:"));
        expect(spawn).toBeDefined();
        const pid = Number(spawn!.split(":")[1]);
        expect(Number.isInteger(pid)).toBe(true);
        const buildDirs = (
          await readdir(join(fixture.dataDir, "build"), {
            withFileTypes: true,
          })
        ).filter((entry) => entry.isDirectory());
        expect(buildDirs.length).toBeGreaterThan(0);

        await fixture.session.close();

        // The managed range signalled the watch itself; a pid that merely
        // stopped being awaited would never produce this record.
        expect(await readFile(eventLog, "utf8")).toContain(`signal:${pid}`);
        expect(() => process.kill(pid, 0)).toThrow();
        // The session owns its scratch tree; close removes it.
        expect(
          (
            await readdir(join(fixture.dataDir, "build"), {
              withFileTypes: true,
            })
          ).filter((entry) => entry.isDirectory()),
        ).toHaveLength(0);
        await expect(fixture.session.settle(1_000)).rejects.toMatchObject({
          code: "TYPST_WATCH_FAILED",
        });
      } finally {
        await fixture.close();
        await rm(eventRoot, { recursive: true, force: true });
      }
    },
  );
});
