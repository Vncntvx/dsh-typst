/**
 * The host Typert Remote runtime for the `typst` namespace: state frames,
 * the live watch stream, preview bytes, file discovery, and source
 * matching, all scoped to the calling Session's workspace through the
 * `typstScope` lookup, adapted from the `workspaceFileScope` lookup shape in
 * `@deepseek-ai/dsh-api-workspace-files` (that package is a reference, not a
 * dependency of this plugin). Host half only.
 * @module dsh-typst/remote
 */
import { TypertRemoteService, } from "@deepseek-ai/dsh-typert-protocol";
import { TYPST_STATUS_SERVICE_KEY, TYPST_SETTINGS_NAMESPACE, } from "./constants.js";
import { domainCall, rethrowRemote, TYPST_NOT_COMPOSED_MESSAGE, TypstError, TYPST_NOT_COMPOSED, } from "./errors.js";
/**
 * The `typst` namespace's host service. Every method resolves the calling
 * session's workspace through the service's session registry, so two
 * sessions on two workspaces preview independently.
 */
export class TypstRuntime extends TypertRemoteService {
    /**
     * Register the service under the shared cordis key bound to the `typst`
     * wire namespace.
     * @param ctx - owning cordis context.
     */
    constructor(ctx) {
        super(ctx, TYPST_STATUS_SERVICE_KEY, {
            namespace: TYPST_SETTINGS_NAMESPACE,
        });
    }
    /** The composed workbench service, or a stable not-composed failure. */
    workbench() {
        const service = this.ctx.get("typstWorkbench");
        if (service === undefined) {
            throw new TypstError(TYPST_NOT_COMPOSED_MESSAGE, TYPST_NOT_COMPOSED);
        }
        return service;
    }
    /** Live state frame for the calling session's workspace; activates the session. */
    async status(typstScope, signal) {
        signal.throwIfAborted();
        return domainCall(async () => {
            const session = await this.workbench().sessionFor(typstScope.workspaceRoot);
            await session.activate();
            return session.state();
        });
    }
    /** Choose the main `.typ` file; state updates follow on the watch stream. */
    async setMain(typstScope, path, signal) {
        signal.throwIfAborted();
        return domainCall(async () => {
            const session = await this.workbench().sessionFor(typstScope.workspaceRoot);
            signal.throwIfAborted();
            const main = await session.setMain(path);
            return { main };
        });
    }
    /**
     * The live state stream: the current frame first, then one frame per
     * relevant change. Opening the stream counts as a panel subscription, so
     * the setup re-lookup runs while Typst is unusable and stops when the
     * stream closes.
     */
    async *watch(typstScope, signal) {
        signal.throwIfAborted();
        const session = await domainCall(async () => {
            const workbench = this.workbench();
            const workspaceSession = await workbench.sessionFor(typstScope.workspaceRoot);
            await workspaceSession.activate();
            return workspaceSession;
        });
        session.watchSetup(true);
        signal.throwIfAborted();
        // Subscribe before the first snapshot: the generator registers its
        // listener on the first next(), and a change that lands while the first
        // frame is being written must not be lost.
        const changes = session.onChangeWaiter(signal);
        const wake = changes.next();
        try {
            yield session.state();
            let next = await wake;
            while (!next.done) {
                yield session.state();
                next = await changes.next();
            }
        }
        catch (error) {
            // Preserve the stream failure's own `typst/<reason>` code on the wire.
            rethrowRemote(error);
        }
        finally {
            await changes.return(undefined);
            session.watchSetup(false);
        }
    }
    /** The current preview PDF's bytes, or the telling no-preview failure. */
    async readPreview(typstScope, identity, signal) {
        signal.throwIfAborted();
        return domainCall(async () => {
            const session = await this.workbench().sessionFor(typstScope.workspaceRoot);
            const { info, bytes } = session.previewBytes(identity);
            return {
                generation: info.generation,
                seq: info.seq,
                sha256: info.sha256,
                // The gateway's writeBytes records this view for the RPC attachment;
                // it never transfers or detaches it, so the retained snapshot stays
                // readable for later page extraction and highlight relocation.
                data: bytes,
            };
        });
    }
    /** Match rendered text against the workspace's sources (the panel's selection toolbar). */
    async locateSource(typstScope, text, focus, signal) {
        signal.throwIfAborted();
        return domainCall(async () => {
            const session = await this.workbench().sessionFor(typstScope.workspaceRoot);
            const matches = await session.locateSource(text, focus ?? undefined, signal);
            return { matches };
        });
    }
    /** Look Typst up again (the setup page's refresh); answers with the new frame. */
    async recheck(typstScope, signal) {
        signal.throwIfAborted();
        return domainCall(async () => {
            const session = await this.workbench().sessionFor(typstScope.workspaceRoot);
            signal.throwIfAborted();
            await session.recheck(true);
            return session.state();
        });
    }
    /** Stop the watch, relocate typst, rescan, restart; answers with the new frame. */
    async restart(typstScope, signal) {
        signal.throwIfAborted();
        return domainCall(async () => {
            const session = await this.workbench().sessionFor(typstScope.workspaceRoot);
            signal.throwIfAborted();
            await session.restart();
            return session.state();
        });
    }
    /** Refresh the cancellable workspace index, optionally including excluded directories. */
    async discover(typstScope, includeExcluded, signal) {
        signal.throwIfAborted();
        return domainCall(async () => {
            const session = await this.workbench().sessionFor(typstScope.workspaceRoot);
            signal.throwIfAborted();
            await session.discover(includeExcluded, signal);
            const frame = session.state();
            return {
                candidates: frame.candidates.length,
                includeExcluded,
                errors: frame.discovery.errors,
            };
        });
    }
}
//# sourceMappingURL=remote.js.map