/**
 * The one rendering of a diagnostic as model-facing text. Both the host
 * tools and the browser panel (its feedback drafts) import this module, so a
 * compile error reads the same in `typst_check` and in an Agent request.
 * Pure values only: safe for the browser bundle.
 * @module dsh-typst/diagnostic-text
 */
import type { DiagnosticLocationView, DiagnosticView } from "./contract.js";
/** A location as `file:line:column`, or the explicit absence marker. */
export declare function formatDiagnosticLocation(location: DiagnosticLocationView | null): string;
/** One diagnostic: severity/message, location, excerpt, hints and call trace. */
export declare function diagnosticText(diagnostic: DiagnosticView): string;
//# sourceMappingURL=diagnostic-text.d.ts.map