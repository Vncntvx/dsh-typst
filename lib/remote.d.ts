/**
 * The host Typert Remote runtime for the `typst` namespace: state frames,
 * the live watch stream, preview bytes, file discovery, and source
 * matching, all scoped to the calling Session's workspace through the
 * `typstScope` lookup, adapted from the `workspaceFileScope` lookup shape in
 * `@deepseek-ai/dsh-api-workspace-files` (that package is a reference, not a
 * dependency of this plugin). Host half only.
 * @module dsh-typst/remote
 */
import type { Context } from "@deepseek-ai/cordis";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { TypertRemoteService, type TypertLookup } from "@deepseek-ai/dsh-typert-protocol";
import type { DiscoveryView, PreviewIdentity, PreviewBytes, TypstStateFrame } from "./contract.js";
import type { SourceMatch } from "./typst/match.js";
/**
 * The session identity every endpoint is scoped by: received on the wire as
 * the calling Session's id, resolved to its workspace root before the method
 * body runs.
 */
export interface TypstScope {
    readonly sessionId: SessionId;
    readonly workspaceRoot: string;
}
declare module "@deepseek-ai/dsh-typert-protocol" {
    interface TypertLookupMap {
        /** Resolve a Session id to its workspace root without loading its event body or activating an Agent. */
        typstScope: TypertLookup<TypstScope, SessionId>;
    }
}
/**
 * The `typst` namespace's host service. Every method resolves the calling
 * session's workspace through the service's session registry, so two
 * sessions on two workspaces preview independently.
 */
export declare class TypstRuntime extends TypertRemoteService {
    /**
     * Register the service under the shared cordis key bound to the `typst`
     * wire namespace.
     * @param ctx - owning cordis context.
     */
    constructor(ctx: Context);
    /** The composed workbench service, or a stable not-composed failure. */
    private workbench;
    /** Live state frame for the calling session's workspace; activates the session. */
    status(typstScope: TypstScope, signal: AbortSignal): Promise<TypstStateFrame>;
    /** Choose the main `.typ` file; state updates follow on the watch stream. */
    setMain(typstScope: TypstScope, path: string, signal: AbortSignal): Promise<{
        main: string;
    }>;
    /**
     * The live state stream: the current frame first, then one frame per
     * relevant change. Opening the stream counts as a panel subscription, so
     * the setup re-lookup runs while Typst is unusable and stops when the
     * stream closes.
     */
    watch(typstScope: TypstScope, signal: AbortSignal): AsyncIterable<TypstStateFrame>;
    /** The current preview PDF's bytes, or the telling no-preview failure. */
    readPreview(typstScope: TypstScope, identity: PreviewIdentity, signal: AbortSignal): Promise<PreviewBytes>;
    /** Match rendered text against the workspace's sources (the panel's selection toolbar). */
    locateSource(typstScope: TypstScope, text: string, focus: string | null, signal: AbortSignal): Promise<{
        matches: SourceMatch[];
    }>;
    /** Look Typst up again (the setup page's refresh); answers with the new frame. */
    recheck(typstScope: TypstScope, signal: AbortSignal): Promise<TypstStateFrame>;
    /** Stop the watch, relocate typst, rescan, restart; answers with the new frame. */
    restart(typstScope: TypstScope, signal: AbortSignal): Promise<TypstStateFrame>;
    /** Refresh the cancellable workspace index, optionally including excluded directories. */
    discover(typstScope: TypstScope, includeExcluded: boolean, signal: AbortSignal): Promise<DiscoveryView>;
}
//# sourceMappingURL=remote.d.ts.map