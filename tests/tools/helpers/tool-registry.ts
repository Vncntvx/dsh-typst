import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import { registerTypstTools } from "../../../src/tools/registration.js";

/** Capture registered definitions without executing any tools. */
export function registeredTools(): Map<string, ToolDefinition> {
  const tools = new Map<string, ToolDefinition>();
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    tools: {
      register: (definition: ToolDefinition) => {
        tools.set(definition.name, definition);
        return () => undefined;
      },
    },
  };
  registerTypstTools(ctx as never, {} as never);
  return tools;
}
