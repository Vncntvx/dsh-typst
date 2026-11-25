/**
 * Types for `scripts/shared/css-syntax.mjs`.
 * @module dsh-typst/scripts/shared/css-syntax
 */

/** One style rule, flattened out of any at-rules around it. */
export interface CssRule {
  /** The selector list as written. */
  readonly selector: string;
  /** The text between the rule's braces. */
  readonly body: string;
  /** The at-rule preludes the rule sits under, outermost first. */
  readonly atRules: readonly string[];
  /** Offset of the selector's first character, `-1` when unknown. */
  readonly at: number;
}

/** One declaration of a rule body. */
export interface CssDeclaration {
  /** Lower-cased property name. */
  readonly property: string;
  /** Trimmed value. */
  readonly value: string;
}

/**
 * Blank out comment bodies while preserving every offset.
 */
export declare function stripComments(css: string): string;

/**
 * Every style rule in a stylesheet, flattening nested at-rules.
 */
export declare function rulesOf(css: string): CssRule[];

/**
 * The declarations of one rule body.
 */
export declare function declarationsOf(body: string): CssDeclaration[];

/**
 * The classes a rule actually styles.
 */
export declare function subjectClassesOf(selector: string): string[];

/**
 * The first class of a simple selector.
 */
export declare function baseClassOf(selector: string): string | undefined;

/**
 * The 1-based line a source offset falls on.
 */
export declare function lineOf(css: string, at: number): number;
