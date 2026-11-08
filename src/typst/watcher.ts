/**
 * The long-running `typst watch` child process: spawn, output parsing, PDF
 * completeness polling, dependency tracking, and tree teardown. Ported from
 * the ZCode typst-workbench server (0.2.0) `src/typst/watcher.ts`. Host
 * half only.
 *
 * The watcher never edits files; it reads the PDF typst writes and reports
 * events to its owner (the session). Ownership is enforced by identity: an
 * event from a replaced watcher is dropped by the session's callbacks.
 * @module dsh-typst/typst/watcher
 */

import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { atLeast } from "./locate.js";
import { parseDeps, WatchLog, type WatchEvent } from "./diagnostics.js";

/** Silence window before a watch round's diagnostics are finalized. */
const QUIET_MS = 25;

/** A complete PDF has the header near the start and the marker near the end. */
function isCompletePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  const tail = Buffer.from(
    bytes.subarray(Math.max(0, bytes.length - 1024)),
  ).toString("latin1");
  return head.includes("%PDF-") && tail.includes("%%EOF");
}

export interface WatcherOptions {
  typst: string;
  version: string;
  cwd: string;
  /** Project sandbox root passed to Typst via `--root`. */
  root?: string;
  /** Extra directories searched recursively for fonts via `--font-path`. */
  fontPaths?: string[];
  main: string;
  buildDir: string;
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
    bytes?: Uint8Array;
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

/** Kill a child and, on POSIX, its whole process group. */
function killTree(
  child: import("node:child_process").ChildProcess,
  signal: NodeJS.Signals,
): void {
  try {
    if (process.platform !== "win32" && child.pid !== undefined) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // No process group (spawn without detached): fall through.
      }
    }
    child.kill(signal);
  } catch {
    // Already gone.
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Kill watch processes left behind by a previous session: every pid file in
 * the build base whose process is still alive and is a typst binary (the
 * command line still mentions typst).
 */
export async function reapOrphans(
  base: string,
  log?: (message: string) => void,
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    const pidPath = join(dir, "watch.pid");
    const raw = await readFile(pidPath, "utf8").catch(() => null);
    const pid = raw !== null ? Number.parseInt(raw.trim(), 10) : Number.NaN;
    if (Number.isInteger(pid) && alive(pid)) {
      const cmdline = await readFile(`/proc/${pid}/cmdline`, "utf8").catch(
        () => null,
      );
      if (cmdline === null || cmdline.includes("typst")) {
        log?.(`stopping typst watch ${pid} left by a previous session`);
        try {
          if (process.platform !== "win32") process.kill(-pid, "SIGKILL");
          else process.kill(pid, "SIGKILL");
        } catch {
          // Gone between the check and the kill.
        }
      }
    }
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export class Watcher {
  readonly pdfPath: string;
  readonly depsPath: string;
  private child: import("node:child_process").ChildProcess | null = null;
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

  get pid(): number | undefined {
    return this.child?.pid;
  }

  private args(): string[] {
    const { main, version, root, fontPaths } = this.options;
    const deps = atLeast(version, [0, 14, 0])
      ? ["--deps", this.depsPath, "--deps-format", "json"]
      : ["--make-deps", this.depsPath];
    const rootArgs = root ? ["--root", root] : [];
    const fontArgs = (fontPaths ?? []).flatMap((dir) => ["--font-path", dir]);
    return ["watch", main, this.pdfPath, ...deps, ...rootArgs, ...fontArgs];
  }

  start(): void {
    if (this.child) return;
    this.stopping = false;
    for (const path of [this.pdfPath, this.depsPath])
      rmSync(path, { force: true });
    const args = this.args();
    this.options.log?.(`starting ${this.options.typst} ${args.join(" ")}`);
    const child = spawn(this.options.typst, args, {
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      // Its own process group: teardown ends the whole tree.
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    this.child = child;
    if (child.pid)
      writeFileSync(
        join(this.options.buildDir, "watch.pid"),
        String(child.pid),
      );
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      this.tail = (this.tail + text).slice(-4_000);
      const pending = this.parser.feed(text);
      if (this.quiet) clearTimeout(this.quiet);
      this.quiet = pending
        ? setTimeout(() => this.parser.finalize(), QUIET_MS)
        : null;
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (error: Error) => {
      this.tail += `\n${error.message}`;
    });
    child.on("close", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.parser.feed("\n");
      this.parser.finalize();
      const expected = this.stopping;
      this.stopping = false;
      this.on.exit({
        code,
        signal,
        tail: this.tail.trim().slice(-1500),
        expected,
      });
    });
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
        let bytes: Uint8Array | undefined;
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
  ): Promise<Uint8Array | undefined> {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (revision !== this.revision || this.stopping) return;
      const before = await stat(this.pdfPath).catch(() => null);
      if (before) {
        const bytes = new Uint8Array(await readFile(this.pdfPath));
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

  /** Stop the watch process (with its process group). */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    if (this.quiet) clearTimeout(this.quiet);
    this.revision++;
    const closed = new Promise<void>((done) =>
      child.once("close", () => done()),
    );
    killTree(child, "SIGTERM");
    const timer = setTimeout(() => killTree(child, "SIGKILL"), 2_000);
    await closed;
    clearTimeout(timer);
  }

  /** Synchronous teardown (process exit). */
  killNow(): void {
    if (this.child) killTree(this.child, "SIGKILL");
  }
}
