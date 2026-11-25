/**
 * Server-side PDF inspection with the user-space geometry the highlight
 * engine needs: page count and per-page text + spans. pdf.js runs on the
 * main thread through its fake-worker entry (`globalThis.pdfjsWorker`), the
 * same arrangement the ZCode typst-workbench server (0.2.0) ships. Loading
 * is lazy: a session that never highlights never pays for the module.
 * Host half only.
 * @module dsh-typst/typst/pdf-extract
 */
import { type PageText } from "./text.js";
/**
 * The directory pdf.js should read its cmaps and standard fonts from (the
 * installed pdfjs-dist package), or null when it cannot be resolved; typst
 * embeds its fonts, so extraction works without them.
 */
export declare function pdfjsDataDir(): string | null;
/**
 * Number of pages in a PDF, or a rejection when the bytes are not readable.
 * Runs without cmaps: only the structure is read.
 */
export declare function pageCount(data: Uint8Array): Promise<number>;
/**
 * Extract per-page text + spans for quote matching and highlight rectangles.
 * @param data - the PDF bytes.
 * @param dataDir - cmap/standard-font directory from {@link pdfjsDataDir}.
 */
export declare function extractPages(data: Uint8Array, dataDir: string | null): Promise<PageText[]>;
//# sourceMappingURL=pdf-extract.d.ts.map