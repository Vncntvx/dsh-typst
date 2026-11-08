import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkspaceSession } from "../../../src/workspace/session.js";
export async function sessionFixture() {
  const root = await mkdtemp(join(tmpdir(), "typst-identity-"));
  const dataDir = join(root, "cache");
  await mkdir(dataDir);
  const wrapper = join(dataDir, "typst");
  const fake = new URL("../../fixtures/typst-fake.cjs", import.meta.url)
    .pathname;
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec '${process.execPath}' '${fake}' "$@"\n`,
    { mode: 0o755 },
  );
  await writeFile(join(root, "main.typ"), "Hello preview world");
  const session = new WorkspaceSession({
    workspaceRoot: root,
    dataDir,
    typstPath: wrapper,
  });
  return {
    root,
    dataDir,
    session,
    async close() {
      await session.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
