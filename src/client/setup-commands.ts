/**
 * The per-platform install commands the setup page offers (ZCode
 * typst-workbench parity: brew, winget, scoop, cargo).
 * @module dsh-typst/client/setup-commands
 */

export type OsKind = "macos" | "windows" | "linux" | "other";

/**
 * The install command for the platform the host facts report.
 * @param os - the detected OS.
 * @returns a shell command the user (or the agent) can run.
 */
export function installCommandFor(os: OsKind): string {
  switch (os) {
    case "macos":
      return "brew install typst";
    case "windows":
      return "winget install --id Typst.Typst";
    case "linux":
      return "cargo install --locked typst-cli";
    case "other":
      return "cargo install --locked typst-cli";
  }
}
