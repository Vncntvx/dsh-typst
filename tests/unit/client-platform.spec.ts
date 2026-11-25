/**
 * The client bundle's externals must be the shell's own platform table, not
 * a hand-maintained subset that drifts when the harness adds a module. The
 * installed `dsh-client-web` ships only the declaration of that table; reading
 * it (instead of importing its boot entry, which pulls the whole shell) is
 * enough to reconcile the two lists.
 * @module tests/unit/client-platform
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { CLIENT_EXTERNALS } from "../../scripts/build-client.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function platformModules(): string[] {
  const declaration = readFileSync(
    join(
      root,
      "node_modules/@deepseek-ai/dsh-client-web/lib/types/platform.d.ts",
    ),
    "utf8",
  );
  const tuple = /PLATFORM_MODULES: readonly \[(.*?)\]/s.exec(declaration)?.[1];
  if (tuple === undefined) throw new Error("PLATFORM_MODULES not found");
  return [...tuple.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

it("externalizes every platform module the shell seeds", () => {
  expect(new Set(CLIENT_EXTERNALS)).toEqual(new Set(platformModules()));
});
