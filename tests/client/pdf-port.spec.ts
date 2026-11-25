/**
 * The PDF port pins the same pdfjs-dist binary the harness document
 * preview uses; the package manifest and the installed tree must agree.
 * @module tests/client/pdf-port
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const expected = "6.3.289";

it("declares pdfjs-dist as an exact runtime dependency", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  expect(manifest.dependencies?.["pdfjs-dist"]).toBe(expected);
  expect(manifest.devDependencies?.["pdfjs-dist"]).toBeUndefined();
});

it("installs exactly the declared pdfjs-dist version", () => {
  const installed = JSON.parse(
    readFileSync(join(root, "node_modules/pdfjs-dist/package.json"), "utf8"),
  ) as { version: string };
  expect(installed.version).toBe(expected);
});
