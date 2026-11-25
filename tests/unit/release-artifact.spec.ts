/**
 * A release artifact must carry exactly the bytes the quality gate proved:
 * the staged tree, the tarball packed from it, and their provenance.
 * @module tests/unit/release-artifact
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  prepareReleaseArtifact,
  verifyReleaseArtifact,
} from "../../scripts/release-artifact.mjs";
import { withTempDir } from "./helpers/temp-dir.js";

/**
 * A committed package tree with install-time code that must not ship.
 * @param root the case directory.
 * @returns the artifact directory, the source commit, and the verified tree.
 */
function fixture(root: string) {
  const base = join(root, "source");
  mkdirSync(join(base, "lib"), { recursive: true });
  writeFileSync(
    join(base, "package.json"),
    JSON.stringify({
      name: "dsh-typst-plugin",
      version: "1.0.0",
      main: "./lib/index.js",
      types: "./lib/index.d.ts",
      files: ["lib"],
      scripts: { prepare: "exit 91" },
      devDependencies: { dangerous: "1.0.0" },
      peerDependencies: { dangerous: ">=1.0.0" },
      overrides: { dangerous: "1.0.0" },
    }),
  );
  writeFileSync(join(base, "lib/index.js"), "export const answer = 42");
  writeFileSync(
    join(base, "lib/index.d.ts"),
    "export declare const answer: 42",
  );
  writeFileSync(join(base, "LICENSE"), "MIT");
  execFileSync("git", ["init", "--quiet"], { cwd: base });
  execFileSync("git", ["add", "."], { cwd: base });
  execFileSync(
    "git",
    [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ],
    { cwd: base },
  );
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: base,
    encoding: "utf8",
  }).trim();
  const out = join(root, "artifact");
  return { out, sha, verified: prepareReleaseArtifact(out, sha, base) };
}

it("packs declarations and strips install-time code from the checked artifact", async () => {
  await withTempDir(async (root) => {
    const { verified, out, sha } = fixture(root);
    const manifest = JSON.parse(
      readFileSync(join(verified.stage, "package.json"), "utf8"),
    );
    expect(manifest.scripts).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.overrides).toBeUndefined();
    expect(manifest.peerDependencies).toEqual({ dangerous: ">=1.0.0" });
    expect(manifest.files).toContain("release-provenance.json");
    expect(verifyReleaseArtifact(out, sha).provenance.files).toHaveProperty(
      "lib/index.d.ts",
    );
  });
});

it("rejects changed bytes, extra files and source identity substitution", async () => {
  await withTempDir(async (root) => {
    const { verified, out, sha } = fixture(root);
    expect(() => verifyReleaseArtifact(out, "b".repeat(40))).toThrow(
      "identity",
    );
    writeFileSync(join(verified.stage, "unexpected-secret"), "secret");
    expect(() => verifyReleaseArtifact(out, sha)).toThrow("digest mismatch");
  });
});

it("rejects a substituted tarball even if its envelope digest is updated", async () => {
  await withTempDir(async (root) => {
    const { verified, out, sha } = fixture(root);
    const substitute = join(root, "substitute");
    mkdirSync(substitute);
    writeFileSync(
      join(substitute, "package.json"),
      '{"name":"substitute","version":"1.0.0"}',
    );
    const packed = JSON.parse(
      execFileSync(
        "npm",
        [
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          substitute,
        ],
        { cwd: substitute, encoding: "utf8" },
      ),
    );
    const report = (Array.isArray(packed) ? packed : Object.values(packed))[0];
    const bytes = readFileSync(join(substitute, report.filename));
    writeFileSync(verified.tarball, bytes);
    const envelopePath = join(out, "artifact.json");
    const envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
    envelope.tarballSha256 = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(envelopePath, JSON.stringify(envelope));
    expect(() => verifyReleaseArtifact(out, sha)).toThrow("does not match");
  });
});
