/**
 * The host Typert Remote runtime for the `typst` namespace: state frames,
 * the live watch stream, preview bytes, file discovery, and source
 * matching, all scoped to the calling Session's workspace through the
 * `typstScope` lookup (the `workspaceFileScope` pattern from
 * `@deepseek-ai/dsh-api-workspace-files`). Host half only.
 * @module dsh-typst/remote
 */

import type { Context } from "@deepseek-ai/cordis";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import {
  TypertRemoteService,
  type TypertLookup,
} from "@deepseek-ai/dsh-typert-protocol";
import {
  TYPST_STATUS_SERVICE_KEY,
  TYPST_SETTINGS_NAMESPACE,
} from "./constants.js";
import type {
  PreviewIdentity,
  PreviewBytes,
  TypstStateFrame,
} from "./contract.js";
import {
  domainCall,
  TYPST_NOT_COMPOSED_MESSAGE,
  TypstError,
  TYPST_NOT_COMPOSED,
} from "./errors.js";
import type { TypstWorkbenchService } from "./service.js";
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
export class TypstRuntime extends TypertRemoteService {
  /**
   * Register the service under the shared cordis key bound to the `typst`
   * wire namespace.
   * @param ctx - owning cordis context.
   */
  constructor(ctx: Context) {
    super(ctx, TYPST_STATUS_SERVICE_KEY, {
      namespace: TYPST_SETTINGS_NAMESPACE,
    });
  }

  /** The composed workbench service, or a stable not-composed failure. */
  private workbench(): TypstWorkbenchService {
    const service = this.ctx.get("typstWorkbench");
    if (service === undefined) {
      throw new TypstError(TYPST_NOT_COMPOSED_MESSAGE, TYPST_NOT_COMPOSED);
    }
    return service;
  }

  /** Live state frame for the calling session's workspace; activates the session. */
  async status(
    typstScope: TypstScope,
    signal: AbortSignal,
  ): Promise<TypstStateFrame> {
    signal.throwIfAborted();
    return domainCall(async () => {
      const session = await this.workbench().sessionFor(
        typstScope.workspaceRoot,
      );
      await session.activate();
      return session.state();
    });
  }

  /** Choose the main `.typ` file; state updates follow on the watch stream. */
  async setMain(
    typstScope: TypstScope,
    path: string,
    signal: AbortSignal,
  ): Promise<{ main: string }> {
    signal.throwIfAborted();
    return domainCall(async () => {
      const session = await this.workbench().sessionFor(
        typstScope.workspaceRoot,
      );
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
  async *watch(
    typstScope: TypstScope,
    signal: AbortSignal,
  ): AsyncIterable<TypstStateFrame> {
    signal.throwIfAborted();
    const session = await domainCall(async () => {
      const workbench = this.workbench();
      const workspaceSession = await workbench.sessionFor(
        typstScope.workspaceRoot,
      );
      await workspaceSession.activate();
      return workspaceSession;
    });
    session.watchSetup(true);
    try {
      const queue = session.state();
      yield queue;
      for await (const _ of session.onChangeWaiter(signal)) {
        yield session.state();
      }
    } finally {
      session.watchSetup(false);
    }
  }

  /** The current preview PDF's bytes, or the telling no-preview failure. */
  async readPreview(
    typstScope: TypstScope,
    identity: PreviewIdentity,
    signal: AbortSignal,
  ): Promise<PreviewBytes> {
    signal.throwIfAborted();
    return domainCall(async () => {
      const session = await this.workbench().sessionFor(
        typstScope.workspaceRoot,
      );
      const { info, bytes } = session.previewBytes(identity);
      return {
        generation: info.generation,
        seq: info.seq,
        sha256: info.sha256,
        data: Uint8Array.from(bytes),
      };
    });
  }

  /** Match rendered text against the workspace's sources (the panel's selection toolbar). */
  async locateSource(
    typstScope: TypstScope,
    text: string,
    focus: string | null,
    signal: AbortSignal,
  ): Promise<{ matches: SourceMatch[] }> {
    signal.throwIfAborted();
    return domainCall(async () => {
      const session = await this.workbench().sessionFor(
        typstScope.workspaceRoot,
      );
      const matches = await session.locateSource(text, focus ?? undefined);
      return { matches };
    });
  }

  /** Look Typst up again (the setup page's refresh); answers with the new frame. */
  async recheck(
    typstScope: TypstScope,
    signal: AbortSignal,
  ): Promise<TypstStateFrame> {
    signal.throwIfAborted();
    return domainCall(async () => {
      const session = await this.workbench().sessionFor(
        typstScope.workspaceRoot,
      );
      await session.recheck(true);
      return session.state();
    });
  }

  /** Stop the watch, relocate typst, rescan, restart; answers with the new frame. */
  async restart(
    typstScope: TypstScope,
    signal: AbortSignal,
  ): Promise<TypstStateFrame> {
    signal.throwIfAborted();
    return domainCall(async () => {
      const session = await this.workbench().sessionFor(
        typstScope.workspaceRoot,
      );
      await session.restart();
      return session.state();
    });
  }

  /** Refresh the cancellable workspace index, optionally including excluded directories. */
  async discover(
    typstScope: TypstScope,
    includeExcluded: boolean,
    signal: AbortSignal,
  ): Promise<object> {
    signal.throwIfAborted();
    return domainCall(async () => {
      const session = await this.workbench().sessionFor(
        typstScope.workspaceRoot,
      );
      await session.discover(includeExcluded, signal);
      return {};
    });
  }
}
