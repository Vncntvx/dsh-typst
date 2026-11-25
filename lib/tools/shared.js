/**
 * Shared tool plumbing: session resolution from a tool execution, and the
 * diagnostics/status text the tools return (ported from the ZCode
 * typst-workbench server 0.2.0 `src/domain/format.ts` and
 * `src/adapters/server.ts`). Host half only.
 * @module dsh-typst/tools/shared
 */
import { formatRetentionNotice } from "@deepseek-ai/dsh-output-retention";
import { LIMITS } from "../constants.js";
export { diagnosticText } from "../diagnostic-text.js";
import { diagnosticText } from "../diagnostic-text.js";
import { TYPST_NOT_COMPOSED, TypstError } from "../errors.js";
/**
 * Resolve the executing session's workspace and return its workbench
 * session (creating it on first use).
 * @param ctx - the plugin context (services resolve through it).
 * @param exec - the tool execution context.
 * @param service - the workbench service.
 */
export async function sessionOfExec(ctx, exec, service) {
    const workingDirectory = ctx.get("workingDirectory");
    if (workingDirectory === undefined) {
        throw new TypstError("The working-directory service is not composed; cannot resolve the workspace.", TYPST_NOT_COMPOSED);
    }
    const cwd = exec.agent
        ? await workingDirectory.ensure(exec.agent, exec.signal)
        : workingDirectory.defaultDirectory;
    return service.sessionFor(cwd);
}
/** The diagnostics block, with any frame-level truncation named explicitly. */
export function diagnosticsText(diagnostics, limit = LIMITS.diagnostics, total = diagnostics.length) {
    const cap = Math.max(0, limit);
    const shown = diagnostics.slice(0, cap);
    const full = Math.max(total, diagnostics.length);
    const omitted = full - shown.length;
    const body = shown.map(diagnosticText).join("\n\n");
    if (omitted <= 0)
        return body;
    const footer = formatRetentionNotice({
        scope: "typst-diagnostics",
        strategy: "head",
        unit: "items",
        limit: cap,
        kept: shown.length,
        omitted: { kind: "exact", count: omitted },
    }, () => `${full} diagnostics in total.`);
    return [body, footer].filter((part) => part.length > 0).join("\n\n");
}
export function countOf(diagnostics) {
    const errors = diagnostics.filter((entry) => entry.severity === "error").length;
    return { errors, warnings: diagnostics.length - errors };
}
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
/** One-line compile summary the status/check/set_main answers lead with. */
export function compileSummary(status, main, diagnostics, pages, diagnosticsTotal = diagnostics.length) {
    const { errors, warnings } = countOf(diagnostics);
    const hidden = diagnosticsTotal - diagnostics.length;
    const hiddenText = hidden > 0 ? ` Showing ${diagnostics.length} of ${diagnosticsTotal}.` : "";
    const time = status.durationMs !== undefined
        ? ` in ${status.durationMs < 10 ? status.durationMs.toFixed(1) : Math.round(status.durationMs)} ms`
        : "";
    const pagesText = pages !== undefined ? ` — ${plural(pages, "page")}` : "";
    switch (status.phase) {
        case "ok":
            return `${main} compiled successfully${time}${pagesText}. No errors or warnings.${hiddenText}`;
        case "warnings":
            return `${main} compiled with ${plural(warnings, "warning")}${time}${pagesText}.${hiddenText}`;
        case "error":
            return `${main} failed to compile: ${plural(errors, "error")}${warnings ? ` and ${plural(warnings, "warning")}` : ""}.${pages !== undefined ? ` The preview still shows the last successful version (${plural(pages, "page")}).` : " There is no preview yet."}${hiddenText}`;
        case "compiling":
        case "starting":
            return `${main} is compiling…`;
        case "crashed":
            return `typst watch stopped: ${status.error ?? "unknown error"}`;
        case "idle":
            return "Not compiling.";
    }
}
//# sourceMappingURL=shared.js.map