/**
 * The seven agent tools of the Typst workbench. Semantics ported from the
 * ZCode typst-workbench server (0.2.0); schemas follow the dsh-zotero tool
 * conventions (value-schema literals with per-property `required`, canonical
 * JSON output plus a model-facing render, one registration effect per tool).
 * Host half only.
 *
 * `typst_render_pages` returns durable attachment references in its canonical
 * value and the client's `tool.call.toolview` view displays them inline; the
 * model-facing render stays text (the canonical JSON is persistence and
 * toolview data).
 * @module dsh-typst/tools/registration
 */
import type { Context } from "@deepseek-ai/cordis";
import type { TypstWorkbenchService } from "../service.js";
/**
 * Register the seven tools, one effect each (unregistration is the
 * effect's own teardown).
 * @param ctx - the plugin context.
 * @param service - the workbench service the tools resolve sessions through.
 */
export declare function registerTypstTools(ctx: Context, service: TypstWorkbenchService): void;
//# sourceMappingURL=registration.d.ts.map