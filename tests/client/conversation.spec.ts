import { expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { createFeedbackBridge } from "../../src/client/conversation.js";
import type { FeedbackDraft } from "../../src/client/types.js";
function fixture() {
  const session = {
    beginSubmission: vi.fn((_options?: { onAccept?: () => void }) => ({
      requestId: "request-1",
      abandon: vi.fn(),
    })),
    prompt: vi.fn(async (..._args: unknown[]) => ({
      ok: true,
      value: { accepted: true },
    })),
  };
  const binding = { session, ctx: {} };
  const initialize = vi.fn(() => "applied"),
    focus = vi.fn();
  const uploadImage = vi.fn(async (..._args: unknown[]) => ({
    ok: true,
    value: { receiptId: "image-receipt" },
  }));
  const ctx = {
    sessions: {
      using: vi.fn(
        async (
          _id: unknown,
          _options: unknown,
          operation: (reference: unknown) => Promise<unknown>,
        ) => operation({ ready: Promise.resolve(binding) }),
      ),
    },
    conversation: {
      input: { requestDraftInitialization: initialize, for: () => ({ focus }) },
    },
    fileUpload: { uploadImage },
  };
  return {
    bridge: createFeedbackBridge(
      ctx as unknown as Context,
      "original-session" as SessionId,
    ),
    ctx,
    session,
    binding,
    initialize,
    focus,
    uploadImage,
  };
}
const draft = (): FeedbackDraft => ({
  id: "feedback-1",
  title: "Ask",
  question: "Why?",
  context: "page 1",
  snapshot: null,
  images: [],
});
it("appends through the existing draft policy without submitting or replacing", async () => {
  const f = fixture();
  await f.bridge.append("Selected text");
  expect(f.initialize).toHaveBeenCalledWith(f.binding, {
    prompt: "Selected text",
    whenDraftExists: "append",
  });
  expect(f.focus).toHaveBeenCalled();
  expect(f.session.prompt).not.toHaveBeenCalled();
  expect(f.ctx.sessions.using.mock.calls[0][0]).toBe("original-session");
});
it("surfaces a locked composer instead of claiming the draft was added", async () => {
  const f = fixture();
  f.initialize.mockReturnValue("blocked");
  await expect(f.bridge.append("text")).rejects.toThrow("busy");
  expect(f.focus).not.toHaveBeenCalled();
});
it("uploads a real region image and submits its receipt with the editable request", async () => {
  const f = fixture();
  const value = draft();
  const blob = new Blob(["image"], { type: "image/png" });
  value.images.push({
    id: "region",
    blob,
    url: "blob:preview",
    page: 1,
    rect: [1, 2, 3, 4],
    width: 30,
    height: 20,
    identity: { generation: 1, seq: 1, sha256: "hash" },
    main: "main.typ",
  });
  const accepted = vi.fn();
  await f.bridge.submit(
    value,
    "Edited question",
    new AbortController().signal,
    vi.fn(),
    accepted,
  );
  expect(f.uploadImage.mock.calls[0][1]).toBe(blob);
  expect(f.session.beginSubmission).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "queue",
      text: "Edited question",
      attachments: [
        {
          type: "image",
          value: {
            previewUrl: expect.any(String),
            width: 30,
            height: 20,
            name: "typst-page-1.png",
          },
        },
      ],
    }),
  );
  expect(f.session.prompt).toHaveBeenCalledWith(
    [
      { type: "file", receiptId: "image-receipt" },
      { type: "text", text: "Edited question" },
    ],
    "queue",
    expect.any(AbortSignal),
    "request-1",
  );
  expect(accepted).toHaveBeenCalled();
});
it("accepts at most once when the submission and the prompt both accept", async () => {
  const f = fixture();
  f.session.beginSubmission.mockImplementation((options: unknown) => {
    (options as { onAccept: () => void }).onAccept();
    return { requestId: "request-1", abandon: vi.fn() };
  });
  const accepted = vi.fn();
  await f.bridge.submit(
    draft(),
    "question",
    new AbortController().signal,
    vi.fn(),
    accepted,
  );
  expect(accepted).toHaveBeenCalledTimes(1);
});
it("retires the echo and its preview URLs after an uncertain prompt failure", async () => {
  const f = fixture();
  const abandon = vi.fn();
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  f.session.beginSubmission.mockReturnValue({
    requestId: "request-1",
    abandon,
  });
  f.session.prompt.mockRejectedValueOnce(new Error("disconnected"));
  const value = draft();
  value.images.push({
    id: "region",
    blob: new Blob(["image"], { type: "image/png" }),
    url: "blob:preview",
    page: 1,
    rect: [1, 2, 3, 4],
    width: 30,
    height: 20,
    identity: { generation: 1, seq: 1, sha256: "hash" },
    main: "main.typ",
  });
  await expect(
    f.bridge.submit(
      value,
      "question",
      new AbortController().signal,
      vi.fn(),
      vi.fn(),
    ),
  ).rejects.toThrow("disconnected");
  expect(abandon).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledTimes(1);
  // A retry starts from a fresh echo rather than a stale request identity.
  await f.bridge.submit(
    value,
    "question",
    new AbortController().signal,
    vi.fn(),
    vi.fn(),
  );
  expect(f.session.beginSubmission).toHaveBeenCalledTimes(2);
  expect(f.session.prompt.mock.calls.map((call) => call[3])).toEqual([
    "request-1",
    "request-1",
  ]);
  revoke.mockRestore();
});
it("coalesces repeated submits while admission is pending", async () => {
  const f = fixture();
  const pending = Promise.withResolvers<{
    ok: boolean;
    value: { accepted: boolean };
  }>();
  f.session.prompt.mockReturnValue(pending.promise);
  const value = draft(),
    signal = new AbortController().signal;
  const first = f.bridge.submit(value, "question", signal, vi.fn(), vi.fn());
  const second = f.bridge.submit(value, "question", signal, vi.fn(), vi.fn());
  expect(first).toBe(second);
  pending.resolve({ ok: true, value: { accepted: true } });
  await Promise.all([first, second]);
  expect(f.session.prompt).toHaveBeenCalledTimes(1);
});
