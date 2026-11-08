// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { TypstNamespace } from "../../src/client/remote.js";
import { frame } from "./helpers/frame.js";
const f = vi.hoisted(() => ({ open: vi.fn(), prepare: vi.fn() }));
vi.mock("../../src/client/pdf/runtime.js", () => ({ openPdf: f.open }));
vi.mock("../../src/client/pdf/page.js", () => ({ preparePage: f.prepare }));
import { usePreview } from "../../src/client/pdf/use-preview.js";
it("rejects a response with a different identity without opening its PDF", async () => {
  const snapshot = frame().snapshot!;
  const remote = {
    readPreview: vi.fn(async () => ({
      ok: true,
      value: { ...snapshot, seq: 99, data: new Uint8Array() },
    })),
  } as unknown as TypstNamespace;
  const { result, unmount } = renderHook(() =>
    usePreview(remote, "session", snapshot, 0, 1, 0),
  );
  await waitFor(() => expect(result.current.error).toContain("does not match"));
  expect(f.open).not.toHaveBeenCalled();
  unmount();
});
it("keeps the previous document when a replacement fails and retries the same identity", async () => {
  const first = frame().snapshot!,
    next = { ...first, seq: 2, sha256: "two" };
  const dispose = vi.fn(async () => {}),
    disposePage = vi.fn();
  f.open.mockImplementation(() => ({
    document: Promise.resolve({ numPages: 2 }),
    dispose,
  }));
  f.prepare.mockImplementation(async () => ({ dispose: disposePage }));
  let fail = false;
  const read = vi.fn(async (_session: string, identity: unknown) =>
    fail
      ? { ok: false, error: { message: "read refused" } }
      : {
          ok: true,
          value: { ...(identity as object), data: new Uint8Array() },
        },
  );
  const remote = { readPreview: read } as unknown as TypstNamespace;
  const { result, rerender, unmount } = renderHook(
    ({ snapshot, retry }) =>
      usePreview(remote, "session", snapshot, 0, 1, retry),
    { initialProps: { snapshot: first, retry: 0 } },
  );
  await waitFor(() => expect(result.current.loaded?.snapshot.seq).toBe(1));
  fail = true;
  rerender({ snapshot: next, retry: 0 });
  await waitFor(() => expect(result.current.error).toBe("read refused"));
  expect(result.current.loaded?.snapshot.seq).toBe(1);
  expect(dispose).not.toHaveBeenCalled();
  fail = false;
  rerender({ snapshot: next, retry: 1 });
  await waitFor(() => expect(result.current.loaded?.snapshot.seq).toBe(2));
  expect(dispose).toHaveBeenCalledTimes(1);
  unmount();
});
it("drops a late old read after the selected main changes", async () => {
  const first = frame().snapshot!,
    next = {
      ...first,
      generation: 2,
      seq: 2,
      sha256: "next",
      main: "other.typ",
    };
  const pending = Promise.withResolvers<unknown>();
  const read = vi
    .fn()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({
      ok: true,
      value: { ...next, data: new Uint8Array() },
    });
  f.open.mockImplementation(() => ({
    document: Promise.resolve({ numPages: 2 }),
    dispose: vi.fn(),
  }));
  f.prepare.mockImplementation(async () => ({ dispose: vi.fn() }));
  const remote = { readPreview: read } as unknown as TypstNamespace;
  const { result, rerender, unmount } = renderHook(
    ({ snapshot }) => usePreview(remote, "session", snapshot, 0, 1, 0),
    { initialProps: { snapshot: first } },
  );
  rerender({ snapshot: next });
  await waitFor(() =>
    expect(result.current.loaded?.snapshot.main).toBe("other.typ"),
  );
  await act(async () =>
    pending.resolve({ ok: true, value: { ...first, data: new Uint8Array() } }),
  );
  expect(result.current.loaded?.snapshot.main).toBe("other.typ");
  unmount();
});
