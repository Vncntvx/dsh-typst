/**
 * The seven agent tools of the Typst workbench. Semantics ported from the
 * ZCode typst-workbench server (0.2.0); schemas follow the dsh-zotero tool
 * conventions (value-schema literals with per-property `required`, canonical
 * JSON output plus a model-facing render, one registration effect per tool).
 * Host half only.
 *
 * `typst_render_pages` returns base64 PNGs in its canonical value and the
 * client's `tool.call.toolview` view displays them inline; the model-facing
 * render stays text (the canonical JSON is persistence and toolview data).
 * @module dsh-typst/tools/registration
 */

import type { Context } from "@deepseek-ai/cordis";
import { defineTool, type ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import { LIMITS } from "../constants.js";
import type { TypstWorkbenchService } from "../service.js";
import { WorkspaceSession } from "../workspace/session.js";
import {
  compileSummary,
  countOf,
  diagnosticsText,
  sessionOfExec,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Shared summary plumbing
// ---------------------------------------------------------------------------

interface SessionSummary {
  main: string | null;
  phase: string;
  errors: number;
  warnings: number;
  pages: number | null;
  durationMs: number | null;
  summary: string;
  problems: string;
}

function summarize(session: WorkspaceSession): SessionSummary {
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
    summary: compileSummary(
      state.status,
      state.main,
      state.diagnostics,
      pages ?? undefined,
    ),
    problems: state.diagnostics.length
      ? diagnosticsText(state.diagnostics)
      : "",
  };
}

function textOf(summary: SessionSummary): string {
  return summary.problems !== ""
    ? `${summary.summary}\n\n${summary.problems}`
    : summary.summary;
}

/** Canonical JSON must be lossless: optional facts are stripped, never null-typed. */
function stripAbsent<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

// ---------------------------------------------------------------------------
// typst_status
// ---------------------------------------------------------------------------

function typstStatusTool(ctx: Context, service: TypstWorkbenchService) {
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
            type: "json",
            required: true,
            description: "Typst toolchain state view.",
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
      render: (_args, value) => [{ type: "text", text: value.summary }],
    },
    presentCall: () => ({ card: "generic", title: "Typst status" }),
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      const session = await sessionOfExec(ctx, exec, service);
      await session.activate();
      const state = session.state();
      const summary = summarize(session);
      return stripAbsent({
        toolchain: state.toolchain as unknown as JsonValue,
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

function typstSetMainTool(ctx: Context, service: TypstWorkbenchService) {
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
    }),
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const session = await sessionOfExec(ctx, exec, service);
      const main = await session.setMain(args.path);
      await session.settle(LIMITS.checkTimeoutMs).catch(() => undefined);
      const summary = summarize(session);
      return {
        main,
        phase: summary.phase,
        errors: summary.errors,
        warnings: summary.warnings,
        summary: textOf(summary),
      };
    },
  });
}

// ---------------------------------------------------------------------------
// typst_check
// ---------------------------------------------------------------------------

function typstCheckTool(ctx: Context, service: TypstWorkbenchService) {
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
            type: "json",
            description: "The full diagnostic views.",
          },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: "text", text: value.summary }],
    },
    presentCall: () => ({ card: "generic", title: "Check Typst document" }),
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const session = await sessionOfExec(ctx, exec, service);
      const timeoutMs =
        typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
          ? Math.min(Math.max(args.timeoutMs, 1_000), 600_000)
          : LIMITS.checkTimeoutMs;
      await session.settle(timeoutMs);
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
        diagnostics: state.diagnostics as unknown as JsonValue,
      });
    },
  });
}

// ---------------------------------------------------------------------------
// typst_render_pages
// ---------------------------------------------------------------------------

