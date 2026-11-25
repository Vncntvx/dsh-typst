/**
 * The release smoke's consumer lockfile must name the exact published CLI at
 * the manifest pin; a stale snapshot otherwise installs an older host in CI.
 * @module tests/unit/harness-toolchain
 */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  consumerDependencies,
  consumerProblems,
} from "../../scripts/harness-toolchain.mjs";

const root = new URL("../../", import.meta.url);
/** @param {string} path the repo-relative JSON document. @returns {any} parsed. */
const json = (path: string) =>
  JSON.parse(readFileSync(new URL(path, root), "utf8"));

const pin: string =
  json("package.json").devDependencies["@deepseek-ai/dsh-api-remotes"];
const fixture = json("tests/fixtures/harness-toolchain-pin.json");

it("keeps the toolchain snapshot on the manifest pin", () => {
  expect(fixture.pin).toBe(`dsh-v${pin}`);
  expect(fixture.commit).toMatch(/^[a-f0-9]{40}$/);
  expect(consumerDependencies(pin, fixture)).toEqual({
    "@deepseek-ai/dsh": pin,
    pnpm: "11.28.5",
  });
});

it("keeps the consumer manifest and lockfile on the toolchain snapshot", () => {
  expect(
    consumerProblems(
      json("tests/fixtures/dsh-cli-consumer/package.json"),
      json("tests/fixtures/dsh-cli-consumer/package-lock.json"),
      pin,
      fixture,
    ),
  ).toEqual([]);
});

it("refuses a consumer snapshot for another pin", () => {
  expect(() =>
    consumerDependencies("0.2.2-rc.5", {
      ...fixture,
      pin: "dsh-v0.2.2-rc.2",
    }),
  ).toThrow("not for dsh-v0.2.2-rc.5");
});
