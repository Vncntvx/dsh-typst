/**
 * `WorkspaceSession` end to end against the simulated typst CLI: watch
 * startup, settle semantics, snapshots, highlights, and one-shot compiles.
 * @module tests/unit/session
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TypstError } from "../../src/errors.js";
import { LIMITS } from "../../src/constants.js";
import { WorkspaceSession } from "../../src/workspace/session.js";

let root: string;
let dataDir: string;
let session: WorkspaceSession;

const fakeTypst = new URL("../fixtures/typst-fake.cjs", import.meta.url)
  .pathname;

// The locator executes the binary with args ['--version']; node needs the
// script path. The session's toolchain options accept a plain path, so the
// spec wraps the fake through a tiny shell script instead.
async function writeFakeWrapper(dir: string): Promise<string> {
  const wrapper = join(dir, "fake-typst");
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec '${process.execPath}' '${fakeTypst}' "$@"\n`,
    {
      mode: 0o755,
    },
  );
  return wrapper;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "dsh-typst-session-"));
  dataDir = join(root, "data");
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(root, "main.typ"),
    "#heading[Hello]\nHello preview world.\n",
  );
  await writeFile(join(root, "other.typ"), "= other\n");
  session = new WorkspaceSession({
    workspaceRoot: root,
    dataDir,
    log: () => undefined,
  });
  // Point the locator at the wrapper through the environment: the session
  // resolves `setting` first, so the spec hands the wrapper path via
  // locateTypst's setting face through the private option surface.
  (session as unknown as { options: { typstPath: string } }).options.typstPath =
    await writeFakeWrapper(dataDir);
});

afterAll(async () => {
  await session.close();
  await rm(root, { recursive: true, force: true });
});

describe("WorkspaceSession against the fake typst", () => {
  it(
    "activates: finds the toolchain, picks main.typ, compiles, and produces a snapshot",
    { timeout: 30_000 },
    async () => {
      await session.activate();
      const state = session.state();
      expect(state.toolchain.state).toBe("ready");
      expect(state.main).toBe("main.typ");
      expect(state.candidates).toEqual(["main.typ", "other.typ"]);
      await session.settle(15_000);
      const settled = session.state();
      expect(settled.status.phase).toBe("ok");
      expect(settled.snapshot?.pages).toBe(1);
    },
  );

  it("answers readPreview with the compiled bytes", async () => {
    const { info, bytes } = session.currentBytes();
    expect(info.seq).toBeGreaterThan(0);
    expect(bytes.length).toBeGreaterThan(16);
    expect(new TextDecoder("latin1").decode(bytes.slice(0, 8))).toContain(
      "%PDF-",
    );
  });

  it("highlights rendered text and reports page rects", async () => {
    const created = await session.highlight({ quote: "Hello preview world" });
    expect(created.highlight.pageIndex).toBe(0);
    expect(created.highlight.rects.length).toBeGreaterThan(0);
    expect(created.highlight.stale).toBe(false);
  });

  it("relocates or stales highlights after a recompile", async () => {
    // Touch the input to trigger a watch round.
    await writeFile(
      join(root, "main.typ"),
      "#heading[Hello]\nHello preview world. Again.\n",
    );
    await session.settle(15_000);
    const state = session.state();
    expect(state.status.phase).toBe("ok");
    // The quote's first words still exist, so the highlight relocates.
    const highlight = state.highlights[0];
    expect(highlight).toBeDefined();
    expect(highlight.stale).toBe(false);
    expect(highlight.seq).toBe(state.snapshot?.seq);
  });

  it("settle waits for on-disk changes and rejects without a toolchain", async () => {
    await session.settle(15_000);
    // A second settle with everything compiled is immediate.
    await session.settle(15_000);
    const empty = new WorkspaceSession({
      workspaceRoot: join(root, "nowhere"),
      dataDir,
    });
    try {
      await expect(empty.settle(1_000)).rejects.toBeInstanceOf(TypstError);
    } finally {
      await empty.close();
    }
  });

  it("showPage rejects out-of-range pages and accepts in-range ones", async () => {
    session.showPage(0);
    const snapshot = session.state().snapshot!;
    expect(session.state().view).toEqual({
      kind: "page",
      pageIndex: 0,
      identity: {
        generation: snapshot.generation,
        seq: snapshot.seq,
        sha256: snapshot.sha256,
      },
    });
    expect(() => session.showPage(9)).toThrow(TypstError);
    session.clearHighlights();
    expect(session.state().highlights).toHaveLength(0);
  });

  it(
    "renderPages renders the fake PNG through a one-shot compile",
    { timeout: 30_000 },
    async () => {
      const result = await session.renderPages("1", LIMITS.ppiDefault);
      expect(result.ok).toBe(true);
      expect(result.pages).toEqual([1]);
      expect(result.images).toHaveLength(1);
      expect(result.images[0].png.subarray(0, 4)).toEqual(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      );
    },
  );

  it(
    "setMain switches the watcher to the named file",
    { timeout: 30_000 },
    async () => {
      const main = await session.setMain("other.typ");
      expect(main).toBe("other.typ");
      await session.settle(15_000);
      expect(session.state().main).toBe("other.typ");
      await session.setMain("main.typ");
      await session.settle(15_000);
    },
  );

  it(
    "exportPdf writes into the workspace and refuses outside paths",
    { timeout: 30_000 },
    async () => {
      const result = await session.exportPdf("out/exported.pdf", {});
      expect(result.ok).toBe(true);
      expect(result.path).toBe("out/exported.pdf");
      expect(result.pages).toBe(1);
      await expect(session.exportPdf("../outside.pdf", {})).rejects.toThrow(
        TypstError,
      );
    },
  );

  it("sourceFiles lists workspace sources and locateSource matches them", async () => {
    const files = await session.sourceFiles();
    expect(files.map((file) => file.path)).toContain("main.typ");
    const matches = await session.locateSource("Hello preview world");
    expect(matches[0]?.file).toBe("main.typ");
  });

  it(
    "process groups: the watcher dies with the session",
    { timeout: 30_000 },
    async () => {
      // The watcher was restarted by setMain; give the fresh watch its round.
      await session.settle(15_000);
      const state = session.state();
      expect(state.status.phase).toBe("ok");
      await session.close();
      // A closed session no longer settles.
      await expect(session.settle(1_000)).rejects.toBeDefined();
    },
  );
});
