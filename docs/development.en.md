<p align="right"><a href="development.md"><b>中文</b></a></p>

# Development guide

This document describes the repository layout, the documentation assets, the build and debug workflows, the test conventions and the release checklist. The rules for agents and contributors live in the repository root's `AGENTS.md`; the test lane rules live in [tests/README.md](../tests/README.md).

## Repository layout

```text
src/
├── index.ts             # plugin entry
├── service.ts           # ctx.typstWorkbench: session registry, config lifecycle, tools and skill
├── remote.ts            # host Typert Remote runtime (the typst namespace)
├── typert.ts            # the hand-written Typert manifest
├── contract.ts          # wire view types (shared by both halves)
├── wire-schemas.ts      # zod schemas shared by both halves
├── status-codec.ts      # host-side zod codecs
├── config.ts            # settings schema (volatile)
├── constants.ts         # constants and LIMITS shared by both halves
├── errors.ts            # domain error codes and the RemoteError translation
├── client/              # browser half
│   ├── index.ts         # client plugin body
│   ├── provider.ts      # the typst resource protocol
│   ├── remote.ts        # client Typert contribution
│   ├── PreviewTab.tsx   # the right-sidebar preview panel
│   ├── candidates.ts    # the document/fragment split
│   ├── ProblemsPanel.tsx
│   ├── SetupPanel.tsx
│   ├── selection.ts     # selected text to source location
│   ├── toolviews.tsx    # tool cards
│   └── pdf/             # pdf.js Blob Worker
│       ├── document.ts  # the canvas rendering
│       ├── outline.ts   # PDF bookmarks to the outline
│       └── runtime.ts   # the worker and the loading task
├── host/                # host facts detection (for the setup guide)
├── skills/              # the typst skill
├── tools/               # registration and shared helpers for the 7 tools
├── typst/               # Typst domain: location, watch, diagnostics, matching, one-shot compiles
└── workspace/           # WorkspaceSession

tests/
├── unit/                # cross-cutting pure logic
├── typst/               # the behavior of src/typst/
├── workspace/           # the behavior of src/workspace/
├── tools/               # the behavior of src/tools/
├── skills/              # the behavior of src/skills/
├── host/                # src/host/ and the documentation guards
├── client/              # the behavior of src/client/
├── fixtures/            # the simulated typst CLI
└── README.md            # test conventions
```

## Documentation assets

The 12 zh/en doc pairs under `docs/` are maintained in lockstep: changing one side means changing the other. The vocabulary and boundaries are defined by the [product model](product-model.en.md). Document ownership, writing rules and gates live in [docs/AGENTS.md](AGENTS.md).

| Document                                       | Content                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| [Getting started](getting-started.en.md)       | Installation, prerequisites and the first task                            |
| [Product model](product-model.en.md)           | Vocabulary, entries, the single component, data flow and boundaries       |
| [Features](features.en.md)                     | Live preview, problems pane, selection-to-source, highlights and export   |
| [Typst skill](skills.en.md)                    | Four phases, batching budgets and evidence boundaries                     |
| [Tool reference](tools.en.md)                  | Parameters, outputs and error codes of the 7 tools and panel wire methods |
| [Configuration reference](configuration.en.md) | The 4 settings fields, lookup order and hot-reload behaviour              |
| [Troubleshooting](troubleshooting.en.md)       | Common symptoms, causes and what to do                                    |
| [Architecture](architecture.en.md)             | Component topology, data flow, state, concurrency, security and contracts |
| [Development guide](development.en.md)         | Repository layout, build, test, debug and release                         |
| [Development notes](development-notes.en.md)   | Upstream patches, compromises and exit conditions                         |
| [Documentation index](index.en.md)             | The reader's entry point                                                  |
| [Plugin detail](plugin-detail.en.md)           | The marketplace component summary                                         |

Product structure and terminology live in the [product model](product-model.en.md); agent and contributor rules live in the repository root's `AGENTS.md`.

## Installation and build

```sh
npm install                  # dependencies, and lib/ through prepare
npm run build                # tsc declarations + the browser bundle
npm run build:client         # the browser bundle only (required after src/client/** changes)
npm run typecheck            # the harness pin check + the node, test, client, client-test and scripts tsc
npm test                     # the test-lint guards + the full vitest suite
npm run test:docs            # document pairs, tool contracts, and release checklist
npm run format               # prettier --write; verify with format:check
```

`prepare` is the build a consumer runs when installing from source: it transpiles the Node half, runs the real client build and proves the entry files are on disk. The declarations come from `tsc` in `npm run build`, which the publish path (`prepublishOnly` → `release:check`) runs first.

### The upstream artifact gate

