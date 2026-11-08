import { Context } from "@deepseek-ai/cordis";
import SessionStore from "@deepseek-ai/dsh-session";
import TypertRegistry from "@deepseek-ai/dsh-typert-registry";
import { describe, expect, it, vi } from "vitest";
import { TypstWorkbenchService } from "../../src/service.js";

describe("Typst host composition", () => {
  it("mounts and withdraws the Remote runtime and strict scope lookup with the workbench", async () => {
    const ctx = new Context();
    ctx.provide("tools", { register: vi.fn(() => () => undefined) } as never);
    ctx.provide("skills", { register: vi.fn(() => () => undefined) } as never);
    const sessions = await ctx.plugin(SessionStore);
    const typert = await ctx.plugin(TypertRegistry);
    const workbench = await ctx.plugin(TypstWorkbenchService, {
      typstPath: "",
    });

    try {
      const runtime = ctx.get("typstStatus");
      expect(runtime).toBeDefined();
      expect(runtime?.typertRemote.namespace).toBe("typst");
      expect(ctx.typert.getPackage("typst", "host")).toBeDefined();
      expect(ctx.typert.lookups.get("typstScope")).toMatchObject({
        parameter: "typstScope",
        wire: "typstScopeId",
        wireTypeSymbol: "@deepseek-ai/dsh-typst#TypstScopeId",
      });

      await workbench.dispose();

      expect(ctx.get("typstStatus")).toBeUndefined();
      expect(ctx.typert.lookups.get("typstScope")).toBeUndefined();
    } finally {
      await workbench.dispose();
      await sessions.dispose();
      await typert.dispose();
    }
  });
});
