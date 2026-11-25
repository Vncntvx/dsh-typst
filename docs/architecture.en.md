<p align="right"><a href="architecture.md"><b>中文</b></a></p>

# Architecture

dsh-typst is a request-driven plugin: loading it starts no typst and touches nothing on disk. The first tool call, or the panel's first subscription to a workspace, is what creates that workspace's session. This document describes the system by runtime concern: component topology, data flow, state and consistency, concurrency and resources, security boundaries, client-host contracts, and design boundaries. Every invariant names its current implementation and verification location. Configuration fields, tool parameters, and interface behavior are owned by `configuration.md`, `tools.md`, and `features.md`; upstream patches are owned by `development-notes.md`. This page is organized by responsibility, not by a walk through the source tree.

## Component topology and lifecycle

### Components and dependency direction

| Component   | Cordis key       | Wire namespace | Settings namespace | Default | Responsibility                                                                                                             |
| ----------- | ---------------- | -------------- | ------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `dsh-typst` | `typstWorkbench` | `typst`        | `typst`            | enabled | local typst discovery, watch lifecycle, snapshots, 7 tools, the `typst` skill, the right-sidebar preview and settings page |

The plugin has one component and no independently switchable sub-surface: the preview and the watch that feeds it must live and die together. The host half is `TypstWorkbenchService`, which owns the session registry, the configuration lifecycle, the Typert manifest and scope lookup, the tools and the skill; the browser half under `src/client/` owns the panel, the resource protocol, the Remote namespace, the pdf.js views and the tool cards.

Dependency direction is fixed: browser surface → `ctx.remote.typst` / the `typst` resource protocol → host service → `WorkspaceSession` → `src/typst/`. The host runtime and browser surfaces meet through the contract, and the dependency stays one-way.

### Mount, configuration, and disposal

The loader mounts the default export with the validated configuration; mounting itself spawns no process and scans no workspace. Configuration is volatile: on `loader/volatile-update`, the service applies one settings change in order and touches only sessions whose `active === true` — a toolchain field restarts the watch, an `excludeDirs` change rescans main-file candidates. An inactive session stays dormant and reads the new values on first use.

A session activates on first use: locate the toolchain, choose the main file, start the watch. Disposal closes every session, and the watch exits with its session; a process-exit hook calls `killNow` as a backstop, while panel stream subscriptions abort their host-side watch registrations. Lifecycle is verified by `tests/host/lifecycle.spec.ts`, `tests/host/composition.spec.ts`, and `tests/workspace/session-lifecycle.spec.ts`.

### Host contract adaptation

`ctx.typstWorkbench` is the plugin's stable boundary to the host; the Typert manifest is hand-written in `src/typert.ts` and registered through `ctx.typert.register()`. The reason the generator cannot serve a standalone checkout, the cost of the patch, and its exit condition live in `development-notes.md` as DN-1.

Every wire method takes a `typstScope` parameter, and the server resolves the wire SessionId into a workspace root through the `typstScope` lookup before the method body runs; the client passes only the sessionId. Two sessions of one host may therefore sit in two workspaces without interfering.

## Data flow

### Startup, discovery, and the main file

`typst_status` is the orientation entry: it reports the Typst version, the main file, the other `.typ` files, and the latest compile result. When `typstPath` is empty, `src/typst/locate.ts` searches the setting, then PATH, the common install locations, and the login shell; it parses the version and compares it with `MIN_TYPST` (0.12.0). Below that the state is `too_old`, not `ready`.

`src/typst/mainfile.ts` scans the `.typ` candidates, skipping the built-in directories and `excludeDirs` (directory name, any depth, case-insensitive), and picks the main file. The main file is remembered per workspace, and both `typst_set_main` and the panel menu converge on the same path check. With no `.typ` file the panel stops at the setup guide; the skill tells the model to create `main.typ`, using the actual file to establish the document structure. Discovery is verified by `tests/typst/mainfile.spec.ts`, `tests/host/which.spec.ts`, and `tests/workspace/discovery.spec.ts`.

### Edit, compile, and diagnostics

The agent edits `.typ` files with its normal file tools; the plugin never writes a source file. A save triggers `typst watch` to recompile, and `src/typst/diagnostics.ts` parses the output into a `WatchLog` and a diagnostic list with `file:line:column`, the source line, Typst's `hint:` lines, and the call trace.

`typst_check` does not guess a duration: it calls `WorkspaceSession.settle`, which waits until every change already on disk has compiled; when the watch missed a change, it restarts the watch once and judges again. The panel reads the same state stream and never starts a second compiler. Settle and diagnostic parsing are verified by `tests/workspace/session.spec.ts`, `tests/typst/watch-log.spec.ts`, and `tests/unit/diagnostic-text.spec.ts`.

### Preview, location, and highlights

