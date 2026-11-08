// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SetupPanel } from "../../src/client/SetupPanel.js";
import type { TypstNamespace } from "../../src/client/remote.js";
import { en } from "../../src/client/locales.js";
import { frame } from "./helpers/frame.js";
afterEach(cleanup);
it("reviews setup without hiding manual recovery and reports recheck failure", async () => {
  const value = frame();
  value.toolchain = { state: "missing" };
  const onRequest = vi.fn(),
    recheck = vi.fn(async () => ({
      ok: false,
      error: { message: "lookup failed" },
    }));
  render(
    <SetupPanel
      frame={value}
      sessionId="session"
      t={(key) => en[key]}
      onRequest={onRequest}
      remote={{ recheck } as unknown as TypstNamespace}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: en["setup.reviewRequest"] }),
  );
  expect(onRequest.mock.calls[0][0].context).toContain("OS unknown");
  expect(onRequest.mock.calls[0][0].context).not.toContain("brew");
  expect(screen.getByRole("button", { name: "Check again" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Check again" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "lookup failed",
  );
  expect(
    screen
      .getByRole("button", { name: "Restart preview" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
