/**
 * The panel's live data: one `typst` protocol resource that streams the
 * workspace's state frames (the docs/subsystems/client-resources.md
 * pattern). The address is `dsh-resource://typst/state/<sessionId>` and never
 * changes; a dropped stream reconnects in place with exponential backoff, so a
 * transient carrier failure does not become a terminal panel error.
 * @module dsh-typst/client/provider
 */

import type { Context } from "@deepseek-ai/cordis";
import type {
  RemoteResult,
  RemoteFailure,
} from "@deepseek-ai/dsh-typert-protocol";
import { remoteErrorOf } from "@deepseek-ai/dsh-typert-protocol";
import { TYPST_STATE_ADDRESS_PREFIX, type TypstNamespace } from "./remote.js";
import { errorText } from "./types.js";

/** Failures that mean reconnecting cannot help. */
const TERMINAL = new Set([
  "gateway/bad-request",
  "gateway/lookup-not-found",
  "gateway/unauthorized",
  "gateway/forbidden",
  "gateway/not-found",
]);

/** The panel's one failure record, preserving a Remote failure's code/details. */
function panelFailure(error: unknown): RemoteFailure {
  const remote = remoteErrorOf(error);
  if (remote !== undefined) return remote;
  return Object.assign(new Error(errorText(error)), {
    name: "RemoteError",
    code: "typst/watch-failed",
    details: { code: "TYPST_WATCH_FAILED" },
    isDSHRemoteError: true as const,
  }) as unknown as RemoteFailure;
}

/** Sleep, resolving early when the resource subscription aborts. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Register the `typst` resource protocol.
 * @param ctx - client context carrying `resources` and the mounted `remote.typst`.
 */
export function registerTypstResource(ctx: Context): void {
  ctx.effect(
    () =>
      ctx.resources.register<"typst">({
        protocol: "typst",
        async *open(
          address,
          { signal },
        ): AsyncIterable<
          RemoteResult<import("../contract.js").TypstStateFrame>
        > {
          const sessionId = sessionIdOf(address);
          if (sessionId === undefined) {
            yield {
              ok: false,
              error: {
                code: "gateway/bad-request",
                message: `Malformed typst state address: ${address}`,
                details: {},
              },
            } as RemoteResult<never>;
            return;
          }
          const remote = ctx.remote.typst as TypstNamespace;
          let failures = 0;
          while (!signal.aborted) {
            try {
              const first = await remote.status(sessionId, signal);
              if (!first.ok) {
                if (TERMINAL.has(first.error.code)) {
                  yield first;
                  return;
                }
                throw first.error;
              }
              yield first;
              for await (const frame of remote.watch(sessionId, signal)) {
                failures = 0;
                yield { ok: true, value: frame };
              }
            } catch (error) {
              if (signal.aborted) return;
              const failure = panelFailure(error);
              if (TERMINAL.has(failure.code)) {
                yield { ok: false, error: failure } as RemoteResult<never>;
                return;
              }
              failures++;
              // One transient blip is retried silently; a run of failures is
              // shown so the panel can explain what is happening.
              if (failures >= 3) {
                yield { ok: false, error: failure } as RemoteResult<never>;
              }
            }
            if (signal.aborted) return;
            await delay(
              Math.min(250 * 2 ** Math.max(0, failures - 1), 5_000),
              signal,
            );
          }
        },
      }),
    "dsh-typst: typst resource provider",
  );
}

/** The session id encoded in a state address, or undefined. */
export function sessionIdOf(
  address: string,
): import("@deepseek-ai/dsh-session/types").SessionId | undefined {
  if (!address.startsWith(TYPST_STATE_ADDRESS_PREFIX)) return undefined;
  const rest = address.slice(TYPST_STATE_ADDRESS_PREFIX.length).split("?")[0];
  return rest !== "" && !rest.includes("/") && !rest.includes("#")
    ? (rest as import("@deepseek-ai/dsh-session/types").SessionId)
    : undefined;
}
