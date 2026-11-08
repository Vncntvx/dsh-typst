// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RegionSelector } from "../../src/client/RegionSelector.js";
import { en } from "../../src/client/locales.js";
afterEach(cleanup);
it("moves and resizes a real region with keyboard controls before capture", async () => {
  const onCapture = vi.fn(async (_rect: number[]) => {});
  render(
    <RegionSelector
      width={400}
      height={600}
      t={(key) => en[key]}
      onCapture={onCapture}
      onCancel={vi.fn()}
    />,
  );
  const region = screen.getByRole("group");
  fireEvent.keyDown(region, { key: "ArrowRight" });
  fireEvent.keyDown(region, { key: "ArrowDown", shiftKey: true });
  fireEvent.keyDown(region, { key: "Enter" });
  await waitFor(() =>
    expect(onCapture).toHaveBeenCalledWith([65, 90, 265, 215]),
  );
});
it("retains a region and shows capture errors for retry", async () => {
  const capture = vi.fn(async () => {
    throw new Error("Encoder failed");
  });
  render(
    <RegionSelector
      width={400}
      height={600}
      t={(key) => en[key]}
      onCapture={capture}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Capture this region" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Encoder failed",
  );
  expect(
    screen
      .getByRole("button", { name: "Capture this region" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
