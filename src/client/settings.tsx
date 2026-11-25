/**
 * The plugin's settings page: rendered on the bundle's page in the plugin
 * manager (`plugins.bundle.config`, keyed by package name). Four fields,
 * one namespace (`typst`), staged by the harness's `SettingsFormModel` and
 * written atomically on save.
 *
 * The page edits the same live entry the service reads: every field is
 * `volatile`, so a save reaches running sessions without remounting the
 * plugin. The host owns path normalization; the page only rejects an
 * exclusion entry that could never match, before it stages a write.
 * @module dsh-typst/client/settings
 */

import { useId, useMemo, type ReactNode } from "react";
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { JsonValue } from "@deepseek-ai/dsh-util-values";
import type {
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";
import {
  SettingsForm,
  SettingsFormModel,
  SettingsValueField,
  settingsTextField,
  type SettingsFieldSpec,
  type SettingsFieldState,
  type SettingsFormActions,
  type SettingsFormLabels,
  type SettingsFormScope,
  type SettingsFormShell,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { TYPST_DIRECTORY_NAME } from "../constants.js";

/** The four fields the page renders, in display order. */
export type TypstSettingsField =
  "typstPath" | "fontPaths" | "packagePath" | "excludeDirs";

/** The page's fields; a unit test pins this list to the host Config keys. */
export const TYPST_SETTINGS_FIELDS: readonly TypstSettingsField[] = [
  "typstPath",
  "fontPaths",
  "packagePath",
  "excludeDirs",
];

/** What the page renders: the form shell plus one control per field. */
export type TypstSettingsState = SettingsFormShell & {
  readonly [K in TypstSettingsField]: SettingsFieldState;
};

/** The registration-side face the page's slot entry injects. */
export interface TypstSettingsFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as `useTypstSettings`. */
    typstSettings: SnapshotStore<TypstSettingsState>;
  };
}

/** Quote one list entry when a separator or quote would otherwise split it. */
function quoteListEntry(entry: string): string {
  return /[",;\n]/.test(entry) ? `"${entry.replaceAll('"', '""')}"` : entry;
}

/** Render a string array as one editable list line, preserving entries that contain separators. */
function formatList(value: unknown): string {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map(quoteListEntry)
        .join(", ")
    : "";
}

/**
 * Split one list line into entries. A comma, semicolon or newline separates
 * entries unless it sits inside double quotes; a doubled quote inside a quoted
 * entry is one literal quote. Quoting keeps a path containing a comma intact.
 */
function splitList(text: string): string[] {
  const entries: string[] = [];
  let entry = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        entry += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && (char === "," || char === ";" || char === "\n")) {
      entries.push(entry);
      entry = "";
      continue;
    }
    entry += char;
  }
  entries.push(entry);
  return entries.map((item) => item.trim()).filter((item) => item !== "");
}

/** One directory list as draft text: comma-, semicolon- or newline-separated entries, quotes preserved. */
function listField(
  field: TypstSettingsField,
  validate?: (name: string) => boolean,
): SettingsFieldSpec {
  return {
    field,
    format: formatList,
    parse: (text) => {
      const items = splitList(text);
      if (items.length === 0) return { kind: "clear" };
      if (validate !== undefined && !items.every(validate)) return undefined;
      return { kind: "set", value: items };
    },
  };
}

/** Whether one exclusion entry is a bare directory name the host schema accepts. */
function isDirectoryName(name: string): boolean {
  return TYPST_DIRECTORY_NAME.test(name);
}

/** Present a shared namespace form as the scope the staged model edits. */
function asScope(
  form: ConfigForm<Record<string, unknown>>,
): SettingsFormScope<Record<string, unknown>> {
  return {
    getSnapshot: () => form.getSnapshot(),
    subscribe: (listener) => form.subscribe(listener),
    mutate: (ops, expectedRevision) =>
      form.mutate(
        ops.map((op) =>
          op.op === "set"
            ? {
                op: "set" as const,
                path: [...op.path],
                value: op.value as JsonValue,
              }
            : { op: "unset" as const, path: [...op.path] },
        ),
        expectedRevision,
      ),
  };
}

