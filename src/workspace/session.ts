/**
 * One workspace's Typst workbench state: toolchain detection, main-file
 * choice, the `typst watch` lifecycle, preview snapshots, agent highlights,
 * source matching, and the settle algorithm `typst_check` relies on.
 * Ported from the ZCode typst-workbench server (0.2.0) `src/app/session.ts`,
 * adapted to this repository's error domain and framed as a plain class the
 * cordis service registers per workspace root (unit-testable without a
 * harness). Host half only.
 * @module dsh-typst/workspace/session
 */

import { createHash } from "node:crypto";
import {
  mkdir,
  lstat,
  open,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { SandboxExecutionPolicy } from "@deepseek-ai/dsh-sandbox";
import {
  workspaceWritableRoots,
  SandboxInvalidRootError,
} from "@deepseek-ai/dsh-sandbox";
import {
  LIMITS,
  SOURCE_BYTES_MAX,
  SOURCE_FILE_MAX_BYTES,
  SOURCE_FILES_MAX,
  INPUT_FILES_MAX,
} from "../constants.js";
import type {
  PreviewIdentity,
  DiagnosticView,
  HighlightView,
  PanelView,
  SetupView,
  SnapshotView,
  SourceRefView,
  StatusView,
  ToolchainView,
  TypstStateFrame,
} from "../contract.js";
import {
  INSTALL_HINT,
  TypstError,
  TYPST_INVALID_ARGUMENT,
  TYPST_MAIN_CHANGED,
  TYPST_MISSING,
  TYPST_NOT_FOUND,
  TYPST_NO_MAIN,
  TYPST_NO_PREVIEW,
  TYPST_PAGE_OUT_OF_RANGE,
  TYPST_PATH_OUTSIDE_WORKSPACE,
  TYPST_QUOTE_NOT_FOUND,
  TYPST_SANDBOX_INVALID_ROOT,
  TYPST_SANDBOX_READ_ONLY,
  TYPST_TIMEOUT,
  TYPST_TOO_OLD,
  TYPST_UNUSABLE,
  TYPST_WATCH_FAILED,
} from "../errors.js";
import { detectFacts, cargoSpec } from "../host/facts.js";
import { locateTypst, searchedDirs, type Toolchain } from "../typst/locate.js";
import { chooseMain, indexTypFiles } from "../typst/mainfile.js";
import { pageCount, extractPages, pdfjsDataDir } from "../typst/pdf-extract.js";
import {
  exportPdf,
  renderPages,
  type OneshotOptions,
} from "../typst/oneshot.js";
import {
  parsePages,
  findQuote,
  rectsFor,
  textAt,
  type PageText,
} from "../typst/text.js";
import {
  fuzzyFind,
  skeleton,
  lineStarts,
  lineRange,
  locateInSources,
} from "../typst/match.js";
import { Watcher } from "../typst/watcher.js";
import { makeBuildDir } from "../typst/owners.js";
import { ProcessRunner } from "../typst/process.js";
import type { SubprocessRuntime } from "@deepseek-ai/dsh-subprocess";
import type { ResolvedConfig } from "../config.js";
import { isWithin, resolveInside } from "./containment.js";
import { withFileLock, writeFileAtomic } from "@deepseek-ai/dsh-atomic-write";

export interface SessionOptions {
  workspaceRoot: string;
  /** The configured "Typst path" setting. */
  typstPath?: string;
  /** Live resolver for the volatile settings; preferred over the plain fields below. */
  resolveSettings?: () => ResolvedConfig;
  /** Configured extra font directories (`--font-path`). */
  fontPaths?: string[];
  /** Configured local package directory (`--package-path`). */
  packagePath?: string;
  /** Configured directory names skipped during discovery. */
  excludeDirs?: string[];
  /** Private plugin data directory (build artifacts, remembered mains). */
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
  /** The harness subprocess capability; all typst children go through it. */
  subprocess: SubprocessRuntime;
  log?: (message: string) => void;
}

export interface HighlightTarget {
  quote?: string;
  file?: string;
  line?: number;
  endLine?: number;
}

export interface HighlightCreated {
  highlight: HighlightView;
  exact: boolean;
}

/**
 * The real path of a file, or the path itself when it cannot be resolved.
 *
 * typst reports the paths it resolved, and a resolved path is the real one:
 * macOS's temporary directory is a symlink to /private/var, so the report and
 * the workspace root spell the same file two ways. Both sides are resolved
 * before they are compared.
 * @param path - the path to resolve.
 * @returns the real path, or the input when it does not exist.
 */
async function realish(path: string): Promise<string> {
  return realpath(path).catch(() => path);
}

export class WorkspaceSession {
  readonly workspaceRoot: string;
  private realRoot: string | null = null;
  private readonly log: (message: string) => void;
  private readonly env: NodeJS.ProcessEnv;
  private readonly process: ProcessRunner;
  private readonly options: SessionOptions;

  private listeners = new Set<() => void>();
  private stateVersion = 0;
  private toolchain: Toolchain = { state: "missing" };
  private main: string | null = null;
  private candidates: string[] = [];
  private candidatesAt = 0;
  private generation = 1;
  private compileToken = 0;
  private startingWatcher: Promise<void> | null = null;
  private previewError: string | null = null;
  private discovery = {
    scanning: false,
    includeExcluded: false,
    visited: 0,
    errors: [] as string[],
  };
  private indexing: AbortController | null = null;
  private indexingPromise: Promise<void> | null = null;
  private mainQueue: Promise<unknown> = Promise.resolve();
  /**
   * The candidates the current document includes, as typst's own dependency
   * report names them. Kept between compiles so the panel can list fragments
   * apart from documents before the first successful compile settles.
   */
  private fragments: string[] = [];
  private status: StatusView = { phase: "idle", run: 0 };
  private diagnostics: DiagnosticView[] = [];
  /** Full diagnostic count of the last round, before the frame cap. */
  private diagnosticsTotal = 0;
  private watcher: Watcher | null = null;
  private retiring: Watcher | null = null;
  private stopPromise: Promise<void> = Promise.resolve();
  private watcherStartedAt = 0;
  private buildDir: string | null = null;
  /** Cancellation handles for in-flight one-shot compiles. */
  private readonly liveOneshots = new Set<AbortController>();
  /** When the in-flight compile started; also when the last finished one started (check uses this). */
  private compilingSince: number | null = null;
  private finishedStartedAt = 0;
  private finishGeneration = 0;
  /** Monotonic count of finished compiles; lets settle notice a wake it missed. */
  private finishVersion = 0;
  /** Input signature the last completed compile consumed. */
  private compiledInputs: string | null = null;
  private finishWaiters = new Set<() => void>();
  private restartTimer: NodeJS.Timeout | null = null;
  private snapshots = new Map<
    number,
    { info: SnapshotView; bytes: Uint8Array<ArrayBuffer> }
  >();
  private current: SnapshotView | null = null;
  private seq = 0;
  private highlights: HighlightView[] = [];
  private highlightSeq = 0;
  private view: PanelView = null;
  private viewSeq = 0;
  private activation: Promise<void> | null = null;
  private activated = false;
  private closed = false;
  private pagesCache = new Map<number, PageText[]>();
  /** Per-compile excerpt cache: one read per file, keyed by mtime. */
  private excerptCache = new Map<
    string,
    { mtimeMs: number; lines: string[] }
  >();

  // Setup page: host facts, "handed to the agent", re-lookup while open.
  private facts: SetupView["facts"] = null;
  private factsPending: Promise<void> | null = null;
  private setupTimer: NodeJS.Timeout | null = null;
  private setupTicks = 0;
  private setupSubscribers = 0;
  private rechecking: Promise<void> | null = null;
  private recheckShell = false;

  constructor(options: SessionOptions) {
    this.options = options;
    this.workspaceRoot = resolve(options.workspaceRoot);
    this.log = options.log ?? (() => undefined);
    this.env = options.env ?? process.env;
    this.process = new ProcessRunner(options.subprocess);
  }

  /**
   * The plugin settings this session compiles with, read per request. The
   * settings page commits volatile values in place, so a long-lived session
   * sees a change without being rebuilt.
   */
  private settings(): ResolvedConfig {
    return (
      this.options.resolveSettings?.() ?? {
        typstPath: this.options.typstPath ?? "",
        fontPaths: this.options.fontPaths ?? [],
        packagePath: this.options.packagePath ?? "",
        excludeDirs: this.options.excludeDirs ?? [],
      }
    );
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Await state changes until `signal` aborts, yielding once per coalesced
   * burst (the watch stream's push side). Every yielded tick means "state
   * changed since the last frame"; the caller re-reads `state()`.
   */
  async *onChangeWaiter(signal: AbortSignal): AsyncIterable<symbol> {
    const queue: symbol[] = [];
    let wake: (() => void) | null = null;
    const off = this.onChange(() => {
      queue.push(Symbol("change"));
      wake?.();
      wake = null;
    });
    const abort = (): void => {
      wake?.();
      wake = null;
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      while (!signal.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((done) => {
            wake = done;
          });
        }
        if (signal.aborted) return;
        // Coalesce the burst: one frame per drain, not per emit.
        queue.length = 0;
        yield Symbol("change");
      }
    } finally {
      off();
      signal.removeEventListener("abort", abort);
    }
  }

  private emit(): void {
    this.stateVersion += 1;
    for (const listener of this.listeners) listener();
  }

  /** The full state frame the panel renders. */
  state(): TypstStateFrame {
    return {
      version: this.stateVersion,
      generation: this.generation,
      previewError: this.previewError,
      discovery: { ...this.discovery },
      toolchain: this.toolchainView(),
      workspace: basename(this.workspaceRoot),
      workspaceRoot: this.workspaceRoot,
      main: this.main,
      candidates: this.candidates,
      fragments: this.fragments,
      status: this.status,
      diagnostics: this.diagnostics,
      diagnosticsTotal: this.diagnosticsTotal,
      diagnosticsTruncated: this.diagnosticsTotal > this.diagnostics.length,
      snapshot: this.current,
      highlights: this.highlights,
      view: this.view,
      viewSeq: this.viewSeq,
      setup: {
        facts: this.facts,
        searched: searchedDirs(
          process.platform,
          this.env,
          this.env.HOME ?? this.env.USERPROFILE ?? "",
        ),
      },
    };
  }

  private toolchainView(): ToolchainView {
    const toolchain = this.toolchain;
    switch (toolchain.state) {
      case "ready":
        return {
          state: "ready",
          version: toolchain.version,
          path: toolchain.path,
          source: toolchain.source,
        };
      case "missing":
        return { state: "missing" };
      case "too_old":
        return {
          state: "too_old",
          version: toolchain.version,
          path: toolchain.path,
          source: toolchain.source,
          error: toolchain.error,
        };
      case "error":
        return {
          state: "error",
          path: toolchain.path,
          source: toolchain.source,
          error: toolchain.error,
        };
    }
  }

  /**
   * Whether this session has started, or is starting, its watch. A session
   * that never ran reads the new settings when its first request activates
   * it, so a settings commit must not activate one just to restart it.
   */
  get active(): boolean {
    return this.activation !== null;
  }

  // -------------------------------------------------------------------------
  // Startup: toolchain, main file, watch
  // -------------------------------------------------------------------------

  /** Started on the first tool call or panel subscription; a no-op afterwards. */
  activate(): Promise<void> {
    this.activation ??= (async () => {
      this.realRoot = await realpath(this.workspaceRoot).catch(
        () => this.workspaceRoot,
      );
      void this.detectFacts();
      await this.detectToolchain();
      await this.refreshCandidates(true);
      if (!this.main) this.main = await this.selectInitialMain();
      await this.startWatcher();
      this.activated = true;
      this.emit();
    })().catch((error) => {
      this.activation = null;
      throw error;
    });
    return this.activation;
  }

  /** Whether a located toolchain differs from the previously cached one. */
  private toolchainChanged(before: Toolchain, after: Toolchain): boolean {
    return (
      before.state !== after.state ||
      (before.state !== "missing" &&
        after.state !== "missing" &&
        before.path !== after.path) ||
      (before.state === "ready" &&
        after.state === "ready" &&
        before.version !== after.version)
    );
  }

  private async detectToolchain(shell = true): Promise<void> {
    const before = this.toolchain;
    this.toolchain = await locateTypst({
      setting: this.settings().typstPath,
      env: this.env,
      shell,
      process: this.process,
      cwd: this.workspaceRoot,
    });
    if (!this.toolchainChanged(before, this.toolchain)) return;
    if (this.toolchain.state === "ready") {
      this.log(
        `typst ${this.toolchain.version} at ${this.toolchain.path} (${this.toolchain.source})`,
      );
    } else {
      this.log(
        `typst not usable: ${this.toolchain.state} ${"error" in this.toolchain ? this.toolchain.error : ""}`,
      );
    }
  }

  /** Host facts are probed once (OS, arch, package managers do not change mid-session). */
  private detectFacts(force = false): Promise<void> {
    if (this.facts && !force) return Promise.resolve();
    this.factsPending ??= detectFacts([cargoSpec(this.env)])
      .then((facts) => {
        if (JSON.stringify(facts) === JSON.stringify(this.facts)) return;
        this.facts = facts;
        this.emit();
      })
      .catch((error) => this.log(`could not detect host facts: ${error}`))
      .finally(() => {
        this.factsPending = null;
      });
    return this.factsPending;
  }

  // -------------------------------------------------------------------------
  // Setup page: re-lookup, hand-off
  // -------------------------------------------------------------------------

  /**
   * Look Typst up again (the agent or the user just installed it). A usable
   * Typst rescans files and starts the preview. `shell: false` skips the
   * login shell (the panel's periodic recheck uses it to avoid spawning
   * shells frequently).
   */
  async recheck(shell = true): Promise<void> {
    if (this.rechecking !== null) {
      // A caller that needs the login-shell probe must not be dropped because
      // a shell-less panel recheck happened to be in flight.
      if (shell) this.recheckShell = true;
      await this.rechecking;
      return;
    }
    this.rechecking = this.runRecheck(shell).finally(() => {
      this.rechecking = null;
    });
    await this.rechecking;
    if (this.recheckShell) {
      this.recheckShell = false;
      await this.recheck(true);
    }
  }

  private async runRecheck(shell: boolean): Promise<void> {
    await this.activate();
    const before = this.toolchain;
    await this.detectToolchain(shell);
    if (!this.toolchainChanged(before, this.toolchain)) return;
    if (this.toolchain.state === "ready") {
      await this.stopWatcher();
      await this.refreshCandidates(true);
      if (!this.main) this.main = await this.selectInitialMain();
      await this.startWatcher();
    }
    this.emit();
  }

  /** While the panel subscribes and Typst is unusable, re-lookup every few seconds; the preview starts by itself once Typst runs. */
  watchSetup(enabled: boolean): void {
    this.setupSubscribers = Math.max(
      0,
      this.setupSubscribers + (enabled ? 1 : -1),
    );
    if (enabled && !this.setupTimer && !this.closed) {
      this.setupTicks = 0;
      this.setupTimer = setInterval(() => {
        if (this.toolchain.state === "ready" || this.rechecking) return;
        const shell = ++this.setupTicks % LIMITS.setupShellEvery === 0;
        if (shell) void this.detectFacts(true);
        void this.recheck(shell).catch((error) =>
          this.log(`recheck failed: ${error}`),
        );
      }, LIMITS.setupWatchMs);
      this.setupTimer.unref?.();
    } else if (!enabled && this.setupSubscribers === 0 && this.setupTimer) {
      clearInterval(this.setupTimer);
      this.setupTimer = null;
    }
  }

  /** Locate typst again, rescan files, and restart the watch (the panel's restart button). */
  async restart(): Promise<void> {
    await this.activate();
    await this.stopWatcher();
    await this.detectToolchain();
    await this.refreshCandidates(true);
    if (!this.main) this.main = await this.selectInitialMain();
    await this.startWatcher();
    this.emit();
  }

  /** Refresh complete discovery; indexed absence never proves the selected main disappeared. */
  async refreshCandidates(force = false): Promise<void> {
    if (!force && Date.now() - this.candidatesAt < 2_000) return;
    const mainAtStart = this.main;
    if (this.indexingPromise && this.indexing) await this.indexingPromise;
    else await this.discover(this.discovery.includeExcluded);
    if (mainAtStart && !(await this.validMain(mainAtStart))) {
      // A concurrent setMain may have chosen a different main while discovery
      // was in flight; never overwrite that choice with this refresh's view.
      if (this.main !== mainAtStart) return;
      await this.stopWatcher();
      this.candidates = this.candidates.filter((path) => path !== mainAtStart);
      this.main = chooseMain(this.candidates, null);
      this.resetPreview();
      await this.startWatcher();
    } else if (!this.main && this.activated) {
      this.main = await this.selectInitialMain();
      await this.startWatcher();
    }
    this.emit();
  }

  private async validMain(path: string): Promise<boolean> {
    try {
      return (await stat(await this.insideWorkspace(path))).isFile();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (
        code === "ENOENT" ||
        code === "ENOTDIR" ||
        code === TYPST_PATH_OUTSIDE_WORKSPACE
      )
        return false;
      // A transient stat failure must not silently discard the main file and
      // clear the preview; keep the choice and try again next refresh.
      this.log(`Could not inspect ${path}: ${String(error)}`);
      return true;
    }
  }

  private async selectInitialMain(): Promise<string | null> {
    const remembered = await this.remembered();
    return remembered && (await this.validMain(remembered))
      ? remembered
      : chooseMain(this.candidates, null);
  }

  async discover(
    includeExcluded: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    this.indexing?.abort();
    const controller = new AbortController();
    this.indexing = controller;
    const stopped = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    this.discovery = {
      scanning: true,
      includeExcluded,
      visited: 0,
      errors: [],
    };
    this.emit();
    const operation = (async () => {
      const found = new Set<string>();
      let lastEmit = 0;
      try {
        for await (const batch of indexTypFiles(
          this.workspaceRoot,
          includeExcluded,
          stopped,
          this.settings().excludeDirs,
        )) {
          if (this.closed || stopped.aborted || this.indexing !== controller)
            return;
          for (const file of batch.added) found.add(file);
          if (this.main) found.add(this.main);
          const now = Date.now();
          if (batch.done || now - lastEmit >= LIMITS.notifyMs) {
            lastEmit = now;
            this.candidates = [...found];
            this.discovery = {
              scanning: true,
              includeExcluded,
              visited: batch.visited,
              errors: batch.errors,
            };
            this.emit();
          }
        }
        this.candidates = [...found];
        this.candidatesAt = Date.now();
        this.emit();
      } catch (error) {
        // A newer discover supersedes this one; that is normal and must not
        // reject the caller (refreshCandidates, setMain, restart) with an
        // AbortError it did not cause.
        if (stopped.aborted || this.indexing !== controller) return;
        throw error;
      } finally {
        if (this.indexing === controller) {
          this.indexing = null;
          this.discovery = { ...this.discovery, scanning: false };
          this.emit();
        }
      }
    })();
    this.indexingPromise = operation;
    return operation;
  }

  private startWatcher(): Promise<void> {
    this.startingWatcher ??= this.performStartWatcher().finally(() => {
      this.startingWatcher = null;
    });
    return this.startingWatcher;
  }

  private async performStartWatcher(): Promise<void> {
    await this.stopPromise;
    if (
      this.closed ||
      this.watcher ||
      this.toolchain.state !== "ready" ||
      !this.main
    ) {
      if (!this.watcher) this.status = { phase: "idle", run: this.status.run };
      return;
    }
    if (!this.buildDir) this.buildDir = await this.makeBuildDir();
    if (
      this.closed ||
      this.watcher ||
      !this.main ||
      this.toolchain.state !== "ready"
    )
      return;
    const settings = this.settings();
    const fontPaths = await this.fontPaths(settings.fontPaths);
    const watcher = new Watcher(
      {
        typst: this.toolchain.path,
        version: this.toolchain.version,
        cwd: this.workspaceRoot,
        root: this.workspaceRoot,
        fontPaths,
        packagePath: settings.packagePath || undefined,
        main: this.main,
        buildDir: this.buildDir,
        process: this.process,
        env: this.env,
        toFile: (path) => this.displayPath(path),
        log: this.log,
      },
      {
        compiling: (startedAt) => {
          if (this.watcher !== watcher) return;
          this.compileToken++;
          this.compilingSince = startedAt;
          this.status = {
            ...this.status,
            phase: "compiling",
            error: undefined,
          };
          this.emit();
        },
        finished: async (result) => {
          if (this.watcher !== watcher) return;
          await this.finish(
            result.outcome,
            result.diagnostics,
            result.durationMs,
            result.bytes,
            result.previewError,
          );
        },
        fatal: (message) => {
          if (this.watcher !== watcher) return;
          void this.finish("error", [
            {
              severity: "error",
              message,
              location: null,
              hints: [],
              trace: [],
            },
          ]);
        },
        exit: ({ code, signal, tail, expected }) => {
          if (this.watcher !== watcher) return;
          this.watcher = null;
          if (expected || this.closed) return;
          this.log(
            `typst watch exited (code ${code}, signal ${signal}): ${tail}`,
          );
          this.status = {
            ...this.status,
            phase: "crashed",
            error:
              tail.split("\n").filter(Boolean).slice(-6).join("\n") ||
              `typst exited with code ${code}`,
          };
          this.wakeWaiters();
          this.emit();
          if (
            Date.now() - this.watcherStartedAt > 10_000 &&
            !this.restartTimer
          ) {
            this.restartTimer = setTimeout(() => {
              this.restartTimer = null;
              void this.startWatcher().then(() => this.emit());
            }, 1_000);
          }
        },
      },
    );
    this.watcher = watcher;
    this.watcherStartedAt = Date.now();
    this.compilingSince = null;
    this.status = { ...this.status, phase: "starting", error: undefined };
    try {
      watcher.start();
    } catch (error) {
      this.watcher = null;
      this.status = {
        ...this.status,
        phase: "crashed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private stopWatcher(): Promise<void> {
    const watcher = this.watcher;
    this.watcher = null;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.compileToken++;
    if (!watcher) return this.stopPromise;
    this.retiring = watcher;
    const done = watcher.stop().finally(() => {
      if (this.retiring === watcher) this.retiring = null;
    });
    this.stopPromise = done;
    return done;
  }

  private async makeBuildDir(): Promise<string> {
    return makeBuildDir(
      this.options.dataDir ?? join(tmpdir(), "dsh-typst"),
      this.log,
    );
  }

  private async finish(
    outcome: "ok" | "warnings" | "error",
    diagnostics: DiagnosticView[],
    durationMs?: number,
    bytes?: Uint8Array<ArrayBuffer>,
    previewFailure?: string,
  ): Promise<void> {
    const generation = this.generation;
    const token = this.compileToken;
    const startedAt = this.compilingSince ?? Date.now();
    const shown = diagnostics.slice(0, LIMITS.diagnostics);
    const diagnosticsWithExcerpts = await Promise.all(
      shown.map((entry) => this.withExcerpt(entry)),
    );
    if (
      generation !== this.generation ||
      token !== this.compileToken ||
      this.closed
    )
      return;
    const run = this.status.run + 1;
    if (outcome !== "error") {
      this.previewError = previewFailure ?? null;
      if (bytes) await this.addSnapshot(bytes, generation, token, run);
      else
        this.previewError ??=
          "Typst did not produce preview bytes. Retry the preview.";
    }
    if (
      generation !== this.generation ||
      token !== this.compileToken ||
      this.closed
    )
      return;
    this.finishedStartedAt = startedAt;
    this.finishGeneration = generation;
    this.compiledInputs = (await this.inputsModifiedAt()).signature;
    this.compilingSince = null;
    this.diagnostics = diagnosticsWithExcerpts;
    this.diagnosticsTotal = diagnostics.length;
    this.status = {
      phase: outcome,
      run: this.status.run + 1,
      durationMs,
      finishedAt: Date.now(),
    };
    // The fragment set belongs to the state a waiter reads, so it is settled
    // before the waiters wake: a caller that waits for the compile must see
    // the document's fragments in the frame it gets.
    if (outcome !== "error") await this.refreshFragments(generation, token);
    if (
      generation !== this.generation ||
      token !== this.compileToken ||
      this.closed
    )
      return;
    // With no highlights there is nothing to extract: wake immediately. With
    // highlights, the relocated identities are part of the state a waiter
    // reads, so finish that before waking.
    if (this.current && this.highlights.length > 0) {
      await this.relocateHighlights(this.current.seq);
      if (
        generation !== this.generation ||
        token !== this.compileToken ||
        this.closed
      )
        return;
    }
    this.wakeWaiters();
    this.finishVersion++;
    this.emit();
    void this.refreshCandidates().catch((error) =>
      this.log(`Discovery failed: ${String(error)}`),
    );
  }

  /**
   * Recompute the fragment set from typst's dependency report.
   *
   * typst names every file it loaded for the current root, so the candidates
   * among them other than the main file are exactly the fragments the
   * document pulls in. The report is empty until the first successful
   * compile, and the previous set is kept rather than emptied, so the panel
   * does not lose the distinction mid-session.
   */
  private async refreshFragments(
    generation: number,
    token: number,
  ): Promise<void> {
    const deps = (await this.watcher?.deps().catch(() => [])) ?? [];
    if (deps.length === 0) return;
    // typst reports the paths it resolved, and a resolved path is the real
    // one: both sides are resolved before they are compared.
    const loaded = new Set(
      await Promise.all(deps.map((path) => realish(path))),
    );
    const fragments: string[] = [];
    for (const candidate of this.candidates) {
      if (candidate === this.main) continue;
      const absolute = resolve(this.workspaceRoot, candidate);
      if (loaded.has(await realish(absolute))) fragments.push(candidate);
    }
    if (
      generation !== this.generation ||
      token !== this.compileToken ||
      this.closed ||
      fragments.join("\n") === this.fragments.join("\n")
    )
      return;
    this.fragments = fragments;
    this.emit();
  }

  private wakeWaiters(): void {
    for (const wake of this.finishWaiters) wake();
  }

  private waitForFinish(ms: number, signal?: AbortSignal): Promise<boolean> {
    return new Promise((done) => {
      let settled = false;
      let timer: NodeJS.Timeout;
      const finish = (value: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.finishWaiters.delete(wake);
        signal?.removeEventListener("abort", onAbort);
        done(value);
      };
      const wake = (): void => finish(true);
      const onAbort = (): void => finish(false);
      timer = setTimeout(() => finish(false), ms);
      timer.unref?.();
      this.finishWaiters.add(wake);
      if (signal !== undefined) {
        if (signal.aborted) finish(false);
        else signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  private resetPreview(): void {
    this.generation++;
    this.compileToken++;
    this.finishGeneration = 0;
    this.compiledInputs = null;
    this.previewError = null;
    this.snapshots.clear();
    this.pagesCache.clear();
    this.excerptCache.clear();
    this.current = null;
    this.diagnostics = [];
    this.diagnosticsTotal = 0;
    this.highlights = [];
    this.fragments = [];
    this.view = null;
    this.status = { phase: "idle", run: this.status.run };
  }

  // -------------------------------------------------------------------------
  // Main file
  // -------------------------------------------------------------------------

  private get mainsFile(): string | null {
    return this.options.dataDir
      ? join(this.options.dataDir, "main-files.json")
      : null;
  }

  private async remembered(): Promise<string | null> {
    const file = this.mainsFile;
    if (!file) return null;
    try {
      const saved: unknown = JSON.parse(await readFile(file, "utf8"));
      if (typeof saved === "object" && saved !== null) {
        const value = (saved as Record<string, unknown>)[
          this.realRoot ?? this.workspaceRoot
        ];
        return typeof value === "string" ? value : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async remember(main: string): Promise<void> {
    const file = this.mainsFile;
    if (!file) return;
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await withFileLock(
      file,
      async () => {
        let saved: Record<string, string> = {};
        try {
          const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
          if (typeof parsed === "object" && parsed !== null)
            saved = parsed as Record<string, string>;
        } catch {
          // First save.
        }
        saved[this.realRoot ?? this.workspaceRoot] = main;
        await writeFileAtomic(file, JSON.stringify(saved, null, 2), {
          mode: 0o600,
          dirMode: 0o700,
        });
      },
      { waitMs: 2_000 },
    );
  }

  setMain(path: string): Promise<string> {
    const operation = this.mainQueue.then(() => this.selectMain(path));
    this.mainQueue = operation.catch(() => undefined);
    return operation;
  }

  private async selectMain(path: string): Promise<string> {
    await this.activate();
    const absolute = await this.insideWorkspace(path);
    if (extname(absolute) !== ".typ") {
      throw new TypstError(
        `${path} is not a .typ file.`,
        TYPST_INVALID_ARGUMENT,
      );
    }
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile())
      throw new TypstError(`${path} does not exist.`, TYPST_NOT_FOUND);
    const main = this.relativePath(absolute);
    await this.refreshCandidates(true);
    if (!this.candidates.includes(main))
      this.candidates = [...this.candidates, main];
    if (main !== this.main || !this.watcher) {
      await this.stopWatcher();
      this.main = main;
      // The fragment set belongs to the root that reported it; a new root
      // has to compile before the panel can tell its fragments again.
      this.fragments = [];
      this.resetPreview();
      await this.startWatcher();
    }
    await this.remember(main).catch((error) =>
      this.log(`could not remember the main file: ${error}`),
    );
    this.emit();
    return main;
  }

  // -------------------------------------------------------------------------
  // Check: wait until the latest changes have compiled
  // -------------------------------------------------------------------------

  /** Both the toolchain and the main file are ready, or a telling error is thrown. */
  requireReady(): void {
    const toolchain = this.toolchain;
    if (toolchain.state === "missing") {
      throw new TypstError(
        `Typst was not found on this computer. ${INSTALL_HINT}`,
        TYPST_MISSING,
      );
    }
    if (toolchain.state === "too_old") {
      throw new TypstError(
        `${toolchain.error} Update Typst (${toolchain.path}).`,
        TYPST_TOO_OLD,
      );
    }
    if (toolchain.state !== "ready") {
      throw new TypstError(
        "error" in toolchain ? toolchain.error : "Typst is not available.",
        TYPST_UNUSABLE,
      );
    }
    if (!this.main) {
      throw new TypstError(
        this.candidates.length
          ? `Choose the main file with typst_set_main. .typ files in the workspace: ${this.candidates.slice(0, 20).join(", ")}${this.candidates.length > 20 ? ", …" : ""}.`
          : "There are no .typ files in the workspace yet. Create one (for example main.typ), then call typst_set_main or typst_check.",
        TYPST_NO_MAIN,
      );
    }
  }

  /**
   * Newest modification and a stable signature over the input files (typst's
   * deps; else the main file and the workspace's .typ files). The signature
   * includes size and mtime, so a rolled-back mtime or a same-mtime rewrite is
   * still detected as a different input set.
   */
  private async inputsModifiedAt(): Promise<{
    max: number;
    future: boolean;
    signature: string;
  }> {
    let files = (await this.watcher?.deps()) ?? [];
    if (!files.length) {
      files = [this.main, ...this.candidates]
        .filter((path): path is string => typeof path === "string")
        .map((path) => resolve(this.workspaceRoot, path));
    }
    let latest = 0;
    const parts: string[] = [];
    await Promise.all(
      files.slice(0, INPUT_FILES_MAX).map(async (file) => {
        const info = await stat(file).catch(() => null);
        if (!info) {
          parts.push(`${file}:missing`);
          return;
        }
        latest = Math.max(latest, info.mtimeMs);
        parts.push(`${file}:${info.mtimeMs}:${info.size}`);
      }),
    );
    parts.sort();
    return {
      max: latest,
      future: latest > Date.now() + 1_000,
      signature: parts.join("\n"),
    };
  }

  /** Wait until every change already on disk has compiled (restart the watch when it missed changes). */
  async settle(
    timeoutMs: number = LIMITS.checkTimeoutMs,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.activate();
    if (this.closed) {
      throw new TypstError(
        "The workspace session is closed.",
        TYPST_WATCH_FAILED,
      );
    }
    if (!this.main) await this.refreshCandidates(true);
    this.requireReady();
    const deadline = Date.now() + timeoutMs;
    let restarted = false;
    for (;;) {
      signal?.throwIfAborted();
      if (this.closed) {
        throw new TypstError(
          "The workspace session is closed.",
          TYPST_WATCH_FAILED,
        );
      }
      if (!this.watcher) {
        if (restarted) {
          throw new TypstError(
            `typst watch stopped: ${this.status.error ?? "unknown error"}`,
            TYPST_WATCH_FAILED,
          );
        }
        restarted = true;
        await this.startWatcher();
        this.emit();
        if (!this.watcher) {
          throw new TypstError(
            this.status.error ?? "typst watch could not start.",
            TYPST_WATCH_FAILED,
          );
        }
        continue;
      }
      const version = this.finishVersion;
      const busy =
        this.status.phase === "starting" || this.status.phase === "compiling";
      const inputs = await this.inputsModifiedAt();
      // A compile may finish while the input signatures are being read; its
      // wake happened before the waiter below exists, so re-evaluate instead.
      if (this.finishVersion !== version) continue;
      if (
        !busy &&
        this.status.run > 0 &&
        this.finishGeneration === this.generation &&
        this.compiledInputs !== null &&
        this.compiledInputs === inputs.signature
      )
        return;
      if (
        !busy &&
        this.status.run > 0 &&
        this.finishGeneration === this.generation &&
        this.compiledInputs === null &&
        !inputs.future &&
        this.finishedStartedAt >= inputs.max
      )
        return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new TypstError(
          `Typst did not finish compiling within ${Math.round(timeoutMs / 1e3)} s. The document may be very large or stuck in a loop.`,
          TYPST_TIMEOUT,
        );
      }
      const finished = await this.waitForFinish(
        busy ? remaining : Math.min(remaining, LIMITS.settleMs),
        signal,
      );
      signal?.throwIfAborted();
      if (!finished && !busy && !restarted) {
        this.log(
          "typst watch did not pick up the latest changes; restarting it",
        );
        restarted = true;
        await this.stopWatcher();
        await this.startWatcher();
        this.emit();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Snapshots
  // -------------------------------------------------------------------------

  private async addSnapshot(
    bytes: Uint8Array<ArrayBuffer>,
    generation: number,
    token: number,
    run: number,
  ): Promise<void> {
    if (bytes.length > LIMITS.pdfBytes) {
      this.previewError = `Preview PDF exceeds ${LIMITS.pdfBytes} bytes (${bytes.length}).`;
      return;
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    let pages: number;
    try {
      pages =
        this.current?.sha256 === sha256
          ? this.current.pages
          : await pageCount(bytes);
    } catch (error) {
      this.previewError = `Could not read the preview PDF: ${String(error)}`;
      return;
    }
    if (
      generation !== this.generation ||
      token !== this.compileToken ||
      !this.main
    )
      return;
    const info: SnapshotView = {
      generation,
      main: this.main,
      run,
      seq: ++this.seq,
      bytes: bytes.length,
      pages,
      sha256,
      createdAt: Date.now(),
    };
    this.snapshots.set(info.seq, { info, bytes });
    const retainedBytes = (): number => {
      let total = 0;
      for (const snapshot of this.snapshots.values())
        total += snapshot.bytes.length;
      return total;
    };
    while (
      this.snapshots.size > LIMITS.snapshots ||
      retainedBytes() > LIMITS.snapshotBytes
    ) {
      if (this.snapshots.size <= 1) break;
      const oldest = this.snapshots.keys().next().value;
      if (oldest === undefined) break;
      this.snapshots.delete(oldest);
      this.pagesCache.delete(oldest);
    }
    this.current = info;
  }

  /** Read precisely the requested retained artifact, never silently substitute the latest. */
  previewBytes(identity: PreviewIdentity): {
    info: SnapshotView;
    bytes: Uint8Array<ArrayBuffer>;
  } {
    const snapshot = this.snapshots.get(identity.seq);
    if (
      !snapshot ||
      snapshot.info.generation !== identity.generation ||
      snapshot.info.sha256 !== identity.sha256
    ) {
      throw new TypstError(
        "The requested preview expired or belongs to another main file. Refresh the preview.",
        TYPST_NOT_FOUND,
      );
    }
    return snapshot;
  }

  private async pagesOf(seq: number): Promise<PageText[]> {
    const cached = this.pagesCache.get(seq);
    if (cached) return cached;
    const snapshot = this.snapshots.get(seq);
    if (!snapshot)
      throw new TypstError(
        `Preview ${seq} is no longer available.`,
        TYPST_NOT_FOUND,
      );
    const pages = await extractPages(snapshot.bytes, pdfjsDataDir());
    this.pagesCache.set(seq, pages);
    return pages;
  }

  /** A preview is required (something compiled successfully). */
  private requireSnapshot(): SnapshotView {
    if (!this.current) {
      throw new TypstError(
        this.status.phase === "error"
          ? "The document has not compiled successfully yet; fix the errors first (see typst_check)."
          : "There is no preview yet.",
        TYPST_NO_PREVIEW,
      );
    }
    return this.current;
  }

  // -------------------------------------------------------------------------
  // Panel view and highlights
  // -------------------------------------------------------------------------

  showPage(pageIndex: number): void {
    const snapshot = this.requireSnapshot();
    if (
      !Number.isInteger(pageIndex) ||
      pageIndex < 0 ||
      pageIndex >= snapshot.pages
    ) {
      throw new TypstError(
        `The document has ${snapshot.pages} page(s).`,
        TYPST_INVALID_ARGUMENT,
      );
    }
    this.view = {
      kind: "page",
      pageIndex,
      identity: {
        generation: snapshot.generation,
        seq: snapshot.seq,
        sha256: snapshot.sha256,
      },
    };
    this.viewSeq += 1;
    this.emit();
  }

  /**
   * When a highlight is created from source lines, count how many times the
   * same rendered passage occurred before the recorded range. Typst emits
   * repeated text in document order, so that ordinal disambiguates identical
   * quotes on the same page.
   */
  private async occurrenceForSource(
    text: string,
    source: SourceRefView,
  ): Promise<number> {
    const files = await this.sourceFiles().catch(() => []);
    const file = files.find((entry) => entry.path === source.file);
    if (!file) return 0;
    const starts = lineStarts(file.text);
    const before = file.text.slice(0, starts[source.line - 1] ?? 0);
    const folded = (value: string): string =>
      value.replace(/\s+/g, " ").trim().toLowerCase();
    const needle = folded(text);
    if (!needle) return 0;
    const haystack = folded(before);
    let ordinal = 0;
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) return ordinal;
      ordinal++;
      from = at + needle.length;
    }
  }

  /** Find text in the preview: quote matching first (tolerant of whitespace, quotes, line breaks), then skeleton approximation. */
  private findText(
    pages: PageText[],
    text: string,
    preferredPage?: number,
    from?: number,
    occurrence?: number,
  ): { pageIndex: number; start: number; end: number; score: number } | null {
    const exact = findQuote(pages, text, preferredPage, from, occurrence);
    if (exact)
      return {
        pageIndex: exact.pageIndex,
        start: exact.start,
        end: exact.end,
        score: 1,
      };
    let best: {
      pageIndex: number;
      start: number;
      end: number;
      score: number;
    } | null = null;
    for (const page of pages) {
      const [hit] = fuzzyFind(text, skeleton(page.text), { max: 1 });
      if (
        hit &&
        (!best ||
          hit.score > best.score + 0.05 ||
          (preferredPage === page.index && hit.score >= best.score - 0.05))
      ) {
        best = { pageIndex: page.index, ...hit };
      }
    }
    return best;
  }

  async highlight(
    target: HighlightTarget,
    comment = "",
  ): Promise<HighlightCreated> {
    const snapshot = this.requireSnapshot();
    const pages = await this.pagesOf(snapshot.seq);
    let text: string;
    let source: HighlightView["source"];
    if (target.quote) {
      text = target.quote;
    } else if (target.file && target.line) {
      if (extname(target.file).toLowerCase() !== ".typ") {
        throw new TypstError(
          `${target.file} is not a .typ file.`,
          TYPST_INVALID_ARGUMENT,
        );
      }
      const absolute = await this.insideWorkspace(target.file);
      const handle = await open(absolute, "r").catch(() => {
        throw new TypstError(`${target.file} does not exist.`, TYPST_NOT_FOUND);
      });
      let content: string;
      try {
        const info = await handle.stat();
        if (!info.isFile()) {
          throw new TypstError(
            `${target.file} is not a regular file.`,
            TYPST_INVALID_ARGUMENT,
          );
        }
        if (info.size > SOURCE_FILE_MAX_BYTES) {
          throw new TypstError(
            `${target.file} is too large to inspect (${info.size} bytes).`,
            TYPST_INVALID_ARGUMENT,
          );
        }
        content = await handle.readFile("utf8");
      } finally {
        await handle.close();
      }
      const starts = lineStarts(content);
      const endLine = Math.max(target.line, target.endLine ?? target.line);
      if (target.line > starts.length) {
        throw new TypstError(
          `${target.file} has ${starts.length} lines.`,
          TYPST_INVALID_ARGUMENT,
        );
      }
      const range = lineRange(content, starts, target.line, endLine);
      text = content.slice(range.start, range.end);
      source = {
        file: this.relativePath(absolute),
        line: target.line,
        endLine: Math.min(endLine, starts.length),
      };
    } else {
      throw new TypstError(
        "Give a quote, or a file and line.",
        TYPST_INVALID_ARGUMENT,
      );
    }
    if (
      this.closed ||
      snapshot.generation !== this.generation ||
      snapshot.seq !== this.current?.seq
    )
      throw new TypstError(
        "The preview changed while locating the quote. Run typst_check and try again.",
        TYPST_NOT_FOUND,
      );
    const occurrence = source
      ? await this.occurrenceForSource(text, source)
      : undefined;
    const found = this.findText(pages, text, undefined, undefined, occurrence);
    if (!found) {
      throw new TypstError(
        source
          ? `No text from ${source.file}:${source.line}${source.endLine !== source.line ? `\u2013${source.endLine}` : ""} was found in the preview. The lines may contain only markup or code, or the preview may be out of date (run typst_check).`
          : "The quote was not found in the preview. Copy the words as they appear in the rendered document (markup is ignored), or point at source lines with file and line.",
        TYPST_QUOTE_NOT_FOUND,
      );
    }
    const page = pages[found.pageIndex];
    const highlight: HighlightView = {
      id: `h${++this.highlightSeq}`,
      quote: textAt(page, found.start, found.end),
      comment,
      ...(source ? { source } : {}),
      identity: {
        generation: snapshot.generation,
        seq: snapshot.seq,
        sha256: snapshot.sha256,
      },
      seq: snapshot.seq,
      pageIndex: found.pageIndex,
      startOffset: found.start,
      ...(occurrence === undefined ? {} : { occurrence }),
      rects: rectsFor(page, found.start, found.end),
      stale: false,
      createdAt: Date.now(),
    };
    this.highlights.push(highlight);
    this.view = {
      kind: "highlight",
      id: highlight.id,
      identity: highlight.identity,
    };
    this.viewSeq += 1;
    this.emit();
    return { highlight, exact: found.score === 1 };
  }

  /** After a new snapshot, relocate highlights; unmatched annotations remain visible as stale. */
  private async relocateHighlights(seq: number): Promise<void> {
    let pages: PageText[];
    try {
      pages = await this.pagesOf(seq);
    } catch {
      return;
    }
    if (this.current?.seq !== seq) return;
    this.highlights = this.highlights.map((highlight) => {
      const from = highlight.startOffset;
      const occurrence = highlight.occurrence;
      const found =
        this.findText(
          pages,
          highlight.quote,
          highlight.pageIndex,
          from,
          occurrence,
        ) ??
        (from === undefined
          ? null
          : this.findText(pages, highlight.quote, highlight.pageIndex));
      if (!found) return { ...highlight, stale: true, rects: [] };
      const page = pages[found.pageIndex];
      return {
        ...highlight,
        identity: {
          generation: this.current!.generation,
          seq,
          sha256: this.current!.sha256,
        },
        seq,
        stale: false,
        pageIndex: found.pageIndex,
        startOffset: found.start,
        ...(highlight.occurrence === undefined
          ? {}
          : { occurrence: highlight.occurrence }),
        rects: rectsFor(page, found.start, found.end),
      };
    });
    const activeView = this.view;
    if (activeView?.kind === "highlight") {
      const current = this.highlights.find(
        (entry) => entry.id === activeView.id,
      );
      if (current !== undefined) {
        this.view = { ...activeView, identity: current.identity };
      }
    }
    this.emit();
  }

  clearHighlights(ids?: string[]): number {
    const before = this.highlights.length;
    this.highlights = ids?.length
      ? this.highlights.filter((entry) => !ids.includes(entry.id))
      : [];
    const view = this.view;
    if (
      view?.kind === "highlight" &&
      !this.highlights.some((entry) => entry.id === view.id)
    ) {
      this.view = null;
    }
    this.emit();
    return before - this.highlights.length;
  }

  // -------------------------------------------------------------------------
  // Rendered text → source
  // -------------------------------------------------------------------------

  /** The project's source files: workspace `.typ` files among typst's reported deps; all candidates when deps are missing. */
  async sourceFiles(
    signal?: AbortSignal,
  ): Promise<{ path: string; text: string }[]> {
    const deps = ((await this.watcher?.deps()) ?? []).filter((file) =>
      file.endsWith(".typ"),
    );
    const paths = deps.length
      ? deps
      : this.candidates.map((path) => resolve(this.workspaceRoot, path));
    const root = this.realRoot ?? this.workspaceRoot;
    const files: { path: string; text: string }[] = [];
    let bytes = 0;
    for (const absolute of paths) {
      signal?.throwIfAborted();
      if (files.length >= SOURCE_FILES_MAX || bytes > SOURCE_BYTES_MAX) break;
      const real = await realish(absolute);
      if (!isWithin(root, real)) continue;
      const rel = relative(root, real);
      const info = await stat(real).catch(() => null);
      if (!info?.isFile() || info.size > SOURCE_FILE_MAX_BYTES) continue;
      const text = await readFile(real, "utf8");
      if (bytes + text.length > SOURCE_BYTES_MAX) break;
      bytes += text.length;
      files.push({ path: rel.split(sep).join("/"), text });
    }
    return files.sort(
      (a, b) => Number(b.path === this.main) - Number(a.path === this.main),
    );
  }

  async locateSource(
    text: string,
    focus?: string,
    signal?: AbortSignal,
  ): Promise<ReturnType<typeof locateInSources>> {
    await this.activate();
    return locateInSources(await this.sourceFiles(signal), text, focus, 3, {
      ...(signal === undefined ? {} : { signal }),
      maxBytes: SOURCE_BYTES_MAX,
    });
  }

  /**
   * Font directories passed to Typst via `--font-path`: the workspace's
   * conventional `fonts/` and `assets/fonts/` first, then the configured
   * directories. Project fonts therefore win on a family clash, and a
   * configured directory typst cannot read is left for typst to ignore.
   * @param configured - font directories from the current settings snapshot.
   * @returns the ordered `--font-path` directories.
   */
  private async fontPaths(configured: readonly string[]): Promise<string[]> {
    const candidates = [
      join(this.workspaceRoot, "fonts"),
      join(this.workspaceRoot, "assets", "fonts"),
    ];
    const resolved: string[] = [];
    for (const dir of candidates) {
      const s = await stat(dir).catch(() => null);
      if (s?.isDirectory()) resolved.push(dir);
    }
    const seen = new Set(resolved);
    for (const dir of configured) {
      if (seen.has(dir)) continue;
      seen.add(dir);
      resolved.push(dir);
    }
    return resolved;
  }

  // -------------------------------------------------------------------------
  // One-shot compiles: render images, export
  // -------------------------------------------------------------------------

  private async oneshot(signal?: AbortSignal): Promise<OneshotOptions> {
    this.requireReady();
    const settings = this.settings();
    const fontPaths = await this.fontPaths(settings.fontPaths);
    return {
      typst: (this.toolchain as { state: "ready"; path: string }).path,
      cwd: this.workspaceRoot,
      root: this.workspaceRoot,
      fontPaths,
      packagePath: settings.packagePath || undefined,
      main: this.main as string,
      process: this.process,
      env: this.env,
      ...(signal === undefined ? {} : { signal }),
      scratch: this.buildDir ?? (this.buildDir = await this.makeBuildDir()),
      toFile: (path) => this.displayPath(path),
    };
  }

  /** Track one one-shot compile so close/killNow can abort it. */
  private async withOneshot<T>(
    signal: AbortSignal | undefined,
    body: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const fused =
      signal === undefined
        ? controller.signal
        : AbortSignal.any([signal, controller.signal]);
    this.liveOneshots.add(controller);
    try {
      return await body(fused);
    } finally {
      this.liveOneshots.delete(controller);
    }
  }

  async renderPages(
    spec: string,
    ppi: number,
    signal?: AbortSignal,
  ): Promise<{
    ok: boolean;
    diagnostics: DiagnosticView[];
    images: { page: number; png: Uint8Array }[];
    pages: number[];
    total: number | undefined;
  }> {
    await this.activate();
    const mainAtStart = this.main;
    const generationAtStart = this.generation;
    const options = await this.oneshot(signal);
    if (this.main !== mainAtStart || this.generation !== generationAtStart) {
      throw new TypstError(
        "The main file changed while preparing the render; call typst_render_pages again.",
        TYPST_MAIN_CHANGED,
      );
    }
    const settled = await this.settle(LIMITS.checkTimeoutMs, signal)
      .then(() => true)
      .catch(() => false);
    // A failed settle leaves the last snapshot in place; its page count is
    // stale, so do not use it to reject a page the new document may have.
    const total = settled ? this.current?.pages : undefined;
    let pages: number[];
    try {
      pages = parsePages(spec, total ?? 10_000).map((index) => index + 1);
    } catch (error) {
      throw new TypstError(
        error instanceof Error ? error.message : String(error),
        TYPST_INVALID_ARGUMENT,
      );
    }
    if (!pages.length) {
      throw new TypstError(
        total ? `The document has ${total} page(s).` : "No pages selected.",
        TYPST_INVALID_ARGUMENT,
      );
    }
    if (pages.length > LIMITS.renderPages) {
      throw new TypstError(
        `Render at most ${LIMITS.renderPages} pages at a time.`,
        TYPST_INVALID_ARGUMENT,
      );
    }
    const result = await this.withOneshot(signal, (fused) =>
      renderPages({ ...options, signal: fused }, pages, ppi),
    );
    const diagnostics = await Promise.all(
      result.diagnostics
        .slice(0, LIMITS.diagnostics)
        .map((entry) => this.withExcerpt(entry)),
    );
    return { ...result, diagnostics, pages, total };
  }

  async exportPdf(
    path: string,
    extra: { pdfStandard?: string; pages?: string },
    signal?: AbortSignal,
    policy?: SandboxExecutionPolicy,
  ): Promise<{
    ok: boolean;
    diagnostics: DiagnosticView[];
    path: string;
    bytes?: number;
    pages?: number;
  }> {
    await this.activate();
    const mainAtStart = this.main;
    const generationAtStart = this.generation;
    const absolute = await this.insideWorkspace(path);
    if (extname(absolute).toLowerCase() !== ".pdf") {
      throw new TypstError(
        "The output path must end in .pdf.",
        TYPST_INVALID_ARGUMENT,
      );
    }
    if (policy !== undefined) {
      if (policy.mode === "read-only") {
        throw new TypstError(
          "The session is read-only; exporting a PDF would write to the workspace.",
          TYPST_SANDBOX_READ_ONLY,
        );
      }
      if (policy.mode === "workspace-write") {
        let roots: string[];
        try {
          roots = workspaceWritableRoots(policy);
        } catch (error) {
          if (error instanceof SandboxInvalidRootError) {
            throw new TypstError(error.message, TYPST_SANDBOX_INVALID_ROOT, {
              cause: error,
            });
          }
          throw error;
        }
        if (!roots.some((root) => isWithin(root, absolute))) {
          throw new TypstError(
            "The output path is outside the session's writable roots.",
            TYPST_PATH_OUTSIDE_WORKSPACE,
          );
        }
      }
    }
    const existing = await lstat(absolute).catch(() => null);
    if (existing?.isSymbolicLink()) {
      throw new TypstError(
        "The output path is a symbolic link; choose a regular .pdf path.",
        TYPST_PATH_OUTSIDE_WORKSPACE,
      );
    }
    if (existing?.isDirectory()) {
      throw new TypstError(
        "The output path is a directory.",
        TYPST_INVALID_ARGUMENT,
      );
    }
    const settled = await this.settle(LIMITS.checkTimeoutMs, signal)
      .then(() => true)
      .catch(() => false);
    const total = settled ? this.current?.pages : undefined;
    if (typeof extra.pages === "string" && extra.pages.trim().length > 0) {
      let selected: number[];
      try {
        selected = parsePages(extra.pages, 10_000);
      } catch (error) {
        throw new TypstError(
          error instanceof Error ? error.message : String(error),
          TYPST_INVALID_ARGUMENT,
        );
      }
      if (selected.length === 0) {
        throw new TypstError("No pages selected.", TYPST_INVALID_ARGUMENT);
      }
      if (total !== undefined && selected.some((page) => page >= total)) {
        throw new TypstError(
          `The document has ${total} page(s); the page selection is out of range.`,
          TYPST_PAGE_OUT_OF_RANGE,
        );
      }
    }
    const options = await this.oneshot(signal);
    if (this.main !== mainAtStart || this.generation !== generationAtStart) {
      throw new TypstError(
        "The main file changed while preparing the export; call typst_export_pdf again.",
        TYPST_MAIN_CHANGED,
      );
    }
    await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
    const result = await this.withOneshot(signal, (fused) =>
      exportPdf({ ...options, signal: fused }, absolute, extra),
    );
    const diagnostics = await Promise.all(
      result.diagnostics
        .slice(0, LIMITS.diagnostics)
        .map((entry) => this.withExcerpt(entry)),
    );
    if (!result.ok)
      return { ...result, diagnostics, path: this.relativePath(absolute) };
    const bytes = new Uint8Array(await readFile(absolute));
    return {
      ...result,
      diagnostics,
      path: this.relativePath(absolute),
      bytes: bytes.length,
      pages: await pageCount(bytes).catch(() => undefined),
    };
  }

  // -------------------------------------------------------------------------
  // Paths
  // -------------------------------------------------------------------------

  /** Workspace-relative path (/ separated), against the canonical root. */
  relativePath(absolute: string): string {
    return relative(this.realRoot ?? this.workspaceRoot, absolute)
      .split(sep)
      .join("/");
  }

  /** A path as typst printed it (relative to the workspace root, or absolute) → display path. */
  displayPath(path: string): string {
    if (!isAbsolute(path)) return path.split(sep).join("/");
    for (const root of [this.workspaceRoot, this.realRoot]) {
      if (!root) continue;
      const rel = relative(root, path);
      if (!rel.startsWith("..") && !isAbsolute(rel))
        return rel.split(sep).join("/");
    }
    return path;
  }

  /** Resolve a path inside the workspace (through symlinks); refuse escapes. */
  async insideWorkspace(path: string): Promise<string> {
    if (!path || path.includes("\0")) {
      throw new TypstError("Empty path.", TYPST_INVALID_ARGUMENT);
    }
    const root =
      this.realRoot ??
      (await realpath(this.workspaceRoot).catch(() => this.workspaceRoot));
    try {
      return await resolveInside(root, resolve(this.workspaceRoot, path));
    } catch {
      throw new TypstError(
        `${path} is outside the workspace.`,
        TYPST_PATH_OUTSIDE_WORKSPACE,
      );
    }
  }

  /** The erroring line of a workspace file. */
  private async withExcerpt(
    diagnostic: DiagnosticView,
  ): Promise<DiagnosticView> {
    const location = diagnostic.location;
    if (!location || location.file.startsWith("@") || isAbsolute(location.file))
      return diagnostic;
    try {
      const file = resolve(this.workspaceRoot, location.file);
      const info = await stat(file);
      let cached = this.excerptCache.get(file);
      if (cached === undefined || cached.mtimeMs !== info.mtimeMs) {
        cached = {
          mtimeMs: info.mtimeMs,
          lines: (await readFile(file, "utf8")).split("\n"),
        };
        this.excerptCache.set(file, cached);
      }
      const line = cached.lines[location.line - 1];
      return line === undefined
        ? diagnostic
        : { ...diagnostic, excerpt: line.replace(/\s+$/, "").slice(0, 300) };
    } catch {
      return diagnostic;
    }
  }

  // -------------------------------------------------------------------------
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.indexing?.abort();
    this.setupSubscribers = 0;
    this.watchSetup(false);
    for (const oneshot of this.liveOneshots) oneshot.abort();
    this.liveOneshots.clear();
    this.wakeWaiters();
    await this.stopWatcher();
    this.retiring?.killNow();
    this.retiring = null;
    this.snapshots.clear();
    this.pagesCache.clear();
    this.excerptCache.clear();
    this.highlights = [];
    this.fragments = [];
    this.current = null;
    this.view = null;
    this.diagnostics = [];
    this.diagnosticsTotal = 0;
    if (this.buildDir) {
      await rm(this.buildDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      this.buildDir = null;
    }
    this.listeners.clear();
  }

  /** Synchronously end the watch (process exit). */
  killNow(): void {
    this.closed = true;
    this.compileToken++;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.indexing?.abort();
    for (const oneshot of this.liveOneshots) oneshot.abort();
    this.liveOneshots.clear();
    this.wakeWaiters();
    this.retiring?.killNow();
    this.retiring = null;
    this.watcher?.killNow();
    this.watcher = null;
  }
}