The watch writes its PDF into the plugin's private cache; every successful compile produces a snapshot identified by `generation/seq/run/pages/sha256`. `LIMITS.snapshots` caps retained snapshots at 3, and the total byte budget caps them again; older snapshots drop in order and remain available for highlight relocation.

The panel reads state through the resource protocol `dsh-resource://typst/state/<sessionId>`: the first frame is the current state, and every later frame follows one relevant change. PDF bytes stay out of state frames; the panel pulls them through `typst/readPreview` by exact identity, and a mismatched identity fails explicitly, so the preview uses only the requested identity. A candidate PDF replaces the readable preview only after its first page and text layer are ready. Snapshot identity and expired reads are verified by `tests/workspace/snapshot-identity.spec.ts` and `tests/client/provider.spec.ts`.

`typst_show` with `quote` maps rendered text back to source through `src/typst/match.ts` and `text.ts`; `file` + `line` addresses a source range directly. Both produce a quote and PDF user-space rectangles. After a recompile the highlight is re-located by quote and marked stale when the target is gone rather than disappearing silently. Matching approximation is covered by `tests/typst/match.spec.ts` and `tests/client/source.spec.ts`.

### Export and one-shot compiles

`typst_export_pdf` and `typst_render_pages` use an independent compile in `src/typst/oneshot.ts` and never occupy the watch: an export may carry a PDF standard and a page selection, while a render is capped at 4 pages at 110 ppi by default. The exported PDF is written inside the workspace, confined by `insideWorkspace`; rendered pages become attachments for the tool card, with bytes in the attachment store. One-shot argument wiring is verified by `tests/tools/render.spec.ts` and `tests/workspace/export-policy.spec.ts`.

### Panel wire and feedback

`typst/watch` is a stream method, and `typst/readPreview` is a request carrying exact identity; the host and the client each materialize the same strict codecs from `src/wire-schemas.ts`. Panel feedback does not go through a plugin host send proxy: the public `conversation.input.requestDraftInitialization`, `sessions.using`, `fileUpload.uploadImage`, and `Session.prompt` put text or screenshots into an editable draft, and only explicit submission turns it into a session message.

The panel declares a `sidebar.right.pane.tab` store seat with `defineStore`. The framework holds one instance per session and groups reading positions, history, outline collapse, and feedback by tab id. Components read through `useStore`, and the first write through `actions` creates the tab bucket. Hiding a tab keeps its state. Closing its record drops the bucket and ignores late writes, as verified by `tests/client/preview.interaction.spec.tsx`. Wire consistency is verified by `tests/client/assembly.spec.ts` and `tests/unit/remote-codes.spec.ts`. `tests/client/feedback.interaction.spec.tsx` verifies the feedback path.

## State, storage, and consistency

### Workspace session

`WorkspaceSession` holds the whole state of one workspace: the toolchain, the main file, the watch process, the snapshots, the highlights, the settle semantics, and path confinement. It exposes actions (`activate`, `setMain`, `settle`, `renderPages`, `exportPdf`, `highlight`, `locateSource`) and the read-only `state()`, never the process internals.

The session separates **documents** from **fragments**: a fragment is a `.typ` file the current document pulls in with `#include` or `#import`, named by typst's own dependency report (`typst --deps`), and carried in the state frame's `fragments` field. typst reports resolved paths, and a resolved path is the real one: macOS's temporary directory is a symlink to `/private/var`. Both sides are `realpath`-resolved before comparison; otherwise the dependency report is silently dropped. Fragment and realpath normalization is verified by `tests/workspace/fragments.spec.ts`.

### Snapshots, main file, and highlights

Snapshots are kept by `seq` inside the session, bytes and metadata together; a new compile increments the generation, and a late result from an older generation is dropped, so the current preview is committed only by the latest generation. The main file is remembered per workspace; switching it rescans candidates and restarts the watch. A highlight stores its quote and rectangles; after a recompile it updates its identity when the quote still exists and turns stale when it does not.

This state stays inside the session; a process restart rebuilds it from the source files and the PDF cache. `tests/workspace/session.spec.ts` covers snapshot commit, highlight relocation, and main-file switching; `tests/workspace/isolation.spec.ts` covers two workspaces not contaminating each other.

### Settings commit

The `typst` namespace has 4 fields: `typstPath`, `fontPaths`, `packagePath`, and `excludeDirs`. `src/config.ts` owns the schema, `ResolvedConfig`, and `settingsChanged`; a settings-page commit reaches the running fiber through `loader/volatile-update`, applies in order, and keeps the plugin mounted.

Configuration precedence is schema defaults → composition entry config → the current profile's Cordis patch overlay → home patch → `--patch` overlay. A live session restarts its watch when a toolchain or font/package field changes and only rescans main files when `excludeDirs` changes; one-shot compiles read the new values on their next call. The complete field and hot-reload rules are owned by `configuration.md`, with tests in `tests/unit/config.spec.ts` and `tests/workspace/config.spec.ts`.