```sh
npm run harness:check        # the pin, the lockfile and upstream artifact freshness
npm run deps:check           # whether the direct dependencies are all behind the registry
npm run tokens:write         # refresh the design token snapshot after a harness upgrade
```

`harness:check` reports **problems**, `deps:check` reports **work to do**: the first one failing blocks the release; the second one lists direct dependencies that are not in the registry yet and still need handling.

`tokens:write` reads the installed pinned `@deepseek-ai/dsh-client-ui-theme` by default (the same version as the manifest pin); `DSH_THEME_DIR` only points at another theme checkout explicitly, and a missing path fails outright. A sibling `../deepseek-harness` theme whose version differs from the pin is skipped, so the snapshot records only the palette the plugin is pinned to.

### Pin upgrade checklist

1. `npm run harness:pin -- <ver>` rewrites the exact versions in `dependencies`, `devDependencies` and `overrides`.
2. `npm install --package-lock-only` updates the lockfile; never edit a version by hand.
3. `npm run harness:check`; the pin, vendored package floors and upstream artifacts must agree.
4. Check each [development note](development-notes.en.md) against its upstream expectation: migrate and delete an entry that is satisfied, otherwise update only the pin and review date.
5. When an architecture or root `AGENTS.md` constraint depends on the pin and changes, update both in the same change.

## Local debugging

There are two routes: to change the browser UI you must **install the package into a profile** (`dsh plugin --profile web add .`), otherwise the page gets the host tools but no panel; for host-only changes, the `--patch` overlay gives you hot reload without restarts.

### Prerequisite: upstream artifacts match the current source

This repository reads declarations and runtime through the sibling `../deepseek-harness`. When the client and the source disagree, rebuild upstream before suspecting the plugin:

```sh
pnpm --dir ../deepseek-harness run build             # declarations and Node artifacts
pnpm --dir ../deepseek-harness run build:lib:client  # browser runtime
npm run harness:check                                # check both halves are still the same generation
```

> Observed trap: when upstream is only partially built, `dsh web` still starts, but the Typert loader reports `entries did not activate` and the page appears to have "no workspaces and no sessions". That is an upstream artifact problem, not this plugin's panel; rebuild upstream with the commands above first.

### Full plugin debugging (with the web UI)

Start from a clean temporary profile every time, with `~/.dsh` left untouched:

```sh
export DSH_HOME=$(mktemp -d /tmp/dsh-typst-dev-XXXX)
cp ~/.dsh/.credentials.yaml "$DSH_HOME/"   # optional: needed for real models/sessions
chmod 600 "$DSH_HOME/.credentials.yaml"

npm run build                               # produces lib/ and lib/client.js
dsh plugin --profile web add .              # installs this checkout into the profile (the panel resolves by package name)

npm run dev &                               # host: tsc --watch
npm run dev:client &                        # client: esbuild --watch
dsh web --port 3307                         # start the web host
```

Open the `http://127.0.0.1:3307/?token=...` URL printed in the log, create a session in the default workspace, then open the **Typst** tab in the right sidebar. After a change under `src/client/**`, `dev:client` repacks the browser half; reload the page. After a host change under `src/**`, `dev` compiles incrementally; restart `dsh web` if needed.

> Note: `dsh plugin --profile web add .` links the profile to the current checkout, so a later `npm run build` takes effect immediately; rerun it only when the checkout moves or the package name changes. To verify host behavior quickly, the `--patch` overlay in the next section is lighter.

### Host-only debugging (with hot reload)

```sh
npm run build
npm run dev &
cp dev.cordis.yml.example dev.cordis.yml     # point name at this repository's lib/index.js absolute path
dsh web --patch ./dev.cordis.yml --port 3307
```

`--patch` loads `lib/index.js` by absolute path, so the Loader can hot-swap host changes without a restart; the browser half is still the `lib/client.js` bundle, so after `src/client/**` run `npm run build:client` and reload. `dev.cordis.yml` carries an absolute path and is never committed.

### Debugging the preview panel

Most panel problems sit on the contract between the two halves: the shape of a state frame, the assembly of a resource address, or the pdf.js load. Start with the host log lines prefixed `[dsh-typst]` — the session's location, the watch's startup and its relocation are all reported there. With no `.typ` in the workspace the panel stops at the setup page; put a main file there that `typst` can compile on its own before reviewing the preview, the main-file menu, the problems pane, and the outline.

## Test conventions

