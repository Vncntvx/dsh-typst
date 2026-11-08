/**
 * The mechanical guards of `scripts/test-lint.mjs`, driven as pure predicates.
 *
 * A guard that stops matching the form its docstring names fails the suite
 * green: the file it should have rejected is accepted, and the check reports
 * nothing. These cases pin the shapes the guards are written against.
 * @module tests/unit/test-lint
 */

import { describe, expect, it } from "vitest";
import {
  focusViolationsOf,
  helperSizeViolations,
  stripCommentsAndStrings,
  unscannedExtensionsOf,
  upstreamSourceImportsOf,
} from "../../scripts/test-lint.mjs";

describe("the extension-coverage guard", () => {
  it("reports an extension that is neither declared text nor declared binary", () => {
    expect(unscannedExtensionsOf(["a.ts", "b.png"])).toEqual([]);
    expect(unscannedExtensionsOf(["a.ts", "b.wasm"])).toEqual([".wasm"]);
  });

  it("reads the extension after the last dot", () => {
    expect(unscannedExtensionsOf(["a.tar.gz"])).toEqual([".gz"]);
    expect(unscannedExtensionsOf(["Makefile"])).toEqual([]);
  });
});

describe("the helper-size guard", () => {
  it("refuses a baselined helper that grew", () => {
    const violations = helperSizeViolations(
      [{ path: "tests/helpers/a.ts", lines: 120 }],
      { "tests/helpers/a.ts": 100 },
      300,
    );
    expect(violations).toEqual([
      { kind: "grown", path: "tests/helpers/a.ts", lines: 120, limit: 100 },
    ]);
  });

  it("allows a baselined helper that shrank", () => {
    expect(
      helperSizeViolations(
        [{ path: "tests/helpers/a.ts", lines: 80 }],
        { "tests/helpers/a.ts": 100 },
        300,
      ),
    ).toEqual([]);
  });

  it("refuses a new helper above the limit", () => {
    const violations = helperSizeViolations(
      [{ path: "tests/helpers/b.ts", lines: 400 }],
      {},
      300,
    );
    expect(violations).toEqual([
      { kind: "new", path: "tests/helpers/b.ts", lines: 400, limit: 300 },
    ]);
  });

  it("reports a baselined helper whose file disappeared", () => {
    const violations = helperSizeViolations(
      [],
      { "tests/helpers/gone.ts": 100 },
      300,
    );
    expect(violations).toEqual([
      { kind: "stale", path: "tests/helpers/gone.ts", lines: 0, limit: 100 },
    ]);
  });
});

describe("the comment and string stripper", () => {
  it("blanks a line comment while keeping every offset", () => {
    const source = "const a = 1; // trailing\nconst b = 2;";
    const stripped = stripCommentsAndStrings(source);
    expect(stripped).toHaveLength(source.length);
    expect(stripped).toContain("const a = 1;");
    expect(stripped).toContain("const b = 2;");
    expect(stripped).not.toContain("trailing");
  });

  it("blanks a block comment without eating the code after it", () => {
    const stripped = stripCommentsAndStrings("/* a */ const b = 1;");
    expect(stripped).toContain("const b = 1;");
    expect(stripped).not.toContain("a */");
  });

  it("blanks string bodies but keeps the quotes' offsets", () => {
    const source = 'const a = "it.only()";';
    const stripped = stripCommentsAndStrings(source);
    expect(stripped).toHaveLength(source.length);
    expect(stripped).not.toContain("it.only()");
  });

  it("keeps string bodies when asked to", () => {
    const source = 'const a = "@deepseek-ai/x/src/y";';
    expect(stripCommentsAndStrings(source, false)).toContain(
      "@deepseek-ai/x/src/y",
    );
  });
});

describe("the focused-and-disabled guard", () => {
  it("reports it.only and its chained forms", () => {
    expect(focusViolationsOf("it.only('a', () => {})")[0]?.construct).toBe(
      "it.only",
    );
    expect(
      focusViolationsOf("it.concurrent.only('a', () => {})")[0]?.construct,
    ).toBe("it.concurrent.only");
    // `it.only.each` focuses every case of the block; the chain regex
    // reports it under the `it.only` label, which is the construct it
    // disarms.
    expect(focusViolationsOf("it.only.each([])('a')")[0]?.construct).toBe(
      "it.only",
    );
  });

  it("reports skip and todo", () => {
    expect(focusViolationsOf("it.skip('a', () => {})")[0]?.construct).toBe(
      "it.skip",
    );
    expect(focusViolationsOf("it.todo('a')")[0]?.construct).toBe("it.todo");
  });

  it("reports an unconditional conditional gate", () => {
    expect(focusViolationsOf("it.skipIf(true, 'a', () => {})")).not.toEqual([]);
    expect(focusViolationsOf("it.runIf(false, 'a', () => {})")).not.toEqual([]);
  });

  it("allows a conditional gate", () => {
    expect(focusViolationsOf("it.runIf(enabled, 'a', () => {})")).toEqual([]);
    expect(focusViolationsOf("it.skipIf(enabled, 'a', () => {})")).toEqual([]);
  });

  it("does not read a mention inside a comment or a string as a violation", () => {
    expect(focusViolationsOf("// it.only('a')")).toEqual([]);
    expect(focusViolationsOf("const s = \"it.skip('a')\"")).toEqual([]);
  });
});

describe("the upstream-source-import guard", () => {
  it("reports an import into an upstream package's source tree", () => {
    const found = upstreamSourceImportsOf(
      'import { a } from "@deepseek-ai/dsh-tools/src/index.js";',
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.specifier).toBe("@deepseek-ai/dsh-tools/src/index.js");
  });

  it("accepts a public entry", () => {
    expect(
      upstreamSourceImportsOf('import { a } from "@deepseek-ai/dsh-tools";'),
    ).toEqual([]);
  });

  it("does not read a specifier inside a comment as a dependency", () => {
    expect(
      upstreamSourceImportsOf(
        '// import { a } from "@deepseek-ai/dsh-tools/src/index.js";',
      ),
    ).toEqual([]);
  });

  it("does not read a specifier inside a string fixture as a dependency", () => {
    expect(
      upstreamSourceImportsOf(
        'const fixture = "@deepseek-ai/dsh-tools/src/index.js";',
      ),
    ).toEqual([]);
  });
});