### Disk and cache

The plugin writes exactly two places: the exported PDF inside the workspace, and its own private cache directory `~/.dsh/cache/typst` for preview PDFs. Source files, workspace `.pdf` files, and the host document preview are not taken over. Cache and export containment is verified by `tests/workspace/containment.spec.ts` and `tests/workspace/export-policy-root.spec.ts`.

## Concurrency, resources, and isolation

One workspace has one `typst watch`; rendering and export use one-shot compiles that run alongside the watch while the workspace keeps a single watch. Session activation, watch restart, and settings application run on the session's own serial chain; a panel stream subscription aborts its host registration on close, and state writes end with the subscription.

PDF rendering uses a pdf.js Blob Worker in the browser, with the worker source inlined by esbuild through `?raw`; the page canvas, the outline, and the loading task each own their resources. Two workspaces hold their own sessions and cache snapshots and share no mutable state. Concurrency and isolation are verified by `tests/workspace/isolation.spec.ts`, `tests/workspace/session-lifecycle.spec.ts`, and `tests/client/pdf-runtime.spec.ts`.

## Security and trust boundaries

- **Workspace confinement**: every path resolves to an absolute path inside the workspace, and an escape is refused with `TYPST_PATH_OUTSIDE_WORKSPACE`; export may only write inside it. `tests/workspace/containment.spec.ts` covers dot segments, symlinks, and absolute-path escapes.
- **Session scope**: a wire method accepts only the workspace resolved from `typstScope`; cross-workspace ids are refused.
- **Process boundary**: `typst watch` is spawned only by `src/typst/watcher.ts` through `ProcessRunner`; the harness subprocess provider owns process identity and termination, and the watcher holds only the running handle. The workbench produces the preview, and the shell serves one-off queries.
- **Network boundary**: the plugin makes zero network requests; Typst downloads `@preview` packages as it does in a terminal. Installing, updating, `sudo`, and shell-profile edits need an explicit user request; a setup request submitted from the panel counts as one.
- **File-type boundary**: a `.pdf` in the workspace is still opened by the host's built-in document preview, and the plugin keeps that responsibility.

## Client-host contracts and interface surfaces

The host registers `TypstRuntime` in the `typst` wire namespace: `status`, `setMain`, `watch`, `readPreview`, `locateSource`, `recheck`, `restart`, and `discover`. `watch` is a stream method whose descriptor carries `mode: 'stream'`; `readPreview`'s `data` is `Uint8Array<ArrayBuffer>`, with bytes travelling through the attachment channel.

`src/contract.ts` owns the shared view types, `src/wire-schemas.ts` owns the strict zod schemas shared by both halves, and the host and client each materialize their codecs. Every stable domain error code crosses the wire as its own `typst/<reason>` code, with the stable domain code also in `details.code`; consumers discriminate by `code` / `details.code`. The contract is verified by `tests/host/typert-manifest.spec.ts`, `tests/client/assembly.spec.ts`, and `tests/unit/remote-codes.spec.ts`.

The browser has one `lib/client.js`. `src/client/index.ts` first awaits `ctx.remote.$mount`, then registers the panel, the resource protocol, the tool cards, and the settings page; the settings page mounts into `plugins.bundle.config` through the optional `configForms` injection and `configForms.whileServed(["typst"])`, and registers only while the component is served. The value-import boundary for browser code is defined by `scripts/client-graph-authority.mjs`, and `tests/unit/client-platform.spec.ts` verifies the platform boundary.

The interface surfaces are the right-sidebar `kind: 'typst'` preview tab (`PreviewTab.tsx`, with the definition and keyed body under the same id), the `typst` resource protocol (`provider.ts`), the tool cards (`toolviews.tsx`), and the settings page (`settings.tsx`). The outline comes from PDF bookmarks and the fragments from typst's dependency report; the file layout takes no part in either. State arrives on a stream and PDF bytes are pulled by identity.

## Design boundaries

- **The user's compiler only**: the plugin ships no Typst and calls the installed one.
- **Sources are read-only**: the agent edits `.typ` files with its own file tools; the plugin reads them.
- **State arrives on a stream**: panel state comes from a stream, not from a timer.
- **No network**: the plugin itself makes zero network requests; Typst's package downloads behave as they do in a terminal.
- **One watch**: one workspace has one watch process; rendering and export use one-shot compiles that leave it free.
- **Workspace isolation**: sessions are isolated by workspace root, so two workspaces preview independently.
- **PDF opening belongs to the host**: a PDF in the workspace is handled by the host's built-in preview.

These boundaries are verified by `tests/typst/process.spec.ts`, `tests/workspace/isolation.spec.ts`, `tests/workspace/export-policy.spec.ts`, `tests/client/provider.spec.ts`, and `tests/host/composition.spec.ts`.