- One behavior per spec; never `.only`, `.skip` or `.todo` (use `.runIf` when a conditional gate is needed).
- Synchronize on the promises you own; never sleep waiting.
- A spec's location is decided by the module it tests; see [tests/README.md](../tests/README.md).
- `tests/fixtures/typst-fake.cjs` is the simulated typst CLI; its output shape must stay in lockstep with what `src/typst/diagnostics.ts` parses.
- `npm run lint:test` holds the mechanical guards (size, lanes, focused cases, upstream source imports); they run together with the cases.

## Release checklist

1. `npm run format:check` — the formatting is consistent.
2. `node scripts/harness-state.mjs --strict` checks the harness pin, lockfile, and upstream artifacts.
3. `npm run lint:test` checks the test suite's conventions.
4. `npm run tokens:check` checks the design token snapshot.
5. `npm run style:check` checks client styles.
6. `npm run typecheck` checks the five TypeScript projects.
7. `npm run test:docs` checks document pairs, tool contracts, and the release checklist.
8. `npm run test:coverage` runs the full suite and checks coverage thresholds.
9. `npm run build` produces the declarations and browser bundle.
10. `npm run verify:pack` checks the packed artifact's entries and file list.

`npm run release:check` runs the whole chain in one go; it is also the content of `prepublishOnly`.

Client-facing changes additionally need `npm run smoke:discovery`, and with a browser `npm run smoke:web-composition`.

## CI workflows

`.github/workflows/` holds five workflows:

- `release-branch.yml`: a `v*` tag push runs the read-only quality job (`npm run release:check`), produces one `release-artifact-<source SHA>`, and hands it to the three-platform install matrix, which verifies every file with `scripts/release-artifact.mjs --verify`, installs the published dsh CLI and pnpm at the exact pin from the isolated consumer lockfile, and loads the profile through `dsh plugin add`. Linux also boots the web composition and asserts the plugin's `client.js` is served. Once every platform passes, `npm-release` submits that same tarball to npm over OIDC, and `publish` re-verifies it before moving the tag channel `stable`.
- `prebuilt.yml`: on a `main` push or a manual dispatch, builds and verifies the prebuilt artifact and moves the rolling `release` channel; it shares the `release-branch` concurrency group with the workflow above, so the two channels never move concurrently.
- `verify-npm-release.yml`: after a successful release run, a delayed job in the `npm-publication` environment downloads the public tarball, checks its SHA-512 integrity against the artifact, then creates or refreshes the GitHub Release.
- `upstream-health.yml`: every Monday at 02:00 UTC it runs `npm run release:check` and compares the pin with the harness `next` mainline; a failing `deps:check` is informational and never silences the report.
- `scanner.yml`: runs the HOL Guard scanner on pull requests and `main` pushes, failing below 75.

Supply chain: every third-party action is pinned to an immutable commit SHA with its version in a trailing comment; npm publication uses OIDC trusted publishing (npm CLI ≥ 11.5.1; the pinned Node 24.22.3 carries npm 11.19.1) and stores no token; `npm-release` and `publish` download, verify and submit existing bytes and never rebuild; the scanner grants only `contents: read`, so fork pull requests run under the same constraints.

Browser acceptance stays local: it needs a real `typst` binary, which the GitHub runners do not carry. `npm run smoke:web-composition` remains a local gate before a release.

### Versions, release notes, and channels

The manifest version is authoritative; update the `package-lock.json` root entry before tagging. Tags use `v<version>` and point at a main commit that passed every gate; the tag, the manifest and the release notes must agree. Prereleases follow SemVer (for example `0.2.0-alpha.1`); the npm dist-tag is the first prerelease identifier (`alpha` in that example, `next` for a numeric or `latest` identifier), and the GitHub Release is marked prerelease and never Latest.

Both installation channels record their source: `release` follows main and reinitializes from current main after an amend or force push rewrites it; `stable` only moves forward along main history, and one source commit producing different bytes is refused. Git-hosted installs use `github:Vncntvx/dsh-typst#release` (no build scripts, no `allowBuilds` approval); npm installs use the version.

Local review: `npm run release:branch -- --dry-run` (the worktree must be clean). A real push requires `--push --artifact <checked artifact directory>` against the project's `release` or `stable` channel.

Trusted publishing needs a trusted publisher for `Vncntvx/dsh-typst` on npmjs.com whose workflow file is exactly `release-branch.yml` (case-sensitive) and which allows `npm publish`.

The delayed verification relies on the `npm-publication` environment: set a 15-minute wait timer for it under Settings → Environments, so GitHub starts the verification runner only after npm has had time to publish. While npm does not show the version yet, the job queries the registry at most 12 times, 10 seconds apart, and asks for a re-run in the job summary when the 404 persists.

> Note: pull requests only run the security scanner; the quality gate runs on `v*` tags and in the weekly upstream job, so local validation is the merge gate. Report the live checks you did not run.
