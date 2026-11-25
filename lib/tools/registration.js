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
import { defineTool } from "@deepseek-ai/dsh-tools";
import { LIMITS } from "../constants.js";
import { TYPST_ATTACHMENT_UNAVAILABLE, TYPST_COMPILE_FAILED, TYPST_INVALID_ARGUMENT, TYPST_INVALID_TARGET, TYPST_NOT_COMPOSED, TypstError, } from "../errors.js";
import { compileSummary, countOf, diagnosticsText, sessionOfExec, } from "./shared.js";
function summarize(session) {
    const state = session.state();
    const { errors, warnings } = countOf(state.diagnostics);
    const pages = state.snapshot?.pages ?? null;
    return {
        main: state.main,
        phase: state.status.phase,
        errors,
        warnings,
        pages,
        durationMs: state.status.durationMs ?? null,
        summary: compileSummary(state.status, state.main, state.diagnostics, pages ?? undefined, state.diagnosticsTotal),
        problems: state.diagnostics.length
            ? diagnosticsText(state.diagnostics, LIMITS.diagnostics, state.diagnosticsTotal)
            : "",
    };
}
function textOf(summary) {
    return summary.problems !== ""
        ? `${summary.summary}\n\n${summary.problems}`
        : summary.summary;
}
/** Canonical JSON must be lossless: optional facts are stripped, never null-typed. */
function stripAbsent(value) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}
/** One file location for a tool card's editor follow-along, or none. */
function fileLocations(path, line) {
    if (typeof path !== "string" || path.length === 0)
        return undefined;
    return [
        {
            path,
            ...(typeof line === "number" && Number.isInteger(line) ? { line } : {}),
        },
    ];
}
// ---------------------------------------------------------------------------
// typst_status
// ---------------------------------------------------------------------------
function typstStatusTool(ctx, service) {
    return defineTool({
        name: "typst_status",
        description: [
            "Show the Typst workbench: the Typst installation in use (version and path), the main .typ file and the other .typ files in the workspace, and the latest compile result.",
            "Call this first when working on a Typst document.",
            "The live preview panel updates by itself when files are saved; this tool reports the state.",
        ].join(" "),
        parameters: {},
        output: {
            schema: {
                type: "object",
                properties: {
                    toolchain: {
                        type: "object",
                        required: true,
                        additionalProperties: false,
                        description: "Typst toolchain state view.",
                        properties: {
                            state: {
                                type: "string",
                                required: true,
                                enum: ["ready", "missing", "too_old", "error"],
                            },
                            version: { type: "string" },
                            path: { type: "string" },
                            source: {
                                type: "string",
                                enum: ["setting", "path", "common", "shell"],
                            },
                            error: { type: "string" },
                        },
                    },
                    main: {
                        type: "string",
                        description: "The chosen main .typ file (workspace-relative).",
                    },
                    candidates: {
                        type: "array",
                        required: true,
                        items: { type: "string" },
                        description: "The workspace's .typ files.",
                    },
                    phase: {
                        type: "string",
                        required: true,
                        description: "Latest compile phase.",
                    },
                    errors: { type: "integer", required: true },
                    warnings: { type: "integer", required: true },
                    pages: { type: "integer", description: "Preview page count." },
                    summary: {
                        type: "string",
                        required: true,
                        description: "One-line compile summary.",
                    },
                },
                additionalProperties: false,
            },
            render: (_args, value) => {
                const toolchain = value.toolchain;
                const install = toolchain?.state === "ready"
                    ? `typst ${toolchain.version} at ${toolchain.path} (${toolchain.source})`
                    : `typst ${toolchain?.state ?? "unknown"}${toolchain?.error ? ` — ${toolchain.error}` : ""}`;
                const candidates = value.candidates.length > 0 ? value.candidates.join(", ") : "(none)";
                return [
                    {
                        type: "text",
                        text: [
                            install,
                            `main: ${value.main ?? "(none)"}`,
                            `candidates: ${candidates}`,
                            value.summary,
                        ].join("\n"),
                    },
                ];
            },
        },
        presentCall: () => ({ card: "generic", title: "Typst status" }),
        isConcurrencySafe: () => true,
        async execute(_args, exec) {
            const session = await sessionOfExec(ctx, exec, service);
            await session.activate();
            const state = session.state();
            const summary = summarize(session);
            return stripAbsent({
                toolchain: state.toolchain,
                ...(state.main !== null ? { main: state.main } : {}),
                candidates: state.candidates,
                phase: summary.phase,
                errors: summary.errors,
                warnings: summary.warnings,
                ...(summary.pages !== null ? { pages: summary.pages } : {}),
                summary: summary.summary,
            });
        },
    });
}
// ---------------------------------------------------------------------------
// typst_set_main
// ---------------------------------------------------------------------------
function typstSetMainTool(ctx, service) {
    return defineTool({
        name: "typst_set_main",
        description: [
            "Choose the main .typ file of the document (the one you would pass to `typst compile`).",
            "The preview restarts with it, and the choice is remembered for this workspace.",
        ].join(" "),
        parameters: {
            path: {
                type: "string",
                required: true,
                description: "Workspace-relative path of a .typ file.",
            },
        },
        output: {
            schema: {
                type: "object",
                properties: {
                    main: { type: "string", required: true },
                    phase: { type: "string", required: true },
                    errors: { type: "integer", required: true },
                    warnings: { type: "integer", required: true },
                    settled: {
                        type: "boolean",
                        required: true,
                        description: "Whether the new main file finished compiling within the check budget.",
                    },
                    reason: {
                        type: "string",
                        description: "Why waiting for the new main file to compile failed.",
                    },
                    summary: { type: "string", required: true },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [{ type: "text", text: value.summary }],
        },
        presentCall: (args) => ({
            card: "generic",
            title: "Set Typst main file",
            rawInput: String(args.path ?? ""),
            locations: fileLocations(args.path),
        }),
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const session = await sessionOfExec(ctx, exec, service);
            const main = await session.setMain(args.path);
            let settled = true;
            let reason;
            try {
                await session.settle(LIMITS.checkTimeoutMs, exec.signal);
            }
            catch (error) {
                if (exec.signal.aborted)
                    throw error;
                settled = false;
                reason = error instanceof Error ? error.message : String(error);
            }
            const summary = summarize(session);
            return {
                main,
                phase: summary.phase,
                errors: summary.errors,
                warnings: summary.warnings,
                settled,
                ...(reason !== undefined ? { reason } : {}),
                summary: settled
                    ? textOf(summary)
                    : `${summary.summary}\n\nCould not wait for the new main file to compile: ${reason ?? "unknown error"}`,
            };
        },
    });
}
// ---------------------------------------------------------------------------
// typst_check
// ---------------------------------------------------------------------------
function typstCheckTool(ctx, service) {
    return defineTool({
        name: "typst_check",
        description: [
            "Compile the document with the user's Typst and report errors and warnings with file:line:column, the source line and Typst's hints.",
            "Waits until every change already saved to disk has been compiled, so call it right after editing.",
            "The preview panel updates by itself; this is how you see the result.",
        ].join(" "),
        parameters: {
            timeoutMs: {
                type: "integer",
                description: `How long to wait for Typst in milliseconds (default ${LIMITS.checkTimeoutMs / 1e3} s).`,
            },
        },
        output: {
            schema: {
                type: "object",
                properties: {
                    main: { type: "string", description: "The chosen main .typ file." },
                    phase: { type: "string", required: true },
                    errors: { type: "integer", required: true },
                    warnings: { type: "integer", required: true },
                    pages: { type: "integer", description: "Preview page count." },
                    durationMs: { type: "integer", description: "Compile duration." },
                    summary: { type: "string", required: true },
                    diagnostics: {
                        type: "array",
                        description: "The bounded diagnostic views for the latest compile.",
                        items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                                severity: {
                                    type: "string",
                                    required: true,
                                    enum: ["error", "warning"],
                                },
                                message: { type: "string", required: true },
                                location: {
                                    oneOf: [
                                        {
                                            type: "object",
                                            additionalProperties: false,
                                            properties: {
                                                file: { type: "string", required: true },
                                                line: { type: "integer", required: true },
                                                column: { type: "integer", required: true },
                                            },
                                        },
                                        { type: "null" },
                                    ],
                                },
                                excerpt: { type: "string" },
                                hints: { type: "array", items: { type: "string" } },
                                trace: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        additionalProperties: false,
                                        properties: {
                                            message: { type: "string", required: true },
                                            location: {
                                                oneOf: [
                                                    {
                                                        type: "object",
                                                        additionalProperties: false,
                                                        properties: {
                                                            file: { type: "string", required: true },
                                                            line: { type: "integer", required: true },
                                                            column: { type: "integer", required: true },
                                                        },
                                                    },
                                                    { type: "null" },
                                                ],
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    diagnosticsTotal: {
                        type: "integer",
                        required: true,
                        description: "Total diagnostics before truncation.",
                    },
                    diagnosticsTruncated: {
                        type: "boolean",
                        required: true,
                        description: "Whether the diagnostic cap omitted any entries.",
                    },
                },
                additionalProperties: false,
            },
            render: (_args, value) => {
                const diagnostics = Array.isArray(value.diagnostics)
                    ? value.diagnostics
                    : [];
                const body = diagnostics.length > 0 ? `\n\n${diagnosticsText(diagnostics)}` : "";
                return [{ type: "text", text: `${value.summary}${body}` }];
            },
        },
        presentCall: () => ({ card: "generic", title: "Check Typst document" }),
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const session = await sessionOfExec(ctx, exec, service);
            const timeoutMs = typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
                ? Math.min(Math.max(args.timeoutMs, 1_000), 600_000)
                : LIMITS.checkTimeoutMs;
            await session.settle(timeoutMs, exec.signal);
            const state = session.state();
            const summary = summarize(session);
            return stripAbsent({
                ...(state.main !== null ? { main: state.main } : {}),
                phase: summary.phase,
                errors: summary.errors,
                warnings: summary.warnings,
                ...(summary.pages !== null ? { pages: summary.pages } : {}),
                ...(summary.durationMs !== null
                    ? { durationMs: Math.round(summary.durationMs) }
                    : {}),
                summary: summary.summary,
                diagnostics: state.diagnostics,
                diagnosticsTotal: state.diagnosticsTotal,
                diagnosticsTruncated: state.diagnosticsTruncated,
            });
        },
    });
}
// ---------------------------------------------------------------------------
// typst_render_pages
// ---------------------------------------------------------------------------
function typstRenderPagesTool(ctx, service) {
    return defineTool({
        name: "typst_render_pages",
        description: [
            "Render pages of the document to PNG images so you can look at the layout (overfull lines, figure placement, tables, title page, spacing).",
            "Compiles the files on disk with the user's Typst.",
            `At most ${LIMITS.renderPages} pages per call; default ${LIMITS.ppiDefault} ppi, raise ppi to inspect details.`,
            "Compile errors do not catch layout problems: render the affected pages and look at them.",
        ].join(" "),
        parameters: {
            pages: {
                type: "string",
                required: true,
                description: '1-based pages, e.g. "1", "2-3", "1,5".',
            },
            ppi: {
                type: "integer",
                description: `Resolution in pixels per inch (default ${LIMITS.ppiDefault}).`,
            },
        },
        output: {
            schema: {
                type: "object",
                properties: {
                    pages: {
                        type: "array",
                        required: true,
                        items: { type: "integer" },
                        description: "The rendered 1-based pages.",
                    },
                    total: {
                        type: "integer",
                        description: "Total pages of the document.",
                    },
                    images: {
                        type: "array",
                        required: true,
                        items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                                page: { type: "integer", required: true },
                                attachment: {
                                    type: "object",
                                    required: true,
                                    additionalProperties: false,
                                    properties: {
                                        attachmentId: { type: "string", required: true },
                                        mediaType: { type: "string", required: true },
                                        bytes: { type: "integer", required: true },
                                        width: { type: "integer", required: true },
                                        height: { type: "integer", required: true },
                                        name: { type: "string" },
                                    },
                                },
                            },
                        },
                        description: "Durable PNG attachments for the model and the card.",
                    },
                },
                additionalProperties: false,
            },
            render: (_args, value) => {
                const images = value.images;
                const rendered = images.map((image) => `page ${image.page}`).join(", ");
                const total = value.total !== undefined ? ` of ${value.total}` : "";
                return [
                    { type: "text", text: `Rendered ${rendered}${total}.` },
                    ...images.map((image) => ({
                        type: "image",
                        attachment: image.attachment,
                    })),
                ];
            },
            // The card's data channel: durable references only. The attachment
            // service stores the bytes; the settled content's image blocks are the
            // model-facing copy, so repeating base64 here would double the record.
            presentationMeta: (_args, value) => ({
                pages: value.pages,
                ...(value.total !== undefined ? { total: value.total } : {}),
                images: value.images.map((image) => ({
                    page: image.page,
                    attachment: image.attachment,
                })),
            }),
        },
        presentCall: (args) => ({
            card: "generic",
            title: "Render Typst pages",
            rawInput: String(args.pages ?? ""),
        }),
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const session = await sessionOfExec(ctx, exec, service);
            const ppi = typeof args.ppi === "number" && Number.isFinite(args.ppi)
                ? Math.min(Math.max(args.ppi, LIMITS.ppiMin), LIMITS.ppiMax)
                : LIMITS.ppiDefault;
            const result = await session.renderPages(args.pages, ppi, exec.signal);
            if (!result.ok) {
                throw new TypstError(`The document does not compile, so no pages were rendered.\n\n${diagnosticsText(result.diagnostics)}`, TYPST_COMPILE_FAILED);
            }
            const attachments = ctx.get("attachments");
            if (attachments === undefined) {
                throw new TypstError("The attachment store is not composed, so rendered pages cannot be returned to the model.", TYPST_ATTACHMENT_UNAVAILABLE);
            }
            const images = await Promise.all(result.images.map(async (image) => ({
                page: image.page,
                attachment: await attachments.saveImage({
                    data: image.png,
                    mediaType: "image/png",
                    name: `page-${image.page}.png`,
                }),
            })));
            return stripAbsent({
                pages: result.pages,
                ...(result.total !== undefined ? { total: result.total } : {}),
                images,
            });
        },
    });
}
// ---------------------------------------------------------------------------
// typst_show
// ---------------------------------------------------------------------------
function typstShowTool(ctx, service) {
    return defineTool({
        name: "typst_show",
        description: [
            "Point the user at something in the live preview: request a page location, or highlight rendered text with an optional comment. The panel notifies the user, who chooses when to navigate.",
            "Give exactly one of: page; quote (words as they appear in the rendered document — markup is ignored); or file and line (and optionally endLine) to highlight what those source lines produce.",
            "Add a short comment explaining why. Highlights follow the text as the document changes and last for this session.",
        ].join(" "),
        parameters: {
            page: { type: "integer", description: "1-based page to request." },
            quote: { type: "string", description: "Rendered words to highlight." },
            file: { type: "string", description: "Workspace-relative .typ file." },
            line: { type: "integer", description: "1-based line in that file." },
            endLine: {
                type: "integer",
                description: "Last line of the range (default: line).",
            },
            comment: {
                type: "string",
                description: "Short comment shown with the highlight.",
            },
        },
        output: {
            schema: {
                type: "object",
                properties: {
                    highlighted: { type: "boolean", required: true },
                    exact: {
                        type: "boolean",
                        description: "Whether the quote matched exactly.",
                    },
                    id: { type: "string", description: "The highlight id." },
                    page: {
                        type: "integer",
                        description: "The 1-based page requested for viewing.",
                    },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [
                {
                    type: "text",
                    text: value.highlighted
                        ? value.exact === false
                            ? "Highlighted in the preview (approximate match; quote the rendered words for an exact one)."
                            : "Highlighted in the preview."
                        : `Requested viewing page ${value.page}; the user can open the location notification.`,
                },
            ],
        },
        presentCall: (args) => ({
            card: "generic",
            title: "Show in preview",
            rawInput: String(args.quote ??
                args.file ??
                (args.page !== undefined ? `page ${args.page}` : "")),
            locations: fileLocations(args.file, args.line),
        }),
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const session = await sessionOfExec(ctx, exec, service);
            await session.activate();
            const hasPage = args.page !== undefined;
            const hasQuote = args.quote !== undefined;
            const hasFile = args.file !== undefined;
            const targets = [hasPage, hasQuote, hasFile].filter(Boolean).length;
            if (targets !== 1) {
                throw new TypstError("Give exactly one target: page, quote, or file (with line).", TYPST_INVALID_TARGET);
            }
            if (hasPage && (!Number.isInteger(args.page) || (args.page ?? 0) < 1)) {
                throw new TypstError("page must be an integer of at least 1.", TYPST_INVALID_TARGET);
            }
            if (hasQuote &&
                args.quote !== undefined &&
                args.quote.trim().length === 0) {
                throw new TypstError("quote must contain the rendered words to highlight.", TYPST_INVALID_TARGET);
            }
            if (hasFile) {
                if (typeof args.file !== "string" || args.file.length === 0) {
                    throw new TypstError("file must be a workspace-relative .typ path.", TYPST_INVALID_TARGET);
                }
                if (args.line === undefined) {
                    throw new TypstError("file needs a 1-based line.", TYPST_INVALID_TARGET);
                }
                if (!Number.isInteger(args.line) || args.line < 1) {
                    throw new TypstError("line must be an integer of at least 1.", TYPST_INVALID_TARGET);
                }
                if (args.endLine !== undefined &&
                    (!Number.isInteger(args.endLine) || args.endLine < args.line)) {
                    throw new TypstError("endLine must be an integer not smaller than line.", TYPST_INVALID_TARGET);
                }
            }
            if (session.state().snapshot === null) {
                await session
                    .settle(LIMITS.checkTimeoutMs, exec.signal)
                    .catch(() => undefined);
            }
            if (typeof args.page === "number") {
                session.showPage(args.page - 1);
                return { highlighted: false, page: args.page };
            }
            const target = {};
            if (typeof args.quote === "string")
                target.quote = args.quote;
            if (typeof args.file === "string") {
                target.file = args.file;
                if (typeof args.line === "number")
                    target.line = args.line;
                if (typeof args.endLine === "number")
                    target.endLine = args.endLine;
            }
            const created = await session.highlight(target, typeof args.comment === "string" ? args.comment : "");
            return {
                highlighted: true,
                exact: created.exact,
                id: created.highlight.id,
            };
        },
    });
}
// ---------------------------------------------------------------------------
// typst_clear_highlights
// ---------------------------------------------------------------------------
function typstClearHighlightsTool(ctx, service) {
    return defineTool({
        name: "typst_clear_highlights",
        description: "Remove the highlights you placed in the live preview (all of them, or the named ids).",
        parameters: {
            ids: {
                type: "array",
                items: { type: "string" },
                description: "Highlight ids to remove; omit to remove all.",
            },
        },
        output: {
            schema: {
                type: "object",
                properties: { removed: { type: "integer", required: true } },
                additionalProperties: false,
            },
            render: (_args, value) => [
                { type: "text", text: `Removed ${value.removed} highlight(s).` },
            ],
        },
        presentCall: () => ({ card: "generic", title: "Clear preview highlights" }),
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const session = await sessionOfExec(ctx, exec, service);
            const ids = args.ids;
            if (ids !== undefined) {
                if (!Array.isArray(ids) ||
                    ids.length === 0 ||
                    !ids.every((id) => typeof id === "string" && id.length > 0)) {
                    throw new TypstError("ids must be a non-empty array of highlight ids; omit it to remove all highlights.", TYPST_INVALID_ARGUMENT);
                }
            }
            return { removed: session.clearHighlights(ids) };
        },
    });
}
// ---------------------------------------------------------------------------
// typst_export_pdf
// ---------------------------------------------------------------------------
const PDF_STANDARDS = [
    "a-1b",
    "a-2b",
    "a-2u",
    "a-3b",
    "a-3u",
    "a-4",
    "a-4f",
];
function typstExportPdfTool(ctx, service) {
    return defineTool({
        name: "typst_export_pdf",
        description: [
            "Compile the document with the user's Typst and write a PDF into the workspace.",
            "Optionally a PDF standard (pdfStandard) and a page selection.",
            "The preview's own PDF is not in the workspace; this is how you produce the deliverable.",
        ].join(" "),
        parameters: {
            path: {
                type: "string",
                required: true,
                description: "Workspace-relative output path ending in .pdf.",
            },
            pdfStandard: {
                type: "string",
                enum: [...PDF_STANDARDS],
                description: "PDF standard to embed.",
            },
            pages: {
                type: "string",
                description: '1-based page selection, e.g. "1-3".',
            },
        },
        output: {
            schema: {
                type: "object",
                properties: {
                    path: { type: "string", required: true },
                    bytes: { type: "integer", description: "PDF byte size." },
                    pages: {
                        type: "integer",
                        description: "Page count of the exported PDF.",
                    },
                    summary: { type: "string", required: true },
                },
                additionalProperties: false,
            },
            render: (_args, value) => [{ type: "text", text: value.summary }],
        },
        presentCall: (args) => ({
            card: "generic",
            title: "Export Typst PDF",
            rawInput: String(args.path ?? ""),
            locations: fileLocations(args.path),
        }),
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const session = await sessionOfExec(ctx, exec, service);
            const policyService = ctx.get("sandboxPolicy");
            if (policyService === undefined) {
                throw new TypstError("The sandbox policy service is not composed; refusing to write a PDF.", TYPST_NOT_COMPOSED);
            }
            const policy = policyService.resolve(exec.agent === undefined ? {} : { session: exec.agent.session });
            const result = await session.exportPdf(args.path, {
                ...(typeof args.pdfStandard === "string"
                    ? { pdfStandard: args.pdfStandard }
                    : {}),
                ...(typeof args.pages === "string" ? { pages: args.pages } : {}),
            }, exec.signal, policy);
            if (!result.ok) {
                throw new TypstError(`The PDF export failed.\n\n${diagnosticsText(result.diagnostics)}`, TYPST_COMPILE_FAILED);
            }
            return stripAbsent({
                path: result.path,
                ...(result.bytes !== undefined ? { bytes: result.bytes } : {}),
                ...(result.pages !== undefined ? { pages: result.pages } : {}),
                summary: `Exported ${result.path}${result.bytes !== undefined ? ` (${result.bytes} bytes)` : ""}${result.pages !== undefined ? ` — ${result.pages} page(s)` : ""}.`,
            });
        },
    });
}
// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
/**
 * Register the seven tools, one effect each (unregistration is the
 * effect's own teardown).
 * @param ctx - the plugin context.
 * @param service - the workbench service the tools resolve sessions through.
 */
export function registerTypstTools(ctx, service) {
    const definitions = [
        typstStatusTool(ctx, service),
        typstSetMainTool(ctx, service),
        typstCheckTool(ctx, service),
        typstRenderPagesTool(ctx, service),
        typstShowTool(ctx, service),
        typstClearHighlightsTool(ctx, service),
        typstExportPdfTool(ctx, service),
    ];
    for (const definition of definitions) {
        ctx.effect(() => ctx.tools.register(definition), `typst: ${definition.name}`);
    }
}
//# sourceMappingURL=registration.js.map