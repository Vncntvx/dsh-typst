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
import { buildPage, type PageText, type PdfTextItem } from "./text.js";

interface PdfJsDocument {
  numPages: number;
  getPageLabels(): Promise<string[] | null>;
  getPage(index: number): Promise<PdfJsPage>;
  destroy(): Promise<void>;
}

interface PdfJsPage {
  view: [number, number, number, number];
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  cleanup(): void;
}

interface PdfJsModule {
  getDocument(params: Record<string, unknown>): {
    promise: Promise<PdfJsDocument>;
    destroy(): Promise<void>;
  };
}

let loading: Promise<PdfJsModule> | null = null;

/** Load pdf.js (legacy build) once; the fake-worker entry must be set first. */
async function pdfjs(): Promise<PdfJsModule> {
  loading ??= (async () => {
    const [pdf, worker] = await Promise.all([
      // pdf.js's own types describe the browser surface; the extraction
      // surface used here is the small one below, so the module is trusted
      // through `unknown` and consumed via PdfJsModule.
      import("pdfjs-dist/legacy/build/pdf.mjs") as Promise<unknown>,
      import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ]);
    (globalThis as Record<string, unknown>).pdfjsWorker = worker;
    return pdf as PdfJsModule;
  })();
  return loading;
}

/**
 * The directory pdf.js should read its cmaps and standard fonts from (the
 * installed pdfjs-dist package), or null when it cannot be resolved; typst
 * embeds its fonts, so extraction works without them.
 * @param hint - an extra candidate directory to prefer.
 */
export function pdfjsDataDir(hint?: string | null): string | null {
  const candidates: string[] = [];
  if (hint) candidates.push(hint);
  try {
    const require = createRequire(import.meta.url);
    candidates.push(dirname(require.resolve("pdfjs-dist/package.json")));
  } catch {
    // Not resolvable (vendored without node_modules): fall through.
  }
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "cmaps"))) return resolve(candidate) + sep;
  }
  return null;
}

interface OpenTask {
  promise: Promise<PdfJsDocument>;
  destroy(): Promise<void>;
}

async function open(
  data: Uint8Array,
  dataDir: string | null,
): Promise<OpenTask> {
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
  }) as OpenTask;
}

/**
 * Number of pages in a PDF, or a rejection when the bytes are not readable.
 * Runs without cmaps: only the structure is read.
 */
export async function pageCount(data: Uint8Array): Promise<number> {
  const task = await open(data, null);
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}

/**
 * Extract per-page text + spans for quote matching and highlight rectangles.
 * @param data - the PDF bytes.
 * @param dataDir - cmap/standard-font directory from {@link pdfjsDataDir}.
 */
export async function extractPages(
  data: Uint8Array,
  dataDir: string | null,
): Promise<PageText[]> {
  const task = await open(data, dataDir);
  try {
    const doc = await task.promise;
    const labels = await doc.getPageLabels().catch(() => null);
    const pages: PageText[] = [];
    for (let index = 0; index < doc.numPages; index++) {
      const page = await doc.getPage(index + 1);
      const [x1, y1, x2, y2] = page.view;
      const content = await page.getTextContent();
      pages.push(
        buildPage(content.items, {
          index,
          label: labels?.[index] || String(index + 1),
          width: x2 - x1,
          height: y2 - y1,
          originX: x1,
          originY: y1,
        }),
      );
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
