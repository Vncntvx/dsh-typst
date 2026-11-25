/**
 * Workspace isolation and teardown: two sessions sharing one cache root must
 * not touch each other's build directory, and a killed session must not
 * restart its watch.
 * @module tests/workspace/isolation
 */

import { Context } from "@deepseek-ai/cordis";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkspaceSession } from "../../src/workspace/session.js";

const fake = fileURLToPath(
  new URL("../fixtures/typst-fake.cjs", import.meta.url),
);

let base: string;
let dataDir: string;
let spawnLog: string;
let wrapper: string;

async function writeWrapper(dir: string): Promise<string> {
  const path = join(dir, "fake-typst");
  await writeFile(
    path,
    `#!/bin/sh\necho "$@" >> '${spawnLog}'\nexec '${process.execPath}' '${fake}' "$@"\n`,
    { mode: 0o755 },
  );
  return path;
}

async function watchSpawns(): Promise<number> {
  const text = await readFile(spawnLog, "utf8").catch(() => "");
  return text.split("\n").filter((line) => line.startsWith("watch ")).length;
}

async function makeSession(
  root: string,
  subprocess: unknown,
): Promise<WorkspaceSession> {
  await writeFile(join(root, "main.typ"), "Hello isolation world");
  return new WorkspaceSession({
    workspaceRoot: root,
    dataDir,
    typstPath: wrapper,
    subprocess: subprocess as never,
    log: () => undefined,
  });
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "dsh-typst-isolation-"));
  dataDir = join(base, "cache");
  spawnLog = join(base, "spawn.log");
  await mkdir(dataDir, { recursive: true });
  await mkdir(join(base, "a"), { recursive: true });
  await mkdir(join(base, "b"), { recursive: true });
  wrapper = await writeWrapper(dataDir);
  await writeFile(spawnLog, "");
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("workspace isolation", () => {
  it(
    "a second session sharing the cache root never disturbs the first",
    { timeout: 30_000 },
    async () => {
      const ctx = new Context();
      const runtime = await ctx.plugin(LocalSubprocessRuntime);
      const a = await makeSession(join(base, "a"), ctx.subprocess);
      const b = await makeSession(join(base, "b"), ctx.subprocess);
      try {
        await a.activate();
        await a.settle(15_000);
        const before = a.state();
        expect(before.status.phase).toBe("ok");
        const runBefore = before.status.run;
        const spawnsBefore = await watchSpawns();

        await b.activate();
        await b.settle(15_000);
        await new Promise((done) => setTimeout(done, 250));

        const after = a.state();
        expect(after.status.phase).toBe("ok");
        expect(after.status.run).toBe(runBefore);
        // B created its own watch; A was not restarted or killed.
        expect(await watchSpawns()).toBe(spawnsBefore + 1);

        const dirs = (
          await readdir(join(dataDir, "build"), {
            withFileTypes: true,
          })
        ).filter((entry) => entry.isDirectory());
        expect(dirs.length).toBe(2);
        for (const entry of dirs) {
          const owner = await readFile(
            join(dataDir, "build", entry.name, "owner.json"),
            "utf8",
          );
          expect(JSON.parse(owner).pid).toBe(process.pid);
        }
      } finally {
        await a.close();
        await b.close();
        await runtime.dispose();
      }
    },
  );

  it(
    "killNow does not restart the watch after the restart threshold",
    { timeout: 30_000 },
    async () => {
      const ctx = new Context();
      const runtime = await ctx.plugin(LocalSubprocessRuntime);
      const root = join(base, "kill");
      await mkdir(root, { recursive: true });
      const session = await makeSession(root, ctx.subprocess);
      try {
        await session.activate();
        await session.settle(15_000);
        expect(session.state().status.phase).toBe("ok");
        const before = await watchSpawns();
        // The crash-restart branch only arms after ten seconds of uptime.
        await new Promise((done) => setTimeout(done, 10_200));
        session.killNow();
        await new Promise((done) => setTimeout(done, 1_500));
        expect(await watchSpawns()).toBe(before);
      } finally {
        await session.close();
        await runtime.dispose();
      }
    },
  );
});