/** Bridges the `typst` settings form onto the page's staged model. */
export class TypstSettingsController {
  private readonly model: SettingsFormModel<Record<string, unknown>>;
  private readonly store: SnapshotStore<TypstSettingsState>;

  /**
   * @param form - the shared configuration form for the `typst` namespace.
   */
  constructor(form: ConfigForm<Record<string, unknown>>) {
    this.model = new SettingsFormModel(asScope(form), [
      settingsTextField("typstPath"),
      listField("fontPaths"),
      settingsTextField("packagePath"),
      listField("excludeDirs", isDirectoryName),
    ]);
    this.store = this.model.bind(() => this.projection());
  }

  private projection(): TypstSettingsState {
    const fields = Object.fromEntries(
      TYPST_SETTINGS_FIELDS.map((field) => [field, this.model.field(field)]),
    ) as { [K in TypstSettingsField]: SettingsFieldState };
    return { ...this.model.shell(), ...fields };
  }

  /**
   * Build the face the page's slot entry injects.
   * @returns the page snapshot and its form actions.
   */
  inject(): TypstSettingsFace {
    return { hooks: { typstSettings: this.store }, ...this.model.actions() };
  }

  /** Release the model's namespace subscription. */
  dispose(): void {
    this.model.dispose();
  }
}

/** The labels the form chrome renders, from the plugin dictionary. */
function formLabels(t: PropsLocale<"typst">["t"]): SettingsFormLabels {
  return {
    unavailable: t("settings.unavailable"),
    readOnly: t("settings.readOnly"),
    saveFailed: t("settings.saveFailed"),
    save: t("settings.save"),
    saving: t("settings.saving"),
  };
}

/** Props the renderer binds for the settings page. */
export type TypstSettingsPageProps = PropsRuntime<"plugins.bundle.config"> &
  PropsLocale<"typst"> &
  InjectFace<TypstSettingsFace>;

/**
 * Render the plugin's settings page.
 * @param props - locale copy, the page snapshot, and its form actions.
 * @returns the four fields inside the host form chrome.
 */
export function TypstSettingsPage(props: TypstSettingsPageProps): ReactNode {
  const { t } = props;
  const state = props.useTypstSettings((snapshot) => snapshot);
  const labels = useMemo(() => formLabels(t), [t]);
  const id = useId();
  const fieldProps = (
    field: TypstSettingsField,
    label: string,
    hint: string,
    invalidLabel?: string,
  ) => ({
    id: `${id}-${field}`,
    label,
    hint,
    invalidLabel: invalidLabel ?? t("settings.invalid"),
    text: state[field].text,
    overridden: state[field].overridden,
    invalid: state[field].invalid,
    overriddenLabel: t("settings.overridden"),
    resetLabel: t("settings.reset"),
    disabled: !state.writable || state.saving,
    onEdit: (text: string) => {
      props.edit(field, text);
    },
    onReset: () => {
      props.resetField(field);
    },
  });
  return (
    <div data-dsh-typst-settings>
      <p>{t("settings.intro")}</p>
      <SettingsForm
        labels={labels}
        state={state}
        onSave={props.save}
        onDiscard={props.discard}
      >
        <SettingsValueField
          {...fieldProps(
            "typstPath",
            t("settings.executable"),
            t("settings.executableHint"),
          )}
          placeholder="/usr/local/bin/typst"
        />
        <SettingsValueField
          {...fieldProps(
            "fontPaths",
            t("settings.fonts"),
            t("settings.fontsHint"),
          )}
          placeholder={"~/Library/Fonts, D:\\Fonts"}
        />
        <SettingsValueField
          {...fieldProps(
            "packagePath",
            t("settings.packages"),
            t("settings.packagesHint"),
          )}
          placeholder="~/typst-packages"
        />
        <SettingsValueField
          {...fieldProps(
            "excludeDirs",
            t("settings.excluded"),
            t("settings.excludedHint"),
            t("settings.excludedInvalid"),
          )}
          placeholder="vendor, generated"
        />
      </SettingsForm>
    </div>
  );
}
