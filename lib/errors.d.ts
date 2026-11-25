/**
 * Stable error classes and codes for the Typst domain. Mirrors the
 * dsh-zotero convention: `HarnessError` subclasses carry a machine-routable
 * code on the host half; the remote layer re-arms them as `RemoteError`s
 * keyed `<domain>/<reason>`, discriminated by code, never by instanceof.
 * @module dsh-typst/errors
 */
import { HarnessError } from "@deepseek-ai/dsh-llm";
/** Typst is not installed anywhere this computer's lookup covers. */
export declare const TYPST_MISSING = "TYPST_MISSING";
/** The installed Typst is older than the supported minimum. */
export declare const TYPST_TOO_OLD = "TYPST_TOO_OLD";
/** Typst exists but does not run (`--version` failed, broken install). */
export declare const TYPST_UNUSABLE = "TYPST_UNUSABLE";
/** No main `.typ` file is chosen and none could be picked automatically. */
export declare const TYPST_NO_MAIN = "TYPST_NO_MAIN";
/** The requested preview does not exist (nothing compiled successfully yet). */
export declare const TYPST_NO_PREVIEW = "TYPST_NO_PREVIEW";
/** A requested snapshot/page/highlight no longer exists. */
export declare const TYPST_NOT_FOUND = "TYPST_NOT_FOUND";
/** An argument the schemas cannot express violates a domain constraint. */
export declare const TYPST_INVALID_ARGUMENT = "TYPST_INVALID_ARGUMENT";
/** A path resolves outside the session workspace. */
export declare const TYPST_PATH_OUTSIDE_WORKSPACE = "TYPST_PATH_OUTSIDE_WORKSPACE";
/** The compile did not settle within the caller's budget. */
export declare const TYPST_TIMEOUT = "TYPST_TIMEOUT";
/** `typst watch` died or could not start. */
export declare const TYPST_WATCH_FAILED = "TYPST_WATCH_FAILED";
/** The requested quote/text was not found in the rendered preview. */
export declare const TYPST_QUOTE_NOT_FOUND = "TYPST_QUOTE_NOT_FOUND";
/** The Typst workbench service is not composed. */
export declare const TYPST_NOT_COMPOSED = "TYPST_NOT_COMPOSED";
/** The attachment store is missing; rendered images cannot be returned. */
export declare const TYPST_ATTACHMENT_UNAVAILABLE = "TYPST_ATTACHMENT_UNAVAILABLE";
/** The document did not compile, so the requested output was not produced. */
export declare const TYPST_COMPILE_FAILED = "TYPST_COMPILE_FAILED";
/** The session's sandbox policy forbids writing the target. */
export declare const TYPST_SANDBOX_READ_ONLY = "TYPST_SANDBOX_READ_ONLY";
/** A granted writable root cannot be enforced: missing, not a directory, or a symlink. */
export declare const TYPST_SANDBOX_INVALID_ROOT = "TYPST_SANDBOX_INVALID_ROOT";
/** A requested page is outside the document or the render budget. */
export declare const TYPST_PAGE_OUT_OF_RANGE = "TYPST_PAGE_OUT_OF_RANGE";
/** The main file changed while a one-shot compile was in flight. */
export declare const TYPST_MAIN_CHANGED = "TYPST_MAIN_CHANGED";
/** The filesystem mtime is ahead of the host clock; the document cannot settle. */
export declare const TYPST_CLOCK_SKEW = "TYPST_CLOCK_SKEW";
/** The highlight target arguments are not exactly one valid target. */
export declare const TYPST_INVALID_TARGET = "TYPST_INVALID_TARGET";
/** A compile did not settle, so the answer cannot represent the new main file. */
export declare const TYPST_SETTLE_FAILED = "TYPST_SETTLE_FAILED";
/** Something unexpected; the message carries the domain fact. */
export declare const TYPST_UNEXPECTED = "TYPST_UNEXPECTED";
/** The one message every "typst workbench is not composed" answer spells. */
export declare const TYPST_NOT_COMPOSED_MESSAGE = "The Typst workbench service is not composed.";
export declare const TYPST_ERROR_CODES: readonly ["TYPST_MISSING", "TYPST_TOO_OLD", "TYPST_UNUSABLE", "TYPST_NO_MAIN", "TYPST_NO_PREVIEW", "TYPST_NOT_FOUND", "TYPST_INVALID_ARGUMENT", "TYPST_PATH_OUTSIDE_WORKSPACE", "TYPST_TIMEOUT", "TYPST_WATCH_FAILED", "TYPST_QUOTE_NOT_FOUND", "TYPST_NOT_COMPOSED", "TYPST_ATTACHMENT_UNAVAILABLE", "TYPST_COMPILE_FAILED", "TYPST_SANDBOX_READ_ONLY", "TYPST_SANDBOX_INVALID_ROOT", "TYPST_PAGE_OUT_OF_RANGE", "TYPST_MAIN_CHANGED", "TYPST_CLOCK_SKEW", "TYPST_INVALID_TARGET", "TYPST_SETTLE_FAILED", "TYPST_UNEXPECTED"];
/** Every stable error code a `TypstError` may carry. */
export type TypstErrorCode = (typeof TYPST_ERROR_CODES)[number];
/**
 * Domain failure with a stable machine-routable code and an actionable,
 * model-facing message. The tool registry renders it as `Error: <message>`
 * with `isError: true`.
 */
