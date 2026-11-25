/**
 * The long-running `typst watch` child process: spawn, output parsing, PDF
 * completeness polling, dependency tracking, and managed-range teardown.
 * Ported from the ZCode typst-workbench server (0.2.0) `src/typst/watcher.ts`.
 * Host half only.
 *
 * The watcher never edits files; it reads the PDF typst writes and reports
 * events to its owner (the session). Ownership is enforced by identity: an
 * event from a replaced watcher is dropped by the session's callbacks.
 *
 * The child is spawned through {@link ProcessRunner}, so the harness
 * subprocess provider supplies the scrubbed environment, the managed process
 * range, and host-exit termination. Process identity comes from that provider;
 * this module keeps no pid file of its own.
 * @module dsh-typst/typst/watcher
 */
import { type TypstFlagOptions } from "./flags.js";
import type { ProcessRunner } from "./process.js";
export interface WatcherOptions extends TypstFlagOptions {
    typst: string;
    version: string;
    cwd: string;
    main: string;
    buildDir: string;
    /** The host subprocess runner shared by the workbench. */
    process: ProcessRunner;
    /** Explicit environment layered after the provider's ambient scrub. */
    env?: NodeJS.ProcessEnv;
    toFile?: (path: string) => string;
    log?: (message: string) => void;
}
export interface WatcherEvents {
    compiling(startedAt: number): void;
    finished(event: {
        outcome: "ok" | "warnings" | "error";
        durationMs?: number;
        diagnostics: import("../contract.js").DiagnosticView[];
        bytes?: Uint8Array<ArrayBuffer>;
        previewError?: string;
    }): void | Promise<void>;
    fatal(message: string): void;
    exit(event: {
        code: number | null;
        signal: NodeJS.Signals | null;
        tail: string;
        expected: boolean;
    }): void;
}
export declare class Watcher {
    private readonly options;
    private readonly on;
    readonly pdfPath: string;
    readonly depsPath: string;
    private child;
    private stopping;
    private quiet;
    private revision;
    private tail;
    private parser;
    constructor(options: WatcherOptions, on: WatcherEvents);
    get running(): boolean;
    private args;
    start(): void;
    /** Invalidate captures immediately when newer input starts compiling. */
    private queue;
    private handle;
    /** Read a complete stable artifact only after the matching successful finish. */
    private captureOutput;
    /** Dependency files of the latest compile (absolute paths). */
    deps(): Promise<string[]>;
    /** Stop the watch process; the provider escalates TERM→KILL within grace. */
    stop(): Promise<void>;
    /** Synchronous teardown (process exit). */
    killNow(): void;
}
//# sourceMappingURL=watcher.d.ts.map