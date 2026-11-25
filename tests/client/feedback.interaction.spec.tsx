// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { FeedbackPanel } from "../../src/client/FeedbackPanel.js";
import {
  createPreviewStore,
  initialPosition,
} from "../../src/client/view-state.js";
import type { FeedbackDraft } from "../../src/client/types.js";
import { en } from "../../src/client/locales.js";
import { frame } from "./helpers/frame.js";
import { hookOf } from "./helpers/use-store.js";
afterEach(cleanup);
const t = (key: keyof typeof en) => en[key];
const TAB = "tab";
function fixture() {
  const value = frame();
  const instance = createPreviewStore().create("session");
  const useStore = hookOf(instance);
  const set: React.ComponentProps<typeof FeedbackPanel>["set"] = (run) =>
    run(instance.actions);
  const draft: FeedbackDraft = {
    id: "draft",
    title: "Repair",
    question: "Please fix",
    context: "Original context",
    snapshot: value.snapshot,
    images: [],
    diagnostics: { generation: 1, run: 1, main: value.main },
  };
  instance.actions.setFeedback(TAB, draft);
  const bridge = {
    append: vi.fn(async (_text: string) => {}),
    submit: vi.fn(async (..._args: unknown[]) => {}),
  };
  function Panel() {
    const state = useStore((value) => value.byTab[TAB]);
    return (
      state?.feedback && (
        <FeedbackPanel
          draft={state.feedback}
          current={value.snapshot}
          frame={value}
          bridge={bridge}
          tabId={TAB}
          busy={state.sending}
          error={state.feedbackError}
          progress={state.progress}
          set={set}
          t={t}
        />
      )
    );
  }
  return { value, instance, bridge, Panel };
}

it("reuses the feedback panel when the parent updates only the reading position", () => {
  const f = fixture();
  const translate = vi.fn(t);
  const committed = vi.fn();
  const panelProps = {
    current: f.value.snapshot,
    frame: f.value,
    bridge: f.bridge,
    tabId: TAB,
    busy: false,
    error: null,
    progress: "",
    set: vi.fn(),
    t: translate,
  };
  const useStore = hookOf(f.instance);
  function Parent() {
    const view = useStore((value) => value.byTab[TAB]);
    return <FeedbackPanel draft={view.feedback!} {...panelProps} />;
  }
  render(
    <Profiler id="feedback-parent" onRender={committed}>
      <Parent />
    </Profiler>,
  );
  const baseline = translate.mock.calls.length;
  act(() => f.instance.actions.setPosition(TAB, "main.typ", initialPosition()));
  expect(committed).toHaveBeenCalledTimes(2);
  expect(translate).toHaveBeenCalledTimes(baseline);
});
it("edits repair text before an explicit submit and retains failed drafts", async () => {
  const f = fixture();
  f.bridge.submit.mockRejectedValue(new Error("Admission rejected"));
  render(<f.Panel />);
  expect(f.bridge.submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Your request"), {
    target: { value: "Fix only the selected error" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await screen.findByRole("alert");
  expect(f.bridge.submit.mock.calls[0][1]).toContain(
    "Fix only the selected error",
  );
  expect(f.instance.getSnapshot().byTab[TAB].feedback?.question).toBe(
    "Fix only the selected error",
  );
  expect(screen.getByRole("alert").textContent).toContain("Admission rejected");
});
it("keeps an in-flight submission disabled through a body remount", async () => {
  const f = fixture();
  const pending = Promise.withResolvers<void>();
  f.bridge.submit.mockReturnValue(pending.promise);
  const first = render(<f.Panel />);
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  first.unmount();
  render(<f.Panel />);
  expect(
    screen.getByRole("button", { name: /Submitting/ }).hasAttribute("disabled"),
  ).toBe(true);
  expect(f.bridge.submit).toHaveBeenCalledTimes(1);
  pending.resolve();
  await waitFor(() =>
    expect(f.instance.getSnapshot().byTab[TAB].sending).toBe(false),
  );
});
it("detects a later failed compile even when the last successful PDF did not change", async () => {
  const f = fixture();
  f.value.status = { phase: "error", run: 2 };
  f.value.diagnostics = [
    {
      severity: "error",
      message: "Unknown variable",
      location: null,
      hints: [],
      trace: [],
    },
  ];
  render(<f.Panel />);
  expect(screen.getByText(en["feedback.oldDiagnostics"])).toBeDefined();
  fireEvent.click(
    screen.getByRole("button", { name: en["feedback.updateDiagnostics"] }),
  );
  expect(f.instance.getSnapshot().byTab[TAB].feedback?.context).toContain(
    "Unknown variable",
  );
  expect(f.instance.getSnapshot().byTab[TAB].feedback?.question).toBe(
    "Please fix",
  );
  expect(f.instance.getSnapshot().byTab[TAB].feedback?.diagnostics?.run).toBe(
    2,
  );
});
