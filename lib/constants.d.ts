/**
 * Runtime constants shared by both halves. Values and type-only imports
 * only: this module is on the client-graph allowlist
 * (`scripts/client-graph-authority.mjs`), so a host-side import here would
 * put host authority in the browser bundle.
 * @module dsh-typst/constants
 */
/** The npm package that owns the Remote methods (Typert's package identity). */
export declare const TYPST_REMOTE_PACKAGE = "dsh-typst-plugin";
/** The wire namespace this plugin mounts its Typert remote under. */
export declare const TYPST_REMOTE_NAMESPACE = "typst";
/** The settings/config namespace spelling shared by both halves. */
export declare const TYPST_SETTINGS_NAMESPACE = "typst";
/**
 * A bare directory name as the exclusion setting accepts it: no path
 * separators, not `.` and not `..`. Shared by the host schema and the settings
 * page so an entry is refused identically before and after it is staged.
 */
export declare const TYPST_DIRECTORY_NAME: RegExp;
/** Cordis service key of the host remote runtime (`TypstRuntime`). */
export declare const TYPST_STATUS_SERVICE_KEY = "typstStatus";
/** The real wire type of the session id a typst lookup is keyed by. */
export declare const TYPST_SCOPE_WIRE_SYMBOL = "@deepseek-ai/dsh-session/types#SessionId";
/** The host-side type symbol of the typst scope (this package owns it). */
export declare const TYPST_SCOPE_HOST_SYMBOL = "dsh-typst-plugin#TypstScope";
export declare const TYPST_STATUS_METHOD = "status";
export declare const TYPST_SET_MAIN_METHOD = "setMain";
export declare const TYPST_WATCH_METHOD = "watch";
export declare const TYPST_READ_PREVIEW_METHOD = "readPreview";
export declare const TYPST_LOCATE_SOURCE_METHOD = "locateSource";
/** Typst versions older than this are refused (ZCode typst-workbench parity). */
export declare const MIN_TYPST: readonly [number, number, number];
/** Tool names, flat domain-prefixed snake_case (dsh-zotero convention). */
export declare const TYPST_TOOL_NAMES: readonly ["typst_status", "typst_set_main", "typst_check", "typst_render_pages", "typst_show", "typst_clear_highlights", "typst_export_pdf"];
/**
 * Ported from the ZCode typst-workbench server (0.2.0): the behavioral
 * bounds every tool and the panel observe.
 */
export declare const LIMITS: {
    /** Silence window that decides a watch round has produced its diagnostics. */
    readonly settleMs: 1500;
    /** One-shot compile (render, export) timeout. */
    readonly oneshotTimeoutMs: 120000;
    /** Diagnostics returned to the model. */
    readonly diagnostics: 30;
    /** Status notification throttle. */
    readonly notifyMs: 30;
    /** Re-lookup interval while the panel is open and Typst is unusable; every setupShellEvery ticks the login shell is queried too. */
    readonly setupWatchMs: 3000;
    readonly setupShellEvery: 5;
    /** How long `typst_check` waits for the document to settle. */
    readonly checkTimeoutMs: 60000;
    /** Provider grace before a managed child range is terminated. */
    readonly stopGraceMs: 2000;
    /** Collected stdout/stderr cap for one short command. */
    readonly processOutputBytes: number;
    /** Maximum pages rendered per `typst_render_pages` call. */
    readonly renderPages: 4;
    readonly ppiDefault: 110;
    readonly ppiMin: 36;
    readonly ppiMax: 300;
    /** Preview PDFs above this size are not served. */
    readonly pdfBytes: number;
    /** Retained compile snapshots (old ones drop for highlight relocation). */
    readonly snapshots: 3;
    /** Total bytes retained across all preview snapshots. */
    readonly snapshotBytes: number;
};
/** Source files larger than this never enter source matching. */
export declare const SOURCE_FILE_MAX_BYTES: number;
/** Source files considered for one `locateSource` call. */
export declare const SOURCE_FILES_MAX = 500;
/** Total source bytes one `locateSource` call may read. */
export declare const SOURCE_BYTES_MAX: number;
/** Dependency files consulted when computing the latest input modification. */
export declare const INPUT_FILES_MAX = 2000;
//# sourceMappingURL=constants.d.ts.map