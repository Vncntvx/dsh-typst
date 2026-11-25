/**
 * The plugin's single subprocess entry point. Every typst invocation and the
 * login-shell lookup go through the harness `ctx.subprocess` seam, which
 * supplies the scrubbed environment, managed process range, abort propagation
 * and host-exit teardown.
 *
 * Two shapes are exposed: {@link ProcessRunner.run} collects a short command's
 * output for toolchain probes and one-shot compiles; {@link ProcessRunner.spawnPiped}
 * streams a long-running child (the watch) with incremental UTF-8 decoding.
 * @module dsh-typst/typst/process
 */
import type { SubprocessHandle, SubprocessOutcome, SubprocessRuntime } from "@deepseek-ai/dsh-subprocess";
/** Spawn facts shared by every typst child. */
export interface ProcessOptions {
    /** Child working directory. */
    cwd: string;
    /** Explicit environment entries merged onto the provider's scrubbed base. */
    env?: NodeJS.ProcessEnv;
    /** Cancellation; the provider starts its managed-range termination. */
    signal?: AbortSignal;
    /** Grace period before the provider escalates termination. */
    graceMs?: number;
}
/** The outcome of one short command; a nonzero exit is a normal value. */
export interface ProcessResult {
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    aborted: boolean;
}
/** A long-running child whose stdout and stderr are decoded as text. */
export interface PipedProcess {
    readonly handle: SubprocessHandle;
    readonly done: Promise<SubprocessOutcome>;
    /** Attach one listener fed by both streams; call once, immediately after spawn. */
    onOutput(listener: (text: string) => void): void;
    /** Start the provider's managed-range termination. */
    terminate(): void;
    /** Wait until the managed range is empty; false when `signal` aborted first. */
    waitForExit(signal?: AbortSignal): Promise<boolean>;
}
/**
 * Wrap the host subprocess capability. One instance is owned by the workbench
 * service and shared by every workspace session.
 */
export declare class ProcessRunner {
    private readonly runtime;
    constructor(runtime: SubprocessRuntime);
    /**
     * Spawn a long-running child with raw pipes. Both streams are decoded with
     * a streaming decoder, so a multi-byte character split across chunks is
     * never replaced with U+FFFD.
     * @param argv - executable and arguments; never shell-interpreted.
     * @param options - cwd, explicit env, cancellation and grace.
     * @returns the live handle plus text-output helpers.
     */
    spawnPiped(argv: readonly string[], options: ProcessOptions): PipedProcess;
    /**
     * Run a short command to completion with bounded collected output.
     * A nonzero exit resolves; only a spawn/provider failure or the deadline
     * produces the failure shape.
     * @param argv - executable and arguments.
     * @param options - cwd, explicit env, cancellation, deadline and output cap.
     * @returns exit facts plus decoded stdout/stderr.
     */
    run(argv: readonly string[], options: ProcessOptions & {
        timeoutMs?: number;
        collectBytes?: number;
    }): Promise<ProcessResult>;
}
//# sourceMappingURL=process.d.ts.map