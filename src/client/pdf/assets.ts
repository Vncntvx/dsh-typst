/** Build-owned, same-version PDF.js worker source, inlined by the esbuild build (`scripts/build-client.mjs`). */
import workerSource from "pdfjs-dist/build/pdf.worker.min.mjs?raw";

export { workerSource };

/** Resource kinds PDF.js 6's BinaryDataFactory may request. */
export type PdfAssetKind = "cMapUrl" | "standardFontDataUrl" | "wasmUrl";

/** Original filenames mapped to base64. */
export type PdfAssetMap = Readonly<
  Record<PdfAssetKind, Readonly<Record<string, string>>>
>;

/** Public methods required by PDF.js's BinaryDataFactory option. */
export interface PdfBinaryDataFactory {
  /** @param request - PDF.js resource kind and exact filename. @returns independent transferable resource bytes. */
  fetch(request: {
    readonly kind: PdfAssetKind;
    readonly filename: string;
  }): Promise<Uint8Array>;
}

/**
 * Capture this build's binary assets without network fallbacks.
 *
 * The first milestone ships an empty asset set: typst embeds every glyph and
 * color profile into its PDFs, so cmaps, standard fonts and image codecs are
 * not requested by a typst-produced document. If a non-typst PDF ever lands
 * here and requests one, the render fails with a telling error instead of a
 * silent network fetch — the same no-network rule the harness preview
 * applies.
 * @returns the constructor passed to PDF.js getDocument.
 */
export function createPdfBinaryDataFactory(): new () => PdfBinaryDataFactory {
  return class implements PdfBinaryDataFactory {
    fetch({
      kind,
      filename,
    }: {
      readonly kind: PdfAssetKind;
      readonly filename: string;
    }): Promise<Uint8Array> {
      return Promise.reject(
        new Error(`PDF.js asset is not bundled: ${kind}/${filename}`),
      );
    }
  };
}
