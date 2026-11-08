/**
 * The outline resolver: the heading tree typst writes into the PDF, read
 * back as the panel's flat list with a page for every heading.
 *
 * The resolver is a pure function of the document and the tree, so the cases
 * here drive it with a stub document rather than a PDF.
 * @module tests/client/outline
 */

import { describe, expect, it } from "vitest";
import {
  resolveOutline,
  type OutlineDocument,
  type RawOutlineNode,
} from "../../src/client/pdf/outline.js";

/** A stub document: named destinations resolve, page refs are their own index. */
function stubDocument(options: {
  readonly named?: Record<string, number>;
  readonly missing?: string[];
}): OutlineDocument {
  return {
    async getDestination(name: string): Promise<unknown[] | null> {
      if (options.missing?.includes(name)) return null;
      const page = options.named?.[name];
      return page === undefined ? null : [{ page }];
    },
    async getPageIndex(ref: unknown): Promise<number> {
      if (typeof ref !== "object" || ref === null) throw new Error("not a ref");
      const page = (ref as { page: number }).page;
      if (page < 0) throw new Error("no such page");
      return page;
    },
  };
}

/** A node with a direct page reference. */
function node(
  title: string,
  page: number,
  items: RawOutlineNode[] = [],
): RawOutlineNode {
  return { title, dest: [{ page }], items };
}

describe("the outline resolver", () => {
  it("flattens a heading tree in reading order", async () => {
    const entries = await resolveOutline(stubDocument({}), [
      node("Introduction", 0, [node("Background", 0), node("Related work", 1)]),
      node("Method", 2),
    ]);
    expect(entries.map((entry) => entry.title)).toEqual([
      "Introduction",
      "Background",
      "Related work",
      "Method",
    ]);
  });

  it("carries the heading depth", async () => {
    const entries = await resolveOutline(stubDocument({}), [
      node("Introduction", 0, [node("Background", 0)]),
      node("Method", 2),
    ]);
    expect(entries.map((entry) => entry.depth)).toEqual([0, 1, 0]);
  });

  it("resolves a direct page reference", async () => {
    const entries = await resolveOutline(stubDocument({}), [node("Method", 2)]);
    expect(entries[0]?.pageIndex).toBe(2);
  });

  it("resolves a named destination", async () => {
    const entries = await resolveOutline(
      stubDocument({ named: { intro: 4 } }),
      [{ title: "Introduction", dest: "intro", items: [] }],
    );
    expect(entries[0]?.pageIndex).toBe(4);
  });

  it("reports no page for a heading the PDF does not place", async () => {
    const entries = await resolveOutline(stubDocument({}), [
      { title: "Nowhere", dest: null, items: [] },
    ]);
    expect(entries[0]?.pageIndex).toBeNull();
  });

  it("reports no page for a named destination that does not resolve", async () => {
    const entries = await resolveOutline(stubDocument({ missing: ["ghost"] }), [
      { title: "Ghost", dest: "ghost", items: [] },
    ]);
    expect(entries[0]?.pageIndex).toBeNull();
  });

  it("reports a document destination lookup failure distinctly from an empty outline", async () => {
    await expect(
      resolveOutline(
        {
          async getDestination(): Promise<unknown[] | null> {
            throw new Error("no destinations");
          },
          async getPageIndex(): Promise<number> {
            throw new Error("no pages");
          },
        },
        [{ title: "Broken", dest: "ghost", items: [] }],
      ),
    ).rejects.toThrow("no destinations");
  });

  it("returns nothing for a document without headings", async () => {
    expect(await resolveOutline(stubDocument({}), [])).toEqual([]);
  });
});

it("preserves two distinct destinations on the same page", async () => {
  const first = [0, { name: "XYZ" }, 30, 700, null];
  const second = [0, { name: "XYZ" }, 30, 200, null];
  const entries = await resolveOutline(stubDocument({}), [
    { title: "First", dest: first, items: [] },
    { title: "Lower", dest: second, items: [] },
  ]);
  expect(entries.map((entry) => entry.pageIndex)).toEqual([0, 0]);
  expect(entries.map((entry) => entry.destination)).toEqual([first, second]);
});
