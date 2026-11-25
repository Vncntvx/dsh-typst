/**
 * Server-side PDF inspection with the user-space geometry the highlight
 * engine needs: page count and per-page text + spans. pdf.js runs on the
 * main thread through its fake-worker entry (`globalThis.pdfjsWorker`), the
 * same arrangement the ZCode typst-workbench server (0.2.0) ships. Loading
 * is lazy: a session that never highlights never pays for the module.
 * Host half only.
 * @module dsh-typst/typst/pdf-extract
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { buildPage } from "./text.js";
let loading = null;
/** Load pdf.js (legacy build) once; the fake-worker entry must be set first. */
async function pdfjs() {
    if (loading !== null)
        return loading;
    const pending = (async () => {
        const [pdf, worker] = await Promise.all([
            // pdf.js's own types describe the browser surface; the extraction
            // surface used here is the small one below, so the module is trusted
            // through `unknown` and consumed via PdfJsModule.
            import("pdfjs-dist/legacy/build/pdf.mjs"),
            import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
        ]);
        globalThis.pdfjsWorker = worker;
        return pdf;
    })();
    loading = pending;
    try {
        return await pending;
    }
    catch (error) {
        // A rejected import must not be cached forever: a transient module-load
        // failure would otherwise disable page counts and highlights for the
        // whole process.
        if (loading === pending)
            loading = null;
        throw error;
    }
}
/**
 * The directory pdf.js should read its cmaps and standard fonts from (the
 * installed pdfjs-dist package), or null when it cannot be resolved; typst
 * embeds its fonts, so extraction works without them.
 */
export function pdfjsDataDir() {
    try {
        const require = createRequire(import.meta.url);
        const dir = dirname(require.resolve("pdfjs-dist/package.json"));
        if (existsSync(join(dir, "cmaps")))
            return resolve(dir) + sep;
    }
    catch {
        // Not resolvable (vendored without node_modules).
    }
    return null;
}
async function open(data, dataDir) {
    const module = await pdfjs();
    return module.getDocument({
        data: new Uint8Array(data),
        ...(dataDir
            ? {
                cMapUrl: `${dataDir}cmaps${sep}`,
                cMapPacked: true,
                standardFontDataUrl: `${dataDir}standard_fonts${sep}`,
            }
            : {}),
        disableFontFace: true,
        useSystemFonts: false,
        verbosity: 0,
    });
}
/**
 * Number of pages in a PDF, or a rejection when the bytes are not readable.
 * Runs without cmaps: only the structure is read.
 */
export async function pageCount(data) {
    const task = await open(data, null);
    try {
        return (await task.promise).numPages;
    }
    finally {
        await task.destroy();
    }
}
/**
 * Extract per-page text + spans for quote matching and highlight rectangles.
 * @param data - the PDF bytes.
 * @param dataDir - cmap/standard-font directory from {@link pdfjsDataDir}.
 */
export async function extractPages(data, dataDir) {
    const task = await open(data, dataDir);
    try {
        const doc = await task.promise;
        const pages = [];
        for (let index = 0; index < doc.numPages; index++) {
            const page = await doc.getPage(index + 1);
            const content = await page.getTextContent();
            pages.push(buildPage(content.items, { index }));
            page.cleanup();
        }
        return pages;
    }
    finally {
        await task.destroy();
    }
}
//# sourceMappingURL=pdf-extract.js.map