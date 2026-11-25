/**
 * Main-file discovery: scan the workspace for `.typ` files and pick the one
 * the user would pass to `typst compile`. Ported from the ZCode
 * typst-workbench server (0.2.0) `src/domain/project.ts`. Host half only.
 *
 * The index is bounded (directories, entries, realpath-visited directories)
 * and yields per-directory additions instead of ever-growing copies. A
 * symlinked directory is followed once when its real target is inside the
 * workspace; a symlinked `.typ` file is a candidate only when its real target
 * is inside the workspace, so an external link cannot become a candidate.
 * @module dsh-typst/typst/mainfile
 */
/**
 * Pick the main file: a remembered choice, `main.typ`, the only top-level
 * file, the shallowest `main.typ`, or — when there is exactly one candidate —
 * that file. `null` means the panel should ask.
 * @param candidates - workspace-relative `.typ` paths.
 * @param remembered - the previously chosen main file for this workspace.
 */
export declare function chooseMain(candidates: string[], remembered: string | null): string | null;
/** One directory's contribution to the index. */
export interface IndexBatch {
    /** `.typ` files discovered in this directory. */
    added: string[];
    /** Entries inspected so far. */
    visited: number;
    /** Read errors so far (directory-relative). */
    errors: string[];
    /** True on the final batch (budget reached or the tree is exhausted). */
    done: boolean;
}
/**
 * Cancellable, bounded complete index.
 * @param root - workspace root to scan.
 * @param includeExcluded - reveal hidden directories and every skipped name.
 * @param signal - aborts the scan when the session is closed or superseded.
 * @param excludeDirs - extra directory names to skip, matched without case at any depth.
 */
export declare function indexTypFiles(root: string, includeExcluded: boolean, signal: AbortSignal, excludeDirs?: readonly string[]): AsyncIterable<IndexBatch>;
//# sourceMappingURL=mainfile.d.ts.map