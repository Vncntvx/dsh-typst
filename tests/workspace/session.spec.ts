/**
 * `WorkspaceSession` end to end against the simulated typst CLI: watch
 * startup, settle semantics, snapshots, highlights, and one-shot compiles.
 * Every case owns a fresh workspace and closes it, so running any one case
 * alone or in a different order exercises the same lifecycle.
 * @module tests/workspace/session
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TypstError } from "../../src/errors.js";
import { WorkspaceSession } from "../../src/workspace/session.js";
import { sessionFixture, subprocessRuntime } from "./helpers/session.js";

const MAIN = "#heading[Hello]\nHello preview world.\n";
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

describe("WorkspaceSession against the fake typst", () => {
  it(
    "activates: finds the toolchain, picks main.typ, compiles, and produces a snapshot",
    { timeout: 30_000 },
    async () => {
      const fixture = await sessionFixture({
        roots: { "other.typ": "= other\n" },
        main: MAIN,
        log: () => undefined,
      });
      try {
        await fixture.session.activate();
        const state = fixture.session.state();
        expect(state.toolchain.state).toBe("ready");
        expect(state.main).toBe("main.typ");
        expect(state.candidates).toEqual(["main.typ", "other.typ"]);
        await fixture.session.settle(15_000);
        const settled = fixture.session.state();
        expect(settled.status.phase).toBe("ok");
        expect(settled.snapshot?.pages).toBe(1);
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "answers readPreview with the compiled bytes",
    { timeout: 30_000 },
    async () => {
      const fixture = await activeFixture();
      try {
        const snapshot = fixture.session.state().snapshot!;
        const { info, bytes } = fixture.session.previewBytes(snapshot);
        expect(info.seq).toBeGreaterThan(0);
        expect(bytes.length).toBeGreaterThan(16);
        expect(new TextDecoder("latin1").decode(bytes.slice(0, 8))).toContain(
          "%PDF-",
        );
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "highlights rendered text and reports page rects",
    { timeout: 30_000 },
    async () => {
      const fixture = await activeFixture();
      try {
        const created = await fixture.session.highlight({
          quote: "Hello preview world",
        });
        expect(created.highlight.pageIndex).toBe(0);
        expect(created.highlight.rects.length).toBeGreaterThan(0);
        expect(created.highlight.stale).toBe(false);
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "relocates highlights after a recompile",
    { timeout: 30_000 },
    async () => {
      const fixture = await activeFixture();
      try {
        const created = await fixture.session.highlight({
          quote: "Hello preview world",
        });
        const before = fixture.session.state();
        await writeFile(
          join(fixture.root, "main.typ"),
          "#heading[Hello]\nHello preview world. Again.\n",
        );
        await fixture.session.settle(15_000);
        const after = fixture.session.state();
        expect(after.status.phase).toBe("ok");
        // A real recompile happened: the watch produced a new PDF round.
        expect(after.status.run).toBeGreaterThan(before.status.run);
        expect(after.snapshot!.seq).toBeGreaterThan(before.snapshot!.seq);
        const highlight = after.highlights[0];
        expect(highlight?.id).toBe(created.highlight.id);
        expect(highlight?.stale).toBe(false);
        expect(highlight?.seq).toBe(after.snapshot?.seq);
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "settle waits for on-disk changes and rejects without a toolchain",
    { timeout: 30_000 },
    async () => {
      const fixture = await activeFixture();
      try {
        await fixture.session.settle(15_000);
        // A second settle with everything compiled is immediate.
        await fixture.session.settle(15_000);
        const empty = new WorkspaceSession({
          workspaceRoot: join(fixture.root, "nowhere"),
          dataDir: fixture.dataDir,
          subprocess: await subprocessRuntime(),
        });
        try {
          await expect(empty.settle(1_000)).rejects.toBeInstanceOf(TypstError);
        } finally {
          await empty.close();
        }
      } finally {
        await fixture.close();
      }
    },
  );

  it(
    "showPage rejects out-of-range pages and clears highlights",
    { timeout: 30_000 },
    async () => {
      const fixture = await activeFixture();
      try {
        fixture.session.showPage(0);
        const snapshot = fixture.session.state().snapshot!;
        expect(fixture.session.state().view).toEqual({
          kind: "page",
          pageIndex: 0,
          identity: {
            generation: snapshot.generation,
            seq: snapshot.seq,
            sha256: snapshot.sha256,
          },
        });
        expect(() => fixture.session.showPage(9)).toThrow(TypstError);
        fixture.session.clearHighlights();
        expect(fixture.session.state().highlights).toHaveLength(0);
      } finally {
        await fixture.close();
      }
    },
  );
});
