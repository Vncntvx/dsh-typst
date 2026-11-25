/**
 * Shared tool plumbing: session resolution from a tool execution, and the
 * diagnostics/status text the tools return (ported from the ZCode
 * typst-workbench server 0.2.0 `src/domain/format.ts` and
 * `src/adapters/server.ts`). Host half only.
 * @module dsh-typst/tools/shared
 */
import type { Context } from "@deepseek-ai/cordis";
import type { ToolRunContext } from "@deepseek-ai/dsh-tools";
import type { DiagnosticView, StatusView } from "../contract.js";
export { diagnosticText } from "../diagnostic-text.js";
import type { TypstWorkbenchService } from "../service.js";
import { WorkspaceSession } from "../workspace/session.js";
/**
 * Resolve the executing session's workspace and return its workbench
 * session (creating it on first use).
 * @param ctx - the plugin context (services resolve through it).
 * @param exec - the tool execution context.
 * @param service - the workbench service.
 */
export declare function sessionOfExec(ctx: Context, exec: ToolRunContext, service: TypstWorkbenchService): Promise<WorkspaceSession>;
/** The diagnostics block, with any frame-level truncation named explicitly. */
export declare function diagnosticsText(diagnostics: DiagnosticView[], limit?: number, total?: number): string;
export declare function countOf(diagnostics: DiagnosticView[]): {
    errors: number;
    warnings: number;
};
/** One-line compile summary the status/check/set_main answers lead with. */
export declare function compileSummary(status: StatusView, main: string | null, diagnostics: DiagnosticView[], pages: number | undefined, diagnosticsTotal?: number): string;
//# sourceMappingURL=shared.d.ts.map