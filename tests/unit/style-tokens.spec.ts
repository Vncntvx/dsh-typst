/**
 * The theme source the token guard reads, driven as a pure resolver.
 *
 * The guard must read the pinned palette even on a machine whose sibling
 * checkout is ahead of the pin, and an explicit `DSH_THEME_DIR` typo must fail
 * instead of silently falling through. These cases pin that priority against
 * `scripts/style-tokens.mjs`.
 * @module tests/unit/style-tokens
 */

import { describe, expect, it } from "vitest";
import {
  resolveThemeDir,
  themeDirCandidates,
} from "../../scripts/style-tokens.mjs";

const SIBLING = "/harness/packages/client/ui-theme/src/styles";
const INSTALLED =
  "/app/node_modules/@deepseek-ai/dsh-client-ui-theme/src/styles";
const EXPLICIT = "/checkout/theme/src/styles";

/** An existence probe that reports only the named directories. */
const existsIn =
  (...present: string[]) =>
  (dir: string) =>
    present.includes(dir);

describe("the theme directory candidates", () => {
  it("honours an explicit directory as the only candidate", () => {
    expect(
      themeDirCandidates({
        env: EXPLICIT,
        sibling: SIBLING,
        installed: INSTALLED,
      }),
    ).toEqual([EXPLICIT]);
  });

  it("prefers a sibling checkout, then the installed package", () => {
    expect(
      themeDirCandidates({
        env: "",
        sibling: SIBLING,
        installed: INSTALLED,
      }),
    ).toEqual([SIBLING, INSTALLED]);
  });
});

describe("the theme directory resolver", () => {
  it("uses an explicit directory without a version check", () => {
    expect(
      resolveThemeDir({
        pin: "0.2.2-rc.5",
        env: EXPLICIT,
        sibling: SIBLING,
        installed: INSTALLED,
        exists: existsIn(EXPLICIT, SIBLING, INSTALLED),
        version: () => "9.9.9",
      }),
    ).toBe(EXPLICIT);
  });

  it("refuses a missing explicit directory instead of falling back", () => {
    expect(
      resolveThemeDir({
        pin: "0.2.2-rc.5",
        env: EXPLICIT,
        sibling: SIBLING,
        installed: INSTALLED,
        exists: existsIn(SIBLING, INSTALLED),
        version: () => "0.2.2-rc.5",
      }),
    ).toBeUndefined();
  });

  it("uses a sibling whose version matches the pin", () => {
    expect(
      resolveThemeDir({
        pin: "0.2.2-rc.5",
        env: "",
        sibling: SIBLING,
        installed: INSTALLED,
        exists: existsIn(SIBLING, INSTALLED),
        version: () => "0.2.2-rc.5",
      }),
    ).toBe(SIBLING);
  });

  it("skips a sibling ahead of the pin and uses the installed package", () => {
    expect(
      resolveThemeDir({
        pin: "0.2.2-rc.5",
        env: "",
        sibling: SIBLING,
        installed: INSTALLED,
        exists: existsIn(SIBLING, INSTALLED),
        version: () => "0.2.3-alpha.2",
      }),
    ).toBe(INSTALLED);
  });

  it("falls back to the installed package when the sibling is absent", () => {
    expect(
      resolveThemeDir({
        pin: "0.2.2-rc.5",
        env: "",
        sibling: SIBLING,
        installed: INSTALLED,
        exists: existsIn(INSTALLED),
        version: () => "0.2.2-rc.5",
      }),
    ).toBe(INSTALLED);
  });

  it("returns undefined when no candidate exists", () => {
    expect(
      resolveThemeDir({
        pin: "0.2.2-rc.5",
        env: "",
        sibling: SIBLING,
        installed: INSTALLED,
        exists: () => false,
        version: () => "0.2.2-rc.5",
      }),
    ).toBeUndefined();
  });
});
