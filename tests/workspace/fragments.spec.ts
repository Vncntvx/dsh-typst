/**
 * The fragment set: the workspace's `.typ` files that the current document
 * includes, as typst's own dependency report names them.
 *
 * The report is the only signal that separates a document from a piece of
 * one, and it arrives from the watch process rather than from a guess about
 * the file names.
 * @module tests/workspace/fragments
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkspaceSession } from "../../src/workspace/session.js";

let root: string;
let dataDir: string;
let session: WorkspaceSession;

const fakeTypst = new URL("../fixtures/typst-fake.cjs", import.meta.url)
  .pathname;

/** A wrapper the locator can execute: node running the fake CLI. */
async function writeFakeWrapper(dir: string): Promise<string> {
  const wrapper = join(dir, "fake-typst");
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec '${process.execPath}' '${fakeTypst}' "$@"\n`,
    { mode: 0o755 },
  );
  return wrapper;
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "dsh-typst-fragments-"));
  dataDir = join(root, "data");
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(root, "chapters"), { recursive: true });
  await writeFile(
    join(root, "main.typ"),
    '#include "chapters/intro.typ"\n= Title\n',
  );
  await writeFile(join(root, "chapters", "intro.typ"), "= Intro\n");
  await writeFile(join(root, "other.typ"), "= other\n");
  session = new WorkspaceSession({
    workspaceRoot: root,
    dataDir,
    log: () => undefined,
  });
  (session as unknown as { options: { typstPath: string } }).options.typstPath =
    await writeFakeWrapper(dataDir);
});

afterAll(async () => {
  await session.close();
  await rm(root, { recursive: true, force: true });
});

describe("the fragment set", () => {
  it("names the file the document includes", { timeout: 30_000 }, async () => {
    await session.activate();
    await session.settle(15_000);
    const state = session.state();
    expect(state.candidates).toContain("chapters/intro.typ");
    expect(state.fragments).toContain("chapters/intro.typ");
  });

  it(
    "does not call the main file a fragment",
    { timeout: 30_000 },
    async () => {
      await session.settle(15_000);
      expect(session.state().fragments).not.toContain("main.typ");
    },
  );

  it(
    "does not call an unrelated file a fragment",
    { timeout: 30_000 },
    async () => {
      await session.settle(15_000);
      expect(session.state().fragments).not.toContain("other.typ");
    },
  );
});
