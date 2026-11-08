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

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The documents that ship as a zh/en pair under `docs/`. */
const DOC_PAIRS = [
  "index",
  "product-model",
  "architecture",
  "tools",
  "configuration",
  "development",
  "getting-started",
  "features",
  "troubleshooting",
];

/** The number of headings a document carries, at any level. */
function headingsOf(text: string): number {
  return text.split("\n").filter((line) => /^#{1,4} /.test(line)).length;
}

describe("the zh/en document pairs", () => {
  it("ships both sides of every pair", () => {
    for (const name of DOC_PAIRS) {
      expect(
        readFileSync(join(root, "docs", `${name}.md`), "utf8"),
        `docs/${name}.md is missing`,
      ).toContain("#");
      expect(
        readFileSync(join(root, "docs", `${name}.en.md`), "utf8"),
        `docs/${name}.en.md is missing`,
      ).toContain("#");
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

  it("opens every document with the language switch", () => {
    for (const name of DOC_PAIRS) {
      const zh = readFileSync(join(root, "docs", `${name}.md`), "utf8");
      const en = readFileSync(join(root, "docs", `${name}.en.md`), "utf8");
      expect(zh.startsWith('<p align="right"><a href="')).toBe(true);
      expect(zh).toContain("<b>English</b>");
      expect(en.startsWith('<p align="right"><a href="')).toBe(true);
      expect(en).toContain("<b>中文</b>");
    }
  });

  it("gives both READMEs a language switch", () => {
    expect(readFileSync(join(root, "README.md"), "utf8")).toContain(
      "[English](README.en.md)",
    );
    expect(readFileSync(join(root, "README.en.md"), "utf8")).toContain(
      "[简体中文](README.md)",
    );
  });
});
