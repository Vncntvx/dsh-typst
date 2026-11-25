/**
 * Page text model: pdf.js text items → per-page text with span geometry,
 * quote search (tolerant of reflow and punctuation), highlight rectangles,
 * and page-spec parsing. Ported from the ZCode typst-workbench server
 * (0.2.0) `src/domain/text.ts`. Host half only.
 * @module dsh-typst/typst/text
 */
/** One text item as pdf.js reports it (`getTextContent().items`). */
export interface PdfTextItem {
    str?: unknown;
    transform?: number[];
    width?: number;
    height?: number;
    hasEOL?: boolean;
}
export interface PdfPageInfo {
    index: number;
}
export interface TextSpan {
    start: number;
    end: number;
    x: number;
    y: number;
    width: number;
    size: number;
}
/** One page's extracted text plus the spans that locate it on the page. */
export interface PageText extends PdfPageInfo {
    text: string;
    spans: TextSpan[];
}
/** Build one page's text from pdf.js items, inserting line/space separators. */
export declare function buildPage(items: PdfTextItem[], page: PdfPageInfo): PageText;
/** Whitespace-normalized text for display (de-hyphenate line breaks). */
export declare function readableText(text: string): string;
interface PageHit {
    pageIndex: number;
    start: number;
    end: number;
}
/**
 * Find a quote in the extracted pages: exact (folded) match first, then
 * across adjacent pages, preferring the preferred page when given. `from`
 * is a UTF-16 offset hint on the preferred page and `occurrence` names the
 * match ordinal (from that offset) to keep when the text repeats.
 */
export declare function findQuote(pages: PageText[], quote: string, preferredPage?: number, from?: number, occurrence?: number): PageHit | null;
/**
 * PDF user-space rectangles covering `page.text[start, end)`, merged across
 * adjacent spans on the same line. The panel maps them through the page
 * viewport to draw highlights.
 */
export declare function rectsFor(page: PageText, start: number, end: number): number[][];
/** The rendered text of a range, whitespace-collapsed for display. */
export declare function textAt(page: PageText, start: number, end: number): string;
/**
 * Parse a 1-based page spec into 0-based indices, bounded by `pageCount`.
 * @throws when a part of the spec is malformed.
 */
export declare function parsePages(spec: string, pageCount: number): number[];
export {};
//# sourceMappingURL=text.d.ts.map