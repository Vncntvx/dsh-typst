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
import type {} from "@deepseek-ai/dsh-subprocess";
import type { Session } from "@deepseek-ai/dsh-session";
import { dshCachePath } from "@deepseek-ai/dsh-home-paths";
import type {} from "@deepseek-ai/dsh-typert-registry";
import {
  Config,
  readResolvedConfig,
  settingsChanged,
  toLiveEntry,
  type LiveEntry,
  type ResolvedConfig,
} from "./config.js";
import { registerTypstTools } from "./tools/registration.js";
import { registerTypstSkill } from "./skills/typst.js";
import { TypstRuntime } from "./remote.js";
import {
  TYPST_SCOPE_HOST_SYMBOL,
  TYPST_SCOPE_WIRE_SYMBOL,
} from "./constants.js";
import { TYPERT_MANIFEST } from "./typert.js";
import { WorkspaceSession } from "./workspace/session.js";

declare module "@deepseek-ai/cordis" {
  interface Context {
    typstWorkbench: TypstWorkbenchService;
  }
}

export class TypstWorkbenchService extends Service {
  static inject = ["tools", "subprocess"];

  static Config = Config;

  /** Live entry config: volatile references re-read per request. */
  private readonly entry: LiveEntry;

  /** The last settings snapshot applied to live sessions, for change detection. */
  private appliedSettings: ResolvedConfig;

  /** Settings commits are serialized: two overlapping commits never race a watch. */
  private settingsQueue: Promise<void> = Promise.resolve();

  /** Workspace sessions keyed by resolved workspace root. */
  private readonly sessions = new Map<string, WorkspaceSession>();

  /** Workspace roots whose lazy session is being closed; new callers wait. */
  private readonly closing = new Map<string, Promise<void>>();

  constructor(ctx: Context, config: Config) {
    super(ctx, "typstWorkbench");
    this.entry = toLiveEntry(config);
    this.appliedSettings = readResolvedConfig(this.entry);
  }

  /** The live entry's current values, read per request. */
  private get resolved(): ResolvedConfig {
    return readResolvedConfig(this.entry);
  }

