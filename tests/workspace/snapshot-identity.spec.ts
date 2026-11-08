import { afterEach, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionFixture } from "./helpers/session.js";
let fixture: Awaited<ReturnType<typeof sessionFixture>>;
afterEach(async () => {
  await fixture?.close();
});
it("serves exactly retained identities and rejects another document generation", async () => {
  fixture = await sessionFixture();
  await fixture.session.activate();
  await fixture.session.settle();
  const first = fixture.session.state().snapshot!;
  expect(fixture.session.previewBytes(first).info).toEqual(first);
  await writeFile(join(fixture.root, "other.typ"), "Other");
  await fixture.session.setMain("other.typ");
  await fixture.session.settle();
  const next = fixture.session.state().snapshot!;
  expect(next.generation).toBeGreaterThan(first.generation);
  expect(next.main).toBe("other.typ");
  expect(() => fixture.session.previewBytes(first)).toThrow("expired");
  expect(() =>
    fixture.session.previewBytes({ ...next, sha256: "wrong" }),
  ).toThrow("expired");
});
it("associates identical PDF bytes with the new successful compile", async () => {
  fixture = await sessionFixture();
  await fixture.session.activate();
  await fixture.session.settle();
  const first = fixture.session.state().snapshot!;
  await fixture.session.restart();
  await fixture.session.settle();
  const next = fixture.session.state().snapshot!;
  expect(next.sha256).toBe(first.sha256);
  expect(next.run).toBeGreaterThan(first.run);
  expect(next.seq).toBeGreaterThan(first.seq);
  expect(next.run).toBe(fixture.session.state().status.run);
});
