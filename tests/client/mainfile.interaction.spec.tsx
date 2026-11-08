// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { en } from "../../src/client/locales.js";
import { frame } from "./helpers/frame.js";
import { MainFileMenu } from "../../src/client/MainFileMenu.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("opens the menu card, filters rows and picks a file", async () => {
  const setMain = vi.fn(async () => ({ ok: true as const }));
  const discover = vi.fn(async () => ({ ok: true as const }));
  const value = frame();
  render(
    <MainFileMenu
      frame={value}
      remote={{ setMain, discover } as never}
      sessionId="session"
      t={(key) => en[key]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "main.typ" }));
  expect(screen.getByRole("searchbox")).toBeDefined();
  expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "slides" },
  });
  const rows = screen.getAllByRole("menuitem");
  expect(rows).toHaveLength(1);
  fireEvent.click(rows[0]!);
  expect(setMain).toHaveBeenCalledWith("session", "slides.typ");
});
