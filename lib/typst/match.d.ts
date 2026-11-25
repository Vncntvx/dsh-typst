/**
 * Fuzzy text matching between rendered pages and `.typ` sources, plus the
 * line/excerpt helpers the diagnostics and highlights share. Ported from the
 * ZCode typst-workbench server (0.2.0) `src/domain/match.ts`. Host half only
 * (the panel performs its own in-page text search).
 * @module dsh-typst/typst/match
 */
export interface Skeleton {
    value: string;
    /** UTF-16 start offset of each skeleton character in the original text. */
    map: number[];
    /** UTF-16 width of the original code point each skeleton character came from. */
    widths: number[];
    /** UTF-16 offset of each skeleton code point inside `value`. */
    valueUnits: number[];
}
export interface FuzzyHit {
    start: number;
    end: number;
    score: number;
}
/**
 * Fold a text onto its matching skeleton: NFKC + lowercase, letters and
 * numbers only, with an offset map back onto the original string.
 */
export declare function skeleton(text: string): Skeleton;
/**
 * Find occurrences of `needle` in a skeleton haystack: exact runs first,
 * then seed-and-chain approximation tolerant of insertions, deletions and
 * reflow. Ported unchanged in behavior; see the ZCode source for the
 * chain-drift rationale.
 */
export declare function fuzzyFind(needle: string, hay: Skeleton, options?: {
    max?: number;
    minScore?: number;
}): FuzzyHit[];
export declare function lineStarts(text: string): number[];
export declare function lineColumn(starts: number[], offset: number): {
    line: number;
    column: number;
};
export declare function lineRange(text: string, starts: number[], from: number, to: number): {
    start: number;
    end: number;
};
export declare function excerpt(text: string, from: number, to: number, maxLines?: number): string;
export interface SourceFile {
    path: string;
    text: string;
}
export type { SourceMatch } from "../contract.js";
import type { SourceMatch } from "../contract.js";
/**
 * Locate rendered text inside the project's source files: fuzzy-find in
 * every file, optionally re-anchoring around a focus passage, and report
 * the best candidates. Reliable for prose; approximate for math, generated
 * text and function output (the panel says so).
 * @param files - the workspace source files to search.
 * @param text - the rendered text to locate.
 * @param focus - a secondary passage expected near the target, when known.
 * @param max - candidate budget.
 */
export declare function locateInSources(files: SourceFile[], text: string, focus?: string, max?: number, options?: {
    signal?: AbortSignal;
    maxBytes?: number;
}): SourceMatch[];
//# sourceMappingURL=match.d.ts.map