/**
 * The one rendering of a diagnostic as model-facing text. Both the host
 * tools and the browser panel (its feedback drafts) import this module, so a
 * compile error reads the same in `typst_check` and in an Agent request.
 * Pure values only: safe for the browser bundle.
 * @module dsh-typst/diagnostic-text
 */

import type { DiagnosticLocationView, DiagnosticView } from "./contract.js";

/** A location as `file:line:column`, or the explicit absence marker. */
export function formatDiagnosticLocation(
  location: DiagnosticLocationView | null,
): string {
  return location
    ? `${location.file}:${location.line}:${location.column}`
    : "(no location)";
}

/** One diagnostic: severity/message, location, excerpt, hints and call trace. */
export function diagnosticText(diagnostic: DiagnosticView): string {
  const lines: string[] = [
    `${diagnostic.severity}: ${diagnostic.message}`,
    `  at ${formatDiagnosticLocation(diagnostic.location)}`,
  ];
  if (diagnostic.excerpt !== undefined)
    lines.push(`  | ${diagnostic.excerpt.trim()}`);
  for (const hint of diagnostic.hints) lines.push(`  hint: ${hint}`);
  for (const point of diagnostic.trace)
    lines.push(
      `  from ${formatDiagnosticLocation(point.location)}: ${point.message}`,
    );
  return lines.join("\n");
}
