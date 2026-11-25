/**
 * The workflows are the release contract: a tag publishes the exact artifact
 * the install matrix proved, and no job may rebuild or republish its own bytes.
 * @module tests/unit/release-workflows
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { withTempDir } from "./helpers/temp-dir.js";

/** @param {string} name the workflow file name. @returns {string} its text. */
function workflow(name: string): string {
  return readFileSync(
    new URL(`../../.github/workflows/${name}`, import.meta.url),
    "utf8",
  );
}

/**
 * The `run: |` body of one named step, dedented to column zero.
 * @param text the workflow text.
 * @param step the step name.
 * @returns the shell body.
 */
function runScript(text: string, step: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.includes(`name: ${step}`));
  const run = lines.findIndex(
    (line, index) => index > at && /^\s*run: \|$/.test(line),
  );
  const indent = /^\s*/.exec(lines[run])![0].length + 2;
  const body: string[] = [];
  for (let index = run + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    if (/^\s*/.exec(line)![0].length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

const release = () => workflow("release-branch.yml");
const prebuilt = () => workflow("prebuilt.yml");

it("starts the release workflow only on version tag pushes", () => {
  expect(release()).toMatch(/on:\n  push:\n    tags:\n      - ["']v\*["']/);
});

it("builds the rolling release branch on main pushes and manual dispatches only", () => {
  expect(prebuilt()).toMatch(
    /on:\n  push:\n    branches:\n      - main\n  workflow_dispatch:/,
  );
});

it("gates publication behind the quality gate and the install matrix", () => {
  const text = release();
  expect(text).toContain("npm run release:check");
  expect(text).toContain("node scripts/release-artifact.mjs --out");
  expect(text).toMatch(
    /publish:[\s\S]*needs:\n\s+- quality-gate\n\s+- web-composition/,
  );
  expect(text).toContain("--branch stable");
  expect(text).toContain('--artifact "$RUNNER_TEMP/release-artifact"');
  expect(text).toContain("RELEASE_PUSH_TOKEN: ${{ github.token }}");
  expect(text).toContain("persist-credentials: false");
  const publish = text.slice(text.indexOf("  publish:"));
  expect(publish).not.toMatch(/npm (?:ci|install|run build)/);
});

it("installs the same artifact on all desktop platforms before publication", () => {
  const text = release();
  const matrix = text.slice(
    text.indexOf("  web-composition:"),
    text.indexOf("  npm-release:"),
  );
  expect(matrix).toContain("os: [ubuntu-latest, macos-latest, windows-latest]");
  expect(matrix).toContain("fail-fast: false");
  expect(matrix).toContain("node scripts/harness-toolchain.mjs");
  expect(matrix).toContain('--tarball "$tarball"');
  expect(matrix).toContain('--dsh "$DSH_CLI"');
  expect(matrix).toContain("--install-only");
  expect(matrix).toContain("node scripts/release-artifact.mjs --verify");
  expect(matrix).toContain("if: failure()");
});

it("publishes npm from the verified tarball under OIDC without stored credentials", () => {
  const text = release();
  const job = text.slice(
    text.indexOf("  npm-release:"),
    text.indexOf("  publish:"),
  );
  expect(job).toContain("id-token: write");
  expect(job).toContain("contents: read");
  expect(job).toContain("registry-url:");
  expect(job).toContain("package-manager-cache: false");
  expect(job).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|secrets\./);
  expect(job).toContain("scripts/npm-registry.mjs --check");
  expect(job).toContain(
    'npm publish "$TARBALL" --access public --tag "$NPM_DIST_TAG"',
  );
  expect(job).toContain("if: env.PUBLISH_NEEDED == 'true'");
  expect(job).toContain("node scripts/release-artifact.mjs --verify");
});

it("publishes the rolling channel with the verified artifact", () => {
  const text = prebuilt();
  expect(text).toContain("npm run build");
  expect(text).toContain("node scripts/release-artifact.mjs --out");
  expect(text).toContain("scripts/publish-release-branch.mjs --push");
  expect(text).toContain("--branch release");
  expect(text).toContain('--artifact "$RUNNER_TEMP/release-artifact"');
  expect(text).toContain("RELEASE_PUSH_TOKEN: ${{ github.token }}");
  expect(text).toContain("contents: write");
});

it("verifies the public tarball before creating the GitHub Release", () => {
  const text = workflow("verify-npm-release.yml");
  expect(text).toContain("workflows: [Update Release Branch]");
  expect(text).toContain("environment: npm-publication");
  expect(text).toContain("timeout-minutes: 15");
  expect(text).toContain("actions: read");
  expect(text).toContain(
    "release-artifact-${{ github.event.workflow_run['head_sha'] }}",
  );
  expect(text).toContain("run-id: ${{ github.event.workflow_run.id }}");
  expect(text).toContain("scripts/npm-registry.mjs --verify");
  expect(text.indexOf("scripts/npm-registry.mjs --verify")).toBeLessThan(
    text.indexOf("gh release create"),
  );
  expect(text).toContain("release_flags+=(--prerelease --latest=false)");
});

it("keeps the weekly report running when direct dependencies drift", () => {
  const text = workflow("upstream-health.yml");
  const dependency = text.slice(
    text.indexOf("- name: Check direct dependency releases"),
    text.indexOf("- name: Check upstream registry updates"),
  );
  const registry = text.slice(
    text.indexOf("- name: Check upstream registry updates"),
  );
  expect(dependency).toContain("continue-on-error: true");
  expect(registry).toContain("if: always()");
  expect(registry).not.toContain("continue-on-error");
});

it.each([
  ["1.3.0", "latest"],
  ["1.3.0-alpha.1", "alpha"],
  ["1.3.0-beta.2", "beta"],
  ["1.3.0-rc.1", "rc"],
  ["1.3.0-1", "next"],
  ["1.3.0-latest.1", "next"],
])("selects the publication channel for %s", async (version, distTag) => {
  const script = runScript(release(), "Select publication channel");
  await withTempDir(async (root) => {
    const envFile = join(root, "github-env");
    execFileSync("bash", ["-e", "-o", "pipefail", "-c", script], {
      env: { ...process.env, VERSION: version, GITHUB_ENV: envFile },
    });
    expect(readFileSync(envFile, "utf8")).toBe(`NPM_DIST_TAG=${distTag}\n`);
  });
});
