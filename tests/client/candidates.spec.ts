/**
 * The file chooser's grouping: which `.typ` files are documents, and which
 * are fragments the current document includes.
 * @module tests/client/candidates
 */

import { describe, expect, it } from "vitest";
import { groupCandidates } from "../../src/client/candidates.js";

describe("the candidate grouping", () => {
  it("puts every file in the documents group when nothing is included", () => {
    const groups = groupCandidates(["paper.typ", "cv.typ"], []);
    expect(groups.others).toEqual(["paper.typ", "cv.typ"]);
    expect(groups.fragments).toEqual([]);
  });

  it("moves an included file to the fragments group", () => {
    const groups = groupCandidates(
      ["paper.typ", "cv.typ", "chapters/intro.typ"],
      ["chapters/intro.typ"],
    );
    expect(groups.others).toEqual(["paper.typ", "cv.typ"]);
    expect(groups.fragments).toEqual(["chapters/intro.typ"]);
  });

  it("keeps the candidate order in both groups", () => {
    const groups = groupCandidates(
      ["a.typ", "b.typ", "c.typ", "d.typ"],
      ["b.typ", "d.typ"],
    );
    expect(groups.others).toEqual(["a.typ", "c.typ"]);
    expect(groups.fragments).toEqual(["b.typ", "d.typ"]);
  });

  it("ignores a fragment that is not among the candidates", () => {
    const groups = groupCandidates(["paper.typ"], ["chapters/intro.typ"]);
    expect(groups.others).toEqual(["paper.typ"]);
    expect(groups.fragments).toEqual([]);
  });

  it("handles an empty workspace", () => {
    expect(groupCandidates([], [])).toEqual({ others: [], fragments: [] });
  });
});
