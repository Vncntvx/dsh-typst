/**
 * One PDF document's natural page sizes, shared by the reader and its page
 * surfaces. pdf.js caches the page proxy itself; this cache keeps the viewport
 * geometry so a page near the viewport is never fetched a second time just to
 * size its slot.
 * @module dsh-typst/client/pdf/page-size
 */

import type { PdfDocument } from "./document.js";

export interface NaturalSize {
  width: number;
  height: number;
}

/** The one in-flight size request per page, plus resolved geometry. */
export class PageSizeCache {
  private readonly sizes = new Map<number, NaturalSize>();
  private readonly pending = new Map<number, Promise<NaturalSize>>();

  constructor(private readonly document: PdfDocument) {}

  /** Cached geometry, or undefined until the page's request settles. */
  get(index: number): NaturalSize | undefined {
    return this.sizes.get(index);
  }

  /** Resolve the page's natural size once per document, sharing in-flight work. */
  async load(index: number): Promise<NaturalSize> {
    const known = this.sizes.get(index);
    if (known !== undefined) return known;
    const running = this.pending.get(index);
    if (running !== undefined) return running;
    const request = this.document
      .getPage(index + 1)
      .then((page) => {
        const viewport = page.getViewport({ scale: 96 / 72 });
        const size = { width: viewport.width, height: viewport.height };
        this.sizes.set(index, size);
        this.pending.delete(index);
        return size;
      })
      .catch((failure) => {
        this.pending.delete(index);
        throw failure;
      });
    this.pending.set(index, request);
    return request;
  }
}
