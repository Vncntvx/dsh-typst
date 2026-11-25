/**
 * dsh-typst's browser half: the live-preview right-sidebar tab, the `typst`
 * resource protocol, the mounted `typst` remote namespace, and the tool
 * cards.
 *
 * `remote.typst` is deliberately absent from `inject`: a fiber parks until
 * every declared name resolves, and this plugin is what creates that
 * namespace. The namespace is declared by the UI fiber instead
 * (`ctx.inject(['remote.typst', …], registerUi)`), the official consumer
 * form in the `@deepseek-ai/dsh` package's
 * `docs/cookbook/extension-cookbook.md` ("An external protocol driver") and
 * `docs/subsystems/typert.md`.
 * @module dsh-typst/client
 */

import type { Context as ClientContext } from "@deepseek-ai/cordis";
// Type-only Context merges: locale (ctx.locale) arrives through its package's
// client declaration; the Remote face (ctx.remote) through api-remotes; the
// `slots` registry through ui-renderer; sidebarRight(+Tabs) through
// ui-sidebar-right; the resource model through client-resources.
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-resources/client";
// Type-only: the `sidebar.right.pane.tab` SlotMap row (declared by the slot's
// owning package) must be in the program for the tab registration to type.
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type {} from "@deepseek-ai/dsh-client-ui-tool/client";
// Type-only: the `configForms` service and the plugin manager's
// `plugins.bundle.config` slot row must be in the program for the settings
// page registration to type. Neither package is imported for value at runtime.
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import type { SessionId } from "@deepseek-ai/dsh-session/types";
import { en, NS, zh } from "./locales.js";
import { TYPST_REMOTE, type TypstNamespace } from "./remote.js";
import { registerTypstResource } from "./provider.js";
import { createPreviewStore } from "./view-state.js";
import { createFeedbackBridge } from "./conversation.js";
import type {} from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-file-upload/client";
import { PreviewTab, type PreviewTabInjected } from "./PreviewTab.js";
import { TypstGlyph } from "./TypstGlyph.js";
import { TypstSettingsController, TypstSettingsPage } from "./settings.js";
import { TOOLVIEW_REGISTRATIONS } from "./toolviews.js";
import {
  TYPST_REMOTE_PACKAGE,
  TYPST_SETTINGS_NAMESPACE,
} from "../constants.js";

/** The tab implementation id: the key the body registers under. */
const TAB_ID = "dsh-typst/preview";

export const inject = [
  "locale",
  "slots",
  "remote",
  "resources",
  "sidebarRightTabs",
  "sessions",
  "conversation",
  "fileUpload",
];

/**
 * The client plugin body. Everything is an effect: entries unwind when the
 * plugin unloads, and re-declaration re-runs them.
 * @param ctx - the browser plugin context.
 */
export async function apply(ctx: ClientContext): Promise<void> {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), "dsh-typst: locale");
  // The settings page is optional: a deployment without the shared settings
  // UI keeps the preview and the tools, and the page appears when the service
  // arrives.
  void ctx.inject(["configForms"], (settings) => {
    registerSettingsPage(settings);
  });
  await ctx.remote.$mount(TYPST_REMOTE);
  await ctx.inject(["remote.typst"], (ui) => {
    registerTypstResource(ui);
    registerPreviewTab(ui);
    registerToolviews(ui);
  });
}

/**
 * Register the plugin's settings page on the bundle's page in the plugin
 * manager. The controller lives with this registration: it subscribes to the
 * shared `typst` config form and is disposed when the fiber unwinds.
 * @param ctx - the browser plugin context.
 */
function registerSettingsPage(ctx: ClientContext): void {
  ctx.effect(
    () =>
      // Follow the namespace the Host actually serves: no page when the
      // profile entry is absent, and a fresh controller after a reload.
      ctx.configForms.whileServed([TYPST_SETTINGS_NAMESPACE], () => {
        const controller = new TypstSettingsController(
          ctx.configForms.get<Record<string, unknown>>(
            TYPST_SETTINGS_NAMESPACE,
          ),
        );
        const unregister = ctx.slots.inject("plugins.bundle.config", () =>
          ctx.slots.register(
            {
              name: "plugins.bundle.config",
              key: TYPST_REMOTE_PACKAGE,
              locale: NS,
              registrant: TYPST_REMOTE_PACKAGE,
              inject: () => controller.inject(),
            },
            TypstSettingsPage,
          ),
        );
        return () => {
          unregister();
          controller.dispose();
        };
      }),
    "dsh-typst: settings page",
  );
}

/**
 * Register the right-sidebar tab: the page type (`openTab('typst')`), the
 * guide entry, and the keyed body.
 * @param ctx - the browser plugin context.
 */
function registerPreviewTab(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS);
  const bridges = new Map<string, ReturnType<typeof createFeedbackBridge>>();
  ctx.effect(() => () => bridges.clear(), "typst: feedback bridges");
  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: "typst",
        priority: "extension",
        title: () => t("tab.title"),
        guide: [
          {
            id: "open",
            order: 40,
            title: () => t("tab.title"),
            description: () => t("tab.description"),
            icon: TypstGlyph,
          },
        ],
      }),
    "dsh-typst: sidebar tab",
  );
  ctx.effect(
    () =>
      ctx.slots.inject("sidebar.right.pane.tab", () =>
        ctx.slots.register(
          {
            name: "sidebar.right.pane.tab",
            key: TAB_ID,
            locale: NS,
            // Exclusive store: the framework owns one instance per session,
            // disposes it with the registration, and injects the selector
            // hook plus the baked action set into the body.
            store: createPreviewStore(),
            inject: (sessionId: SessionId): PreviewTabInjected => {
              let bridge = bridges.get(sessionId);
              if (!bridge)
                bridges.set(
                  sessionId,
                  (bridge = createFeedbackBridge(ctx, sessionId as SessionId)),
                );
              return {
                bridge,
                remote: ctx.remote.typst as TypstNamespace,
              };
            },
          },
          // The framework injects useResource and useTabInfo as standard
          // props; PreviewTab reads them through the props surface.
          PreviewTab,
        ),
      ),
    "dsh-typst: sidebar tab body",
  );
}

/**
 * Register the tool cards into the `tool.call.toolview` keyed slot.
 * @param ctx - the browser plugin context.
 */
function registerToolviews(ctx: ClientContext): void {
  ctx.slots.inject("tool.call.toolview", function* () {
    for (const [key, component] of TOOLVIEW_REGISTRATIONS) {
      yield ctx.slots.register(
        {
          name: "tool.call.toolview",
          key,
          locale: NS,
          registrant: "dsh-typst",
        },
        component,
      );
    }
  });
}
