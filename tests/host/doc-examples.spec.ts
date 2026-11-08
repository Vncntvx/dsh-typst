/**
 * The tool-call examples printed in the docs, checked against the tools'
 * own parameter schemas.
 *
 * A README example that names `pdfStandard` where the schema says
 * `pdf_standard` teaches the model a call the tool rejects, and the
 * documentation is the one place a reader trusts. The docs therefore carry
 * no call the registry cannot accept.
 * @module tests/host/doc-examples
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import { registerTypstTools } from "../../src/tools/registration.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The documents whose examples are checked. */
const DOC_FILES = [
  "README.md",
  "README.en.md",
  "docs/index.md",
  "docs/index.en.md",
  "docs/product-model.md",
  "docs/product-model.en.md",
  "docs/tools.md",
  "docs/tools.en.md",
  "docs/features.md",
  "docs/features.en.md",
  "docs/getting-started.md",
  "docs/getting-started.en.md",
  "docs/architecture.md",
  "docs/architecture.en.md",
  "docs/configuration.md",
  "docs/configuration.en.md",
  "docs/troubleshooting.md",
  "docs/troubleshooting.en.md",
];

/**
 * The registered tools, captured without running any of them.
 *
 * `registerTypstTools` registers one effect per tool; a stub context that
 * runs each effect immediately captures the definitions and nothing else.
 * @returns every registered tool definition, keyed by name.
 */
function registeredTools(): Map<string, ToolDefinition> {
  const captured: ToolDefinition[] = [];
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    tools: {
      register: (definition: ToolDefinition) => {
        captured.push(definition);
        return () => undefined;
      },
    },
  };
  registerTypstTools(ctx as never, {} as never);
  return new Map(captured.map((definition) => [definition.name, definition]));
}

/**
 * One documented call: the tool's name and its named arguments.
 */
interface DocumentedCall {
  readonly file: string;
  readonly line: number;
  readonly tool: string;
  readonly args: { readonly name: string; readonly value: string }[];
}

/**
 * The `typst_*(...)` calls in a document, with their argument names.
 *
 * The parser is deliberately literal: it reads the `name=value` pairs a
 * reader sees, and it does not try to understand the value. What it checks
 * is the argument *name*, which is the part a typo breaks.
 * @param text - the document's content.
 * @param file - the document's repo-relative path, for the failure message.
 * @returns every documented call.
 */
function callsIn(text: string, file: string): DocumentedCall[] {
  const calls: DocumentedCall[] = [];
  const pattern = /\b(typst_[a-z_]+)\(([^)]*)\)/g;
  for (const match of text.matchAll(pattern)) {
    const [, tool, body] = match;
    const args = body
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map((part) => {
        const eq = part.indexOf("=");
        return {
          name: eq === -1 ? part : part.slice(0, eq).trim(),
          value: eq === -1 ? "" : part.slice(eq + 1).trim(),
        };
      });
    calls.push({
      file,
      line: text.slice(0, match.index).split("\n").length,
      tool,
      args,
    });
  }
  return calls;
}

/**
 * The parameters of one tool, in the JSON Schema shape `defineTool` compiles
 * the value-schema DSL into: the properties under `properties`, the required
 * ones in the root `required` array.
 * @param definition - the registered tool.
 * @returns the parameter names and the required subset.
 */
function parametersOf(definition: ToolDefinition | undefined): {
  names: Set<string>;
  required: Set<string>;
} {
  const schema = (definition?.parameters ?? {}) as {
    properties?: Record<string, { enum?: unknown[] }>;
    required?: string[];
  };
  return {
    names: new Set(Object.keys(schema.properties ?? {})),
    required: new Set(schema.required ?? []),
  };
}

const tools = registeredTools();

describe("the documented tool calls", () => {
  it("registers the 7 workbench tools", () => {
    expect([...tools.keys()].sort()).toEqual([
      "typst_check",
      "typst_clear_highlights",
      "typst_export_pdf",
      "typst_render_pages",
      "typst_set_main",
      "typst_show",
      "typst_status",
    ]);
  });

  it("names a tool the registry knows", () => {
    for (const file of DOC_FILES) {
      const text = readFileSync(join(root, file), "utf8");
      for (const call of callsIn(text, file)) {
        expect(
          tools.has(call.tool),
          `${file}:${call.line} calls ${call.tool}, which no tool answers`,
        ).toBe(true);
      }
    }
  });

  it("passes only arguments the tool declares", () => {
    for (const file of DOC_FILES) {
      const text = readFileSync(join(root, file), "utf8");
      for (const call of callsIn(text, file)) {
        const { names } = parametersOf(tools.get(call.tool));
        for (const arg of call.args) {
          expect(
            names.has(arg.name),
            `${file}:${call.line} passes ${arg.name}, which ${call.tool} does not declare`,
          ).toBe(true);
        }
      }
    }
  });

  it("passes every required argument", () => {
    for (const file of DOC_FILES) {
      const text = readFileSync(join(root, file), "utf8");
      for (const call of callsIn(text, file)) {
        const { required } = parametersOf(tools.get(call.tool));
        const passed = new Set(call.args.map((arg) => arg.name));
        for (const name of required) {
          expect(
            passed.has(name),
            `${file}:${call.line} calls ${call.tool} without its required ${name}`,
          ).toBe(true);
        }
      }
    }
  });

  it("uses an enum value the tool declares", () => {
    for (const file of DOC_FILES) {
      const text = readFileSync(join(root, file), "utf8");
      for (const call of callsIn(text, file)) {
        const schema = (tools.get(call.tool)?.parameters ?? {}) as {
          properties?: Record<string, { enum?: unknown[] }>;
        };
        for (const arg of call.args) {
          const values = schema.properties?.[arg.name]?.enum;
          if (!Array.isArray(values)) continue;
          const literal = arg.value.replace(/^["']|["']$/g, "");
          expect(
            values.includes(literal),
            `${file}:${call.line} passes ${arg.name}=${literal}, which ${call.tool} does not declare`,
          ).toBe(true);
        }
      }
    }
  });
});
