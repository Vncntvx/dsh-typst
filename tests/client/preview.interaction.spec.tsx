// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { en } from "../../src/client/locales.js";
import { frame } from "./helpers/frame.js";
import { createPreviewStore } from "../../src/client/view-state.js";
import type { PreviewTabProps } from "../../src/client/PreviewTab.js";
import { hookOf } from "./helpers/use-store.js";
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
  const instance = createPreviewStore().create("session");
  const useStore = hookOf(instance);
  const controller = new AbortController();
  const refresh = { current: () => {} };
  const props = {
    sessionId: "session",
    t: (key: keyof typeof en) => en[key],
    useStore,
    actions: instance.actions,
    bridge: { append: vi.fn(), submit: vi.fn() },
    remote: {
      status: vi.fn(async () => ({ ok: true, value })),
      recheck: vi.fn(async () => ({ ok: true, value })),
      restart: vi.fn(async () => ({ ok: true, value })),
    },
    useResource,
    useTabInfo: () => ({
      tab: {
        id: "tab",
        contentId: "typst",
        signal: controller.signal,
        actions: {
          bindCommands: (commands: { refresh: () => void }) => {
            refresh.current = commands.refresh;
            return () => {};
          },
          openResource,
        },
      },
    }),
  } as unknown as PreviewTabProps;
  return {
    value,
    props,
    instance,
    useResource,
    openResource,
    controller,
    refresh,
  };
}
it("notifies for an Agent page request and navigates only after a click", async () => {
  const a = fixture();
  a.value.view = { kind: "page", pageIndex: 1, identity: a.value.snapshot! };
  a.value.viewSeq = 1;
  render(<PreviewTab {...a.props} />);
  await screen.findByText("Agent shared a preview location");
  expect(f.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /View location/ }));
  expect(f.navigate).toHaveBeenCalledWith(1);
  expect(screen.queryByText("Agent shared a preview location")).toBeNull();
});
it("reconnects in place without minting a new subscription address", async () => {
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
  await waitFor(() => expect(screen.getByText("Reading area")).toBeDefined());
  expect(a.useResource.mock.calls.at(-1)).toEqual(first);
});

it("drops a hidden tab on close and ignores the result of its pending refresh", async () => {
  const a = fixture();
  const pending = Promise.withResolvers<{
    ok: false;
    error: { message: string };
  }>();
  vi.mocked(a.props.remote.restart).mockReturnValue(pending.promise as never);
  const rendered = render(<PreviewTab {...a.props} />);
  act(a.refresh.current);
  rendered.unmount();
  expect(a.instance.getSnapshot().byTab.tab).toBeDefined();
  a.controller.abort();
  expect(a.instance.getSnapshot().byTab.tab).toBeUndefined();
  pending.resolve({ ok: false, error: { message: "Refresh failed" } });
  await pending.promise;
  expect(a.instance.getSnapshot().byTab.tab).toBeUndefined();
});
