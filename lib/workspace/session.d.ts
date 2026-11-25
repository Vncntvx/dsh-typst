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
import type { SandboxExecutionPolicy } from "@deepseek-ai/dsh-sandbox";
import type { PreviewIdentity, DiagnosticView, HighlightView, SnapshotView, TypstStateFrame } from "../contract.js";
import { locateInSources } from "../typst/match.js";
import type { SubprocessRuntime } from "@deepseek-ai/dsh-subprocess";
import type { ResolvedConfig } from "../config.js";
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
export declare class WorkspaceSession {
    readonly workspaceRoot: string;
    private realRoot;
    private readonly log;
    private readonly env;
    private readonly process;
    private readonly options;
    private listeners;
    private stateVersion;
    private toolchain;
    private main;
    private candidates;
    private candidatesAt;
    private generation;
    private compileToken;
    private startingWatcher;
    private previewError;
    private discovery;
    private indexing;
    private indexingPromise;
    private mainQueue;
    /**
     * The candidates the current document includes, as typst's own dependency
     * report names them. Kept between compiles so the panel can list fragments
     * apart from documents before the first successful compile settles.
     */
    private fragments;
    private status;
    private diagnostics;
    /** Full diagnostic count of the last round, before the frame cap. */
    private diagnosticsTotal;
    private watcher;
    private retiring;
    private stopPromise;
    private watcherStartedAt;
    private buildDir;
    /** Cancellation handles for in-flight one-shot compiles. */
    private readonly liveOneshots;
    /** When the in-flight compile started; also when the last finished one started (check uses this). */
    private compilingSince;
    private finishedStartedAt;
    private finishGeneration;
    /** Monotonic count of finished compiles; lets settle notice a wake it missed. */
    private finishVersion;
    /** Input signature the last completed compile consumed. */
    private compiledInputs;
    private finishWaiters;
    private restartTimer;
    private snapshots;
    private current;
    private seq;
    private highlights;
    private highlightSeq;
    private view;
    private viewSeq;
    private activation;
    private activated;
    private closed;
    private pagesCache;
    /** Per-compile excerpt cache: one read per file, keyed by mtime. */
    private excerptCache;
    private facts;
    private factsPending;
    private setupTimer;
    private setupTicks;
    private setupSubscribers;
    private rechecking;
    private recheckShell;
    constructor(options: SessionOptions);
    /**
     * The plugin settings this session compiles with, read per request. The
     * settings page commits volatile values in place, so a long-lived session
     * sees a change without being rebuilt.
     */
    private settings;
    onChange(listener: () => void): () => void;
    /**
     * Await state changes until `signal` aborts, yielding once per coalesced
     * burst (the watch stream's push side). Every yielded tick means "state
     * changed since the last frame"; the caller re-reads `state()`.
     */
    onChangeWaiter(signal: AbortSignal): AsyncIterable<symbol>;
    private emit;
    /** The full state frame the panel renders. */
    state(): TypstStateFrame;
    private toolchainView;
    /**
     * Whether this session has started, or is starting, its watch. A session
     * that never ran reads the new settings when its first request activates
     * it, so a settings commit must not activate one just to restart it.
     */
    get active(): boolean;
    /** Started on the first tool call or panel subscription; a no-op afterwards. */
    activate(): Promise<void>;
    /** Whether a located toolchain differs from the previously cached one. */
    private toolchainChanged;
    private detectToolchain;
    /** Host facts are probed once (OS, arch, package managers do not change mid-session). */
    private detectFacts;
    /**
     * Look Typst up again (the agent or the user just installed it). A usable
     * Typst rescans files and starts the preview. `shell: false` skips the
     * login shell (the panel's periodic recheck uses it to avoid spawning
     * shells frequently).
     */
    recheck(shell?: boolean): Promise<void>;
    private runRecheck;
    /** While the panel subscribes and Typst is unusable, re-lookup every few seconds; the preview starts by itself once Typst runs. */
    watchSetup(enabled: boolean): void;
    /** Locate typst again, rescan files, and restart the watch (the panel's restart button). */
    restart(): Promise<void>;
    /** Refresh complete discovery; indexed absence never proves the selected main disappeared. */
    refreshCandidates(force?: boolean): Promise<void>;
    private validMain;
    private selectInitialMain;
    discover(includeExcluded: boolean, signal?: AbortSignal): Promise<void>;
    private startWatcher;
    private performStartWatcher;
    private stopWatcher;
    private makeBuildDir;
    private finish;
    /**
     * Recompute the fragment set from typst's dependency report.
     *
     * typst names every file it loaded for the current root, so the candidates
     * among them other than the main file are exactly the fragments the
     * document pulls in. The report is empty until the first successful
     * compile, and the previous set is kept rather than emptied, so the panel
     * does not lose the distinction mid-session.
     */
    private refreshFragments;
    private wakeWaiters;
    private waitForFinish;
    private resetPreview;
    private get mainsFile();
    private remembered;
    private remember;
    setMain(path: string): Promise<string>;
    private selectMain;
    /** Both the toolchain and the main file are ready, or a telling error is thrown. */
    requireReady(): void;
    /**
     * Newest modification and a stable signature over the input files (typst's
     * deps; else the main file and the workspace's .typ files). The signature
     * includes size and mtime, so a rolled-back mtime or a same-mtime rewrite is
     * still detected as a different input set.
     */
    private inputsModifiedAt;
    /** Wait until every change already on disk has compiled (restart the watch when it missed changes). */
    settle(timeoutMs?: number, signal?: AbortSignal): Promise<void>;
    private addSnapshot;
    /** Read precisely the requested retained artifact, never silently substitute the latest. */
    previewBytes(identity: PreviewIdentity): {
        info: SnapshotView;
        bytes: Uint8Array<ArrayBuffer>;
    };
    private pagesOf;
    /** A preview is required (something compiled successfully). */
    private requireSnapshot;
    showPage(pageIndex: number): void;
    /**
     * When a highlight is created from source lines, count how many times the
     * same rendered passage occurred before the recorded range. Typst emits
     * repeated text in document order, so that ordinal disambiguates identical
     * quotes on the same page.
     */
    private occurrenceForSource;
    /** Find text in the preview: quote matching first (tolerant of whitespace, quotes, line breaks), then skeleton approximation. */
    private findText;
    highlight(target: HighlightTarget, comment?: string): Promise<HighlightCreated>;
    /** After a new snapshot, relocate highlights; unmatched annotations remain visible as stale. */
    private relocateHighlights;
    clearHighlights(ids?: string[]): number;
    /** The project's source files: workspace `.typ` files among typst's reported deps; all candidates when deps are missing. */
    sourceFiles(signal?: AbortSignal): Promise<{
        path: string;
        text: string;
    }[]>;
    locateSource(text: string, focus?: string, signal?: AbortSignal): Promise<ReturnType<typeof locateInSources>>;
    /**
     * Font directories passed to Typst via `--font-path`: the workspace's
     * conventional `fonts/` and `assets/fonts/` first, then the configured
     * directories. Project fonts therefore win on a family clash, and a
     * configured directory typst cannot read is left for typst to ignore.
     * @param configured - font directories from the current settings snapshot.
     * @returns the ordered `--font-path` directories.
     */
    private fontPaths;
    private oneshot;
    /** Track one one-shot compile so close/killNow can abort it. */
    private withOneshot;
    renderPages(spec: string, ppi: number, signal?: AbortSignal): Promise<{
        ok: boolean;
        diagnostics: DiagnosticView[];
        images: {
            page: number;
            png: Uint8Array;
        }[];
        pages: number[];
        total: number | undefined;
    }>;
    exportPdf(path: string, extra: {
        pdfStandard?: string;
        pages?: string;
    }, signal?: AbortSignal, policy?: SandboxExecutionPolicy): Promise<{
        ok: boolean;
        diagnostics: DiagnosticView[];
        path: string;
        bytes?: number;
        pages?: number;
    }>;
    /** Workspace-relative path (/ separated), against the canonical root. */
    relativePath(absolute: string): string;
    /** A path as typst printed it (relative to the workspace root, or absolute) → display path. */
    displayPath(path: string): string;
    /** Resolve a path inside the workspace (through symlinks); refuse escapes. */
    insideWorkspace(path: string): Promise<string>;
    /** The erroring line of a workspace file. */
    private withExcerpt;
    close(): Promise<void>;
    /** Synchronously end the watch (process exit). */
    killNow(): void;
}
//# sourceMappingURL=session.d.ts.map