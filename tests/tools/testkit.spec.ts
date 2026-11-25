/**
 * The official tool testkit drives this repository's own tool registry:
 * a fixture definition goes through the same prepare/dispatch/complete
 * pipeline as a product tool, without a live Typst or Agent loop.
 * @module tests/tools/testkit
 */
import { Context } from "@deepseek-ai/cordis";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolsService from "@deepseek-ai/dsh-tools";
import {
  defineContentToolFixture,
  executeToolFixture,
} from "@deepseek-ai/dsh-tool-testkit";
import { expect, it } from "vitest";

it("executes a fixture through the real tool pipeline", async () => {
  const ctx = new Context();
  const prompt = await ctx.plugin(SystemPrompt);
  const tools = await ctx.plugin(ToolsService);
  const definition = defineContentToolFixture({
    name: "fixture_echo",
    description: "Echo one string.",
    parameters: { text: { type: "string", required: true } },
    execute: async (args) => [{ type: "text", text: args.text }],
  });
  const dispose = ctx.tools.register(definition);
  const result = await executeToolFixture(ctx, {
    callId: "fixture-1" as never,
    name: "fixture_echo",
    arguments: { text: "hello" },
    signal: new AbortController().signal,
  });
  expect(result.isError).toBe(false);
  expect(result.content).toEqual([{ type: "text", text: "hello" }]);
  dispose();
  await prompt.dispose();
  await tools.dispose();
});
