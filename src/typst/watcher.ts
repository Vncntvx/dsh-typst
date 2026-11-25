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

import { rmSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { LIMITS } from "../constants.js";
import { atLeast } from "./locate.js";
import { parseDeps, WatchLog, type WatchEvent } from "./diagnostics.js";
import { typstFlags, type TypstFlagOptions } from "./flags.js";
import type { PipedProcess, ProcessRunner } from "./process.js";

/** Silence window before a watch round's diagnostics are finalized. */
const QUIET_MS = 100;

/** A complete PDF has the header near the start and the marker near the end. */
function isCompletePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  const tail = Buffer.from(
    bytes.subarray(Math.max(0, bytes.length - 1024)),
  ).toString("latin1");
  return head.includes("%PDF-") && tail.includes("%%EOF");
}

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

export class Watcher {
  readonly pdfPath: string;
  readonly depsPath: string;
  private child: PipedProcess | null = null;
  private stopping = false;
  private quiet: NodeJS.Timeout | null = null;
  private revision = 0;
  private tail = "";
  private parser: WatchLog;

  constructor(
    private readonly options: WatcherOptions,
    private readonly on: WatcherEvents,
  ) {
    this.pdfPath = join(options.buildDir, "preview.pdf");
    this.depsPath = join(options.buildDir, "deps.txt");
    this.parser = new WatchLog((event) => this.handle(event), options.toFile);
  }

  get running(): boolean {
    return !!this.child && !this.stopping;
  }

  private args(): string[] {
    const { main, version } = this.options;
    const deps = atLeast(version, [0, 14, 0])
      ? ["--deps", this.depsPath, "--deps-format", "json"]
      : ["--make-deps", this.depsPath];
    return ["watch", main, this.pdfPath, ...deps, ...typstFlags(this.options)];
  }

  start(): void {
    if (this.child) return;
    this.stopping = false;
    rmSync(this.pdfPath, { force: true });
    rmSync(this.depsPath, { force: true });
    const args = this.args();
    this.options.log?.(`starting ${this.options.typst} ${args.join(" ")}`);
    const child = this.options.process.spawnPiped(
      [this.options.typst, ...args],
      {
        cwd: this.options.cwd,
        graceMs: LIMITS.stopGraceMs,
        ...(this.options.env === undefined ? {} : { env: this.options.env }),
      },
    );
    this.child = child;
    child.onOutput((text) => {
      this.tail = (this.tail + text).slice(-4_000);
      const pending = this.parser.feed(text);
      if (this.quiet) clearTimeout(this.quiet);
      this.quiet = pending
        ? setTimeout(() => this.parser.finalize(), QUIET_MS)
        : null;
    });
    // The output listener registers its own `done` continuation before this
    // one, so the decoder tail is delivered before the exit event.
    void child.done.then(
      (outcome) => {
        if (this.child !== child) return;
        this.child = null;
        if (this.quiet) clearTimeout(this.quiet);
        this.quiet = null;
        this.parser.feed("\n");
        this.parser.finalize();
        const expected = this.stopping;
        this.stopping = false;
        this.on.exit({
          code: outcome.exitCode,
          signal: outcome.signal,
          tail: this.tail.trim().slice(-1500),
          expected,
        });
      },
      (error) => {
        if (this.child !== child) return;
        this.child = null;
        if (this.quiet) clearTimeout(this.quiet);
        this.quiet = null;
        const detail = error instanceof Error ? error.message : String(error);
        this.tail += `\n${detail}`;
        const expected = this.stopping;
        this.stopping = false;
        this.on.exit({
          code: null,
          signal: null,
          tail: this.tail.trim().slice(-1500),
          expected,
        });
      },
    );
  }

  /** Invalidate captures immediately when newer input starts compiling. */
  private queue: Promise<void> = Promise.resolve();

  private handle(event: WatchEvent): void {
    if (event.kind === "compiling") {
      this.revision++;
      this.on.compiling(Date.now());
      return;
    }
    const revision = this.revision;
    this.queue = this.queue
      .then(async () => {
        if (revision !== this.revision || this.stopping) return;
        if (event.kind === "fatal") return this.on.fatal(event.message);
        if (event.kind !== "finished") return;
        let bytes: Uint8Array<ArrayBuffer> | undefined;
        let previewError: string | undefined;
        if (event.outcome !== "error") {
          try {
            bytes = await this.captureOutput(revision);
          } catch (error) {
            previewError =
              error instanceof Error ? error.message : String(error);
          }
        }
        if (revision !== this.revision || this.stopping) return;
        await this.on.finished({ ...event, bytes, previewError });
      })
      .catch((error) => this.on.fatal(String(error)));
  }

  /** Read a complete stable artifact only after the matching successful finish. */
  private async captureOutput(
    revision: number,
  ): Promise<Uint8Array<ArrayBuffer> | undefined> {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (revision !== this.revision || this.stopping) return;
      const before = await stat(this.pdfPath).catch(() => null);
      if (before) {
        if (before.size > LIMITS.pdfBytes) {
          throw new Error(
            `The preview PDF is ${before.size} bytes, above the ${LIMITS.pdfBytes}-byte preview limit.`,
          );
        }
        const bytes = new Uint8Array(
          await readFile(this.pdfPath),
        ) as Uint8Array<ArrayBuffer>;
        if (bytes.length > LIMITS.pdfBytes) {
          throw new Error(
            `The preview PDF is ${bytes.length} bytes, above the ${LIMITS.pdfBytes}-byte preview limit.`,
          );
        }
        const after = await stat(this.pdfPath);
        if (
          before.mtimeMs === after.mtimeMs &&
          before.size === after.size &&
          isCompletePdf(bytes)
        )
          return bytes;
      }
      await new Promise((done) => setTimeout(done, 25));
    }
    throw new Error(
      "Typst finished but did not produce a complete preview PDF. Retry the preview.",
    );
  }

  /** Dependency files of the latest compile (absolute paths). */
  async deps(): Promise<string[]> {
    const text = await readFile(this.depsPath, "utf8").catch(() => "");
    const base = this.options.root ?? this.options.cwd;
    return parseDeps(text)
      .filter((path) => !path.includes("*"))
      .map((path) => (isAbsolute(path) ? path : resolve(base, path)));
  }

  /** Stop the watch process; the provider escalates TERM→KILL within grace. */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    if (this.quiet) clearTimeout(this.quiet);
    this.quiet = null;
    this.revision++;
    child.terminate();
    await child
      .waitForExit(AbortSignal.timeout(LIMITS.stopGraceMs + 1_000))
      .catch(() => false);
  }

  /** Synchronous teardown (process exit). */
  killNow(): void {
    this.stopping = true;
    this.child?.terminate();
  }
}
