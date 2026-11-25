// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import {
  createPreviewStore,
  initialPosition,
  initialTabState,
  sameTabView,
} from "../../src/client/view-state.js";
import type { FeedbackDraft } from "../../src/client/types.js";

it("creates tab buckets on first write and isolates writes between tabs", () => {
  const instance = createPreviewStore().create("session");
  expect(instance.getSnapshot().byTab).toEqual({});
  instance.actions.setMain("tab-b", null);
  instance.actions.setAuxiliary("tab-a", "problems");
  instance.actions.setMain("tab-a", "main.typ");
  expect(instance.getSnapshot().byTab["tab-a"]).toMatchObject({
    auxiliary: "problems",
    main: "main.typ",
  });
  expect(instance.getSnapshot().byTab["tab-b"].auxiliary).toBeNull();
  expect(instance.getSnapshot().byTab["tab-b"].main).toBeNull();
});

it("forgets a tab bucket and revokes its feedback image URLs", () => {
  const instance = createPreviewStore().create("session");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const draft = {
    ...initialTabState(),
    id: "draft",
    title: "Region",
    question: "",
    context: "",
    snapshot: null,
    images: [
      {
        id: "image",
        url: "blob:typst",
        main: "main.typ",
        page: 1,
        rect: [0, 0, 1, 1],
        identity: {},
      },
    ],
  } as unknown as FeedbackDraft;
  instance.actions.setFeedback("tab-a", draft);
  instance.actions.forget("tab-a");
  expect(instance.getSnapshot().byTab["tab-a"]).toBeUndefined();
  expect(revoke).toHaveBeenCalledWith("blob:typst");
  revoke.mockRestore();
});

it("exposes only the declared action set, never a wholesale update surface", () => {
  const handle = createPreviewStore();
  expect(Object.keys(handle.create("session").actions).sort()).toEqual(
    [
      "dropRequest",
      "forget",
      "markRequestSeen",
      "patchFeedback",
      "pushRequest",
      "setAuxiliary",
      "setAuxiliaryHeight",
      "setFeedback",
      "setFeedbackError",
      "setFeedbackExpanded",
      "setHistory",
      "setMain",
      "setNotice",
      "setOutlineCollapsed",
      "setPosition",
      "setProgress",
      "setSending",
    ].sort(),
  );
  expect(handle.create("session")).not.toHaveProperty("update");
  expect(handle.create("session")).not.toHaveProperty("set");
});

it("compares the current document position and ignores positions for other documents", () => {
  const initial = initialTabState();
  const next = { ...initial, positions: { "draft.typ": initialPosition() } };
  expect(sameTabView(initial, next, "main.typ")).toBe(true);
  expect(sameTabView(initial, next, "draft.typ")).toBe(false);
  expect(
    sameTabView(initial, { ...initial, progress: "50%" }, "main.typ"),
  ).toBe(false);
});
