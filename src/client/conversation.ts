import type { Context } from "@deepseek-ai/cordis";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import type {
  SessionRequestId,
  PromptContentPart,
} from "@deepseek-ai/dsh-api-session-controller/types";
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-file-upload/client";
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
              "The conversation input is busy. Keep this feedback and try again.",
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
              if (!result.ok) throw new Error(result.error.message);
              content.push({ type: "file", receiptId: result.value.receiptId });
            }
            content.push({ type: "text", text });
            signal.throwIfAborted();
            // The session echo owns separate URLs; retiring it cannot invalidate a retained draft.
            const previews = draft.images.map((image) =>
              URL.createObjectURL(image.blob),
            );
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
              onAccept: accepted,
              onRetire: () => {
                previews.forEach((url) => URL.revokeObjectURL(url));
              },
            });
            attempt = { signature, content, requestId: submission.requestId };
            attempts.set(draft.id, attempt);
          }
          const result = await session.prompt(
            attempt.content,
            "queue",
            signal,
            attempt.requestId,
          );
          if (!result.ok) {
            attempts.delete(draft.id);
            throw new Error(result.error.message);
          }
          accepted();
          attempts.delete(draft.id);
        },
      );
      inFlight.set(draft.id, operation);
      void operation.finally(() => inFlight.delete(draft.id)).catch(() => {});
      return operation;
    },
  };
}