  protected async [Service.init](): Promise<void> {
    const ctx = this.ctx;
    // The manifest describes the wire surface, but the Gateway invokes a
    // live Cordis service. Keep the runtime under this service's ownership so
    // it is present for every request and is disposed with the workbench.
    ctx.plugin(TypstRuntime);
    // The scope lookup resolves the wire SessionId to the workspace root. Its
    // lookup shape is adapted from `workspaceFileScope` in
    // `@deepseek-ai/dsh-api-workspace-files`; this plugin does not depend on
    // that package.
    ctx.inject(["sessions", "typert"], (scope) => {
      // The last live session for a workspace releases its typst watch; the
      // plugin disposer remains the final fallback for process teardown.
      scope.on("session/disposed", (session) => {
        this.releaseIfUnused(scope, session).catch((error) =>
          scope.logger.warn(`typst session release failed: ${String(error)}`),
        );
      });
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
            hostTypeSymbol: TYPST_SCOPE_HOST_SYMBOL,
            // The wire value is the session id, so the symbol names the session
            // package's real type; strict Gateway resolution compares it with
            // the invocation codec.
            wireTypeSymbol: TYPST_SCOPE_WIRE_SYMBOL,
            resolve: (sessionId) => {
              const live = scope.sessions.get(sessionId);
              const header = live?.header;
              if (header === undefined) return undefined;
              // The panel must follow the same current directory the tools use;
              // header.cwd is the immutable project the session started in.
              const current =
                live === undefined
                  ? undefined
                  : scope.get("workingDirectory")?.get(live);
              return {
                sessionId,
                workspaceRoot:
                  current ??
                  header.cwd ??
                  scope.get("workingDirectory")?.defaultDirectory ??
                  process.cwd(),
              };
            },
          }),
        "typst: session scope lookup",
      );
    });
    // A settings commit reaches the running fiber as a volatile update. A
    // changed toolchain input restarts each live session's watch; a changed
    // exclusion list only re-scans its candidates.
    ctx.on("loader/volatile-update", () => {
      this.scheduleSettingsApply();
    });
    // Ordered teardown: the snapshot is taken inside the disposer, after all
    // lazy sessions exist; closing an init-time snapshot would always be empty.
    ctx.effect(
      () => async () => {
        const sessions = [...this.sessions.values()];
        this.sessions.clear();
        await Promise.allSettled(sessions.map((session) => session.close()));
      },
      "typst: session teardown",
    );
    // Process exit: a real listener, not just the fiber disposer. killNow is
    // synchronous and idempotent; the subprocess provider also terminates its
    // managed ranges, so this is the plugin half of the same teardown.
    ctx.effect(() => {
      const onExit = (): void => {
        for (const session of this.sessions.values()) session.killNow();
      };
      process.prependListener("exit", onExit);
      return () => process.off("exit", onExit);
    }, "typst: process-exit kill");
    registerTypstTools(ctx, this);
    registerTypstSkill(ctx);
  }

  /**
   * The workspace's session, creating it on first use. Keyed by the
   * realpath of the workspace root so symlinked paths of the same workspace
   * share one watcher.
   * @param workspaceRoot - the session workspace's absolute root.
   */
  async sessionFor(workspaceRoot: string): Promise<WorkspaceSession> {
    const root = await this.canonical(workspaceRoot);
    const closing = this.closing.get(root);
    if (closing !== undefined) await closing;
    const existing = this.sessions.get(root);
    if (existing !== undefined) return existing;
    const session = new WorkspaceSession({
      workspaceRoot: root,
      resolveSettings: () => this.resolved,
      dataDir: dshCachePath("typst"),
      subprocess: this.ctx.subprocess,
      log: (message) => this.ctx.logger.debug(`[dsh-typst] ${message}`),
    });
    this.sessions.set(root, session);
    return session;
  }

  /** Realpath when it exists; the original spelling otherwise. */
  private async canonical(path: string): Promise<string> {
    return realpath(path).catch(() => path);
  }

  /**
   * Close a workspace's session once its last live session is gone. The
   * disposed session is excluded from the live set because the store removes
   * it before announcing disposal.
   */
  private async releaseIfUnused(
    scope: Context,
    disposed: Session,
  ): Promise<void> {
    const root = await this.canonical(
      scope.get("workingDirectory")?.get(disposed) ?? disposed.header.cwd,
    );
    const live = scope.get("sessions")?.list() ?? [];
    const roots = await Promise.all(
      live
        .filter((session) => session !== disposed)
        .map((session) =>
          this.canonical(
            scope.get("workingDirectory")?.get(session) ?? session.header.cwd,
          ),
        ),
    );
    if (roots.includes(root)) return;
    const session = this.sessions.get(root);
    if (session === undefined) return;
    this.sessions.delete(root);
    const close = (async () => {
      try {
        await session.close();
      } catch (error) {
        scope.logger.warn(`typst workspace close failed: ${String(error)}`);
      } finally {
        this.closing.delete(root);
      }
    })();
    this.closing.set(root, close);
    await close;
  }

  /**
   * Diff the committed settings against the ones already applied. A toolchain
   * change (binary, fonts, packages) restarts the watch; an exclusion change
   * only re-runs discovery, because discovery is exactly what it feeds.
   */
  private scheduleSettingsApply(): void {
    // Read inside the queue: two commits that arrive while one apply runs
    // coalesce into the snapshot the next job sees, never into a diff against
    // values this job has not applied yet.
    this.settingsQueue = this.settingsQueue
      .then(async () => {
        const next = readResolvedConfig(this.entry);
        const change = settingsChanged(this.appliedSettings, next);
        if (change === null) return;
        await this.applySettings(change.toolchain);
        this.appliedSettings = next;
      })
      .catch((error) =>
        this.ctx.logger.warn(`typst settings apply failed: ${String(error)}`),
      );
  }

  /** Apply one settings change to every active session, in order; inactive ones read it when they start. */
  private async applySettings(toolchain: boolean): Promise<void> {
    for (const session of this.sessions.values()) {
      if (!session.active) continue;
      try {
        if (toolchain) await session.restart();
        else await session.refreshCandidates(true);
      } catch (error) {
        this.ctx.logger.warn(
          `typst session settings update failed: ${String(error)}`,
        );
      }
    }
  }
}
