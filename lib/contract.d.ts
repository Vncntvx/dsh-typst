/**
 * Wire identity shared by both halves: the view types the host serves and
 * the browser half renders, plus the strict zod codecs both arms materialize
 * (`wire-schemas.ts`). Values and type-only imports only — this module is on
 * the client-graph allowlist (`scripts/client-graph-authority.mjs`).
 * @module dsh-typst/contract
 */
import type { TypstErrorCode } from "./errors.js";
/**
 * One Remote failure code per stable domain failure: every domain error
 * crosses the wire as its own `typst/<reason>`, so consumers discriminate on
 * `error.code` while `details.code` keeps the host's stable domain code.
 */
declare module "@deepseek-ai/dsh-typert-protocol" {
    interface RemoteErrorDetailsMap {
        "typst/missing": {
            readonly code: TypstErrorCode;
        };
        "typst/too-old": {
            readonly code: TypstErrorCode;
        };
        "typst/unusable": {
            readonly code: TypstErrorCode;
        };
        "typst/no-main": {
            readonly code: TypstErrorCode;
        };
        "typst/no-preview": {
            readonly code: TypstErrorCode;
        };
        "typst/not-found": {
            readonly code: TypstErrorCode;
        };
        "typst/invalid-argument": {
            readonly code: TypstErrorCode;
        };
        "typst/path-outside-workspace": {
            readonly code: TypstErrorCode;
        };
        "typst/timeout": {
            readonly code: TypstErrorCode;
        };
        "typst/watch-failed": {
            readonly code: TypstErrorCode;
        };
        "typst/quote-not-found": {
            readonly code: TypstErrorCode;
        };
        "typst/not-composed": {
            readonly code: TypstErrorCode;
        };
        "typst/attachment-unavailable": {
            readonly code: TypstErrorCode;
        };
        "typst/compile-failed": {
            readonly code: TypstErrorCode;
        };
        "typst/sandbox-read-only": {
            readonly code: TypstErrorCode;
        };
        "typst/sandbox-invalid-root": {
            readonly code: TypstErrorCode;
        };
        "typst/page-out-of-range": {
            readonly code: TypstErrorCode;
        };
        "typst/main-changed": {
            readonly code: TypstErrorCode;
        };
        "typst/clock-skew": {
            readonly code: TypstErrorCode;
        };
        "typst/invalid-target": {
            readonly code: TypstErrorCode;
        };
        "typst/settle-failed": {
            readonly code: TypstErrorCode;
        };
        "typst/unexpected": {
            readonly code: TypstErrorCode;
        };
    }
}
/** Where the located binary came from. */
export type TypstSource = "setting" | "path" | "common" | "shell";
export interface ToolchainReadyView {
    state: "ready";
    version: string;
    path: string;
    source: TypstSource;
}
export interface ToolchainMissingView {
    state: "missing";
}
export interface ToolchainTooOldView {
    state: "too_old";
    version: string;
    path: string;
    source: TypstSource;
    error: string;
}
export interface ToolchainErrorView {
    state: "error";
    path?: string;
    source?: TypstSource;
    error: string;
}
export type ToolchainView = ToolchainReadyView | ToolchainMissingView | ToolchainTooOldView | ToolchainErrorView;
export interface DiagnosticLocationView {
    file: string;
    line: number;
    column: number;
}
export interface DiagnosticPointView {
    message: string;
    location: DiagnosticLocationView | null;
}
export interface DiagnosticView {
    severity: "error" | "warning";
    message: string;
    location: DiagnosticLocationView | null;
    excerpt?: string;
    hints: string[];
    trace: DiagnosticPointView[];
}
export type CompilePhase = "idle" | "starting" | "compiling" | "ok" | "warnings" | "error" | "crashed";
export interface StatusView {
    phase: CompilePhase;
    run: number;
    durationMs?: number;
    error?: string;
    finishedAt?: number;
}
/** Metadata of the current preview PDF; bytes ride `readPreview`. */
export interface PreviewIdentity {
    generation: number;
    seq: number;
    sha256: string;
}
export interface SnapshotView extends PreviewIdentity {
    main: string;
    run: number;
    bytes: number;
    pages: number;
    createdAt: number;
}
export interface SourceRefView {
    file: string;
    line: number;
    endLine: number;
}
/**
 * One agent highlight. Rects are PDF user-space `[x1, y1, x2, y2]` boxes on
 * the page; the panel maps them through the page viewport. `seq` names the
 * snapshot the rects belong to; after a recompile the host re-locates the
 * quote and pushes new rects (unmatched highlights turn `stale`).
 */
