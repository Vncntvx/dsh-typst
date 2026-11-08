/**
 * Runtime constants shared by both halves. Values and type-only imports
 * only: this module is on the client-graph allowlist
 * (`scripts/client-graph-authority.mjs`), so a host-side import here would
 * put host authority in the browser bundle.
 * @module dsh-typst/constants
 */

/** The wire namespace this plugin mounts its Typert remote under. */
export const TYPST_REMOTE_PACKAGE = "typst";
/** The settings/config namespace spelling shared by both halves. */
export const TYPST_SETTINGS_NAMESPACE = "typst";
/** Cordis service key of the host remote runtime (`TypstRuntime`). */
export const TYPST_STATUS_SERVICE_KEY = "typstStatus";

export const TYPST_STATUS_METHOD = "status";
export const TYPST_SET_MAIN_METHOD = "setMain";
export const TYPST_WATCH_METHOD = "watch";
export const TYPST_READ_PREVIEW_METHOD = "readPreview";
export const TYPST_LOCATE_SOURCE_METHOD = "locateSource";

/** Typst versions older than this are refused (ZCode typst-workbench parity). */
export const MIN_TYPST: readonly [number, number, number] = [0, 12, 0];

/** Tool names, flat domain-prefixed snake_case (dsh-zotero convention). */
export const TYPST_TOOL_NAMES = [
  "typst_status",
  "typst_set_main",
  "typst_check",
  "typst_render_pages",
  "typst_show",
  "typst_clear_highlights",
  "typst_export_pdf",
] as const;

export type TypstToolName = (typeof TYPST_TOOL_NAMES)[number];

/**
 * Ported from the ZCode typst-workbench server (0.2.0): the behavioral
 * bounds every tool and the panel observe.
 */
export const LIMITS = {
  /** Silence window that decides a watch round has produced its diagnostics. */
  settleMs: 1_500,
  /** One-shot compile (render, export) timeout. */
  oneshotTimeoutMs: 120_000,
  /** Diagnostics returned to the model. */
  diagnostics: 30,
  /** Status notification throttle. */
  notifyMs: 30,
  /** Re-lookup interval while the panel is open and Typst is unusable; every setupShellEvery ticks the login shell is queried too. */
  setupWatchMs: 3_000,
  setupShellEvery: 5,
  /** How long `typst_check` waits for the document to settle. */
  checkTimeoutMs: 60_000,
  /** Maximum pages rendered per `typst_render_pages` call. */
  renderPages: 4,
  ppiDefault: 110,
  ppiMin: 36,
  ppiMax: 300,
  /** Preview PDFs above this size are not served. */
  pdfBytes: 256 * 1024 * 1024,
  /** Retained compile snapshots (old ones drop for highlight relocation). */
  snapshots: 3,
} as const;

/** Source files larger than this never enter source matching. */
export const SOURCE_FILE_MAX_BYTES = 4 * 1024 * 1024;
/** Source files considered for one `locateSource` call. */
export const SOURCE_FILES_MAX = 500;
/** Dependency files consulted when computing the latest input modification. */
export const INPUT_FILES_MAX = 2_000;
