/**
 * Canvas rendering with cancellation and page cleanup, shared by the
 * preview body. Ported from the harness document preview's
 * `packages/client/ui-sidebar-documentpreview/src/client/pdf/document.ts`.
 * @module dsh-typst/client/pdf/document
 */

import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * The document operations used by one mounted preview body.
 *
 * `getOutline`, `getDestination` and `getPageIndex` are here for the
 * outline view: typst writes the heading hierarchy into the PDF as
 * bookmarks, and the drawer reads them back through these three.
 */
export type PdfDocument = Pick<
  PDFDocumentProxy,
  "numPages" | "getPage" | "getOutline" | "getDestination" | "getPageIndex"
>;

/** One in-flight PDF load and its complete cleanup operation. */
export interface PdfSession {
  readonly document: Promise<PdfDocument>;
  /**
   * Cancel loading and rendering, destroy the document, and release its worker.
   * @returns cleanup completion without rejection.
   */
  dispose(): Promise<void>;
}
