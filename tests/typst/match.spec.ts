/**
 * Fuzzy matching between rendered text and sources, and the page text
 * model's quote search and rectangles.
 * @module tests/unit/match
 */

import { describe, expect, it } from "vitest";
import {
  excerpt,
  fuzzyFind,
  lineColumn,
  lineRange,
  lineStarts,
  locateInSources,
  skeleton,
} from "../../src/typst/match.js";
import {
  buildPage,
  findQuote,
  parsePages,
  rectsFor,
  textAt,
} from "../../src/typst/text.js";

describe("skeleton + fuzzyFind", () => {
  it("matches exact runs", () => {
    const hay = skeleton("The quick brown fox");
    const original = "The quick brown fox";
    const [hit] = fuzzyFind("quick brown", hay);
    expect(hit).toBeDefined();
    expect(hit.score).toBe(1);
    // Hit offsets index the original text, not the skeleton.
    expect(original.slice(hit.start, hit.end)).toBe("quick brown");
  });

  it("finds reflowed text approximately", () => {
    const hay = skeleton("The quick brown\nfox jumps over the lazy dog");
    const [hit] = fuzzyFind("brown fox jumps", hay);
    expect(hit).toBeDefined();
    expect(hit.score).toBeGreaterThan(0.5);
  });
});

describe("line helpers", () => {
  it("maps offsets to lines and columns", () => {
    const text = "ab\ncd\n";
    const starts = lineStarts(text);
    expect(lineColumn(starts, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumn(starts, 3)).toEqual({ line: 2, column: 1 });
    expect(lineRange(text, starts, 2, 2)).toEqual({ start: 3, end: 5 });
    expect(excerpt(text, 1, 2)).toBe("ab\ncd");
  });
});

describe("locateInSources", () => {
  it("locates rendered text in the source file", () => {
    const files = [
      { path: "main.typ", text: "#heading[Intro]\nThe quick brown fox.\n" },
      { path: "lib.typ", text: "#let x = 1\n" },
    ];
    const matches = locateInSources(files, "quick brown fox");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].file).toBe("main.typ");
    expect(matches[0].line).toBe(2);
  });
});

describe("page text model", () => {
  const page = buildPage(
    [
      {
        str: "Hello ",
        transform: [1, 0, 0, 1, 10, 700],
        width: 60,
        height: 12,
        hasEOL: true,
      },
      {
        str: "preview world",
        transform: [1, 0, 0, 1, 10, 660],
        width: 120,
        height: 12,
      },
    ],
    { index: 0, label: "1", width: 612, height: 792, originX: 0, originY: 0 },
  );

  it("builds page text with line separators and spans", () => {
    expect(page.text).toBe("Hello \npreview world");
    expect(page.spans).toHaveLength(2);
  });

  it("finds quotes across the fold", () => {
    const hit = findQuote([page], "Hello preview");
    expect(hit).not.toBeNull();
    expect(hit?.pageIndex).toBe(0);
  });

  it("computes rectangles covering the hit", () => {
    const hit = findQuote([page], "preview")!;
    const rects = rectsFor(page, hit.start, hit.end);
    expect(rects.length).toBeGreaterThan(0);
    for (const rect of rects) {
      expect(rect[2]).toBeGreaterThan(rect[0]);
      expect(rect[3]).toBeGreaterThan(rect[1]);
    }
    expect(textAt(page, hit.start, hit.end)).toBe("preview world".slice(0, 7));
  });

  it("parses page specs", () => {
    expect(parsePages("2", 5)).toEqual([1]);
    expect(parsePages("1-3", 5)).toEqual([0, 1, 2]);
    expect(parsePages("1,4-6", 5)).toEqual([0, 3, 4]);
    expect(parsePages("9", 5)).toEqual([]);
  });
});
