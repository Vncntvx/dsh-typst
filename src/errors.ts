/**
 * Stable error classes and codes for the Typst domain. Mirrors the
 * dsh-zotero convention: `HarnessError` subclasses carry a machine-routable
 * code on the host half; the remote layer re-arms them as `RemoteError`s
 * keyed `<domain>/<reason>`, discriminated by code, never by instanceof.
 * @module dsh-typst/errors
 */

import { HarnessError } from "@deepseek-ai/dsh-llm";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";

/** Typst is not installed anywhere this computer's lookup covers. */
export const TYPST_MISSING = "TYPST_MISSING";
/** The installed Typst is older than the supported minimum. */
export const TYPST_TOO_OLD = "TYPST_TOO_OLD";
/** Typst exists but does not run (`--version` failed, broken install). */
export const TYPST_UNUSABLE = "TYPST_UNUSABLE";
/** No main `.typ` file is chosen and none could be picked automatically. */
export const TYPST_NO_MAIN = "TYPST_NO_MAIN";
/** The requested preview does not exist (nothing compiled successfully yet). */
export const TYPST_NO_PREVIEW = "TYPST_NO_PREVIEW";
/** A requested snapshot/page/highlight no longer exists. */
export const TYPST_NOT_FOUND = "TYPST_NOT_FOUND";
/** An argument the schemas cannot express violates a domain constraint. */
export const TYPST_INVALID_ARGUMENT = "TYPST_INVALID_ARGUMENT";
/** A path resolves outside the session workspace. */
export const TYPST_PATH_OUTSIDE_WORKSPACE = "TYPST_PATH_OUTSIDE_WORKSPACE";
/** The compile did not settle within the caller's budget. */
export const TYPST_TIMEOUT = "TYPST_TIMEOUT";
/** `typst watch` died or could not start. */
export const TYPST_WATCH_FAILED = "TYPST_WATCH_FAILED";
/** The requested quote/text was not found in the rendered preview. */
export const TYPST_QUOTE_NOT_FOUND = "TYPST_QUOTE_NOT_FOUND";
/** The Typst workbench service is not composed. */
export const TYPST_NOT_COMPOSED = "TYPST_NOT_COMPOSED";
/** The attachment store is missing; rendered images cannot be returned. */
export const TYPST_ATTACHMENT_UNAVAILABLE = "TYPST_ATTACHMENT_UNAVAILABLE";
/** The document did not compile, so the requested output was not produced. */
export const TYPST_COMPILE_FAILED = "TYPST_COMPILE_FAILED";
/** The session's sandbox policy forbids writing the target. */
export const TYPST_SANDBOX_READ_ONLY = "TYPST_SANDBOX_READ_ONLY";
/** A granted writable root cannot be enforced: missing, not a directory, or a symlink. */
export const TYPST_SANDBOX_INVALID_ROOT = "TYPST_SANDBOX_INVALID_ROOT";
/** A requested page is outside the document or the render budget. */
export const TYPST_PAGE_OUT_OF_RANGE = "TYPST_PAGE_OUT_OF_RANGE";
/** The main file changed while a one-shot compile was in flight. */
export const TYPST_MAIN_CHANGED = "TYPST_MAIN_CHANGED";
/** The filesystem mtime is ahead of the host clock; the document cannot settle. */
export const TYPST_CLOCK_SKEW = "TYPST_CLOCK_SKEW";
/** The highlight target arguments are not exactly one valid target. */
export const TYPST_INVALID_TARGET = "TYPST_INVALID_TARGET";
/** A compile did not settle, so the answer cannot represent the new main file. */
export const TYPST_SETTLE_FAILED = "TYPST_SETTLE_FAILED";
/** Something unexpected; the message carries the domain fact. */
export const TYPST_UNEXPECTED = "TYPST_UNEXPECTED";

/** The one message every "typst workbench is not composed" answer spells. */
export const TYPST_NOT_COMPOSED_MESSAGE =
  "The Typst workbench service is not composed.";

export const TYPST_ERROR_CODES = [
  TYPST_MISSING,
  TYPST_TOO_OLD,
  TYPST_UNUSABLE,
  TYPST_NO_MAIN,
  TYPST_NO_PREVIEW,
  TYPST_NOT_FOUND,
  TYPST_INVALID_ARGUMENT,
  TYPST_PATH_OUTSIDE_WORKSPACE,
  TYPST_TIMEOUT,
  TYPST_WATCH_FAILED,
  TYPST_QUOTE_NOT_FOUND,
  TYPST_NOT_COMPOSED,
  TYPST_ATTACHMENT_UNAVAILABLE,
  TYPST_COMPILE_FAILED,
  TYPST_SANDBOX_READ_ONLY,
  TYPST_SANDBOX_INVALID_ROOT,
  TYPST_PAGE_OUT_OF_RANGE,
  TYPST_MAIN_CHANGED,
  TYPST_CLOCK_SKEW,
  TYPST_INVALID_TARGET,
  TYPST_SETTLE_FAILED,
  TYPST_UNEXPECTED,
] as const;

