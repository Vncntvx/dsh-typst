/**
 * Types for `scripts/style-tokens.mjs`.
 * @module dsh-typst/scripts/style-tokens
 */

/** The committed snapshot of the palette the client stylesheets consume. */
export interface StyleTokenSnapshot {
  /** The pinned harness version the palette was read from. */
  readonly harness: string;
  /** `--dsw-*` names the theme sheets define. Generated. */
  readonly dsw: readonly string[];
  /** `--dsh-*` seams this plugin consumes. Hand-maintained. */
  readonly dsh: readonly string[];
  /** `--ds-*` host base tokens the theme sheets define. Generated. */
  readonly ds: readonly string[];
}

/** What the snapshot is written from. */
export interface StyleTokenFacts {
  /** The pinned harness version. */
  readonly harness: string;
  /** The freshly read palette. */
  readonly dsw: readonly string[];
  /** The freshly read host base tokens. */
  readonly ds?: readonly string[];
}

/** Names the snapshot and upstream disagree on. */
export interface StyleTokenDiff {
  /** Published upstream but absent from the snapshot. */
  readonly missing: readonly string[];
  /** Carried by the snapshot but gone upstream. */
  readonly removed: readonly string[];
}

/**
 * The harness version the snapshot describes.
 * @param pkg - parsed `package.json`.
 * @returns the pinned version, or `''` when the line is absent.
 */
export declare function pinnedHarness(pkg: unknown): string;

/** Path overrides for theme discovery. */
export interface ThemeDirOptions {
  /** Explicit `DSH_THEME_DIR`; when set it is the only candidate. */
  readonly env?: string;
  /** A sibling checkout's `ui-theme/src/styles`. */
  readonly sibling?: string;
  /** The installed pinned package's `src/styles`. */
  readonly installed?: string;
}

/** Paths and probes for theme resolution, with the manifest pin. */
export interface ThemeDirProbe extends ThemeDirOptions {
  /** The pinned harness version a sibling must match. */
  readonly pin?: string;
  /** Existence probe, for tests. */
  readonly exists?: (dir: string) => boolean;
  /** Version probe for a theme directory, for tests. */
  readonly version?: (dir: string) => string | null;
}

/**
 * The theme sheet directories to try, in priority order.
 * @param options - path overrides.
 * @returns the candidates; an explicit directory is the only one.
 */
export declare function themeDirCandidates(options?: ThemeDirOptions): string[];

/**
 * The first candidate that exists on disk.
 * @param candidates - directories, in priority order.
 * @param exists - existence probe, for tests.
 * @returns the first existing directory, or undefined.
 */
export declare function firstExisting(
  candidates: readonly string[],
  exists?: (dir: string) => boolean,
): string | undefined;

/**
 * The theme directory the check should read.
 * @param options - the pin, path overrides, and probes for tests.
 * @returns the directory to read, or undefined when none exists.
 */
export declare function resolveThemeDir(
  options?: ThemeDirProbe,
): string | undefined;

/**
 * Every custom property a stylesheet defines under one prefix.
 * @param css - stylesheet source.
 * @param prefix - the namespace to collect, e.g. `--dsw-` or `--ds-`.
 * @returns the token names, `--` prefix included.
 */
export declare function collectThemeTokens(
  css: string,
  prefix?: string,
): string[];

/**
 * The sorted, de-duplicated token list across a directory of stylesheets.
 * @param read - one sheet's source by file name.
 * @param files - sheet file names.
 * @param prefix - the namespace to collect.
 * @returns every token the theme defines under that prefix.
 */
export declare function mergeThemeTokens(
  read: (file: string) => string,
  files: readonly string[],
  prefix?: string,
): string[];

/**
 * Compare the snapshot with upstream.
 * @param snapshotTokens - the committed list.
 * @param upstreamTokens - the list read from the theme sheets.
 * @returns missing and extra names, both empty when they agree.
 */
export declare function diffTokens(
  snapshotTokens: readonly string[],
  upstreamTokens: readonly string[],
): StyleTokenDiff;

/**
 * The snapshot to write: the two generated token families, the pin they were
 * read under, and the hand-maintained seam list carried over from the current
 * file.
 * @param current - the committed snapshot, absent on first write.
 * @param facts - the pin and the freshly read token families.
 * @returns the snapshot object, keys in a stable order.
 */
export declare function snapshotOf(
  current: StyleTokenSnapshot | undefined,
  facts: StyleTokenFacts,
): StyleTokenSnapshot;
