/**
 * A release channel may only move forward: the guards decide before any ref
 * changes, and the publishing script is the only caller.
 * @module tests/unit/release-channels
 */
import { expect, it } from "vitest";
import {
  assertReleaseAdvance,
  assertReleaseSource,
  assertReleaseTarget,
} from "../../scripts/release-branch-guard.mjs";

it("rejects a source SHA drift before a release ref can move", () => {
  expect(() =>
    assertReleaseSource({
      actualSha: "actual",
      expectedSha: "checked",
      status: "",
    }),
  ).toThrow("does not match checked source");
});

it("rejects tracked worktree changes before a release ref can move", () => {
  expect(() =>
    assertReleaseSource({
      actualSha: "checked",
      expectedSha: "checked",
      status: " M src/index.ts",
    }),
  ).toThrow("dirty worktree");
});

it.each([
  "https://github.com/Vncntvx/dsh-typst",
  "https://github.com/Vncntvx/dsh-typst.git",
  "https://github.com/Vncntvx/dsh-typst/",
  "git@github.com:Vncntvx/dsh-typst",
  "git@github.com:Vncntvx/dsh-typst.git",
  "ssh://git@github.com/Vncntvx/dsh-typst",
])("accepts a reviewed canonical release remote: %s", (remoteUrl) => {
  expect(() =>
    assertReleaseTarget({ branch: "release", remote: "origin", remoteUrl }),
  ).not.toThrow();
  expect(() =>
    assertReleaseTarget({ branch: "stable", remote: "origin", remoteUrl }),
  ).not.toThrow();
});

it.each([
  { branch: "main", remote: "origin" },
  { branch: "release-tag", remote: "origin" },
  { branch: "stable", remote: "fork" },
  { branch: "release", remote: "fork" },
])("refuses an unreviewed channel or remote: $branch $remote", (target) => {
  expect(() =>
    assertReleaseTarget({
      ...target,
      remoteUrl: "https://github.com/Vncntvx/dsh-typst.git",
    }),
  ).toThrow();
});

it("refuses a remote that is not the trusted project repository", () => {
  expect(() =>
    assertReleaseTarget({
      branch: "release",
      remote: "origin",
      remoteUrl: "https://github.com/attacker/dsh-typst.git",
    }),
  ).toThrow("not the trusted project repository");
});

it("accepts a forward source change but refuses rollback and rebuilt bytes", () => {
  const request = {
    branch: "release",
    sourceSha: "new",
    mainSha: "new",
    previous: { sourceSha: "old", artifactDigest: "old-bytes" },
    sourceDescendsFromPrevious: true,
    mainDescendsFromSource: true,
    artifactDigest: "new-bytes",
  };
  expect(() => assertReleaseAdvance(request)).not.toThrow();
  expect(() =>
    assertReleaseAdvance({
      ...request,
      sourceSha: "side",
      sourceDescendsFromPrevious: false,
      mainDescendsFromSource: false,
    }),
  ).toThrow("backwards");
  expect(() => assertReleaseAdvance({ ...request, sourceSha: "old" })).toThrow(
    "different release bytes",
  );
  expect(() =>
    assertReleaseAdvance({
      ...request,
      previous: undefined,
      sourceSha: "stale",
    }),
  ).toThrow("current main");
});

it("reinitializes the rolling channel from rewritten main but keeps stable monotonic", () => {
  const rewritten = {
    branch: "release",
    sourceSha: "rewritten",
    mainSha: "rewritten",
    previous: { sourceSha: "old", artifactDigest: "old-bytes" },
    sourceDescendsFromPrevious: false,
    mainDescendsFromSource: true,
    artifactDigest: "new-bytes",
  };
  expect(() => assertReleaseAdvance(rewritten)).not.toThrow();
  expect(() =>
    assertReleaseAdvance({ ...rewritten, branch: "stable" }),
  ).toThrow("backwards");
  expect(() =>
    assertReleaseAdvance({
      ...rewritten,
      sourceSha: "side",
      mainSha: "rewritten",
    }),
  ).toThrow("backwards");
});

it("initializes the stable channel from main history and the rolling channel from main tip", () => {
  const first = {
    branch: "stable",
    sourceSha: "tag",
    mainSha: "tip",
    previous: undefined,
    sourceDescendsFromPrevious: false,
    mainDescendsFromSource: true,
    artifactDigest: "bytes",
  };
  expect(() => assertReleaseAdvance(first)).not.toThrow();
  expect(() =>
    assertReleaseAdvance({ ...first, mainDescendsFromSource: false }),
  ).toThrow("main history");
  expect(() => assertReleaseAdvance({ ...first, branch: "release" })).toThrow(
    "current main",
  );
  expect(() => assertReleaseAdvance({ ...first, branch: "nightly" })).toThrow(
    "Unknown",
  );
});
