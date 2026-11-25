/**
 * The model-facing tool renders: the facts a model needs must be in the
 * `render` content, not only in the canonical value. These specs call the
 * registered renderers directly, so they do not need a live Typst.
 * @module tests/tools/render
 */

import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import { registeredTools } from "./helpers/tool-registry.js";

const tools = registeredTools();

function textOf(definition: ToolDefinition, value: unknown): string {
  return definition.output
    .render({}, value as never)
    .filter((block) => block.type === "text")
    .map((block) => (block as { text: string }).text)
    .join("\n");
}

describe("tool model-facing renders", () => {
  it("typst_check renders the diagnostics, not only the summary", () => {
    const text = textOf(tools.get("typst_check")!, {
      main: "main.typ",
      phase: "error",
      errors: 1,
      warnings: 0,
      summary: "main.typ failed to compile: 1 error.",
      diagnostics: [
        {
          severity: "error",
          message: "unknown variable: foo",
          location: { file: "main.typ", line: 2, column: 3 },
          excerpt: "foo",
          hints: ["did you mean bar?"],
          trace: [
            {
              message: "while calling `f`",
              location: { file: "main.typ", line: 1, column: 1 },
            },
          ],
        },
      ],
    });
    expect(text).toContain("main.typ:2:3");
    expect(text).toContain("hint: did you mean bar?");
    expect(text).toContain("from main.typ:1:1: while calling `f`");
  });

  it("typst_status renders the toolchain, main and candidates", () => {
    const text = textOf(tools.get("typst_status")!, {
      toolchain: {
        state: "ready",
        version: "0.15.1",
        path: "/opt/homebrew/bin/typst",
        source: "path",
      },
      main: "paper.typ",
      candidates: ["paper.typ", "notes.typ"],
      phase: "ok",
      errors: 0,
      warnings: 0,
      summary: "paper.typ compiled successfully.",
    });
    expect(text).toContain("typst 0.15.1 at /opt/homebrew/bin/typst (path)");
    expect(text).toContain("main: paper.typ");
    expect(text).toContain("candidates: paper.typ, notes.typ");
  });

  it("typst_status explains a missing toolchain instead of 'Not compiling.'", () => {
    const text = textOf(tools.get("typst_status")!, {
      toolchain: { state: "missing" },
      candidates: [],
      phase: "idle",
      errors: 0,
      warnings: 0,
      summary: "Not compiling.",
    });
    expect(text).toContain("typst missing");
    expect(text).toContain("main: (none)");
  });

  it("typst_render_pages returns image blocks and keeps text", () => {
    const definition = tools.get("typst_render_pages")!;
    const blocks = definition.output.render({}, {
      pages: [1],
      total: 2,
      images: [
        {
          page: 1,
          attachment: {
            attachmentId: "abc",
            mediaType: "image/png",
            bytes: 10,
            width: 1,
            height: 1,
            name: "page-1.png",
          },
        },
      ],
    } as never);
    expect(blocks.some((block) => block.type === "text")).toBe(true);
    expect(blocks.filter((block) => block.type === "image")).toHaveLength(1);
  });

  it("typst_show marks an approximate quote", () => {
    const text = textOf(tools.get("typst_show")!, {
      highlighted: true,
      exact: false,
      id: "h1",
    });
    expect(text).toContain("approximate match");
  });
});
