/**
 * The two stylesheet guards added for finding S29, driven as pure predicates.
 *
 * A guard that stops matching the form its docstring names fails the suite
 * green: the rule it should have rejected is accepted and the check reports
 * nothing. These cases pin the elevated-surface and neutral-hairline shapes
 * against `scripts/style-guard.mjs`.
 * @module tests/unit/style-guard
 */

import { describe, expect, it } from "vitest";
import {
  elevatedSurfaceViolations,
  fontWeightViolations,
  neutralHairlineViolations,
} from "../../scripts/style-guard.mjs";

/** These two guards read no palette entries, but the guard signature takes one. */
const PALETTE = { dsw: [], dsh: [] };

const elevated = (css: string) =>
  elevatedSurfaceViolations({ file: "x.css", css }, PALETTE);

const neutral = (css: string, file = "x.css") =>
  neutralHairlineViolations({ file, css }, PALETTE);

const weigh = (css: string) =>
  fontWeightViolations({ file: "x.css", css }, PALETTE);

describe("the elevated-surface guard", () => {
  it("reports a neutral border paired with an elevation shadow", () => {
    const violations = elevated(
      ".pill { box-shadow: var(--dsw-elevation-panel); border: 1px solid var(--dsw-alias-border-l2); }",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain("pairs a neutral border");
    expect(violations[0]?.fix).toContain("border: 0");
  });

  it("leaves an elevated surface with border: 0 alone", () => {
    expect(
      elevated(
        ".pill { box-shadow: var(--dsw-elevation-prominent); border: 0; }",
      ),
    ).toEqual([]);
  });

  it("leaves an elevation shadow with no border alone", () => {
    expect(
      elevated(".pill { box-shadow: var(--dsw-elevation-soft); }"),
    ).toEqual([]);
  });

  it("keeps a state-coloured border beside an elevation shadow", () => {
    // State borders are real borders, not the neutral hairline the shadow
    // replaces, so the official rule leaves them out of scope.
    expect(
      elevated(
        ".warn { box-shadow: var(--dsw-elevation-panel); border: 1px solid var(--dsw-alias-state-warn-primary); }",
      ),
    ).toEqual([]);
  });
});

describe("the neutral-hairline guard", () => {
  it("reports a 1px neutral border", () => {
    const violations = neutral(
      ".card { border: 1px solid var(--dsw-alias-border-l1); }",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain("1px neutral border");
    expect(violations[0]?.fix).toContain("0.5px");
  });

  it("reports a 1px neutral long-hand border", () => {
    expect(
      neutral(".row { border-bottom: 1px solid var(--dsw-alias-border-l1); }"),
    ).toHaveLength(1);
  });

  it("leaves a 0.5px neutral border alone", () => {
    expect(
      neutral(".card { border: 0.5px solid var(--dsw-alias-border-l1); }"),
    ).toEqual([]);
    expect(
      neutral(".row { border-top: 0.5px solid var(--dsw-alias-border-l2); }"),
    ).toEqual([]);
  });

  it("keeps a dashed 1px affordance at 1px", () => {
    expect(
      neutral(".drop { border: 1px dashed var(--dsw-alias-border-l1); }"),
    ).toEqual([]);
    expect(
      neutral(".drop { border: 1px dotted var(--dsw-alias-border-l1); }"),
    ).toEqual([]);
  });

  it("keeps a state-coloured 1px border at 1px", () => {
    expect(
      neutral(
        ".warn { border: 1px solid var(--dsw-alias-state-warn-primary); }",
      ),
    ).toEqual([]);
  });

  it("ignores a border with no neutral token", () => {
    expect(neutral(".zoom { border: 0; }")).toEqual([]);
    expect(neutral(".btn { border: 1px solid transparent; }")).toEqual([]);
    expect(
      neutral(".sel { border: 1px solid var(--dsw-alias-link); }"),
    ).toEqual([]);
  });
});

describe("the neutral-hairline guard and declared rails", () => {
  it("reports a logical inline rail like a physical one", () => {
    expect(
      neutral(
        ".quote { border-inline-start: 2px solid var(--dsw-alias-border-l3); }",
      ),
    ).toHaveLength(1);
  });

  it("permits a rail declared for that sheet and selector", () => {
    expect(
      neutral(
        ".annotationQuote { border-inline-start: 2px solid var(--dsw-alias-border-l3); }",
        "src/client/preview.module.css",
      ),
    ).toEqual([]);
  });

  it("refuses the same rail in another sheet", () => {
    expect(
      neutral(
        ".annotationQuote { border-inline-start: 2px solid var(--dsw-alias-border-l3); }",
      ),
    ).toHaveLength(1);
  });
});

describe("the weight-ceiling guard", () => {
  it("reports a numeric weight above 500", () => {
    const violations = weigh(".label { font-weight: 700; }");
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toContain("weight 700");
  });

  it("reports a weight stated by a font shorthand", () => {
    expect(
      weigh(".title { font: 700 14px/20px var(--dsw-font-family); }"),
    ).toHaveLength(1);
  });

  it("reports the bold keyword", () => {
    expect(weigh(".title { font-weight: bold; }")).toHaveLength(1);
  });

  it("leaves the 500 ceiling and ladder tokens alone", () => {
    expect(weigh(".label { font-weight: 500; }")).toEqual([]);
    expect(weigh(".title { font: var(--dsw-font-s-strong-14); }")).toEqual([]);
    expect(weigh(".body { font: var(--dsw-font-s-14); }")).toEqual([]);
  });
});
