/**
 * The panel's live data: one `typst` protocol resource that streams the
 * workspace's state frames (the docs/subsystems/client-resources.md
 * pattern). The address is `dsh-resource://typst/state/<sessionId>`; the
 * stream is the host's `typst/watch`, which also owns the setup re-lookup
 * while open.
 * @module dsh-typst/client/provider
 */

import type { Context } from "@deepseek-ai/cordis";
import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import { TYPST_STATE_ADDRESS_PREFIX, type TypstNamespace } from "./remote.js";
import { errorText } from "./types.js";

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
          try {
            const first = await remote.status(sessionId, signal);
            if (!first.ok) {
              yield first;
              return;
            }
            yield first;
            for await (const frame of remote.watch(sessionId, signal)) {
              yield { ok: true, value: frame };
            }
            if (!signal.aborted)
              throw new Error(
                "The Typst state stream ended. Reconnect to receive updates.",
              );
          } catch (error) {
            if (!signal.aborted)
              yield {
                ok: false,
                error: {
                  code: "typst/domain",
                  message: errorText(error),
                  details: { code: "TYPST_WATCH_FAILED" },
                },
              } as RemoteResult<never>;
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