export declare class TypstError extends HarnessError {
    readonly code: TypstErrorCode;
    constructor(message: string, code: TypstErrorCode, options?: ErrorOptions);
}
/**
 * The wire code each stable domain failure crosses the Typert boundary as.
 * Typert's protocol reserves one `<domain>/<reason>` code per failure and
 * discriminates `RemoteFailure` by that code; the details still carry the
 * stable domain code so a handler that needs the finer domain fact can read
 * it without matching message text.
 */
export declare const TYPST_REMOTE_CODES: {
    readonly TYPST_MISSING: "typst/missing";
    readonly TYPST_TOO_OLD: "typst/too-old";
    readonly TYPST_UNUSABLE: "typst/unusable";
    readonly TYPST_NO_MAIN: "typst/no-main";
    readonly TYPST_NO_PREVIEW: "typst/no-preview";
    readonly TYPST_NOT_FOUND: "typst/not-found";
    readonly TYPST_INVALID_ARGUMENT: "typst/invalid-argument";
    readonly TYPST_PATH_OUTSIDE_WORKSPACE: "typst/path-outside-workspace";
    readonly TYPST_TIMEOUT: "typst/timeout";
    readonly TYPST_WATCH_FAILED: "typst/watch-failed";
    readonly TYPST_QUOTE_NOT_FOUND: "typst/quote-not-found";
    readonly TYPST_NOT_COMPOSED: "typst/not-composed";
    readonly TYPST_ATTACHMENT_UNAVAILABLE: "typst/attachment-unavailable";
    readonly TYPST_COMPILE_FAILED: "typst/compile-failed";
    readonly TYPST_SANDBOX_READ_ONLY: "typst/sandbox-read-only";
    readonly TYPST_SANDBOX_INVALID_ROOT: "typst/sandbox-invalid-root";
    readonly TYPST_PAGE_OUT_OF_RANGE: "typst/page-out-of-range";
    readonly TYPST_MAIN_CHANGED: "typst/main-changed";
    readonly TYPST_CLOCK_SKEW: "typst/clock-skew";
    readonly TYPST_INVALID_TARGET: "typst/invalid-target";
    readonly TYPST_SETTLE_FAILED: "typst/settle-failed";
    readonly TYPST_UNEXPECTED: "typst/unexpected";
};
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
export declare function rethrowRemote(error: unknown): never;
/** Install guidance shown whenever Typst cannot be found. */
export declare const INSTALL_HINT: string;
/**
 * Wrap a domain call so every failure crosses the wire as a `RemoteError`
 * with a stable `typst/<reason>` code (client remote calls never reject with
 * anything else; they resolve `{ ok: false }`).
 * @param call - the domain call.
 * @returns the call's value.
 */
export declare function domainCall<T>(call: () => Promise<T>): Promise<T>;
//# sourceMappingURL=errors.d.ts.map