/** Every stable error code a `TypstError` may carry. */
export type TypstErrorCode = (typeof TYPST_ERROR_CODES)[number];

/**
 * Domain failure with a stable machine-routable code and an actionable,
 * model-facing message. The tool registry renders it as `Error: <message>`
 * with `isError: true`.
 */
export class TypstError extends HarnessError {
  declare readonly code: TypstErrorCode;

  constructor(message: string, code: TypstErrorCode, options?: ErrorOptions) {
    super(message, code, options);
    this.name = "TypstError";
  }
}

/**
 * The wire code each stable domain failure crosses the Typert boundary as.
 * Typert's protocol reserves one `<domain>/<reason>` code per failure and
 * discriminates `RemoteFailure` by that code; the details still carry the
 * stable domain code so a handler that needs the finer domain fact can read
 * it without matching message text.
 */
export const TYPST_REMOTE_CODES = {
  [TYPST_MISSING]: "typst/missing",
  [TYPST_TOO_OLD]: "typst/too-old",
  [TYPST_UNUSABLE]: "typst/unusable",
  [TYPST_NO_MAIN]: "typst/no-main",
  [TYPST_NO_PREVIEW]: "typst/no-preview",
  [TYPST_NOT_FOUND]: "typst/not-found",
  [TYPST_INVALID_ARGUMENT]: "typst/invalid-argument",
  [TYPST_PATH_OUTSIDE_WORKSPACE]: "typst/path-outside-workspace",
  [TYPST_TIMEOUT]: "typst/timeout",
  [TYPST_WATCH_FAILED]: "typst/watch-failed",
  [TYPST_QUOTE_NOT_FOUND]: "typst/quote-not-found",
  [TYPST_NOT_COMPOSED]: "typst/not-composed",
  [TYPST_ATTACHMENT_UNAVAILABLE]: "typst/attachment-unavailable",
  [TYPST_COMPILE_FAILED]: "typst/compile-failed",
  [TYPST_SANDBOX_READ_ONLY]: "typst/sandbox-read-only",
  [TYPST_SANDBOX_INVALID_ROOT]: "typst/sandbox-invalid-root",
  [TYPST_PAGE_OUT_OF_RANGE]: "typst/page-out-of-range",
  [TYPST_MAIN_CHANGED]: "typst/main-changed",
  [TYPST_CLOCK_SKEW]: "typst/clock-skew",
  [TYPST_INVALID_TARGET]: "typst/invalid-target",
  [TYPST_SETTLE_FAILED]: "typst/settle-failed",
  [TYPST_UNEXPECTED]: "typst/unexpected",
} as const satisfies Record<TypstErrorCode, `typst/${string}`>;

/** Every Typert Remote failure code this plugin may emit. */
export type TypstRemoteCode = (typeof TYPST_REMOTE_CODES)[TypstErrorCode];

/**
 * Rethrow a domain failure across the Typert wire as its own
 * `<domain>/<reason>` code, with the stable domain code in `details`.
 * Consumers discriminate by `error.code`, never by instanceof (the client
 * never sees these classes).
 * @param error - the thrown value.
 * @returns never; throws a `RemoteError` keyed `typst/<reason>`.
 */
export function rethrowRemote(error: unknown): never {
  if (error instanceof TypstError) {
    throw new RemoteError(TYPST_REMOTE_CODES[error.code], error.message, {
      code: error.code,
    });
  }
  if (error instanceof RemoteError) throw error;
  throw new RemoteError(
    TYPST_REMOTE_CODES[TYPST_UNEXPECTED],
    error instanceof Error ? error.message : String(error),
    {
      code: TYPST_UNEXPECTED,
    },
  );
}

/** Install guidance shown whenever Typst cannot be found. */
export const INSTALL_HINT =
  "Install Typst (for example `brew install typst`, `winget install --id Typst.Typst`, " +
  "`cargo install --locked typst-cli`, or a release from " +
  'https://github.com/typst/typst/releases), or set its path in the plugin setting "Typst path".';

/**
 * Wrap a domain call so every failure crosses the wire as a `RemoteError`
 * with a stable `typst/<reason>` code (client remote calls never reject with
 * anything else; they resolve `{ ok: false }`).
 * @param call - the domain call.
 * @returns the call's value.
 */
export async function domainCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    rethrowRemote(error);
  }
}
