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
import { StringDecoder } from "node:string_decoder";
import { deadline, timeoutOf } from "@deepseek-ai/dsh-timeout";
import { LIMITS } from "../constants.js";
import { TYPST_TIMEOUT } from "../errors.js";
/**
 * Wrap the host subprocess capability. One instance is owned by the workbench
 * service and shared by every workspace session.
 */
export class ProcessRunner {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    /**
     * Spawn a long-running child with raw pipes. Both streams are decoded with
     * a streaming decoder, so a multi-byte character split across chunks is
     * never replaced with U+FFFD.
     * @param argv - executable and arguments; never shell-interpreted.
     * @param options - cwd, explicit env, cancellation and grace.
     * @returns the live handle plus text-output helpers.
     */
    spawnPiped(argv, options) {
        const handle = this.runtime.spawn({
            argv,
            cwd: options.cwd,
            stdio: { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
            graceMs: options.graceMs ?? LIMITS.stopGraceMs,
            ...(options.env === undefined ? {} : { env: options.env }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
        });
        return {
            handle,
            done: handle.done,
            onOutput: (listener) => {
                const stdout = new StringDecoder("utf8");
                const stderr = new StringDecoder("utf8");
                const flush = () => {
                    for (const decoder of [stdout, stderr]) {
                        const tail = decoder.end();
                        if (tail.length > 0)
                            listener(tail);
                    }
                };
                handle.stdout?.on("data", (chunk) => {
                    const text = stdout.write(chunk);
                    if (text.length > 0)
                        listener(text);
                });
                handle.stderr?.on("data", (chunk) => {
                    const text = stderr.write(chunk);
                    if (text.length > 0)
                        listener(text);
                });
                // Flush before the owner's own `done` continuation runs: listeners are
                // registered in call order, and the owner registers after this call.
                void handle.done.then(flush, flush);
            },
            terminate: () => handle.terminate(),
            waitForExit: (signal) => handle.waitForExit(signal),
        };
    }
    /**
     * Run a short command to completion with bounded collected output.
     * A nonzero exit resolves; only a spawn/provider failure or the deadline
     * produces the failure shape.
     * @param argv - executable and arguments.
     * @param options - cwd, explicit env, cancellation, deadline and output cap.
     * @returns exit facts plus decoded stdout/stderr.
     */
    async run(argv, options) {
        const timeoutMs = options.timeoutMs ?? LIMITS.oneshotTimeoutMs;
        const fuse = deadline(options.signal, timeoutMs, TYPST_TIMEOUT);
        const collect = {
            maxBytes: options.collectBytes ?? LIMITS.processOutputBytes,
        };
        try {
            let handle;
            try {
                handle = this.runtime.spawn({
                    argv,
                    cwd: options.cwd,
                    stdio: { stdin: "ignore", stdout: collect, stderr: collect },
                    graceMs: options.graceMs ?? LIMITS.stopGraceMs,
                    signal: fuse.signal,
                    ...(options.env === undefined ? {} : { env: options.env }),
                });
            }
            catch (error) {
                return {
                    code: null,
                    signal: null,
                    stdout: "",
                    stderr: error instanceof Error ? error.message : String(error),
                    timedOut: timeoutOf(fuse.signal, TYPST_TIMEOUT) !== undefined,
                    aborted: options.signal?.aborted === true,
                };
            }
            let outcome = null;
            let providerFailure = null;
            try {
                outcome = await handle.done;
            }
            catch (error) {
                providerFailure =
                    error instanceof Error ? error.message : String(error);
            }
            const stdout = handle.collected.stdout?.readFrom(0).text ?? "";
            const stderr = handle.collected.stderr?.readFrom(0).text ?? "";
            const timedOut = timeoutOf(fuse.signal, TYPST_TIMEOUT) !== undefined;
            if (providerFailure !== null) {
                return {
                    code: null,
                    signal: null,
                    stdout,
                    stderr: stderr.length > 0
                        ? `${stderr}\n${providerFailure}`
                        : providerFailure,
                    timedOut,
                    aborted: options.signal?.aborted === true,
                };
            }
            return {
                code: outcome === null ? null : outcome.exitCode,
                signal: outcome === null ? null : outcome.signal,
                stdout,
                stderr,
                timedOut,
                aborted: options.signal?.aborted === true,
            };
        }
        finally {
            fuse[Symbol.dispose]();
        }
    }
}
//# sourceMappingURL=process.js.map