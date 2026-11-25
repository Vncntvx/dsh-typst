/**
 * The hand-written host Typert manifest for the typst Remote. Registered
 * through `ctx.typert.register` in the service body, not as a generated
 * `./typert` artifact: Typert's generator runs only inside a workspace root
 * that contains both `tsconfig.host.json` and `packages/`, and this
 * repository is a standalone checkout with neither. The registry documents
 * `ctx.typert.register()` as the path for hand-written wire schemas. No
 * `./typert` export is declared on purpose: the production Loader row is the
 * npm package `dsh-typst-plugin`, and registering the same `package#face`
 * twice fails with "already registered". The wire namespace remains `typst`
 * (the Cordis service key / `TYPST_REMOTE_NAMESPACE`), independent of the
 * package identity. The strict registry is the Host Gateway's preferred
 * resolution path and needs no `@Remote` markers.
 *
 * Invocations come from `status-codec.ts` (host zod factories); the client
 * half mounts its own codecs in `client/status-codec.ts`. Both arms
 * materialize the same strict schemas from the client-safe
 * `wire-schemas.ts`. Structural endpoint identity is shared through
 * `contract.ts`.
 * @module dsh-typst/typert
 */
import { TYPST_REMOTE_PACKAGE, TYPST_STATUS_SERVICE_KEY } from "./constants.js";
import { TYPST_INVOCATIONS_HOST } from "./status-codec.js";
/** The typst namespace's host manifest (strict codecs owned by this half). */
export const TYPERT_MANIFEST = {
    package: TYPST_REMOTE_PACKAGE,
    face: "host",
    schemas: [],
    model: {
        services: [
            {
                key: TYPST_STATUS_SERVICE_KEY,
                exportName: "TypstRuntime",
                description: "Serves the Typst workbench to the panel: state frames, the live watch stream, the preview bytes, file discovery, and source matching.",
                tags: [],
                members: [
                    {
                        kind: "method",
                        name: "status",
                        signature: "status(typstScope: TypstScope, signal: AbortSignal): Promise<TypstStateFrame>",
                    },
                    {
                        kind: "method",
                        name: "setMain",
                        signature: "setMain(typstScope: TypstScope, path: string, signal: AbortSignal): Promise<{ main: string }>",
                    },
                    {
                        kind: "method",
                        name: "watch",
                        signature: "@Remote({ mode: 'stream' }) watch(typstScope: TypstScope, signal: AbortSignal): AsyncIterable<TypstStateFrame>",
                    },
                    {
                        kind: "method",
                        name: "readPreview",
                        signature: "readPreview(typstScope: TypstScope, identity: PreviewIdentity, signal: AbortSignal): Promise<PreviewBytes>",
                    },
                    {
                        kind: "method",
                        name: "locateSource",
                        signature: "locateSource(typstScope: TypstScope, text: string, focus: string | null, signal: AbortSignal): Promise<{ matches: SourceMatch[] }>",
                    },
                    {
                        kind: "method",
                        name: "recheck",
                        signature: "recheck(typstScope: TypstScope, signal: AbortSignal): Promise<TypstStateFrame>",
                    },
                    {
                        kind: "method",
                        name: "restart",
                        signature: "restart(typstScope: TypstScope, signal: AbortSignal): Promise<TypstStateFrame>",
                    },
                    {
                        kind: "method",
                        name: "discover",
                        signature: "discover(typstScope: TypstScope, includeExcluded: boolean, signal: AbortSignal): Promise<DiscoveryView>",
                    },
                ],
                /**
                 * Declarations for every named business type the member signatures
                 * reference. The reflection model requires these to be present; the
                 * codecs in `invocations` remain the wire authority.
                 */
                types: [
                    {
                        name: "TypstScope",
                        declaration: "export interface TypstScope { readonly sessionId: SessionId; readonly workspaceRoot: string }",
                    },
                    {
                        name: "TypstStateFrame",
                        declaration: "export interface TypstStateFrame { version: number; generation: number; previewError: string | null; discovery: object; toolchain: object; workspace: string; workspaceRoot: string; main: string | null; candidates: string[]; fragments: string[]; status: object; diagnostics: object[]; diagnosticsTotal: number; diagnosticsTruncated: boolean; snapshot: object | null; highlights: object[]; view: object; viewSeq: number; setup: object }",
                    },
                    {
                        name: "PreviewIdentity",
                        declaration: "export interface PreviewIdentity { generation: number; seq: number; sha256: string }",
                    },
                    {
                        name: "PreviewBytes",
                        declaration: "export interface PreviewBytes extends PreviewIdentity { data: Uint8Array<ArrayBuffer> }",
                    },
                    {
                        name: "SourceMatch",
                        declaration: "export interface SourceMatch { file: string; line: number; column: number; endLine: number; excerpt: string; score: number }",
                    },
                    {
                        name: "DiscoveryView",
                        declaration: "export interface DiscoveryView { candidates: number; includeExcluded: boolean; errors: string[] }",
                    },
                ],
            },
        ],
        events: [],
        objects: [],
    },
    invocations: TYPST_INVOCATIONS_HOST,
};
//# sourceMappingURL=typert.js.map