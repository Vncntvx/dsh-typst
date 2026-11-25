/**
 * Move the harness pin and refresh every derived snapshot in one step:
 * the manifest faces, the toolchain snapshot, the consumer manifest and its
 * lockfile. A pin bump that skips the consumer snapshot leaves the release
 * smoke installing an older CLI, so this command is the only supported path.
 * @module scripts/harness-pin
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
if (version === undefined) {
  console.error("usage: node scripts/harness-pin.mjs <exact-version>");
  process.exit(1);
}

/**
 * Run one repository script through the current Node binary.
 * @param {string} script - file under `scripts/`.
 * @param {...string} args - forwarded arguments.
 */
const node = (script, ...args) =>
  execFileSync(process.execPath, [resolve(root, "scripts", script), ...args], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });

node("harness-state.mjs", "--write", version);
node("harness-toolchain.mjs", "--write");
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  [
    "install",
    "--package-lock-only",
    "--prefix",
    "tests/fixtures/dsh-cli-consumer",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  },
);
node("harness-toolchain.mjs");
node("harness-state.mjs");
