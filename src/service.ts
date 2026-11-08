/**
 * `ctx.typstWorkbench`: the plugin's stable boundary. It owns the per-
 * workspace `WorkspaceSession` registry (one `typst watch` per workspace
 * root, stopped on dispose), the plugin configuration lifecycle, the Typert
 * manifest and scope lookup, and the agent tools. Host half only.
 *
 * Request-driven like the dsh-zotero core: loading the plugin never spawns
 * typst and touches nothing on disk. The first tool call, or the first
 * panel subscription on a workspace, starts that workspace's session.
 * @module dsh-typst/service
 */

import { realpath } from "node:fs/promises";
import { Service, type Context } from "@deepseek-ai/cordis";
// Type-only: the loader `loader/volatile-update` merge for the config reaction.
import type {} from "@deepseek-ai/cordis-plugin-loader";
import { dshCachePath } from "@deepseek-ai/dsh-home-paths";
import type {} from "@deepseek-ai/dsh-typert-registry";
import {
  Config,
  readResolvedConfig,
  toLiveEntry,
  type LiveEntry,
} from "./config.js";
import { registerTypstTools } from "./tools/registration.js";
import { registerTypstSkill } from "./skills/typst.js";
import { TypstRuntime } from "./remote.js";
import { TYPERT_MANIFEST } from "./typert.js";
import { WorkspaceSession } from "./workspace/session.js";

declare module "@deepseek-ai/cordis" {
  interface Context {
    typstWorkbench: TypstWorkbenchService;
  }
}

export class TypstWorkbenchService extends Service {
  static inject = ["tools"];

  static Config = Config;

  /** Live entry config: volatile references re-read per request. */
  private readonly entry: LiveEntry;

  /** Workspace sessions keyed by resolved workspace root. */
  private readonly sessions = new Map<string, WorkspaceSession>();

  constructor(ctx: Context, config: Config) {
    super(ctx, "typstWorkbench");
    this.entry = toLiveEntry(config);
  }

  /** The live entry's current values, read per request. */
  private get resolved(): { typstPath: string } {
    return readResolvedConfig(this.entry);
  }

  protected async [Service.init](): Promise<void> {
    const ctx = this.ctx;
    // The manifest describes the wire surface, but the Gateway invokes a
    // live Cordis service. Keep the runtime under this service's ownership so
    // it is present for every request and is disposed with the workbench.
    ctx.plugin(TypstRuntime);
    // The scope lookup resolves the wire SessionId to the workspace root
    // (the `workspaceFileScope` pattern from dsh-api-workspace-files).
    ctx.inject(["sessions", "typert"], (scope) => {
      scope.effect(
        () => scope.typert.register(TYPERT_MANIFEST),
        "typst: wire manifest",
      );
      scope.effect(
        () =>
          scope.typert.lookups.register("typstScope", {
            parameter: "typstScope",
            wire: "typstScopeId",
            resource: "session",
            hostTypeSymbol: "dsh-typst#TypstScope",
            // The invocation codec carries the public TypstScopeId alias;
            // strict Gateway resolution requires this symbol to match it.
            wireTypeSymbol: "@deepseek-ai/dsh-typst#TypstScopeId",
            resolve: (sessionId) => {
              const header = scope.sessions.get(sessionId)?.header;
              if (header === undefined) return undefined;
              return {
                sessionId,
                workspaceRoot:
                  header.cwd ??
                  scope.get("workingDirectory")?.defaultDirectory ??
                  process.cwd(),
              };
            },
          }),
        "typst: session scope lookup",
      );
    });
    // A changed Typst path makes every live workspace look the binary up
    // again (the watcher restarts; sessions converge without remounting).
    ctx.on("loader/volatile-update", () => {
      void this.recheckAll();
    });
    // Ordered teardown: close every session (watchers included).
    ctx.effect(() => {
      const sessions = [...this.sessions.values()];
      return async () => {
        await Promise.all(sessions.map((session) => session.close()));
        this.sessions.clear();
      };
    }, "typst: session teardown");
    // Process exit: synchronous tree kill.
    ctx.effect(
      () => () => {
        for (const session of this.sessions.values()) session.killNow();
      },
      "typst: process-exit kill",
    );
    registerTypstTools(ctx, this);
    registerTypstSkill(ctx);
  }

  /** The configured Typst path setting ('' = look it up). */
  get typstPath(): string {
    return this.resolved.typstPath;
  }

  /**
   * The workspace's session, creating it on first use. Keyed by the
   * realpath of the workspace root so symlinked paths of the same workspace
   * share one watcher.
   * @param workspaceRoot - the session workspace's absolute root.
   */
  async sessionFor(workspaceRoot: string): Promise<WorkspaceSession> {
    const root = await realpath(workspaceRoot).catch(() => workspaceRoot);
    const existing = this.sessions.get(root);
    if (existing !== undefined) return existing;
    const session = new WorkspaceSession({
      workspaceRoot: root,
      typstPath: this.typstPath || undefined,
      dataDir: dshCachePath("typst"),
      log: (message) => this.ctx.logger.debug(`[dsh-typst] ${message}`),
    });
    this.sessions.set(root, session);
    return session;
  }

  /** A changed Typst path makes every live session look the binary up again. */
  private async recheckAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.recheck(true).catch(() => undefined);
    }
  }
}
