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
import { Service, type Context } from "@deepseek-ai/cordis";
import { Config } from "./config.js";
import { WorkspaceSession } from "./workspace/session.js";
declare module "@deepseek-ai/cordis" {
    interface Context {
        typstWorkbench: TypstWorkbenchService;
    }
}
export declare class TypstWorkbenchService extends Service {
    static inject: string[];
    static Config: import("@deepseek-ai/schemastery").default<Schemastery.ObjectS<NoInfer<{
        typstPath: import("@deepseek-ai/schemastery").default<string, string, "volatile-defined">;
        fontPaths: import("@deepseek-ai/schemastery").default<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
        packagePath: import("@deepseek-ai/schemastery").default<string, string, "volatile-defined">;
        excludeDirs: import("@deepseek-ai/schemastery").default<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    }>>, Schemastery.ObjectT<NoInfer<{
        typstPath: import("@deepseek-ai/schemastery").default<string, string, "volatile-defined">;
        fontPaths: import("@deepseek-ai/schemastery").default<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
        packagePath: import("@deepseek-ai/schemastery").default<string, string, "volatile-defined">;
        excludeDirs: import("@deepseek-ai/schemastery").default<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    }>>, "plain">;
    /** Live entry config: volatile references re-read per request. */
    private readonly entry;
    /** The last settings snapshot applied to live sessions, for change detection. */
    private appliedSettings;
    /** Settings commits are serialized: two overlapping commits never race a watch. */
    private settingsQueue;
    /** Workspace sessions keyed by resolved workspace root. */
    private readonly sessions;
    /** Workspace roots whose lazy session is being closed; new callers wait. */
    private readonly closing;
    constructor(ctx: Context, config: Config);
    /** The live entry's current values, read per request. */
    private get resolved();
    protected [Service.init](): Promise<void>;
    /**
     * The workspace's session, creating it on first use. Keyed by the
     * realpath of the workspace root so symlinked paths of the same workspace
     * share one watcher.
     * @param workspaceRoot - the session workspace's absolute root.
     */
    sessionFor(workspaceRoot: string): Promise<WorkspaceSession>;
    /** Realpath when it exists; the original spelling otherwise. */
    private canonical;
    /**
     * Close a workspace's session once its last live session is gone. The
     * disposed session is excluded from the live set because the store removes
     * it before announcing disposal.
     */
    private releaseIfUnused;
    /**
     * Diff the committed settings against the ones already applied. A toolchain
     * change (binary, fonts, packages) restarts the watch; an exclusion change
     * only re-runs discovery, because discovery is exactly what it feeds.
     */
    private scheduleSettingsApply;
    /** Apply one settings change to every active session, in order; inactive ones read it when they start. */
    private applySettings;
}
//# sourceMappingURL=service.d.ts.map