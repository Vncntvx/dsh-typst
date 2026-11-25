// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProblemsPanel } from "../../src/client/ProblemsPanel.js";
import { en } from "../../src/client/locales.js";
import { frame } from "./helpers/frame.js";
afterEach(cleanup);
it("reviews only selected diagnostics and opens the reported source", () => {
  const value = frame();
  value.diagnostics = [
    {
      severity: "error",
      message: "Broken",
      location: { file: "main.typ", line: 12, column: 2 },
      hints: ["Check syntax"],
      trace: [],
    },
    {
      severity: "warning",
      message: "Warning",
      location: null,
      hints: [],
      trace: [],
    },
  ];
  const onFix = vi.fn(),
    onSource = vi.fn();
  render(
    <ProblemsPanel
      frame={value}
      t={(key) => en[key]}
      onFix={onFix}
      onSource={onSource}
    />,
  );
  fireEvent.change(screen.getByLabelText("Filter problems"), {
    target: { value: "error" },
  });
  expect(screen.queryByText("Warning")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Select visible" }));
  fireEvent.click(
    screen.getByRole("button", { name: `${en["problems.fixSelected"]} (1)` }),
  );
  expect(onFix).toHaveBeenCalledWith([value.diagnostics[0]]);
  fireEvent.click(screen.getByRole("button", { name: "main.typ:12:2" }));
  expect(onSource).toHaveBeenCalledWith("main.typ", 12);
});

it("names the full diagnostic count when the frame was truncated", () => {
  const value = frame();
  value.diagnostics = [
    {
      severity: "error",
      message: "Broken",
      location: null,
      hints: [],
      trace: [],
    },
  ];
  value.diagnosticsTotal = 87;
  value.diagnosticsTruncated = true;
  render(
    <ProblemsPanel
      frame={value}
      t={(key, params) =>
        en[key]
          .replace("{shown}", String(params?.shown ?? ""))
          .replace("{total}", String(params?.total ?? ""))
      }
      onFix={vi.fn()}
      onSource={vi.fn()}
    />,
  );
  expect(screen.getByRole("status").textContent).toContain("1 of 87");
});
