// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { en } from "../../src/client/locales.js";
import { frame } from "./helpers/frame.js";
import { MainFileMenu } from "../../src/client/MainFileMenu.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

it("anchors the portaled card to the trigger through a CSS anchor name", () => {
  render(
    <MainFileMenu
      frame={frame()}
      remote={{ setMain: vi.fn(), discover: vi.fn() } as never}
      sessionId="session"
      t={(key) => en[key]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "main.typ" });
  fireEvent.click(trigger);
  const card = screen.getByRole("group", { name: en["main.choose"] });
  // The trigger publishes the anchor name and the card names it as its
  // position anchor, so the harness's CSS anchor positioning places the
  // card instead of a JS measurement.
  const anchor = trigger.style.getPropertyValue("anchor-name");
  expect(anchor).not.toBe("");
  expect(card.style.getPropertyValue("position-anchor")).toBe(anchor);
});

it("does not show a defensive recompile notice in the card", () => {
  render(
    <MainFileMenu
      frame={frame()}
      remote={{ setMain: vi.fn(), discover: vi.fn() } as never}
      sessionId="session"
      t={(key) => en[key]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "main.typ" }));
  expect(screen.queryByText(/recompile/i)).toBeNull();
});

it("keeps form controls outside the menu role and leaves editing keys alone", () => {
  const value = frame();
  render(
    <MainFileMenu
      frame={value}
      remote={{ setMain: vi.fn(), discover: vi.fn() } as never}
      sessionId="session"
      t={(key) => en[key]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "main.typ" }));
  const card = screen.getByRole("group", { name: en["main.choose"] });
  const list = screen.getByRole("menu", { name: en["main.choose"] });
  const search = screen.getByRole("searchbox");
  expect(card.contains(search)).toBe(true);
  expect(list.contains(search)).toBe(false);
  expect(
    screen.getAllByRole("menuitem").every((row) => list.contains(row)),
  ).toBe(true);
  // Home/End in a text field must move the caret, not focus a menu row.
  fireEvent.keyDown(search, { key: "End" });
  expect(document.activeElement).toBe(search);
  const path = screen.getByRole("textbox", { name: en["main.path"] });
  path.focus();
  fireEvent.keyDown(path, { key: "Home" });
  expect(document.activeElement).toBe(path);
});

it("moves focus between candidate rows from the list's own key handler", () => {
  const value = frame();
  render(
    <MainFileMenu
      frame={value}
      remote={{ setMain: vi.fn(), discover: vi.fn() } as never}
      sessionId="session"
      t={(key) => en[key]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "main.typ" }));
  const list = screen.getByRole("menu", { name: en["main.choose"] });
  const rows = screen.getAllByRole("menuitem");
  fireEvent.keyDown(list, { key: "End" });
  expect(document.activeElement).toBe(rows.at(-1));
  fireEvent.keyDown(list, { key: "Home" });
  expect(document.activeElement).toBe(rows[0]);
});
