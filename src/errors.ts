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

/** The remote layer's one failure code (details carry the domain code). */
export const TYPST_REMOTE_DOMAIN = "typst/domain" as const;

/**
 * Rethrow a domain failure across the Typert wire as the plugin's one
 * `typst/domain` code with the stable domain code in `details`. Consumers
 * discriminate by `details.code`, never by instanceof (the client never
 * sees these classes).
 * @param error - the thrown value.
 * @returns never; throws a `RemoteError` keyed `typst/domain`.
 */
export function rethrowRemote(error: unknown): never {
  if (error instanceof TypstError) {
    throw new RemoteError("typst/domain", error.message, { code: error.code });
  }
  if (error instanceof RemoteError) throw error;
  throw new RemoteError(
    "typst/domain",
    error instanceof Error ? error.message : String(error),
    {
      code: TYPST_UNEXPECTED,
    },
  );
}

/**
 * Throw an argument error: the message is model-facing and names the
 * offending value.
 * @param message - the model-facing argument error text.
 * @throws {TypstError} `TYPST_INVALID_ARGUMENT`.
 */
export function invalid(message: string): never {
  throw new TypstError(message, TYPST_INVALID_ARGUMENT);
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
