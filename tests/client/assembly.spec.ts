/**
 * The browser plugin's assembly: mount before the UI fiber, one tab type whose
 * definition and body share the id, and the render-pages tool card keyed by the
 * tool name.
 * @module tests/client/assembly
 */

import { describe, expect, it } from "vitest";
import * as clientEntry from "../../src/client/index.js";

describe("client assembly", () => {
  it("exports the client plugin entry points", () => {
    expect(Object.keys(clientEntry).sort()).toEqual(["apply", "inject"]);
  });

  it("mounts the remote before registering the tab and tool cards", async () => {
    const events: string[] = [];
    const tabs: unknown[] = [];
    const registrations: { name: string; key: string; store?: unknown }[] = [];
    const resources: unknown[] = [];
    const slots = {
      inject: (name: string, body: () => unknown) => {
        const produced = body();
        // The toolview registration uses a generator of disposers.
        if (
          produced !== undefined &&
          produced !== null &&
          typeof (produced as { [Symbol.iterator]?: unknown })[
            Symbol.iterator
          ] === "function" &&
          typeof produced !== "function"
        ) {
          for (const _ of produced as Iterable<unknown>) void _;
        }
        return () => undefined;
      },
      register: (spec: { name: string; key: string; store?: unknown }) => {
        registrations.push({
          name: spec.name,
          key: spec.key,
          store: spec.store,
        });
        return () => undefined;
      },
    };
    const configForm = {
      getSnapshot: () => ({
        status: "unavailable",
        writable: false,
        value: undefined,
        base: undefined,
        user: undefined,
        revision: undefined,
      }),
      subscribe: () => () => undefined,
      mutate: async () => false,
    };
    const configForms = {
      get: () => configForm,
      whileServed: (_namespaces: string[], register: () => () => void) =>
        register(),
    };
    const ui = {
      effect: (fn: () => unknown) => fn(),
      remote: { typst: {} },
      resources: {
        register: (provider: unknown) => {
          resources.push(provider);
          return () => undefined;
        },
      },
      sidebarRightTabs: {
        register: (tab: unknown) => {
          tabs.push(tab);
          return () => undefined;
        },
      },
      slots,
      configForms,
      sessions: {},
      conversation: {},
      fileUpload: {},
      locale: {
        register: () => () => undefined,
        bind: () => (key: string) => key,
      },
    };
    const ctx = {
      effect: (fn: () => unknown) => fn(),
      locale: { register: () => () => undefined },
      slots,
      configForms,
      remote: {
        $mount: async () => {
          events.push("mount");
        },
      },
      inject: async (deps: string[], body: (host: unknown) => void) => {
        if (deps.includes("configForms")) {
          body(ui);
          return;
        }
        events.push("inject");
        body(ui);
      },
    };
    await clientEntry.apply(ctx as never);
    expect(events).toEqual(["mount", "inject"]);
    expect(resources).toHaveLength(1);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ id: "dsh-typst/preview", kind: "typst" });
    expect(
      (tabs[0] as { guide: { icon?: unknown }[] }).guide[0]?.icon,
    ).toBeTypeOf("function");
    const tab = registrations.find(
      (entry) => entry.name === "sidebar.right.pane.tab",
    );
    expect(tab).toMatchObject({
      key: "dsh-typst/preview",
    });
    // The body declares the official store seat; the framework owns the
    // instance and injects useStore/actions, so no registry is created here.
    expect(tab?.store).toHaveProperty("create");
    expect(registrations).toContainEqual(
      expect.objectContaining({
        name: "tool.call.toolview",
        key: "typst_render_pages",
      }),
    );
    expect(registrations).toContainEqual(
      expect.objectContaining({
        name: "plugins.bundle.config",
        key: "dsh-typst-plugin",
      }),
    );
  });
});
