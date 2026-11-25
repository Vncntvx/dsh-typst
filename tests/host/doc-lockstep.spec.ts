/**
 * The structure of the documentation set: the zh/en pairs and the language
 * switch.
 *
 * The two files of a pair are translations of each other, and the rule that
 * keeps them that way is mechanical: the same number of headings, and a
 * language switch on every page. A section that exists on one side only is a
 * section somebody forgot, and nothing in a diff shows it.
 * @module tests/host/doc-lockstep
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Every document that ships as a zh/en pair under `docs/`.
 *
 * Discovery, not a hand-maintained list: a new page enters the scan with its
 * `.en.md`, and `docs/AGENTS.md` is the one single-language instruction.
 */
const DOC_PAIRS = readdirSync(join(root, "docs"))
  .filter(
    (name) =>
      name.endsWith(".md") && !name.endsWith(".en.md") && name !== "AGENTS.md",
  )
  .map((name) => name.slice(0, -".md".length))
  .sort();

/** Full pages open with a language switch; `plugin-detail` is a fragment. */
const PAGE_PAIRS = DOC_PAIRS.filter((name) => name !== "plugin-detail");

function hasSwitch(text: string, href: string, label: string): boolean {
  return (
    text.includes(`<a href="${href}"><b>${label}</b></a>`) ||
    text.includes(`[${label}](${href})`)
  );
}

/** The number of headings a document carries outside fenced code blocks. */
export function headingsOf(text: string): number {
  let fenced = false;
  let count = 0;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && /^#{1,4} /.test(line)) count++;
  }
  return count;
}

/** The number of top-level list items outside fenced code blocks. */
export function bulletsOf(text: string): number {
  let fenced = false;
  let count = 0;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && /^- /.test(line)) count++;
  }
  return count;
}

describe("heading counting", () => {
  it("ignores shell comments inside fenced code blocks", () => {
    const text = [
      "# Title",
      "```sh",
      "# not a heading",
      "```",
      "## Section",
    ].join("\n");
    expect(headingsOf(text)).toBe(2);
  });
});

describe("the zh/en document pairs", () => {
  it("ships both sides of every pair", () => {
    for (const name of DOC_PAIRS) {
      expect(
        readFileSync(join(root, "docs", `${name}.md`), "utf8").trim().length,
        `docs/${name}.md is missing`,
      ).toBeGreaterThan(0);
      expect(
        readFileSync(join(root, "docs", `${name}.en.md`), "utf8").trim().length,
        `docs/${name}.en.md is missing`,
      ).toBeGreaterThan(0);
    }
  });

  it("gives every pair the same number of headings", () => {
    for (const name of DOC_PAIRS) {
      const zh = headingsOf(
        readFileSync(join(root, "docs", `${name}.md`), "utf8"),
      );
      const en = headingsOf(
        readFileSync(join(root, "docs", `${name}.en.md`), "utf8"),
      );
      expect(
        en,
        `docs/${name}.md and docs/${name}.en.md differ in headings`,
      ).toBe(zh);
    }
  });

  it("gives every pair the same number of top-level items", () => {
    for (const name of DOC_PAIRS) {
      const zh = bulletsOf(
        readFileSync(join(root, "docs", `${name}.md`), "utf8"),
      );
      const en = bulletsOf(
        readFileSync(join(root, "docs", `${name}.en.md`), "utf8"),
      );
      expect(
        en,
        `docs/${name}.md and docs/${name}.en.md differ in top-level items`,
      ).toBe(zh);
    }
  });

  it("states the number of document pairs it ships", () => {
    const zh = readFileSync(join(root, "docs", "development.md"), "utf8");
    const en = readFileSync(join(root, "docs", "development.en.md"), "utf8");
    expect(zh).toContain(`${DOC_PAIRS.length} 对 zh/en 文档`);
    expect(en).toContain(`${DOC_PAIRS.length} zh/en doc pairs`);
  });

  it("opens every document with the language switch", () => {
    for (const name of PAGE_PAIRS) {
      const zh = readFileSync(join(root, "docs", `${name}.md`), "utf8");
      const en = readFileSync(join(root, "docs", `${name}.en.md`), "utf8");
      expect(zh.startsWith('<p align="right"><a href="')).toBe(true);
      expect(zh).toContain("<b>English</b>");
      expect(en.startsWith('<p align="right"><a href="')).toBe(true);
      expect(en).toContain("<b>中文</b>");
    }
  });

  it("gives both READMEs a language switch", () => {
    expect(
      hasSwitch(
        readFileSync(join(root, "README.md"), "utf8"),
        "README.en.md",
        "English",
      ),
    ).toBe(true);
    expect(
      hasSwitch(
        readFileSync(join(root, "README.en.md"), "utf8"),
        "README.md",
        "中文",
      ),
    ).toBe(true);
  });

  it("rejects an empty language link", () => {
    expect(
      hasSwitch('<a href="README.en.md"></a>', "README.en.md", "English"),
    ).toBe(false);
  });
});
