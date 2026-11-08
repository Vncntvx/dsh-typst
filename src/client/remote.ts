/**
 * The client-side Typert Remote contribution for the dsh-typst host
 * service: mounts the shared structural descriptors into `ctx.remote.typst`.
 *
 * Endpoint identity comes from `../wire-schemas.ts` (types + shared
 * invocations, no host zod). The client Gateway decodes a unary result only
 * through `descriptor.result.decode`, so a pure-JSON result arrives
 * unvalidated and the client factory is not called at runtime. The byte
 * result (`readPreview`) decodes through the shared codec's encode arm.
 * @module dsh-typst/client/remote
 */

import type {
  RemoteResult,
  RemoteStreamHandle,
  TypertRemoteContribution,
} from "@deepseek-ai/dsh-typert-protocol";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type {
  PreviewBytes,
  PreviewIdentity,
  SourceMatch,
  TypstStateFrame,
} from "../contract.js";
import { TYPST_INVOCATIONS_CLIENT } from "./status-codec.js";

export type {
  PreviewIdentity,
  SourceMatch,
  TypstStateFrame,
} from "../contract.js";

/** The client's view of one preview read (the shared wire type). */
export type PreviewBytesView = PreviewBytes;

/**
 * The mounted `typst` namespace face (available after `$mount` + inject on
 * the consuming fiber). The declare-module block below merges it into the
 * protocol's namespace map under the wire's name.
 */
export interface TypstNamespace {
  status: (
    typstScopeId: SessionId,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<TypstStateFrame>>;
  setMain: (
    typstScopeId: SessionId,
    path: string,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<{ main: string }>>;
  watch: (
    typstScopeId: SessionId,
    signal: AbortSignal,
  ) => RemoteStreamHandle<TypstStateFrame, never>;
  readPreview: (
    typstScopeId: SessionId,
    identity: PreviewIdentity,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<PreviewBytesView>>;
  locateSource: (
    typstScopeId: SessionId,
    text: string,
    focus: string | null,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<{ matches: SourceMatch[] }>>;
  recheck: (typstScopeId: SessionId) => Promise<RemoteResult<TypstStateFrame>>;
  restart: (typstScopeId: SessionId) => Promise<RemoteResult<TypstStateFrame>>;
  discover: (
    typstScopeId: SessionId,
    includeExcluded: boolean,
    signal?: AbortSignal,
  ) => Promise<RemoteResult<object>>;
}

/** The `typst` namespace's client contribution. */
export const TYPST_REMOTE: TypertRemoteContribution = {
  package: "typst",
  descriptors: TYPST_INVOCATIONS_CLIENT,
};

/** Build the state-resource address for one session's workspace. */
export function typstStateAddress(sessionId: SessionId): string {
  return `${TYPST_STATE_ADDRESS_PREFIX}${sessionId}`;
}

declare module "@deepseek-ai/dsh-typert-protocol" {
  // Typed face of the mounted namespace. `index.ts` mounts this contribution
  // with `ctx.remote.$mount`, then registers the UI through
  // `ctx.inject(['remote.typst', …], registerUi)`, so the official dotted
  // read `ctx.remote.typst` resolves it on that fiber. The face extends the
  // module-local `TypstNamespace` so the two cannot drift.
  /** The `typst` namespace face mounted under `ctx.remote.typst`. */
  interface TypertRemoteNamespaceMap {
    typst: TypstNamespace;
  }
  interface TypertRemoteMap {
    "typst/status": TypstNamespace["status"];
    "typst/setMain": TypstNamespace["setMain"];
    "typst/watch": TypstNamespace["watch"];
    "typst/readPreview": TypstNamespace["readPreview"];
    "typst/locateSource": TypstNamespace["locateSource"];
    "typst/recheck": TypstNamespace["recheck"];
    "typst/restart": TypstNamespace["restart"];
    "typst/discover": TypstNamespace["discover"];
  }
}

declare module "@deepseek-ai/dsh-client-ui-slots" {
  // The panel reads the live state through one resource.
  interface ResourceProtocolMap {
    /** The Typst workbench state frame of one workspace (the panel's data). */
    typst: TypstStateFrame;
  }
}

/** The wire identity of the panel's state resource (per session). */
export const TYPST_STATE_ADDRESS_PREFIX = "dsh-resource://typst/state/";
