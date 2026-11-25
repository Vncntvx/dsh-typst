import { Context } from "@deepseek-ai/cordis";
import { createVolatile, updateVolatile } from "@deepseek-ai/cosmokit";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import SessionStore from "@deepseek-ai/dsh-session";
import TypertRegistry from "@deepseek-ai/dsh-typert-registry";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  TYPST_REMOTE_PACKAGE,
  TYPST_SCOPE_WIRE_SYMBOL,
} from "../../src/constants.js";
import { TypstWorkbenchService } from "../../src/service.js";
import { TYPST_INVOCATIONS } from "../../src/wire-schemas.js";

describe("Typst host composition", () => {
  it("mounts and withdraws the Remote runtime and strict scope lookup with the workbench", async () => {
    const ctx = new Context();
    ctx.provide("tools", { register: vi.fn(() => () => undefined) } as never);
    ctx.provide("skills", { register: vi.fn(() => () => undefined) } as never);
    const sessions = await ctx.plugin(SessionStore);
    const subprocess = await ctx.plugin(LocalSubprocessRuntime);
    const typert = await ctx.plugin(TypertRegistry);
    const workbench = await ctx.plugin(TypstWorkbenchService, {
      typstPath: "",
    });

    try {
      const runtime = ctx.get("typstStatus");
      expect(runtime).toBeDefined();
      expect(runtime?.typertRemote.namespace).toBe("typst");
      const contribution = ctx.typert.getPackage("dsh-typst-plugin", "host");
      expect(contribution).toBeDefined();
      const declared = contribution?.model.services[0]?.types ?? [];
      expect(declared.map((type) => type.name)).toEqual([
        "TypstScope",
        "TypstStateFrame",
        "PreviewIdentity",
        "PreviewBytes",
        "SourceMatch",
        "DiscoveryView",
      ]);
      for (const type of declared) expect(type.declaration).toContain("export");
      const lookup = ctx.typert.lookups.get("typstScope");
      expect(lookup).toMatchObject({
        parameter: "typstScope",
        wire: "typstScopeId",
        hostTypeSymbol: `${TYPST_REMOTE_PACKAGE}#TypstScope`,
        wireTypeSymbol: TYPST_SCOPE_WIRE_SYMBOL,
      });
      const scope = TYPST_INVOCATIONS[0]?.parameters.find(
        (parameter) => parameter.lookup === "typstScope",
      );
      expect(
        scope?.codec.mode === "strict" ? scope.codec.typeSymbol : undefined,
      ).toBe(lookup?.wireTypeSymbol);

      await workbench.dispose();

      expect(ctx.get("typstStatus")).toBeUndefined();
      expect(ctx.typert.lookups.get("typstScope")).toBeUndefined();
    } finally {
      await workbench.dispose();
      await typert.dispose();
      await subprocess.dispose();
      await sessions.dispose();
    }
  });

  it("closes a lazily created workspace session on dispose", async () => {
    const ctx = new Context();
    ctx.provide("tools", { register: vi.fn(() => () => undefined) } as never);
    ctx.provide("skills", { register: vi.fn(() => () => undefined) } as never);
    const sessions = await ctx.plugin(SessionStore);
    const subprocess = await ctx.plugin(LocalSubprocessRuntime);
    const typert = await ctx.plugin(TypertRegistry);
    const workbench = await ctx.plugin(TypstWorkbenchService, {
      typstPath: "",
    });
    const root = await mkdtemp(join(tmpdir(), "dsh-typst-composition-"));
    try {
      await writeFile(join(root, "main.typ"), "Hello");
      const service = ctx.get("typstWorkbench");
      expect(service).toBeDefined();
      const session = await service!.sessionFor(root);
      const close = vi.spyOn(session, "close");
      await workbench.dispose();
      expect(close).toHaveBeenCalled();
    } finally {
      await workbench.dispose();
      await typert.dispose();
      await subprocess.dispose();
      await sessions.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });
});

it("names every typst-owned wire symbol after the package and keys the scope to SessionId", () => {
  const owned = `${TYPST_REMOTE_PACKAGE}#`;
  const codecs = TYPST_INVOCATIONS.flatMap((invocation) => [
    ...invocation.parameters.map((parameter) => parameter.codec),
    invocation.result,
    ...(invocation.uplink ? [invocation.uplink.codec] : []),
    ...(invocation.invocation.kind === "context"
      ? [invocation.invocation.codec]
      : []),
  ]);
  const symbols = codecs.flatMap((codec) =>
    codec.mode === "strict" ? [codec.typeSymbol] : [],
  );
  expect(symbols.length).toBeGreaterThan(0);
  expect(
    symbols.every(
      (symbol) =>
        symbol.startsWith(owned) || symbol === TYPST_SCOPE_WIRE_SYMBOL,
    ),
  ).toBe(true);
});

it("readPreview hands the retained snapshot bytes to the wire without copying", async () => {
  const ctx = new Context();
  ctx.provide("tools", { register: vi.fn(() => () => undefined) } as never);
  ctx.provide("skills", { register: vi.fn(() => () => undefined) } as never);
  const sessions = await ctx.plugin(SessionStore);
  const subprocess = await ctx.plugin(LocalSubprocessRuntime);
  const typert = await ctx.plugin(TypertRegistry);
  await ctx.plugin(TypstWorkbenchService, { typstPath: "" });
  try {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const session = {
      previewBytes: vi.fn(() => ({
        info: { generation: 1, seq: 1, sha256: "sha" },
        bytes,
      })),
    };
    const service = ctx.get("typstWorkbench")!;
    vi.spyOn(service, "sessionFor").mockResolvedValue(session as never);
    const runtime = ctx.get("typstStatus")!;
    const result = await runtime.readPreview(
      { sessionId: "s" as never, workspaceRoot: "/workspace" },
      { generation: 1, seq: 1, sha256: "sha" },
      new AbortController().signal,
    );
    // Identity, not a copy: the gateway records the view for its attachment.
    expect(result.data).toBe(bytes);
  } finally {
    await typert.dispose();
    await subprocess.dispose();
    await sessions.dispose();
  }
});

it("restarts active sessions and leaves idle ones for their first request", async () => {
  const ctx = new Context();
  ctx.provide("tools", { register: vi.fn(() => () => undefined) } as never);
  ctx.provide("skills", { register: vi.fn(() => () => undefined) } as never);
  const sessions = await ctx.plugin(SessionStore);
  const subprocess = await ctx.plugin(LocalSubprocessRuntime);
  const typert = await ctx.plugin(TypertRegistry);
  const fonts = createVolatile<string[]>([]);
  const workbench = await ctx.plugin(TypstWorkbenchService, {
    typstPath: "",
    fontPaths: [],
    packagePath: "",
    excludeDirs: [],
  });
  try {
    const service = ctx.get("typstWorkbench")!;
    // The loader hands the constructor volatile references after schema
    // validation; this test installs the same shape on the live entry.
    Reflect.set(service, "entry", {
      typstPath: "",
      fontPaths: fonts,
      packagePath: "",
      excludeDirs: [],
    });
    const live = (
      service as unknown as {
        sessions: Map<
          string,
          { active: boolean; restart: () => Promise<void> }
        >;
      }
    ).sessions;
    const active = { active: true, restart: vi.fn(async () => undefined) };
    const idle = { active: false, restart: vi.fn(async () => undefined) };
    live.set("/active", active);
    live.set("/idle", idle);
    updateVolatile(fonts, createVolatile(["/Fonts/New"]));
    ctx.emit("loader/volatile-update", [["fontPaths"]]);
    await vi.waitFor(() => {
      expect(active.restart).toHaveBeenCalledTimes(1);
    });
    expect(idle.restart).not.toHaveBeenCalled();
  } finally {
    await workbench.dispose();
    await typert.dispose();
    await subprocess.dispose();
    await sessions.dispose();
  }
});
