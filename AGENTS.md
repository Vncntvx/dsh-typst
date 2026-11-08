# AGENTS.md

dsh-typst is a DeepSeek Harness plugin: agents write and fix Typst documents against a live preview rendered in a right-sidebar panel, driven by the user's own `typst` binary (their fonts, packages and version). The plugin never edits `.typ` files and never runs a compiler of its own. Read `docs/product-model.md` before naming a surface or scope.

## Repository map

| Path             | Ownership                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `src/`           | Host runtime: `TypstWorkbenchService` (`ctx.typstWorkbench`), Typert remote, tools, skill               |
| `src/typst/`     | Typst domain: binary location, `typst watch` driver, output parsing, text/matching, one-shot compiles   |
| `src/workspace/` | Per-workspace `WorkspaceSession`: toolchain, main file, snapshots, highlights, settle, path confinement |
| `src/tools/`     | The 7 host tools (`typst_*`)                                                                            |
| `src/skills/`    | The `typst` skill (agent guidance)                                                                      |
| `src/client/`    | Browser half bundled into `lib/client.js`: preview tab, pdf.js viewer, resource provider, tool cards    |
| `tests/`         | Lanes by ownership; rules in `tests/README.md`; fixtures in `tests/fixtures`                            |
| `docs/`          | Product and technical docs, maintained as zh/en pairs                                                   |
| `scripts/`       | Build, pack verification, harness pinning, style guards, test lint, smoke probes                        |
| `lib/`           | Generated output from `tsc` and `esbuild`; never edited                                                 |

## Sources of truth

- Product model, vocabulary, component boundaries: `docs/product-model.md`.
- Architecture, data flow, service layers: `docs/architecture.md`: read before changing the service, the session, the wire or the panel.
- Tool contracts, schemas, errors: `docs/tools.md`: read before changing any tool.
- Configuration schemas and defaults: `docs/configuration.md`.
- Build, launch, debug, release: `docs/development.md`.
- Test lanes, fixtures, verification levels, guards: [tests/README.md](tests/README.md): required before adding, moving or refactoring tests or helpers.
- Upstream harness contracts: this repo is developed as a sibling checkout of `../deepseek-harness`; its docs and types outrank this file.
- The ZCode typst-workbench (0.2.0) is the behavioral reference for tool semantics and panel behavior; where this plugin diverges (wire shape, panel paradigm), the DSH contract wins.

Keep `docs/x.md` and `docs/x.en.md` in lockstep: the two files carry the same section skeleton, and a change to one is a change to both. Tool-call examples in `README*.md` and in the docs listed in `tests/host/doc-examples.spec.ts` are validated against the tools' parameter schemas; that spec also checks the heading count of every zh/en pair.

## Commands

```sh
npm install                  # also builds lib/ through prepare
npx vitest run <spec>        # focused spec while iterating
npm run typecheck            # harness pin checks + node, test, and client tsc
npm run build:client         # browser bundle only; required after src/client changes
npm test                     # test-lint guards + full vitest suite
npm run format               # prettier --write; verify with format:check
npm run harness:check        # pin, lockfile, and upstream artifact freshness
npm run style:check          # client stylesheet guards against the token snapshot
npm run tokens:write         # refresh the token snapshot after a harness upgrade
npm run deps:check           # direct dependencies behind the registry; harness-owned ones excluded
npm run release:check        # full gate: format, strict harness, lint, style, typecheck, coverage, build, pack
npm run smoke:discovery      # pack + compose the plugin into a real harness + load the browser bundle
```

Run `npm run link:local-harness` when the sibling harness is ahead of the registry.

## Invariants

