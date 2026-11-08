/**
 * Wire identity shared by both halves: the view types the host serves and
 * the browser half renders, plus the strict zod codecs both arms materialize
 * (`wire-schemas.ts`). Values and type-only imports only — this module is on
 * the client-graph allowlist (`scripts/client-graph-authority.mjs`).
 * @module dsh-typst/contract
 */

/**
 * The plugin's one Remote failure code: every domain error crosses the wire
 * as `typst/domain` with the stable domain code in `details`, so consumers
 * discriminate by `details.code` while the wire keeps a single declared
 * shape (the dsh-zotero pattern).
 */
declare module "@deepseek-ai/dsh-typert-protocol" {
  interface RemoteErrorDetailsMap {
    "typst/domain": { readonly code: string };
  }
}

// ---------------------------------------------------------------------------
// Toolchain
// ---------------------------------------------------------------------------

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

export type ToolchainView =
  | ToolchainReadyView
  | ToolchainMissingView
  | ToolchainTooOldView
  | ToolchainErrorView;

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Compile status and preview snapshot
// ---------------------------------------------------------------------------

export type CompilePhase =
  "idle" | "starting" | "compiling" | "ok" | "warnings" | "error" | "crashed";

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

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

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
  rects: number[][];
  stale: boolean;
  createdAt: number;
}

/** A location request from `typst_show`; the panel notifies before navigating. */
export type PanelView =
  | { kind: "page"; pageIndex: number; identity: PreviewIdentity }
  | { kind: "highlight"; id: string; identity: PreviewIdentity }
  | null;

// ---------------------------------------------------------------------------
// Setup (Typst missing / too old)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The state frame (one push of the watch stream)
// ---------------------------------------------------------------------------

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
  diagnostics: DiagnosticView[];
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

// ---------------------------------------------------------------------------
// Source matching
// ---------------------------------------------------------------------------

/** One rendered-text → source candidate (`typst/locateSource` and the panel's selection toolbar). */
export interface SourceMatch {
  file: string;
  line: number;
  column: number;
  endLine: number;
  excerpt: string;
  score: number;
}