export interface HighlightView {
    id: string;
    quote: string;
    comment: string;
    source?: SourceRefView;
    identity: PreviewIdentity;
    seq: number;
    pageIndex: number;
    /** UTF-16 offset of the matched text on its page, kept for re-location. */
    startOffset?: number;
    /** Ordinal of the quote occurrence in its source file, when created from lines. */
    occurrence?: number;
    rects: number[][];
    stale: boolean;
    createdAt: number;
}
/** A location request from `typst_show`; the panel notifies before navigating. */
export type PanelView = {
    kind: "page";
    pageIndex: number;
    identity: PreviewIdentity;
} | {
    kind: "highlight";
    id: string;
    identity: PreviewIdentity;
} | null;
export interface PackageManagerView {
    name: string;
    version?: string;
    path: string;
}
export interface HostFactsView {
    os: "macos" | "windows" | "linux" | "other";
    osName: string;
    arch: string;
    tools: PackageManagerView[];
}
export interface SetupView {
    facts: HostFactsView | null;
    searched: string[];
}
/** What one explicit index refresh discovered, returned to its caller. */
export interface DiscoveryView {
    /** Number of `.typ` candidates the refresh left in the workspace index. */
    candidates: number;
    includeExcluded: boolean;
    errors: string[];
}
/**
 * Everything the panel renders, in one frame: the stream's first frame is
 * the current state, later frames follow every relevant change (compile
 * finished, snapshot replaced, highlight moved, toolchain changed).
 */
export interface TypstStateFrame {
    version: number;
    generation: number;
    previewError: string | null;
    discovery: {
        scanning: boolean;
        includeExcluded: boolean;
        visited: number;
        errors: string[];
    };
    toolchain: ToolchainView;
    workspace: string;
    /** Absolute workspace root the diagnostics' relative file paths resolve against. */
    workspaceRoot: string;
    main: string | null;
    candidates: string[];
    /**
     * The candidates this document includes, as typst's own dependency report
     * names them. A fragment is a `.typ` file another file pulls in with
     * `#include` or `#import`; compiling one on its own is rarely what the user
     * means, so the panel lists them apart from other, unclassified files.
     */
    fragments: string[];
    status: StatusView;
    /**
     * Diagnostics of this round, capped at `LIMITS.diagnostics`. When the
     * compiler produced more, `diagnosticsTotal` is the full count and
     * `diagnosticsTruncated` is true; the model text and the panel both show
     * the same bounded views.
     */
    diagnostics: DiagnosticView[];
    diagnosticsTotal: number;
    diagnosticsTruncated: boolean;
    snapshot: SnapshotView | null;
    highlights: HighlightView[];
    view: PanelView;
    viewSeq: number;
    setup: SetupView;
}
/** Bytes for exactly one retained preview identity. */
export interface PreviewBytes extends PreviewIdentity {
    data: Uint8Array<ArrayBuffer>;
}
/** One rendered-text → source candidate (`typst/locateSource` and the panel's selection toolbar). */
export interface SourceMatch {
    file: string;
    line: number;
    column: number;
    endLine: number;
    excerpt: string;
    score: number;
}
//# sourceMappingURL=contract.d.ts.map