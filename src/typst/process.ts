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
import type {
  SubprocessHandle,
  SubprocessOutcome,
  SubprocessRuntime,
} from "@deepseek-ai/dsh-subprocess";
import { deadline, timeoutOf } from "@deepseek-ai/dsh-timeout";
import { LIMITS } from "../constants.js";
import { TYPST_TIMEOUT } from "../errors.js";

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
export class ProcessRunner {
  constructor(private readonly runtime: SubprocessRuntime) {}

  /**
   * Spawn a long-running child with raw pipes. Both streams are decoded with
   * a streaming decoder, so a multi-byte character split across chunks is
   * never replaced with U+FFFD.
   * @param argv - executable and arguments; never shell-interpreted.
   * @param options - cwd, explicit env, cancellation and grace.
   * @returns the live handle plus text-output helpers.
   */
  spawnPiped(argv: readonly string[], options: ProcessOptions): PipedProcess {
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
        const flush = (): void => {
          for (const decoder of [stdout, stderr]) {
            const tail = decoder.end();
            if (tail.length > 0) listener(tail);
          }
        };
        handle.stdout?.on("data", (chunk: Buffer) => {
          const text = stdout.write(chunk);
          if (text.length > 0) listener(text);
        });
        handle.stderr?.on("data", (chunk: Buffer) => {
          const text = stderr.write(chunk);
          if (text.length > 0) listener(text);
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
  async run(
    argv: readonly string[],
    options: ProcessOptions & {
      timeoutMs?: number;
      collectBytes?: number;
    },
  ): Promise<ProcessResult> {
    const timeoutMs = options.timeoutMs ?? LIMITS.oneshotTimeoutMs;
    const fuse = deadline(options.signal, timeoutMs, TYPST_TIMEOUT);
    const collect = {
      maxBytes: options.collectBytes ?? LIMITS.processOutputBytes,
    };
    try {
      let handle: SubprocessHandle;
      try {
        handle = this.runtime.spawn({
          argv,
          cwd: options.cwd,
          stdio: { stdin: "ignore", stdout: collect, stderr: collect },
          graceMs: options.graceMs ?? LIMITS.stopGraceMs,
          signal: fuse.signal,
          ...(options.env === undefined ? {} : { env: options.env }),
        });
      } catch (error) {
        return {
          code: null,
          signal: null,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          timedOut: timeoutOf(fuse.signal, TYPST_TIMEOUT) !== undefined,
          aborted: options.signal?.aborted === true,
        };
      }
      let outcome: SubprocessOutcome | null = null;
      let providerFailure: string | null = null;
      try {
        outcome = await handle.done;
      } catch (error) {
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
          stderr:
            stderr.length > 0
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
    } finally {
      fuse[Symbol.dispose]();
    }
  }
}
