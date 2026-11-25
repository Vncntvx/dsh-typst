import type { Context } from "@deepseek-ai/cordis";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type {
  SessionRequestId,
  PromptContentPart,
} from "@deepseek-ai/dsh-api-session-controller/types";
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-file-upload/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import { NS } from "./locales.js";
import type { FeedbackDraft } from "./types.js";

declare module "@deepseek-ai/dsh-api-session-controller/client" {
  interface SessionReferenceSourceMap {
    "typst-preview": true;
  }
}
export interface FeedbackBridge {
  append(text: string): Promise<void>;
  submit(
    draft: FeedbackDraft,
    text: string,
    signal: AbortSignal,
    progress: (loaded: number, total?: number) => void,
    accepted: () => void,
  ): Promise<void>;
}
/** Public Session admission owns queueing, cold Agents, validation and durable receipts. */
export function createFeedbackBridge(
  ctx: Context,
  sessionId: SessionId,
): FeedbackBridge {
  const inFlight = new Map<string, Promise<void>>();
  const attempts = new Map<
    string,
    {
      requestId: SessionRequestId;
      content: PromptContentPart[];
      signature: string;
      /** Rolled back by discard on any failed prompt path. */
      discard: () => void;
      /** Invoke the panel's acceptance callback at most once. */
      accept: () => void;
      /** Resolves when the submission is accepted, even if the RPC lags. */
      accepted: Promise<void>;
    }
  >();
  return {
    async append(text) {
      await ctx.sessions.using(
        sessionId,
        { source: "typst-preview" },
        async (reference) => {
          const binding = await reference.ready;
          const result = ctx.conversation.input.requestDraftInitialization(
            binding,
            { prompt: text, whenDraftExists: "append" },
          );
          if (result !== "applied")
            throw new Error(
              ctx.locale === undefined
                ? "The conversation input is busy. Keep this feedback and try again."
                : ctx.locale.bind(NS)("feedback.busy"),
            );
          ctx.conversation.input.for(binding.ctx).focus();
        },
      );
    },
    submit(draft, text, signal, progress, accepted) {
      const running = inFlight.get(draft.id);
      if (running) return running;
      const operation = ctx.sessions.using(
        sessionId,
        { source: "typst-preview", signal },
        async (reference) => {
          const { session } = await reference.ready;
          const signature = JSON.stringify([
            text,
            draft.images.map((image) => image.id),
          ]);
          let attempt = attempts.get(draft.id);
          if (attempt?.signature !== signature) {
            const content: PromptContentPart[] = [];
            for (const image of draft.images) {
              const result = await ctx.fileUpload.uploadImage(
                sessionId,
                image.blob,
                "image/png",
                `typst-page-${image.page}.png`,
                signal,
                (value) => progress(value.loaded, value.total),
              );
              if (!result.ok) throw result.error;
              content.push({ type: "file", receiptId: result.value.receiptId });
            }
            content.push({ type: "text", text });
            signal.throwIfAborted();
            // The session echo owns separate URLs; retiring it cannot invalidate a retained draft.
            const previews = draft.images.map((image) =>
              URL.createObjectURL(image.blob),
            );
            let acceptedOnce = false;
            const acceptedSignal = Promise.withResolvers<void>();
            const accept = (): void => {
              if (acceptedOnce) return;
              acceptedOnce = true;
              accepted();
              acceptedSignal.resolve();
            };
            const submission = session.beginSubmission({
              mode: "queue",
              text,
              attachments: draft.images.map((image, index) => ({
                type: "image" as const,
                value: {
                  previewUrl: previews[index],
                  width: image.width,
                  height: image.height,
                  name: `typst-page-${image.page}.png`,
                },
              })),
              onAccept: accept,
              onRetire: () => {
                previews.forEach((url) => URL.revokeObjectURL(url));
              },
            });
            attempt = {
              signature,
              content,
              requestId: submission.requestId,
              accept,
              accepted: acceptedSignal.promise,
              discard: () => {
                previews.forEach((url) => URL.revokeObjectURL(url));
                // Test doubles and older handles may omit abandon.
                (submission as { abandon?: () => void }).abandon?.();
              },
            };
            attempts.set(draft.id, attempt);
          }
          let result;
          try {
            const outcome = await Promise.race([
              session
                .prompt(attempt.content, "queue", signal, attempt.requestId)
                .then((value) => ({ kind: "prompt" as const, value })),
              attempt.accepted.then(() => ({ kind: "accepted" as const })),
            ]);
            if (outcome.kind === "accepted") {
              // The panel saw acceptance; the prompt RPC may still be in
              // flight, but this submission is no longer "sending".
              attempts.delete(draft.id);
              return;
            }
            result = outcome.value;
          } catch (failure) {
            // An identified prompt failure retires its echo on the framework
            // side, but a transport/assembly throw can leave ours registered.
            // Retire it explicitly: the preview URLs belong to this attempt,
            // and a retry must mint a fresh request identity instead of
            // pointing at an echo that has already settled.
            attempt.discard();
            attempts.delete(draft.id);
            throw failure;
          }
          if (!result.ok) {
            // A deterministic rejection is final: retire the echo and its
            // preview URLs instead of leaving them reachable forever.
            attempt.discard();
            attempts.delete(draft.id);
            throw result.error;
          }
          attempt.accept();
          attempts.delete(draft.id);
        },
      );
      inFlight.set(draft.id, operation);
      void operation.finally(() => inFlight.delete(draft.id)).catch(() => {});
      return operation;
    },
  };
}
