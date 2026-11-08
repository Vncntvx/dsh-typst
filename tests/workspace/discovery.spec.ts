import { afterEach, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionFixture } from "./helpers/session.js";
let fixture: Awaited<ReturnType<typeof sessionFixture>>;
afterEach(async () => {
  await fixture?.close();
});
it("keeps an explicitly selected deep excluded file through refresh and restart", async () => {
  fixture = await sessionFixture();
  const path = ".hidden/a/b/c/d/e/paper.typ";
  await mkdir(join(fixture.root, ".hidden/a/b/c/d/e"), { recursive: true });
  await writeFile(join(fixture.root, path), "Deep document");
  await fixture.session.setMain(path);
  await fixture.session.settle();
  await fixture.session.refreshCandidates(true);
  expect(fixture.session.state().main).toBe(path);
  await fixture.session.restart();
  await fixture.session.settle();
  expect(fixture.session.state().main).toBe(path);
  expect(fixture.session.state().snapshot?.main).toBe(path);
});
it("discovers files beyond the former scan depth and exposes exclusions explicitly", async () => {
  fixture = await sessionFixture();
  await mkdir(join(fixture.root, "a/b/c/d/e"), { recursive: true });
  await writeFile(join(fixture.root, "a/b/c/d/e/deep.typ"), "Deep");
  await mkdir(join(fixture.root, ".hidden"));
  await writeFile(join(fixture.root, ".hidden/hidden.typ"), "Hidden");
  await fixture.session.discover(false);
  expect(fixture.session.state().candidates).toContain("a/b/c/d/e/deep.typ");
  expect(fixture.session.state().candidates).not.toContain(
    ".hidden/hidden.typ",
  );
  await fixture.session.discover(true);
  expect(fixture.session.state().candidates).toContain(".hidden/hidden.typ");
  expect(fixture.session.state().discovery.scanning).toBe(false);
});
it("uses actual file absence when removing the selected main", async () => {
  fixture = await sessionFixture();
  await fixture.session.activate();
  await fixture.session.settle();
  await writeFile(join(fixture.root, "other.typ"), "Other");
  await rm(join(fixture.root, "main.typ"));
  await fixture.session.refreshCandidates(true);
  await fixture.session.settle();
  expect(fixture.session.state().main).toBe("other.typ");
});
