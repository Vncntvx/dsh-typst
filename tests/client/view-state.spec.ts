import { expect, it } from "vitest";
import { PreviewViewRegistry } from "../../src/client/view-state.js";
it("retains reading state across remounts but isolates tabs and sessions", () => {
  const registry = new PreviewViewRegistry(),
    a = new AbortController(),
    b = new AbortController();
  const store = registry.for("session", "tab-a", a.signal);
  store.update({ auxiliary: "problems", main: "main.typ" });
  expect(
    registry.for("session", "tab-a", a.signal).getSnapshot().auxiliary,
  ).toBe("problems");
  expect(
    registry.for("session", "tab-b", b.signal).getSnapshot().auxiliary,
  ).toBeNull();
  expect(registry.for("other", "tab-a", b.signal)).not.toBe(store);
  a.abort();
  expect(
    registry.for("session", "tab-a", new AbortController().signal).getSnapshot()
      .main,
  ).toBeNull();
  registry.dispose();
});
