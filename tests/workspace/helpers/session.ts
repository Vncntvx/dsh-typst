import { Context } from "@deepseek-ai/cordis";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import type { SubprocessRuntime } from "@deepseek-ai/dsh-subprocess";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolvedConfig } from "../../../src/config.js";
import { WorkspaceSession } from "../../../src/workspace/session.js";

/** One host subprocess provider for the whole test process. */
let runtime: Promise<SubprocessRuntime> | undefined;

/**
 * A real `ctx.subprocess` provider for session specs. The provider owns the
 * managed process range and registers the host-exit listener; creating one per
 * process keeps that listener from accumulating across specs.
 */
export function subprocessRuntime(): Promise<SubprocessRuntime> {
  runtime ??= (async () => {
    const ctx = new Context();
    await ctx.plugin(LocalSubprocessRuntime);
    return ctx.subprocess;
  })();
  return runtime;
}

/**
 * Write an executable wrapper that runs the simulated typst CLI. The wrapper
 * goes through `process.execPath` and `fileURLToPath`, so a workspace path
 * containing spaces is passed as one argv entry and the Windows form uses a
 * `.cmd` shim instead of a POSIX shell.
 * @param dir - directory that receives the wrapper.
 * @returns the wrapper path to hand to the session's `typstPath`.
 */
export async function fakeTypstWrapper(dir: string): Promise<string> {
  const fake = fileURLToPath(
    new URL("../../fixtures/typst-fake.cjs", import.meta.url),
  );
  if (process.platform === "win32") {
    const wrapper = join(dir, "fake-typst.cmd");
    await writeFile(
      wrapper,
      `@echo off\r\n"${process.execPath}" "${fake}" %*\r\n`,
    );
    return wrapper;
  }
  const wrapper = join(dir, "fake-typst");
  await writeFile(
    wrapper,
    `#!/bin/sh\nexec '${process.execPath}' '${fake}' "$@"\n`,
    { mode: 0o755 },
  );
  return wrapper;
}

export async function sessionFixture(
  options: {
    roots?: Record<string, string>;
    main?: string;
    log?: (...args: unknown[]) => void;
    eventLog?: string;
    argsLog?: string;
    fontPaths?: string[];
    packagePath?: string;
    excludeDirs?: string[];
    settings?: (typst: string) => ResolvedConfig;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "typst-identity-"));
  const dataDir = join(root, "cache");
  await mkdir(dataDir);
  const wrapper = await fakeTypstWrapper(dataDir);
  for (const [file, contents] of Object.entries(options.roots ?? {})) {
    const target = join(root, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  await writeFile(
    join(root, "main.typ"),
    options.main ?? "Hello preview world",
  );
  const session = new WorkspaceSession({
    workspaceRoot: root,
    dataDir,
    typstPath: wrapper,
    fontPaths: options.fontPaths,
    packagePath: options.packagePath,
    excludeDirs: options.excludeDirs,
    ...(options.settings === undefined
      ? {}
      : { resolveSettings: () => options.settings!(wrapper) }),
    subprocess: await subprocessRuntime(),
    ...(options.eventLog === undefined && options.argsLog === undefined
      ? {}
      : {
          env: {
            ...process.env,
            ...(options.eventLog === undefined
              ? {}
              : { TYPST_FAKE_EVENT_LOG: options.eventLog }),
            ...(options.argsLog === undefined
              ? {}
              : { TYPST_FAKE_ARGS_LOG: options.argsLog }),
          },
        }),
    ...(options.log === undefined ? {} : { log: options.log }),
  });
  return {
    root,
    dataDir,
    wrapper,
    session,
    async close() {
      await session.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
