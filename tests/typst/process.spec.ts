/**
 * `ProcessRunner` against the real host subprocess provider: the credential
 * and DSH_* scrub, streaming UTF-8 across chunk boundaries, and deadline /
 * abort termination of the managed range.
 * @module tests/typst/process
 */

import { Context } from "@deepseek-ai/cordis";
import LocalSubprocessRuntime from "@deepseek-ai/dsh-subprocess-local";
import { describe, expect, it } from "vitest";
import { ProcessRunner } from "../../src/typst/process.js";

async function runner(): Promise<ProcessRunner> {
  const ctx = new Context();
  await ctx.plugin(LocalSubprocessRuntime);
  return new ProcessRunner(ctx.subprocess);
}

describe("ProcessRunner", () => {
  it(
    "scrubs credential-shaped and DSH_* names but keeps PATH",
    { timeout: 20_000 },
    async () => {
      const previousKey = process.env.DEEPSEEK_API_KEY;
      const previousDsh = process.env.DSH_PROBE;
      process.env.DEEPSEEK_API_KEY = "secret-value";
      process.env.DSH_PROBE = "harness-only";
      try {
        const result = await (
          await runner()
        ).run(
          [process.execPath, "-e", "console.log(JSON.stringify(process.env))"],
          { cwd: process.cwd(), timeoutMs: 10_000 },
        );
        expect(result.code).toBe(0);
        const env = JSON.parse(result.stdout) as Record<string, string>;
        expect(env.DEEPSEEK_API_KEY).toBeUndefined();
        expect(env.DSH_PROBE).toBeUndefined();
        expect(env.PATH ?? env.Path).toBeTruthy();
      } finally {
        if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
        else process.env.DEEPSEEK_API_KEY = previousKey;
        if (previousDsh === undefined) delete process.env.DSH_PROBE;
        else process.env.DSH_PROBE = previousDsh;
      }
    },
  );

  it(
    "decodes a multi-byte character split across chunks without U+FFFD",
    { timeout: 20_000 },
    async () => {
      const script =
        'const b = Buffer.from("你好"); process.stdout.write(b.subarray(0, 1)); setTimeout(() => process.stdout.write(b.subarray(1)), 40);';
      const child = (await runner()).spawnPiped(
        [process.execPath, "-e", script],
        { cwd: process.cwd(), graceMs: 1_000 },
      );
      let text = "";
      child.onOutput((chunk) => {
        text += chunk;
      });
      await child.done;
      expect(text).toBe("你好");
    },
  );

  it(
    "resolves a deadline and terminates the managed range",
    { timeout: 20_000 },
    async () => {
      const started = Date.now();
      const result = await (
        await runner()
      ).run([process.execPath, "-e", "setTimeout(() => {}, 30_000)"], {
        cwd: process.cwd(),
        timeoutMs: 250,
        graceMs: 500,
      });
      expect(result.timedOut).toBe(true);
      expect(Date.now() - started).toBeLessThan(5_000);
    },
  );

  it(
    "classifies caller cancellation and terminates the managed range",
    { timeout: 20_000 },
    async () => {
      const controller = new AbortController();
      const handle = (await runner()).run(
        [process.execPath, "-e", "setTimeout(() => {}, 30_000)"],
        {
          cwd: process.cwd(),
          timeoutMs: 30_000,
          graceMs: 500,
          signal: controller.signal,
        },
      );
      setTimeout(() => controller.abort(), 100);
      const result = await handle;
      expect(result.aborted).toBe(true);
      expect(result.timedOut).toBe(false);
    },
  );
});
