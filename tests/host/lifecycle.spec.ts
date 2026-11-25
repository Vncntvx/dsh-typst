/**
 * The workbench releases a workspace's watcher when its last live Session
 * leaves the store, not only when the plugin itself unloads.
 * @module tests/host/lifecycle
 */
import { Context } from "@deepseek-ai/cordis";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import SessionStore from "@deepseek-ai/dsh-session";
import TypertRegistry from "@deepseek-ai/dsh-typert-registry";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { TypstWorkbenchService } from "../../src/service.js";

it("closes a workspace session after its last live Session is disposed", async () => {
  const ctx = new Context();
  ctx.provide("tools", { register: vi.fn(() => () => undefined) } as never);
  ctx.provide("skills", { register: vi.fn(() => () => undefined) } as never);
  const sessions = await ctx.plugin(SessionStore);
  const subprocess = await ctx.plugin(LocalSubprocessRuntime);
  const typert = await ctx.plugin(TypertRegistry);
  const workbench = await ctx.plugin(TypstWorkbenchService, { typstPath: "" });
  const root = await mkdtemp(join(tmpdir(), "dsh-typst-lifecycle-"));
  try {
    await writeFile(join(root, "main.typ"), "Hello");
    const service = ctx.get("typstWorkbench")!;
    const typst = await service.sessionFor(root);
    const close = vi.spyOn(typst, "close");
    const owner = await ctx.plugin({
      inject: ["sessions"],
      apply(scope) {
        scope.sessions.create(undefined, { meta: { cwd: root } });
      },
    });
    await owner.dispose();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  } finally {
    await workbench.dispose();
    await typert.dispose();
    await subprocess.dispose();
    await sessions.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

it("waits for a closing workspace before creating its successor", async () => {
  const ctx = new Context();
  ctx.provide("tools", { register: vi.fn(() => () => undefined) } as never);
  ctx.provide("skills", { register: vi.fn(() => () => undefined) } as never);
  const sessions = await ctx.plugin(SessionStore);
  const subprocess = await ctx.plugin(LocalSubprocessRuntime);
  const typert = await ctx.plugin(TypertRegistry);
  const workbench = await ctx.plugin(TypstWorkbenchService, { typstPath: "" });
  const root = await mkdtemp(join(tmpdir(), "dsh-typst-lifecycle-"));
  try {
    await writeFile(join(root, "main.typ"), "Hello");
    const service = ctx.get("typstWorkbench")!;
    const first = await service.sessionFor(root);
    let releaseClose!: () => void;
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    const close = vi
      .spyOn(first, "close")
      .mockImplementation(async () => await closeGate);
    const owner = await ctx.plugin({
      inject: ["sessions"],
      apply(scope) {
        scope.sessions.create(undefined, { meta: { cwd: root } });
      },
    });
    await owner.dispose();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    let settled = false;
    const nextPromise = service.sessionFor(root).then((session) => {
      settled = true;
      return session;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseClose();
    const next = await nextPromise;
    expect(next).not.toBe(first);
  } finally {
    await workbench.dispose();
    await typert.dispose();
    await subprocess.dispose();
    await sessions.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

it("keeps a workspace alive while another live Session shares its root", async () => {
  const ctx = new Context();
  ctx.provide("tools", { register: vi.fn(() => () => undefined) } as never);
  ctx.provide("skills", { register: vi.fn(() => () => undefined) } as never);
  const sessions = await ctx.plugin(SessionStore);
  const subprocess = await ctx.plugin(LocalSubprocessRuntime);
  const typert = await ctx.plugin(TypertRegistry);
  const workbench = await ctx.plugin(TypstWorkbenchService, { typstPath: "" });
  const root = await mkdtemp(join(tmpdir(), "dsh-typst-lifecycle-"));
  const owner = () =>
    ctx.plugin({
      inject: ["sessions"],
      apply(scope) {
        scope.sessions.create(undefined, { meta: { cwd: root } });
      },
    });
  try {
    await writeFile(join(root, "main.typ"), "Hello");
    const service = ctx.get("typstWorkbench")!;
    const typst = await service.sessionFor(root);
    const close = vi.spyOn(typst, "close");
    const first = await owner();
    const second = await owner();
    await first.dispose();
    expect(close).not.toHaveBeenCalled();
    await second.dispose();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  } finally {
    await workbench.dispose();
    await typert.dispose();
    await subprocess.dispose();
    await sessions.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
