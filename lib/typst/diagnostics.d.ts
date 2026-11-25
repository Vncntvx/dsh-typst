/**
 * Typst output parsing: one-shot diagnostics, the `typst watch` log stream,
 * and make-deps files. Ported from the ZCode typst-workbench server
 * (0.2.0) `src/typst/diagnostics.ts` and adjusted to this repository's
 * domain error type. Host half only.
 * @module dsh-typst/typst/diagnostics
 */
import type { DiagnosticView } from "../contract.js";
/**
 * Parse the diagnostics block of one compile round (stderr of a one-shot
 * compile, or the lines a `typst watch` round accumulated).
 * @param text - raw output text.
 * @param toFile - maps a path as typst printed it onto a display path.
 * @returns the parsed diagnostics in order of appearance.
 */
export declare function parseDiagnostics(text: string, toFile?: (path: string) => string): DiagnosticView[];
/** One event the watch log emits; the watcher serializes their handling. */
export type WatchEvent = {
    kind: "compiling";
} | {
    kind: "finished";
    outcome: "ok" | "warnings" | "error";
    durationMs?: number;
    diagnostics: DiagnosticView[];
} | {
    kind: "fatal";
    message: string;
};
/**
 * Incremental parser for `typst watch` stdout/stderr. Typst prints an
 * ANSI-stamped `compiling` line per round, then `compiled …` plus any
 * diagnostics. Rounds are finalized on the next marker or when the caller
 * decides the output went quiet (`finalize`); a round with errors keeps
 * accumulating help/hint lines until then.
 */
export declare class WatchLog {
    private readonly emit;
    private readonly toFile;
    private buffer;
    private pending;
    constructor(emit: (event: WatchEvent) => void, toFile?: (path: string) => string);
    /**
     * Feed one output chunk.
     * @returns whether a round is awaiting `finalize`.
     */
    feed(chunk: string): boolean;
    private line;
    /** End the current round (next round started, or output went quiet). */
    finalize(): void;
}
/**
 * Parse a deps file: typst ≥0.14 JSON (`{ inputs: [...] }`) or the classic
 * make-deps grammar of `--make-deps`.
 * @param text - the deps file content.
 * @returns dependency paths in the order printed.
 */
export declare function parseDeps(text: string): string[];
//# sourceMappingURL=diagnostics.d.ts.map