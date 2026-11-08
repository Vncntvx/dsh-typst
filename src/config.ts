/**
 * Plugin configuration. The schema fills defaults and every field is
 * `volatile`, so a settings commit lands in the running fiber without
 * remounting and the workbench reads it per request. Structural reactions
 * (a changed Typst path re-checks every workspace) ride
 * `loader/volatile-update` in the service.
 * @module dsh-typst/config
 */

import type { Volatile } from "@deepseek-ai/cordis";
import { isVolatile } from "@deepseek-ai/cosmokit";
import Schema from "@deepseek-ai/schemastery";

export interface Config {
  /**
   * Full path of the typst executable. Empty looks typst up on PATH, in the
   * common install locations, and finally in the login shell; set it only
   * when Typst is installed somewhere else.
   */
  typstPath?: Volatile<string>;
}

/**
 * Every field is `volatile`: the settings page edits the live entry, and the
 * loader commits volatile edits into the running fiber without remounting.
 */
export const Config = Schema.object({
  typstPath: Schema.string().default("").volatile(),
});

/** The live entry the service holds: plain current values, unwrapped per read. */
export interface LiveEntry {
  typstPath: string;
}

/**
 * Read the current value behind a volatile reference. Plain values pass
 * through untouched, so callers holding pre-resolution input need no
 * wrapping.
 * @param value - a field value, possibly a volatile reference.
 * @returns the current plain value.
 */
function current(value: unknown): unknown {
  return isVolatile(value) ? value.get() : value;
}

/**
 * Unwrap every top-level field of an entry to its plain value.
 * @param config - a Loader-resolved `Config` or human-written values.
 * @returns the plain field map, without schema defaults.
 */
function unwrapConfig(
  config: Config | Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config ?? {}).map(([key, value]) => [key, current(value)]),
  );
}

/**
 * Read the live config values per request. The entry already passed the
 * schema (the loader applies `Config` before the constructor runs), so this
 * only unwraps volatile references.
 * @param entry - the live entry the service holds.
 * @returns the plain current values.
 */
export function readResolvedConfig(entry: Config | object): {
  typstPath: string;
} {
  const plain = unwrapConfig(entry);
  return {
    typstPath: typeof plain.typstPath === "string" ? plain.typstPath : "",
  };
}

/**
 * Accept the loader entry (volatile references) or plain written values and
 * normalize to the live-entry shape the service holds. Validation stays
 * minimal: an empty string means "look typst up".
 * @param entry - what the loader handed the constructor or the settings page wrote.
 * @returns the live entry.
 */
export function toLiveEntry(entry: Config | object): LiveEntry {
  const plain = unwrapConfig(entry);
  return {
    typstPath: typeof plain.typstPath === "string" ? plain.typstPath : "",
  };
}
