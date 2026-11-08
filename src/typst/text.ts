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
  label: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
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
export function buildPage(items: PdfTextItem[], page: PdfPageInfo): PageText {
  let text = "";
  const spans: TextSpan[] = [];
  let previous: { x2: number; y: number; size: number } | null = null;
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = item.transform ?? [];
    const size = Math.hypot(c, d) || Math.hypot(a, b) || item.height || 10;
    if (previous && item.str) {
      const sameLine = Math.abs(f - previous.y) < size * 0.5;
      const last = text.at(-1) ?? "\n";
      if (!sameLine && !/\s/.test(last)) text += "\n";
      else if (
        sameLine &&
        e - previous.x2 > size * 0.15 &&
        !/\s/.test(last) &&
        !/^\s/.test(item.str)
      ) {
        text += " ";
      }
    }
    if (item.str) {
      const start = text.length;
      text += item.str;
      spans.push({
        start,
        end: text.length,
        x: e,
        y: f,
        width: item.width ?? 0,
        size,
      });
      previous = { x2: e + (item.width ?? 0), y: f, size };
    }
    if (item.hasEOL && !text.endsWith("\n")) {
      text += "\n";
    }
  }
  return {
    index: page.index,
    label: page.label,
    width: page.width,
    height: page.height,
    originX: page.originX,
    originY: page.originY,
    text,
    spans,
  };
}

/** Whitespace-normalized text for display (de-hyphenate line breaks). */
export function readableText(text: string): string {
  return text
    .replace(new RegExp("(\\p{Ll})-\\n(\\p{Ll})", "gu"), "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FOLD: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201B": "'",
  "\u2032": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u2033": '"',
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2015": "-",
  "\u2212": "-",
  "\u00ad": "",
  "\u200b": "",
  "\u2026": "...",
};

interface Normalized {
  value: string;
  map: number[];
}

/** Fold punctuation/whitespace variants so quotes match as rendered. */
function normalize(text: string, compact = false): Normalized {
  let value = "";
  const map: number[] = [];
  let pendingSpace = -1;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (
      char === "-" &&
      text[index + 1] === "\n" &&
      new RegExp("\\p{Ll}", "u").test(text[index - 1] ?? "") &&
      new RegExp("\\p{Ll}", "u").test(text[index + 2] ?? "")
    ) {
      index += 1;
      continue;
    }
    if (/\s/.test(char)) {
      if (!compact && pendingSpace < 0 && value.length) pendingSpace = index;
      continue;
    }
    const folded = (FOLD[char] ?? char).normalize("NFKC").toLowerCase();
    if (!folded) continue;
    if (pendingSpace >= 0) {
      value += " ";
      map.push(pendingSpace);
      pendingSpace = -1;
    }
    for (const part of folded) {
      value += part;
      map.push(index);
    }
  }
  return { value, map };
}

interface PageHit {
  pageIndex: number;
  start: number;
  end: number;
}

function findInPage(page: PageText, quote: string, from = 0): PageHit | null {
  for (const compact of [false, true]) {
    const haystack = normalize(page.text, compact);
    const needle = normalize(quote, compact).value.trim();
    if (!needle) return null;
    const startAt = haystack.map.findIndex((original) => original >= from);
    if (startAt < 0) continue;
    const position = haystack.value.indexOf(needle, startAt);
    if (position >= 0) {
      return {
        pageIndex: page.index,
        start: haystack.map[position],
        end: haystack.map[position + needle.length - 1] + 1,
      };
    }
  }
  const parts = quote
    .split(/\s*(?:\.\.\.|…|\[\s*\.\.\.\s*\])\s*/)
    .filter((part) => part.trim().length >= 8);
  if (parts.length >= 2) {
    const first = findInPage(page, parts[0], from);
    if (first) {
      const last = findInPage(page, parts.at(-1)!, first.end);
      if (last && last.end - first.start < 3e3) {
        return { pageIndex: page.index, start: first.start, end: last.end };
      }
    }
  }
  return null;
}

/**
 * Find a quote in the extracted pages: exact (folded) match first, then
 * across adjacent pages, preferring the preferred page when given.
 */
