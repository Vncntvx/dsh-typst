// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { en } from "../../src/client/locales.js";
import { frame } from "./helpers/frame.js";
import { PreviewViewRegistry } from "../../src/client/view-state.js";
import type { PreviewTabProps } from "../../src/client/PreviewTab.js";
const f = vi.hoisted(() => ({
  navigate: vi.fn(),
  highlight: vi.fn(),
  loaded: null as unknown,
}));
vi.mock("../../src/client/pdf/Reader.js", async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import("react");
  return {
    Reader: forwardRef(function MockReader(
      props: { onLoaded: (value: unknown) => void },
      ref,
    ) {
      useImperativeHandle(ref, () => ({
        navigate: f.navigate,
        highlight: f.highlight,
      }));
      useEffect(() => props.onLoaded(f.loaded), [props.onLoaded]);
      return <div>Reading area</div>;
    }),
  };
});
import { PreviewTab } from "../../src/client/PreviewTab.js";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function fixture() {
  const value = frame();
  f.loaded = {
    snapshot: value.snapshot,
    document: { getOutline: async () => [] },
  };
  const useResource = vi.fn(() => ({
    status: "live",
    value,
    failure: undefined,
  }));
  const openResource = vi.fn();
  const props = {
    sessionId: "session",
    t: (key: keyof typeof en) => en[key],
    views: new PreviewViewRegistry(),
    bridge: { append: vi.fn(), submit: vi.fn() },
    remote: { status: vi.fn(async () => ({ ok: true, value })) },
    useResource,
    useTabInfo: () => ({
      tab: {
        id: "tab",
        contentId: "typst",
        signal: new AbortController().signal,
        actions: { bindCommands: () => () => {}, openResource },
      },
    }),
  } as unknown as PreviewTabProps;
  return { value, props, useResource, openResource };
}
it("notifies for an Agent page request and navigates only after a click", async () => {
  const a = fixture();
  a.value.view = { kind: "page", pageIndex: 1, identity: a.value.snapshot! };
  a.value.viewSeq = 1;
  render(<PreviewTab {...a.props} />);
  await screen.findByText("Agent shared a preview location");
  expect(f.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "View location" }));
  expect(f.navigate).toHaveBeenCalledWith(1);
  expect(screen.queryByText("Agent shared a preview location")).toBeNull();
});
it("reconnects failed resources through a new subscription while preserving the last frame", async () => {
  const a = fixture();
  a.useResource.mockReturnValue({
    status: "failed",
    value: a.value,
    failure: undefined,
  });
  render(<PreviewTab {...a.props} />);
  expect(screen.getByRole("alert").textContent).toContain("disconnected");
  const first = a.useResource.mock.calls.at(-1);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(a.useResource.mock.calls.at(-1)).not.toEqual(first),
  );
  expect(screen.getByText("Reading area")).toBeDefined();
});
