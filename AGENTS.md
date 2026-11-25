# AGENTS.md

dsh-typst is a DeepSeek Harness plugin: agents write and fix Typst documents against a live preview rendered in a right-sidebar panel, driven by the user's own `typst` binary (their fonts, packages and version). The plugin never edits `.typ` files and never runs a compiler of its own. Consult `docs/product-model.md` before naming a surface or scope.

## Sources of truth

- Product model, vocabulary, and component boundaries: `docs/product-model.md`.
- Architecture, data flow, and service layers: `docs/architecture.md` — read before changing the service, the session, the wire, or the panel.
- Tool contracts, schemas, and errors: `docs/tools.md` — read before changing any tool or adding a documented example.
- Configuration schemas and defaults: `docs/configuration.md`.
- Build, launch, debug, release, and repository layout: `docs/development.md`.
- Upstream patches and their exit conditions: `docs/development-notes.md` — read before changing a covered workaround or a harness pin.
- Skill workflow, budgets, and evidence boundaries: `docs/skills.md` — read before changing the `typst` skill.
- Test lanes, fixtures, verification levels, and guards: [tests/README.md](tests/README.md) — read before adding, moving, or refactoring tests or helpers.
- Documentation ownership, writing rules, and gates: `docs/AGENTS.md` — read before adding, moving, or rewriting a document.
- Upstream harness contracts: this repo is usually developed beside `../deepseek-harness`; upstream docs and types win.
- The ZCode typst-workbench (0.2.0) is the behavioral reference for tool semantics and panel behavior; where this plugin diverges (wire shape, panel paradigm), the DSH contract wins.

Keep `docs/x.md` and `docs/x.en.md` in lockstep. `tests/host/doc-lockstep.spec.ts` discovers every document pair, checks equal heading counts and the language switch, and pins the pair count stated in `docs/development.md`; `tests/host/doc-examples.spec.ts` validates documented calls against tool schemas.

When a change creates a non-obvious constraint that future developers must preserve, route it to its owning page per `docs/AGENTS.md`: an upstream patch (a harness feature with a defect the plugin patches locally) goes to `docs/development-notes.md`, an internal invariant goes to `docs/architecture.md`, and a gate or release rule goes to `docs/development.md` or `tests/README.md`. Update the paired `.en.md` in the same change. A development-notes entry that is migrated or no longer needed is deleted outright; its number is never reused.

## Commands and validation

```sh
npm install                  # also builds lib/ through prepare
npx vitest run <spec>        # focused iteration
npm run typecheck            # harness pin check plus the node, test, client, client-test, and scripts tsc
npm run build:client         # browser bundle only; required after src/client changes
npm test                     # test-lint and token guards plus the full vitest suite
npm run test:docs            # document pairs, tool contracts, and release checklist
npm run format               # prettier --write; verify with format:check
npm run harness:check        # pin, lockfile, and upstream artifact freshness
npm run style:check          # client stylesheet guards against the token snapshot
npm run tokens:write         # refresh the token snapshot after a harness upgrade
npm run deps:check           # direct dependencies behind the registry; harness-owned ones excluded
npm run release:check        # full gate: format, strict harness, lint, style, typecheck, docs, coverage, build, pack
npm run smoke:discovery      # pack and load the plugin in a real harness profile
```

- Iterating: focused spec plus `npm run typecheck`; add `npm run build:client` for changes under `src/client/**`.
- Behavior changes: `npm test`. Cross-cutting, test-infrastructure, or release-bound changes: `npm run release:check`.
- Docs-only changes: `npm run test:docs`, `npm run format:check` and `npm run lint:test`.
- Client-facing changes additionally need `npm run smoke:discovery`; `npm run smoke:web-composition` covers the browser composition when a browser is available.
- Pull requests and `main` pushes run only the security scanner. The quality gate runs on `v*` tag pushes and in the weekly upstream-health workflow. Local validation is the merge gate. Report live checks you did not run.

## Architecture and invariants

