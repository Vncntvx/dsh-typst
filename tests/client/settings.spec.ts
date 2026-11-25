// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";
import {
  TYPST_SETTINGS_FIELDS,
  TypstSettingsController,
  TypstSettingsPage,
} from "../../src/client/settings.js";
import { Config } from "../../src/config.js";

/** A shared form over one mutable section, with the writes it accepted. */
function fakeForm(initial: Record<string, unknown>) {
  let value = { ...initial };
  let revision = 1;
  const listeners = new Set<() => void>();
  const writes: { op: string; path: readonly string[]; value?: unknown }[] = [];
  const form = {
    getSnapshot: () => ({
      status: "ready" as const,
      writable: true,
      value,
      base: {},
      user: value,
      revision,
    }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    mutate: async (
      ops: readonly { op: string; path: readonly string[]; value?: unknown }[],
    ) => {
      writes.push(...ops);
      value = { ...value };
      for (const op of ops) {
        if (op.op === "set") value[op.path[0]!] = op.value;
        else delete value[op.path[0]!];
      }
      revision += 1;
      for (const listener of listeners) listener();
      return true;
    },
  };
  return {
    form: form as unknown as ConfigForm<Record<string, unknown>>,
    writes,
  };
}

describe("Typst settings page controller", () => {
  it("projects the stored section into the four controls", () => {
    const { form } = fakeForm({
      typstPath: "/opt/typst",
      fontPaths: ["~/Fonts", "/Library/Fonts/Brand"],
      packagePath: "~/packages",
      excludeDirs: ["vendor", "generated"],
    });
    const controller = new TypstSettingsController(form);
    const state = controller.inject().hooks.typstSettings.getSnapshot();
    expect(state.typstPath.text).toBe("/opt/typst");
    expect(state.fontPaths.text).toBe("~/Fonts, /Library/Fonts/Brand");
    expect(state.packagePath.text).toBe("~/packages");
    expect(state.excludeDirs.text).toBe("vendor, generated");
    expect(state.available).toBe(true);
    controller.dispose();
  });

  it("writes comma- and semicolon-separated directories as one array", async () => {
    const { form, writes } = fakeForm({ fontPaths: ["~/Fonts"] });
    const controller = new TypstSettingsController(form);
    const face = controller.inject();
    face.edit("fontPaths", "~/Fonts, D:\\Fonts; /Library/Fonts");
    await face.save();
    expect(writes).toEqual([
      {
        op: "set",
        path: ["fontPaths"],
        value: ["~/Fonts", "D:\\Fonts", "/Library/Fonts"],
      },
    ]);
    expect(face.hooks.typstSettings.getSnapshot().fontPaths.text).toBe(
      "~/Fonts, D:\\Fonts, /Library/Fonts",
    );
    controller.dispose();
  });

  it("keeps a path that contains the list separator when it is quoted", async () => {
    const { form, writes } = fakeForm({ fontPaths: ["/Fonts, Old"] });
    const controller = new TypstSettingsController(form);
    const face = controller.inject();
    expect(face.hooks.typstSettings.getSnapshot().fontPaths.text).toBe(
      '"/Fonts, Old"',
    );
    face.edit("fontPaths", '"/Fonts, Old", /New');
    await face.save();
    expect(writes).toEqual([
      { op: "set", path: ["fontPaths"], value: ["/Fonts, Old", "/New"] },
    ]);
    controller.dispose();
  });

  it("rejects an exclusion path before it reaches the host", async () => {
    const { form, writes } = fakeForm({});
    const controller = new TypstSettingsController(form);
    const face = controller.inject();
    face.edit("excludeDirs", "vendor/generated");
    const state = face.hooks.typstSettings.getSnapshot();
    expect(state.invalid).toBe(true);
    expect(state.excludeDirs.invalid).toBe(true);
    await face.save();
    expect(writes).toEqual([]);
    controller.dispose();
  });

  it("clears an empty list so the field re-inherits its default", async () => {
    const { form, writes } = fakeForm({ excludeDirs: ["vendor"] });
    const controller = new TypstSettingsController(form);
    const face = controller.inject();
    face.edit("excludeDirs", "  ");
    await face.save();
    expect(writes).toEqual([{ op: "unset", path: ["excludeDirs"] }]);
    controller.dispose();
  });
});

it("renders one labelled control per field and blocks the initial save", () => {
  const { form } = fakeForm({
    typstPath: "",
    fontPaths: [],
    packagePath: "",
    excludeDirs: [],
  });
  const controller = new TypstSettingsController(form);
  const face = controller.inject();
  render(
    createElement(TypstSettingsPage, {
      t: (key: string) => key,
      useTypstSettings: (select: (state: unknown) => unknown) =>
        select(face.hooks.typstSettings.getSnapshot()),
      edit: face.edit,
      resetField: face.resetField,
      save: face.save,
      discard: face.discard,
    } as never),
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(4);
  expect(screen.getByLabelText("settings.executable")).toBeDefined();
  expect(screen.getByLabelText("settings.fonts")).toBeDefined();
  expect(screen.getByLabelText("settings.packages")).toBeDefined();
  expect(screen.getByLabelText("settings.excluded")).toBeDefined();
  expect(screen.getByRole("button", { name: "settings.save" })).toHaveProperty(
    "disabled",
    true,
  );
  controller.dispose();
});

it("keeps the page fields in step with the host Config schema", () => {
  expect(Object.keys(Config({}))).toEqual([...TYPST_SETTINGS_FIELDS]);
});
