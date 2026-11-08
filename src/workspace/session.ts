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

import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
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
import {
  LIMITS,
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
  StatusView,
  ToolchainView,
  TypstStateFrame,
} from "../contract.js";
import {
  INSTALL_HINT,
  TypstError,
  TYPST_INVALID_ARGUMENT,
  TYPST_MISSING,
  TYPST_NOT_FOUND,
  TYPST_NO_MAIN,
  TYPST_NO_PREVIEW,
  TYPST_PATH_OUTSIDE_WORKSPACE,
  TYPST_QUOTE_NOT_FOUND,
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
import { reapOrphans, Watcher } from "../typst/watcher.js";

export interface SessionOptions {
  workspaceRoot: string;
  /** The configured "Typst path" setting. */
  typstPath?: string;
  /** Private plugin data directory (build artifacts, remembered mains). */
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
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
  private watcher: Watcher | null = null;
  private watcherStartedAt = 0;
  private buildDir: string | null = null;
  /** When the in-flight compile started; also when the last finished one started (check uses this). */
  private compilingSince: number | null = null;
  private finishedStartedAt = 0;
  private finishWaiters = new Set<() => void>();
  private restartTimer: NodeJS.Timeout | null = null;
  private snapshots = new Map<
    number,
    { info: SnapshotView; bytes: Uint8Array }
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

  // Setup page: host facts, "handed to the agent", re-lookup while open.
  private facts: SetupView["facts"] = null;
  private factsPending: Promise<void> | null = null;
  private setupTimer: NodeJS.Timeout | null = null;
  private setupTicks = 0;
  private setupSubscribers = 0;
  private rechecking: Promise<void> | null = null;

  constructor(options: SessionOptions) {
    this.options = options;
    this.workspaceRoot = resolve(options.workspaceRoot);
    this.log = options.log ?? (() => undefined);
    this.env = options.env ?? process.env;
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
      main: this.main,
      candidates: this.candidates,
      fragments: this.fragments,
      status: this.status,
      diagnostics: this.diagnostics,
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

  private async detectToolchain(shell = true): Promise<void> {
    const before = this.toolchain;
    this.toolchain = await locateTypst({
      setting: this.options.typstPath,
      env: this.env,
      shell,
    });
    const changed =
      before.state !== this.toolchain.state ||
      (before.state !== "missing" &&
        this.toolchain.state !== "missing" &&
        before.path !== this.toolchain.path) ||
      (before.state === "ready" &&
        this.toolchain.state === "ready" &&
        before.version !== this.toolchain.version);
    if (!changed) return;
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
  recheck(shell = true): Promise<void> {
    this.rechecking ??= (async () => {
      await this.activate();
      const before = this.toolchain;
      await this.detectToolchain(shell);
      const changed =
        before.state !== this.toolchain.state ||
        (before.state !== "missing" &&
          this.toolchain.state !== "missing" &&
          before.path !== this.toolchain.path) ||
        (before.state === "ready" &&
          this.toolchain.state === "ready" &&
          before.version !== this.toolchain.version);
      if (!changed) return;
      if (this.toolchain.state === "ready") {
        await this.stopWatcher();
        await this.refreshCandidates(true);
        if (!this.main) this.main = await this.selectInitialMain();
        await this.startWatcher();
      }
      this.emit();
    })().finally(() => {
      this.rechecking = null;
    });
    return this.rechecking;
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
    if (this.indexingPromise && this.indexing) await this.indexingPromise;
    else await this.discover(this.discovery.includeExcluded);
    if (this.main && !(await this.validMain(this.main))) {
      await this.stopWatcher();
      this.candidates = this.candidates.filter((path) => path !== this.main);
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
    } catch {
      return false;
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
      try {
        for await (const batch of indexTypFiles(
          this.workspaceRoot,
          includeExcluded,
          stopped,
        )) {
          if (this.closed || stopped.aborted || this.indexing !== controller)
            return;
          this.candidates = [
            ...new Set([...batch.files, ...(this.main ? [this.main] : [])]),
          ];
          this.discovery = {
            scanning: true,
            includeExcluded,
            visited: batch.visited,
            errors: batch.errors,
          };
          this.emit();
        }
        this.candidatesAt = Date.now();
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
    const fontPaths = await this.fontPaths();
    const watcher = new Watcher(
      {
        typst: this.toolchain.path,
        version: this.toolchain.version,
        cwd: this.workspaceRoot,
        root: this.workspaceRoot,
        fontPaths,
        main: this.main,
        buildDir: this.buildDir,
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

  private async stopWatcher(): Promise<void> {
    await this.startingWatcher;
    const watcher = this.watcher;
    this.watcher = null;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    await watcher?.stop();
  }

  private async makeBuildDir(): Promise<string> {
    const base = join(
      this.options.dataDir ?? join(tmpdir(), "dsh-typst"),
      "build",
    );
    await mkdir(base, { recursive: true });
    await reapOrphans(base, this.log);
    const dir = join(base, `${process.pid}-${randomBytes(4).toString("hex")}`);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private async finish(
    outcome: "ok" | "warnings" | "error",
    diagnostics: DiagnosticView[],
    durationMs?: number,
    bytes?: Uint8Array,
    previewFailure?: string,
  ): Promise<void> {
    const generation = this.generation;
    const token = this.compileToken;
    const startedAt = this.compilingSince ?? Date.now();
    const diagnosticsWithExcerpts = await Promise.all(
      diagnostics.map((entry) => this.withExcerpt(entry)),
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
    this.compilingSince = null;
    this.diagnostics = diagnosticsWithExcerpts;
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
    if (generation !== this.generation || token !== this.compileToken) return;
    if (this.current) await this.relocateHighlights(this.current.seq);
    if (
      generation !== this.generation ||
      token !== this.compileToken ||
      this.closed
    )
      return;
    this.wakeWaiters();
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

  private waitForFinish(ms: number): Promise<boolean> {
    return new Promise((done) => {
      const wake = (): void => {
        clearTimeout(timer);
        this.finishWaiters.delete(wake);
        done(true);
      };
      const timer = setTimeout(() => {
        this.finishWaiters.delete(wake);
        done(false);
      }, ms);
      this.finishWaiters.add(wake);
    });
  }

  private resetPreview(): void {
    this.generation++;
    this.compileToken++;
    this.previewError = null;
    this.snapshots.clear();
    this.pagesCache.clear();
    this.current = null;
    this.diagnostics = [];
    this.highlights = [];
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
    let saved: Record<string, string> = {};
    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      if (typeof parsed === "object" && parsed !== null)
        saved = parsed as Record<string, string>;
    } catch {
      // First save.
    }
    saved[this.realRoot ?? this.workspaceRoot] = main;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(saved, null, 2));
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

  /** Newest modification among the input files (typst's deps; else the main file and the workspace's .typ files). */
  private async inputsModifiedAt(): Promise<number> {
    let files = (await this.watcher?.deps()) ?? [];
    if (!files.length) {
      files = [this.main, ...this.candidates]
        .filter((path): path is string => typeof path === "string")
        .map((path) => resolve(this.workspaceRoot, path));
    }
    let latest = 0;
    await Promise.all(
      files.slice(0, INPUT_FILES_MAX).map(async (file) => {
        const info = await stat(file).catch(() => null);
        if (info) latest = Math.max(latest, info.mtimeMs);
      }),
    );
    return Math.min(latest, Date.now());
  }

  /** Wait until every change already on disk has compiled (restart the watch when it missed changes). */
  async settle(timeoutMs: number = LIMITS.checkTimeoutMs): Promise<void> {
    await this.activate();
    if (!this.main) await this.refreshCandidates(true);
    this.requireReady();
    const deadline = Date.now() + timeoutMs;
    let restarted = false;
    for (;;) {
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
      const busy =
        this.status.phase === "starting" || this.status.phase === "compiling";
      const inputs = await this.inputsModifiedAt();
      if (!busy && this.status.run > 0 && this.finishedStartedAt >= inputs)
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
      );
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
    bytes: Uint8Array,
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
    while (this.snapshots.size > LIMITS.snapshots) {
      const oldest = this.snapshots.keys().next().value;
      if (oldest === undefined) break;
      this.snapshots.delete(oldest);
      this.pagesCache.delete(oldest);
    }
    this.current = info;
  }

  /** The current preview bytes, or a telling error. */
  currentBytes(): { info: SnapshotView; bytes: Uint8Array } {
    if (!this.current) {
      throw new TypstError(
        this.status.phase === "error"
          ? "The document has not compiled successfully yet; fix the errors first (see typst_check)."
          : "There is no preview yet.",
        TYPST_NO_PREVIEW,
      );
    }
    const snapshot = this.snapshots.get(this.current.seq);
    if (!snapshot)
      throw new TypstError(
        `Preview ${this.current.seq} is no longer available.`,
        TYPST_NOT_FOUND,
      );
    return snapshot;
  }

  /** Read precisely the requested retained artifact, never silently substitute the latest. */
  previewBytes(identity: PreviewIdentity): {
    info: SnapshotView;
    bytes: Uint8Array;
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

  /** Find text in the preview: quote matching first (tolerant of whitespace, quotes, line breaks), then skeleton approximation. */
  private findText(
    pages: PageText[],
    text: string,
    preferredPage?: number,
  ): { pageIndex: number; start: number; end: number; score: number } | null {
    const exact = findQuote(pages, text, preferredPage);
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
      const absolute = await this.insideWorkspace(target.file);
      const content = await readFile(absolute, "utf8").catch(() => {
        throw new TypstError(`${target.file} does not exist.`, TYPST_NOT_FOUND);
      });
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
    const found = this.findText(pages, text);
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
      const found = this.findText(pages, highlight.quote, highlight.pageIndex);
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
        rects: rectsFor(page, found.start, found.end),
      };
    });
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
  async sourceFiles(): Promise<{ path: string; text: string }[]> {
    const deps = ((await this.watcher?.deps()) ?? []).filter((file) =>
      file.endsWith(".typ"),
    );
    const paths = deps.length
      ? deps
      : this.candidates.map((path) => resolve(this.workspaceRoot, path));
    const root = this.realRoot ?? this.workspaceRoot;
    const files: { path: string; text: string }[] = [];
    for (const absolute of paths.slice(0, SOURCE_FILES_MAX)) {
      const real = await realish(absolute);
      const rel = relative(root, real);
      if (rel.startsWith("..") || isAbsolute(rel)) continue;
      const info = await stat(real).catch(() => null);
      if (!info?.isFile() || info.size > SOURCE_FILE_MAX_BYTES) continue;
      files.push({
        path: rel.split(sep).join("/"),
        text: await readFile(real, "utf8"),
      });
    }
    return files.sort(
      (a, b) => Number(b.path === this.main) - Number(a.path === this.main),
    );
  }

  async locateSource(
    text: string,
    focus?: string,
  ): Promise<ReturnType<typeof locateInSources>> {
    await this.activate();
    return locateInSources(await this.sourceFiles(), text, focus);
  }

  /** Common workspace font directories to pass to Typst via `--font-path`. */
  private async fontPaths(): Promise<string[]> {
    const candidates = [
      join(this.workspaceRoot, "fonts"),
      join(this.workspaceRoot, "assets", "fonts"),
    ];
    const resolved: string[] = [];
    for (const dir of candidates) {
      const s = await stat(dir).catch(() => null);
      if (s?.isDirectory()) resolved.push(dir);
    }
    return resolved;
  }

  // -------------------------------------------------------------------------
  // One-shot compiles: render images, export
  // -------------------------------------------------------------------------

  private async oneshot(): Promise<OneshotOptions> {
    this.requireReady();
    const fontPaths = await this.fontPaths();
    return {
      typst: (this.toolchain as { state: "ready"; path: string }).path,
      cwd: this.workspaceRoot,
      root: this.workspaceRoot,
      fontPaths,
      main: this.main as string,
      env: this.env,
      scratch: this.buildDir ?? (this.buildDir = await this.makeBuildDir()),
      toFile: (path) => this.displayPath(path),
    };
  }

  async renderPages(
    spec: string,
    ppi: number,
  ): Promise<{
    ok: boolean;
    diagnostics: DiagnosticView[];
    images: { page: number; png: Uint8Array }[];
    pages: number[];
    total: number | undefined;
  }> {
    await this.activate();
    const options = await this.oneshot();
    await this.settle().catch(() => undefined);
    const total = this.current?.pages;
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
    const result = await renderPages(options, pages, ppi);
    const diagnostics = await Promise.all(
      result.diagnostics.map((entry) => this.withExcerpt(entry)),
    );
    return { ...result, diagnostics, pages, total };
  }

  async exportPdf(
    path: string,
    extra: { pdfStandard?: string; pages?: string },
  ): Promise<{
    ok: boolean;
    diagnostics: DiagnosticView[];
    path: string;
    bytes?: number;
    pages?: number;
  }> {
    await this.activate();
    const options = await this.oneshot();
    const absolute = await this.insideWorkspace(path);
    if (extname(absolute).toLowerCase() !== ".pdf") {
      throw new TypstError(
        "The output path must end in .pdf.",
        TYPST_INVALID_ARGUMENT,
      );
    }
    await mkdir(dirname(absolute), { recursive: true });
    const result = await exportPdf(options, absolute, extra);
    const diagnostics = await Promise.all(
      result.diagnostics.map((entry) => this.withExcerpt(entry)),
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

  /** Workspace-relative path (/ separated). */
  relativePath(absolute: string): string {
    return relative(this.workspaceRoot, absolute).split(sep).join("/");
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
    const absolute = resolve(this.workspaceRoot, path);
    const root =
      this.realRoot ??
      (await realpath(this.workspaceRoot).catch(() => this.workspaceRoot));
    let existing = absolute;
    let rest = "";
    for (;;) {
      try {
        const real = await realpath(existing);
        const full = rest ? join(real, rest) : real;
        const rel = relative(root, full);
        if (rel.startsWith("..") || isAbsolute(rel)) break;
        return absolute;
      } catch {
        const parent = dirname(existing);
        if (parent === existing) break;
        rest = rest ? join(basename(existing), rest) : basename(existing);
        existing = parent;
      }
    }
    throw new TypstError(
      `${path} is outside the workspace.`,
      TYPST_PATH_OUTSIDE_WORKSPACE,
    );
  }

  /** The erroring line of a workspace file. */
  private async withExcerpt(
    diagnostic: DiagnosticView,
  ): Promise<DiagnosticView> {
    const location = diagnostic.location;
    if (!location || location.file.startsWith("@") || isAbsolute(location.file))
      return diagnostic;
    try {
      const text = await readFile(
        resolve(this.workspaceRoot, location.file),
        "utf8",
      );
      const line = text.split("\n")[location.line - 1];
      return line === undefined
        ? diagnostic
        : { ...diagnostic, excerpt: line.replace(/\s+$/, "").slice(0, 300) };
    } catch {
      return diagnostic;
    }
  }

  // -------------------------------------------------------------------------
  async close(): Promise<void> {
    this.closed = true;
    this.indexing?.abort();
    this.setupSubscribers = 0;
    this.watchSetup(false);
    await this.stopWatcher();
    if (this.buildDir)
      await rm(this.buildDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
  }

  /** Synchronously end the watch (process exit). */
  killNow(): void {
    this.watcher?.killNow();
  }
}
