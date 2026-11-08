/**
 * Shared tool plumbing: session resolution from a tool execution, and the
 * diagnostics/status text the tools return (ported from the ZCode
 * typst-workbench server 0.2.0 `src/domain/format.ts` and
 * `src/adapters/server.ts`). Host half only.
 * @module dsh-typst/tools/shared
 */

import type { Context } from "@deepseek-ai/cordis";
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import { LIMITS } from "../constants.js";
import type { DiagnosticView, StatusView } from "../contract.js";
import type { TypstWorkbenchService } from "../service.js";
import { WorkspaceSession } from "../workspace/session.js";

/**
 * Resolve the executing session's workspace and return its workbench
 * session (creating it on first use).
 * @param ctx - the plugin context (services resolve through it).
 * @param exec - the tool execution context.
 * @param service - the workbench service.
 */
export async function sessionOfExec(
  ctx: Context,
  exec: ToolRunContext,
  service: TypstWorkbenchService,
): Promise<WorkspaceSession> {
  const workingDirectory = ctx.get("workingDirectory");
  if (workingDirectory === undefined) {
    throw new Error(
      "The working-directory service is not composed; cannot resolve the workspace.",
    );
  }
  const cwd = exec.agent
    ? await workingDirectory.ensure(exec.agent, exec.signal)
    : workingDirectory.defaultDirectory;
  return service.sessionFor(cwd);
}

/** Model-facing rendering of one diagnostic: location, excerpt, hints, trace. */
export function diagnosticText(diagnostic: DiagnosticView): string {
  const lines: string[] = [
    `${diagnostic.severity}: ${diagnostic.message}`,
    `  at ${formatLocation(diagnostic.location)}`,
  ];
  if (diagnostic.excerpt !== undefined)
    lines.push(`  | ${diagnostic.excerpt.trim()}`);
  for (const hint of diagnostic.hints) lines.push(`  hint: ${hint}`);
  for (const point of diagnostic.trace) {
    lines.push(`  from ${formatLocation(point.location)}: ${point.message}`);
  }
  return lines.join("\n");
}

function formatLocation(
  location: { file: string; line: number; column: number } | null,
): string {
  return location
    ? `${location.file}:${location.line}:${location.column}`
    : "(no location)";
}

/** The diagnostics block, capped at LIMITS.diagnostics entries. */
export function diagnosticsText(
  diagnostics: DiagnosticView[],
  limit = LIMITS.diagnostics,
): string {
  const shown = diagnostics.slice(0, limit);
  const more = diagnostics.length - shown.length;
  const body = shown.map(diagnosticText).join("\n\n");
  return body + (more > 0 ? `\n\n… and ${more} more.` : "");
}

export function countOf(diagnostics: DiagnosticView[]): {
  errors: number;
  warnings: number;
} {
  const errors = diagnostics.filter(
    (entry) => entry.severity === "error",
  ).length;
  return { errors, warnings: diagnostics.length - errors };
}

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** One-line compile summary the status/check/set_main answers lead with. */
export function compileSummary(
  status: StatusView,
  main: string | null,
  diagnostics: DiagnosticView[],
  pages: number | undefined,
): string {
  const { errors, warnings } = countOf(diagnostics);
  const time =
    status.durationMs !== undefined
      ? ` in ${status.durationMs < 10 ? status.durationMs.toFixed(1) : Math.round(status.durationMs)} ms`
      : "";
  const pagesText = pages !== undefined ? ` — ${plural(pages, "page")}` : "";
  switch (status.phase) {
    case "ok":
      return `${main} compiled successfully${time}${pagesText}. No errors or warnings.`;
    case "warnings":
      return `${main} compiled with ${plural(warnings, "warning")}${time}${pagesText}.`;
    case "error":
      return `${main} failed to compile: ${plural(errors, "error")}${warnings ? ` and ${plural(warnings, "warning")}` : ""}.${pages !== undefined ? ` The preview still shows the last successful version (${plural(pages, "page")}).` : " There is no preview yet."}`;
    case "compiling":
    case "starting":
      return `${main} is compiling…`;
    case "crashed":
      return `typst watch stopped: ${status.error ?? "unknown error"}`;
    case "idle":
      return "Not compiling.";
  }
}
