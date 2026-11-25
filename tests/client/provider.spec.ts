import { expect, it } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { ResourceProvider } from "@deepseek-ai/dsh-client-resources/client";
import {
  registerTypstResource,
  sessionIdOf,
} from "../../src/client/provider.js";
import { frame } from "./helpers/frame.js";

it("reconnects a dropped stream in place and reports a run of failures", async () => {
  let provider: ResourceProvider<"typst"> | undefined;
  let statusCalls = 0;
  const ctx = {
    effect: (callback: () => void) => callback(),
    resources: {
      register: (value: ResourceProvider<"typst">) => {
        provider = value;
      },
    },
    remote: {
      typst: {
        status: async () => {
          statusCalls++;
          return { ok: true, value: frame() };
        },
        watch: async function* () {
          throw new Error("Disconnected");
        },
      },
    },
  };
  registerTypstResource(ctx as unknown as Context);
  const controller = new AbortController();
  const values = [];
  for await (const value of provider!.open(
    "dsh-resource://typst/state/session?subscription=2",
    { signal: controller.signal },
  )) {
    values.push(value);
    if (values.length >= 4) {
      controller.abort();
      break;
    }
  }
  expect(sessionIdOf("dsh-resource://typst/state/session?subscription=2")).toBe(
    "session",
  );
  expect(values[0].ok).toBe(true);
  expect(values.at(-1)).toMatchObject({
    ok: false,
    error: {
      code: "typst/watch-failed",
      message: "Disconnected",
      details: { code: "TYPST_WATCH_FAILED" },
    },
  });
  // The same resource address retried; no new subscription was minted.
  expect(statusCalls).toBeGreaterThan(1);
});
