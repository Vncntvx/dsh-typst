import { expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { ResourceProvider } from "@deepseek-ai/dsh-client-resources/client";
import {
  registerTypstResource,
  sessionIdOf,
} from "../../src/client/provider.js";
import { frame } from "./helpers/frame.js";
it("reports a dropped stream as failure and supports an explicit reconnection address", async () => {
  let provider: ResourceProvider<"typst"> | undefined;
  const ctx = {
    effect: (callback: () => void) => callback(),
    resources: {
      register: (value: ResourceProvider<"typst">) => {
        provider = value;
      },
    },
    remote: {
      typst: {
        status: async () => ({ ok: true, value: frame() }),
        watch: async function* () {
          throw new Error("Disconnected");
        },
      },
    },
  };
  registerTypstResource(ctx as unknown as Context);
  const values = [];
  for await (const value of provider!.open(
    "dsh-resource://typst/state/session?subscription=2",
    { signal: new AbortController().signal },
  ))
    values.push(value);
  expect(sessionIdOf("dsh-resource://typst/state/session?subscription=2")).toBe(
    "session",
  );
  expect(values[0].ok).toBe(true);
  expect(values[1]).toMatchObject({
    ok: false,
    error: { message: "Disconnected" },
  });
});