- **Harness pin**: every `@deepseek-ai/dsh-*` in `dependencies`, `devDependencies`, and `overrides` is an exact version; `peerDependencies` and `engines.dsh` use `>=`. Never hand-edit versions: run `npm run harness:pin -- <ver>`, then `npm install --package-lock-only`. Vendored `cordis`, `cosmokit`, `schemastery`, and `cordis-plugin-*` floors must match the sibling's `vendor/<pkg>/package.json`; `npm run harness:check` enforces it, and an `overrides` entry naming a vendored package is refused outright.
- **Request-driven**: loading the plugin spawns no process and touches nothing on disk. The first tool call, or the panel's first subscription to a workspace, creates that workspace's session.
- **No file edits**: the plugin never writes `.typ` files. It writes into the workspace only through `typst_export_pdf` (inside the workspace, enforced by `WorkspaceSession.insideWorkspace`), and into its own private cache dir (`~/.dsh/cache/typst`) elsewhere.
- **No shell preview**: `typst watch` is spawned only by `src/typst/watcher.ts` through `ProcessRunner`; the harness owns process identity and termination, and the watcher holds only the running handle. Tools and the panel preview through the workbench.
- **One watch per workspace**: rendering and export use one-shot compiles and never occupy the watch; two workspaces preview independently.
- **Session scope**: sessions are keyed by the realpath of the workspace root. Every wire method resolves a SessionId through `typstScope`; neither half may equate a session with a global process.
- **The panel reads document structure from typst**: the fragments come from typst's own dependency report and the outline from the PDF's own bookmarks. A file name, a directory layout or a regex over the sources is a guess, not a substitute for either.
- **Wire error codes**: every stable domain error of the plugin's own crosses the wire as its own `typst/<reason>`, with the stable domain code also in `details.code`; consumers discriminate by `code` / `details.code`.
- **Client graph**: browser code may value-import only `src/client/**` and the pure modules allowlisted in `scripts/client-graph-authority.mjs` (`contract`, `constants`, `diagnostic-text`, `wire-schemas`); never `@deepseek-ai/schemastery`, `src/config.ts`, `src/status-codec.ts`, `src/typert.ts`, or anything that spawns processes. `zod` stays external. `src/client/index.ts` must `await ctx.remote.$mount` before the UI fiber injects on `remote.typst`.
- **Right-sidebar paradigm**: one tab type (`kind: 'typst'`) registered as definition + keyed body under the same id; the body reads state through the `typst` resource protocol.
- **Client styling**: feature CSS consumes the host design system through published tokens only — `--dsw-alias-*` for colour and surface, `--dsw-font-*` for the typography ladder, `--dsw-radius-*` for geometry. It declares no `--dsw-*` custom property of its own, states no literal colour, keeps every font size on the ladder, gates hover under `@media (hover: hover)`, reduces every transition under `prefers-reduced-motion`, and states at most font-weight 500. `npm run style:check` enforces all of it against the token snapshot; a harness upgrade means `npm run tokens:write`.
- **Design semantics**: intent decides the token, not taste. Ink: `label-*` role ladder, `label-on-color` over a saturated fill, `label-tertiary` for disabled. Accent: `link` only for clickable text (the `LinkButton` family), `state-business-primary` for selection, current rails and document marks. Fill: `interactive-bg-hover` transient, `interactive-bg-active` persistent. Strokes: `border-l1` inside an elevated surface, `l2` structural dividers and card strokes, `l3` compact control edges, `l4` standard field edges, all neutral strokes at 0.5px. Surfaces: `bg-layer-1` panel chrome, cards and rows, `bg-layer-2` raised menus and drawers, `bg-layer-3` the topmost nest, `bg-document-preview` the page stage; floating chrome takes `elevation-panel`, temporary mode surfaces and portals `elevation-prominent`, and surfaces carry `border: 0` with the elevation's stroke rebound. Spacing states grouping, not a scale: 2/4 inside a cluster, 8 between peers, 12/16 between regions, on a 4px rhythm. The table lives in the header comment of `src/client/preview.module.css`.
- **Control ownership**: `Button`, `Input`, `Checkbox`, `Tag`, `SegmentedTabs` and `ZoomControls` keep the host's size, padding, fill, ink, border, focus and disabled dress; a feature class may only seat them (display, flex, width, margin, inset, z-index) and never restate their material. The two exceptions are machine-declared in `scripts/shared/control-style-ownership.mjs`: `IconButton` owns icon-button geometry and the `aria-pressed` dress, and `.pagebar .zoom` inlines the floating zoom panel. New icon-only or link actions go through `src/client/IconButton.tsx` / `src/client/LinkButton.tsx`, never a bare `<button>`; a state that changes appearance is keyed on `aria-*` so the guard can see it.
- **Teardown**: disposing the plugin kills every `typst watch` tree (session close + process-exit killNow); panel streams abort their host watch registrations.

## Development rules

- Follow [tests/README.md](tests/README.md): one behavior per spec, no `.only`/`.skip`/`.todo` (use `.runIf`), synchronize on owned promises, and use the shared fixtures. A spec's location is decided by the module it tests, not by when it was written.
- A spec or doc pair adds no undocumented command: copy scripts, paths, counts, defaults and error codes from `package.json`, the schemas or the tests.
- Commits: `<type>(<scope>): <emoji> <subject>`; lowercase type, imperative subject, blank line, then bullets explaining what and why.
- Never commit `dev.cordis.yml`; edit `dev.cordis.yml.example`.

## Safety

- **Workspace containment**: every path a tool takes is resolved and confined by `insideWorkspace`; escapes are refused (`TYPST_PATH_OUTSIDE_WORKSPACE`).
- **Process boundary**: only `src/typst/watcher.ts` spawns `typst watch`. Never preview through a shell, and never leave a child tree alive after a session closes.
- **No network**: the plugin makes no network requests; typst itself may download `@preview` packages, as it would in a terminal.
- **Install boundary**: setup requests are user actions. Do not install or update Typst, use `sudo`, or edit shell profiles without an explicit request; a submitted panel setup request counts as one.
- **No takeover of `.pdf` opening**: a `.pdf` in the workspace is still opened by the host's built-in document preview.
- **Generated output**: `lib/` is produced by `tsc` and `esbuild`; rebuild instead of editing.
