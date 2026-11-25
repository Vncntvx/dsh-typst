// @vitest-environment jsdom
/**
 * The main-file card's geometry contract.
 *
 * The card is a harness `MenuSurface` holding custom content, so the insets
 * are the feature's own responsibility. The values here are the harness
 * menu's: a 4px card padding, rows whose own 8px padding is the only
 * inset, and a footer whose rows carry that same 8px. The search band is a
 * feature-owned composition that copies the host `SearchField` row's height
 * formula (field + 3px optical padding + hairline), and the path field's seat
 * stays border-box so
 * a flex basis plus the primitive's own padding cannot overflow the form.
 *
 * These are read from the stylesheet because jsdom computes no layout: the
 * rendered result was measured against a live harness menu instead.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const css = readFileSync(
  join(import.meta.dirname, "..", "..", "src", "client", "preview.module.css"),
  "utf8",
);

/** One rule's declarations, keyed by property. */
function rule(selector: string): Map<string, string> {
  // The class selector must stand alone: a compound selector such as
  // `.mainFileSearch .mainFileSearchInput` would otherwise match too.
  const match = new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`).exec(css);
  // A comment inside the body would otherwise be glued to the declaration
  // that follows it, and the key would carry the comment text.
  const body = (match?.[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, " ");
  const out = new Map<string, string>();
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    out.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return out;
}

it("gives the card the harness menu's 4px padding and no extra list inset", () => {
  const card = rule("mainFileCard");
  expect(card.get("padding")).toBe("4px");
  // The list container adds nothing: the card's 4px plus the row's own 8px
  // are the whole inset, as in a harness menu.
  expect(rule("mainFileList").get("padding")).toBe("0");
});

it("gives the footer's rows the harness menu row's 8px inset", () => {
  // In a harness menu the footer holds menu rows, so they carry the 8px
  // row padding. Ours hold form controls, so they carry it themselves.
  for (const selector of ["mainFilePathForm", "mainFileScan"]) {
    expect(rule(selector).get("padding")).toBe("0 8px");
  }
});

it("keeps the card's fields inside the card", () => {
  // The search band owns its own row: border-box padding lives inside the
  // band, so the icon and field cannot push past the card's edge. The path
  // field's Input seat stays border-box: the primitive's wrapper is
  // content-box, so a flex basis plus its own padding would overflow the form.
  const search = rule("mainFileSearch");
  expect(search.get("box-sizing")).toBe("border-box");
  expect(search.get("padding")).toBe("0 8px 3px");
  // The band's height is the host `SearchField` formula, not a guessed row
  // height: the field is 32px, the band adds the 3px optical bottom padding
  // and owns its own 0.5px hairline inside the border box.
  expect(search.get("height")).toBe("calc(32px + 3px + 0.5px)");
  expect(rule("mainFilePath").get("box-sizing")).toBe("border-box");
});
