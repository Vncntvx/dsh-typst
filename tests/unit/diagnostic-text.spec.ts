/**
 * The host tools and the browser panel must render one diagnostic identically.
 * @module tests/unit/diagnostic-text
 */
import { expect, it } from "vitest";
import type { DiagnosticView } from "../../src/contract.js";
import {
  diagnosticText,
  formatDiagnosticLocation,
} from "../../src/diagnostic-text.js";
import {
  diagnosticText as fromHost,
  diagnosticsText,
} from "../../src/tools/shared.js";

const diagnostic: DiagnosticView = {
  severity: "error",
  message: "unknown variable: nope",
  location: { file: "main.typ", line: 2, column: 3 },
  excerpt: "  let x = nope",
  hints: ["check the spelling"],
  trace: [
    {
      message: "while calling `f`",
      location: { file: "main.typ", line: 1, column: 1 },
    },
  ],
};

it("formats location, excerpt, hints and trace in one shape", () => {
  expect(diagnosticText(diagnostic)).toBe(
    [
      "error: unknown variable: nope",
      "  at main.typ:2:3",
      "  | let x = nope",
      "  hint: check the spelling",
      "  from main.typ:1:1: while calling `f`",
    ].join("\n"),
  );
  expect(formatDiagnosticLocation(null)).toBe("(no location)");
});

it("exports the same formatter from the host and through the panel re-export", () => {
  expect(fromHost).toBe(diagnosticText);
  // The panel's import resolves to this same pure module; both the model text
  // and the feedback draft therefore carry identical locations and traces.
  expect(diagnosticsText([diagnostic])).toBe(diagnosticText(diagnostic));
});

it("uses the official retention footer with the exact omitted count", () => {
  expect(diagnosticsText([diagnostic], 1, 87)).toBe(
    `${diagnosticText(diagnostic)}\n\nOmitted 86 items. 87 diagnostics in total.`,
  );
});

it("counts omitted diagnostics from the full frame, not the shown list", () => {
  const second = { ...diagnostic, message: "second" };
  expect(diagnosticsText([diagnostic, second], 2, 87)).toBe(
    `${diagnosticText(diagnostic)}\n\n${diagnosticText(second)}\n\nOmitted 85 items. 87 diagnostics in total.`,
  );
});
