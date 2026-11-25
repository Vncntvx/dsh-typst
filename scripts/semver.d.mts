/**
 * Minimal ambient types for the `semver` functions the build scripts import.
 * The published package ships no declarations and this repo carries no
 * `@types/semver`, so declare only the API `deps-check.mjs` uses. Script-mode
 * (no top-level import/export): `declare module` augments the global module
 * space rather than shadowing a same-named `.mjs` file.
 */
declare module "semver" {
  /** Whether `version` is a valid semver string (narrows to `string`). */
  export function valid(version: string | null | undefined): version is string;
  /** Whether `a` is greater than `b`. */
  export function gt(a: string, b: string): boolean;
  /** The difference kind between two versions, or null when they are equal. */
  export function diff(a: string, b: string): string | null;
}
