/**
 * Types for `scripts/shared/control-style-ownership.mjs`.
 * @module dsh-typst/scripts/shared/control-style-ownership
 */

/** One client source: repo-relative path and text. */
export interface ClientSource {
  /** Repo-relative path, `/`-separated. */
  readonly file: string;
  /** The source text. */
  readonly code: string;
}

/** One stylesheet, as the stylesheet guards read it. */
export interface StyleSheet {
  /** Repo-relative path, `/`-separated. */
  readonly file: string;
  /** The stylesheet source. */
  readonly css: string;
}

/** One violation, shaped like the stylesheet guards' own. */
export interface ControlViolation {
  /** Repo-relative path of the offending source or sheet. */
  readonly file: string;
  /** 1-based line, `0` when unknown. */
  readonly line: number;
  /** The offending selector or control, or `className`. */
  readonly selector: string;
  /** What is wrong, in one line. */
  readonly detail: string;
  /** What to do instead. */
  readonly fix: string;
}

/** A declared geometry adapter and why it exists. */
export interface ControlAdapter {
  /** The adapter stylesheet, repo-relative. */
  readonly file: string;
  /** Why the host primitive cannot cover this control. */
  readonly reason: string;
}

/** A declared control composition. */
export interface ControlComposition {
  /** The feature stylesheet, repo-relative. */
  readonly file: string;
  /** The selector that deliberately inlines the control. */
  readonly selector: string;
  /** Why the default placement does not fit. */
  readonly reason: string;
}

/** Adapters that own control geometry by design. */
export declare const CONTROL_GEOMETRY_ADAPTERS: readonly ControlAdapter[];

/** Compositions that deliberately inline a host control. */
export declare const CONTROL_COMPOSITIONS: readonly ControlComposition[];

/** Every client source under `<base>/src/client`, sorted by path. */
export declare function clientSources(base: string): ClientSource[];

/** Every place a feature sheet restyles a host control. */
export declare function controlStyleViolations(
  codeSources: readonly ClientSource[],
  styles: readonly StyleSheet[],
): ControlViolation[];
