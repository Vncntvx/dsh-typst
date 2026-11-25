/**
 * Turn a typst diagnostic location into the host file address the panel
 * opens. typst reports file paths relative to the workspace root, while the
 * host resolves `dsh-resource://file` paths against the session cwd; send an
 * absolute path so a session that `cd`-ed into a subdirectory still opens the
 * file the compiler named.
 * @module dsh-typst/client/source
 */
import { fileAddressFor } from "@deepseek-ai/dsh-util-workspace-path";

/**
 * A workspace-relative source path as an absolute host file address.
 * @param sessionId - the calling session.
 * @param workspaceRoot - the absolute root the typst workspace was opened at.
 * @param file - the path the compiler reported.
 * @returns the address, or undefined when the path cannot be confined.
 */
export function workspaceSourceAddress(
  sessionId: string,
  workspaceRoot: string | undefined,
  file: string,
): string | undefined {
  const normalized = file.replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized.split("/").includes("..") ||
    /^[A-Za-z]:/.test(normalized) ||
    workspaceRoot === undefined ||
    workspaceRoot.length === 0
  )
    return undefined;
  const absolute = `${workspaceRoot.replace(/[\\/]+$/, "")}/${normalized}`;
  return fileAddressFor(sessionId, undefined, absolute);
}
