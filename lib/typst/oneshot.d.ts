/**
 * One-shot typst compiles that do not touch the preview: rendering pages to
 * PNG for the agent to look at, and exporting PDFs into the workspace.
 * Ported from the ZCode typst-workbench server (0.2.0) `src/typst/
 * oneshot.ts`. Host half only.
 * @module dsh-typst/typst/oneshot
 */
import { type TypstFlagOptions } from "./flags.js";
import type { ProcessRunner } from "./process.js";
import type { DiagnosticView } from "../contract.js";
export interface OneshotOptions extends TypstFlagOptions {
    typst: string;
    cwd: string;
    main: string;
    /** The harness subprocess runner shared by the workbench. */
    process: ProcessRunner;
    /** Explicit environment entries merged onto the provider's scrubbed base. */
    env?: NodeJS.ProcessEnv;
    /** Cancellation forwarded to the compile. */
    signal?: AbortSignal;
    /** Where render scratch directories are created. */
    scratch: string;
    toFile?: (path: string) => string;
    timeoutMs?: number;
}
export interface CompileResult {
    ok: boolean;
    diagnostics: DiagnosticView[];
}
export interface RenderedImage {
    page: number;
    png: Uint8Array;
}
export interface RenderPagesResult extends CompileResult {
    images: RenderedImage[];
}
/**
 * Render the given 1-based pages to PNGs in a scratch directory and read
 * them back, page-ordered; the scratch directory is always removed.
 */
export declare function renderPages(options: OneshotOptions, pages: number[], ppi: number): Promise<RenderPagesResult>;
export interface ExportExtra {
    pdfStandard?: string;
    pages?: string;
}
/** Compile a PDF into the workspace (optionally a PDF standard and a page selection). */
export declare function exportPdf(options: OneshotOptions, output: string, extra: ExportExtra): Promise<CompileResult>;
//# sourceMappingURL=oneshot.d.ts.map