function typstRenderPagesTool(ctx: Context, service: TypstWorkbenchService) {
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
                dataUrl: { type: "string", required: true },
              },
            },
            description: "Rendered PNGs for the tool card.",
          },
        },
        additionalProperties: false,
      },
      render: (_args, value) => {
        const images = value.images as { page: number }[];
        const rendered = images.map((image) => `page ${image.page}`).join(", ");
        const total = value.total !== undefined ? ` of ${value.total}` : "";
        return [
          {
            type: "text",
            text: `Rendered ${rendered}${total}. The images are on the tool card.`,
          },
        ];
      },
      // The card's data channel: bounded so a pathological render cannot
      // bloat the replay record (the toolview shows text above the cap).
      presentationMeta: (_args, value) => {
        const images = value.images;
        const bytes = images.reduce(
          (sum, image) => sum + image.dataUrl.length,
          0,
        );
        return {
          pages: value.pages,
          ...(value.total !== undefined ? { total: value.total } : {}),
          images: bytes > 6_000_000 ? [] : images,
        };
      },
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Render Typst pages",
      rawInput: String(args.pages ?? ""),
    }),
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const session = await sessionOfExec(ctx, exec, service);
      const ppi =
        typeof args.ppi === "number" && Number.isFinite(args.ppi)
          ? Math.min(Math.max(args.ppi, LIMITS.ppiMin), LIMITS.ppiMax)
          : LIMITS.ppiDefault;
      const result = await session.renderPages(args.pages, ppi);
      if (!result.ok) {
        const error = new Error(
          `The document does not compile, so no pages were rendered.\n\n${diagnosticsText(result.diagnostics)}`,
        );
        error.name = "TYPST_COMPILE_FAILED";
        throw error;
      }
      return stripAbsent({
        pages: result.pages,
        ...(result.total !== undefined ? { total: result.total } : {}),
        images: result.images.map((image) => ({
          page: image.page,
          dataUrl: `data:image/png;base64,${Buffer.from(image.png).toString("base64")}`,
        })),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// typst_show
// ---------------------------------------------------------------------------

function typstShowTool(ctx: Context, service: TypstWorkbenchService) {
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
            ? "Highlighted in the preview."
            : `Requested viewing page ${value.page}; the user can open the location notification.`,
        },
      ],
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Show in preview",
      rawInput: String(
        args.quote ??
          args.file ??
          (args.page !== undefined ? `page ${args.page}` : ""),
      ),
    }),
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const session = await sessionOfExec(ctx, exec, service);
      if (typeof args.page === "number") {
        session.showPage(args.page - 1);
        return { highlighted: false, page: args.page };
      }
      const target: Parameters<WorkspaceSession["highlight"]>[0] = {};
      if (typeof args.quote === "string") target.quote = args.quote;
      if (typeof args.file === "string") {
        target.file = args.file;
        if (typeof args.line === "number") target.line = args.line;
        if (typeof args.endLine === "number") target.endLine = args.endLine;
      }
      const created = await session.highlight(
        target,
        typeof args.comment === "string" ? args.comment : "",
      );
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

function typstClearHighlightsTool(
  ctx: Context,
  service: TypstWorkbenchService,
) {
  return defineTool({
    name: "typst_clear_highlights",
    description:
      "Remove the highlights you placed in the live preview (all of them, or the named ids).",
    parameters: {
      ids: {
        type: "json",
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
      const removed = session.clearHighlights(
        Array.isArray(ids) ? ids.map(String) : undefined,
      );
      return { removed };
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
] as const;

function typstExportPdfTool(ctx: Context, service: TypstWorkbenchService) {
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
    }),
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const session = await sessionOfExec(ctx, exec, service);
      const result = await session.exportPdf(args.path, {
        ...(typeof args.pdfStandard === "string"
          ? { pdfStandard: args.pdfStandard }
          : {}),
        ...(typeof args.pages === "string" ? { pages: args.pages } : {}),
      });
      if (!result.ok) {
        const error = new Error(
          `The PDF export failed.\n\n${diagnosticsText(result.diagnostics)}`,
        );
        error.name = "TYPST_COMPILE_FAILED";
        throw error;
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
export function registerTypstTools(
  ctx: Context,
  service: TypstWorkbenchService,
): void {
  const definitions = [
    typstStatusTool(ctx, service),
    typstSetMainTool(ctx, service),
    typstCheckTool(ctx, service),
    typstRenderPagesTool(ctx, service),
    typstShowTool(ctx, service),
    typstClearHighlightsTool(ctx, service),
    typstExportPdfTool(ctx, service),
  ] satisfies ToolDefinition[];
  for (const definition of definitions) {
    ctx.effect(
      () => ctx.tools.register(definition),
      `typst: ${definition.name}`,
    );
  }
}