export function findQuote(
  pages: PageText[],
  quote: string,
  preferredPage?: number,
): PageHit | null {
  const order =
    preferredPage !== undefined && pages[preferredPage]
      ? [
          pages[preferredPage],
          ...pages.filter((page) => page.index !== preferredPage),
        ]
      : pages;
  for (const page of order) {
    const match = findInPage(page, quote);
    if (match) return match;
  }
  for (let index = 0; index + 1 < pages.length; index++) {
    const a = pages[index];
    const b = pages[index + 1];
    const joined: PageText = { ...a, text: `${a.text}\n${b.text}` };
    const match = findInPage(joined, quote);
    if (match && match.start < a.text.length && match.end > a.text.length) {
      return { pageIndex: a.index, start: match.start, end: a.text.length };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Highlight rectangles
// ---------------------------------------------------------------------------

/** Per-glyph advance widths for ASCII (Helvetica metrics, as ZCode used). */
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
  278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
  833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
  500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];

function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 32;
  if (code >= 32 && code < 127) return ASCII_WIDTHS[code - 32];
  if (
    (code >= 11904 && code <= 40959) ||
    (code >= 44032 && code <= 55215) ||
    (code >= 65280 && code <= 65519)
  ) {
    return 1e3;
  }
  return 556;
}

function fraction(text: string, offset: number): number {
  let before = 0;
  let total = 0;
  let index = 0;
  for (const char of text) {
    const width = charWidth(char);
    if (index < offset) before += width;
    total += width;
    index += char.length;
  }
  return total ? before / total : 0;
}

/**
 * PDF user-space rectangles covering `page.text[start, end)`, merged across
 * adjacent spans on the same line. The panel maps them through the page
 * viewport to draw highlights.
 */
export function rectsFor(
  page: PageText,
  start: number,
  end: number,
): number[][] {
  const rects: number[][] = [];
  for (const span of page.spans) {
    if (span.end <= start || span.start >= end) continue;
    const text = page.text.slice(span.start, span.end);
    const from = Math.max(start, span.start) - span.start;
    const to = Math.min(end, span.end) - span.start;
    const x1 = span.x + span.width * fraction(text, from);
    const x2 = span.x + span.width * fraction(text, to);
    const rect = [x1, span.y - span.size * 0.25, x2, span.y + span.size * 0.75];
    const last = rects.at(-1);
    if (
      last &&
      Math.abs(last[1] - rect[1]) < span.size * 0.3 &&
      rect[0] - last[2] < span.size * 1.5 &&
      rect[0] >= last[0] - 1
    ) {
      last[2] = Math.max(last[2], rect[2]);
      last[1] = Math.min(last[1], rect[1]);
      last[3] = Math.max(last[3], rect[3]);
    } else {
      rects.push(rect);
    }
  }
  return rects.map((rect) =>
    rect.map((value) => Math.round(value * 1e3) / 1e3),
  );
}

/** The rendered text of a range, whitespace-collapsed for display. */
export function textAt(page: PageText, start: number, end: number): string {
  return readableText(page.text.slice(start, end)).replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Page specs ("1", "2-3", "1,5")
// ---------------------------------------------------------------------------

/**
 * Parse a 1-based page spec into 0-based indices, bounded by `pageCount`.
 * @throws when a part of the spec is malformed.
 */
export function parsePages(spec: string, pageCount: number): number[] {
  const result = new Set<number>();
  for (const part of spec
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean)) {
    const match = /^(\d+)?\s*(?:-\s*(\d+)?)?$/.exec(part);
    if (!match || (!match[1] && !match[2])) {
      throw new Error(
        `Invalid page range "${part}". Use e.g. "3", "2-5" or "1,4-6".`,
      );
    }
    const isRange = part.includes("-");
    const from = match[1] ? Number(match[1]) : 1;
    const to = isRange ? (match[2] ? Number(match[2]) : pageCount) : from;
    for (let page = Math.max(from, 1); page <= Math.min(to, pageCount); page++)
      result.add(page - 1);
  }
  return [...result].sort((a, b) => a - b);
}