- **Harness pin**: every `@deepseek-ai/dsh-*` in `dependencies`, `devDependencies`, and `overrides` is an exact version; `peerDependencies` and `engines.dsh` use `>=`. Never hand-edit versions: run `npm run harness:pin -- <ver>`, then `npm install --package-lock-only`. Vendored `cordis`, `cosmokit`, `schemastery`, and `cordis-plugin-*` floors must match the sibling's `vendor/<pkg>/package.json`; `npm run harness:check` enforces it, and an `overrides` entry naming a vendored package is refused outright.
- **Request-driven**: loading the plugin spawns no process and touches nothing on disk. The first tool call, or the panel's first subscription to a workspace, creates that workspace's session.
- **No file edits**: the plugin never writes `.typ` files. It writes into the workspace only through `typst_export_pdf` (inside the workspace, enforced by `WorkspaceSession.insideWorkspace`), and into its own private cache dir (`~/.dsh/cache/typst`) elsewhere.
- **No shell preview**: `typst watch` is spawned only by `src/typst/watcher.ts` (own process group, pid file, tree teardown). Tools and the panel never shell out for previewing.
- **One watch per workspace**: rendering and export use one-shot compiles and never occupy the watch; two workspaces preview independently.
- **Client graph**: browser code may value-import only `src/client/**` and the pure modules allowlisted in `scripts/client-graph-authority.mjs` (`contract`, `constants`, `wire-schemas`); never `@deepseek-ai/schemastery`, `src/config.ts`, `src/status-codec.ts`, `src/typert.ts`, or anything that spawns processes. `zod` stays external. `src/client/index.ts` must `await ctx.remote.$mount` before the UI fiber injects on `remote.typst`.
- **Right-sidebar paradigm**: one tab type (`kind: 'typst'`) registered as definition + keyed body under the same id; the body reads state through the `typst` resource protocol, never by polling.
- **The panel never guesses the document**: the fragments come from typst's own dependency report and the outline from the PDF's own bookmarks. A file name, a directory layout or a regex over the sources is not a substitute for either.
- **One wire error code**: a domain error of the plugin's own crosses the wire as `typst/domain` with the stable domain code in `details.code`; consumers discriminate by `details.code`, never by `instanceof`.
- **Client styling**: feature CSS consumes the host design system through published tokens only — `--dsw-alias-*` for colour and surface, `--dsw-font-*` for the typography ladder, `--dsw-radius-*` for geometry. It declares no `--dsw-*` custom property of its own, states no literal colour, keeps every font size on the ladder, gates hover under `@media (hover: hover)`, and reduces every transition under `prefers-reduced-motion`. `npm run style:check` enforces all of it against the token snapshot; a harness upgrade means `npm run tokens:write`.
- **Teardown**: disposing the plugin kills every `typst watch` tree (session close + process-exit killNow); panel streams abort their host watch registrations.

## Development rules

- Tests: one behavior per spec; never `.only`, `.skip`, or `.todo` (use `.runIf`); synchronize on owned promises, never sleeps. The session spec drives the simulated typst CLI in `tests/fixtures/typst-fake.cjs` — keep its output shape in lockstep with what `src/typst/diagnostics.ts` parses.
- A spec's location is decided by the module it tests, not by when it was written: `tests/typst/`, `tests/workspace/`, `tests/tools/`, `tests/skills/`, `tests/host/`, `tests/client/`, and `tests/unit/` for cross-cutting pure logic. `scripts/test-lint.mjs` enforces the lane list and the size ratchets; its own predicates are driven by `tests/unit/test-lint.spec.ts`.
- Commits: `<type>(<scope>): <emoji> <subject>`: scope optional, lowercase type, imperative subject; body after a blank line, as bullet points explaining what and why.
- Never commit `dev.cordis.yml`; edit `dev.cordis.yml.example`.

## Validation

- Iterating: focused spec + `npm run typecheck`; add `npm run build:client` for `src/client/**`.
- Behavior changes: `npm test`.
- Cross-cutting, test-infrastructure, or release-bound: `npm run release:check`.
- Docs-only: `npm run format:check` and `npm run lint:test`.
- Client-facing changes additionally need `npm run smoke:discovery` (and `smoke:web-composition` with a browser).
- No PR workflow runs the suite; treat local validation as the gate. Report live checks you did not run.

## Safety

- **Workspace containment**: every path a tool takes is resolved and confined by `insideWorkspace`; escapes are refused (`TYPST_PATH_OUTSIDE_WORKSPACE`).
- **No network**: the plugin makes no network requests; typst itself may download `@preview` packages, as it would in a terminal.
- **No takeover of `.pdf` opening**: a `.pdf` in the workspace is still opened by the host's built-in document preview.
- **Generated output**: `lib/` is produced by `tsc` and `esbuild`; rebuild instead of editing.
