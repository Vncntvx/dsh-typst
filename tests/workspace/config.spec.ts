/**
 * Settings wiring: font and package directories reach the real typst argv,
 * exclusions reach discovery, and a restart adopts a committed value.
 * @module tests/workspace/config
 */

import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ResolvedConfig } from "../../src/config.js";
import { sessionFixture } from "./helpers/session.js";

let fixture: Awaited<ReturnType<typeof sessionFixture>> | undefined;
let extras: string[] = [];

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
  for (const path of extras.splice(0)) {
    await rm(path, { recursive: true, force: true });
  }
});

async function tempDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `typst-config-${name}-`));
  extras.push(dir);
  return dir;
}

async function lastArgv(
  log: string,
  command: string,
): Promise<string[] | undefined> {
  const text = await readFile(log, "utf8").catch(() => "");
  const lines = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
  return lines.filter((argv) => argv[0] === command).at(-1);
}

function flagValue(
  argv: string[] | undefined,
  flag: string,
): string | undefined {
  if (argv === undefined) return undefined;
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

it.each(["watch", "compile"])(
  "passes the project flags to typst %s",
  async (command) => {
    const fonts = await tempDir("font library");
    const moreFonts = await tempDir("extra fonts");
    const packages = await tempDir("packages");
    const log = join(await tempDir("log"), "args.log");
    fixture = await sessionFixture({
      fontPaths: [fonts, moreFonts],
      packagePath: packages,
      argsLog: log,
    });
    await fixture.session.activate();
    await fixture.session.settle();
    if (command === "compile") await fixture.session.renderPages("1", 72);
    const argv = await lastArgv(log, command);
    expect(argv?.slice(-8)).toEqual([
      "--root",
      fixture.session.workspaceRoot,
      "--font-path",
      fonts,
      "--font-path",
      moreFonts,
      "--package-path",
      packages,
    ]);
  },
);

it("skips configured directory names during discovery and reveals them on request", async () => {
  fixture = await sessionFixture({
    roots: { "vendor/notes.typ": "= notes\n" },
    excludeDirs: ["vendor"],
  });
  await fixture.session.discover(false);
  expect(fixture.session.state().candidates).not.toContain("vendor/notes.typ");
  await fixture.session.discover(true);
  expect(fixture.session.state().candidates).toContain("vendor/notes.typ");
});

it("adopts a committed font directory when the watch restarts", async () => {
  const fonts = await tempDir("fonts");
  const log = join(await tempDir("log"), "args.log");
  let fontPaths: string[] = [];
  fixture = await sessionFixture({
    argsLog: log,
    settings: (typst): ResolvedConfig => ({
      typstPath: typst,
      fontPaths,
      packagePath: "",
      excludeDirs: [],
    }),
  });
  await fixture.session.activate();
  await fixture.session.settle();
  expect(
    flagValue(await lastArgv(log, "watch"), "--font-path"),
  ).toBeUndefined();
  fontPaths = [fonts];
  await fixture.session.restart();
  await fixture.session.settle();
  expect(flagValue(await lastArgv(log, "watch"), "--font-path")).toBe(fonts);
});
