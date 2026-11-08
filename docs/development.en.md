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

The Chinese documents under `docs/` and their `.en.md` English twins are maintained in lockstep: changing one side means changing the other. The vocabulary and the boundaries are defined by the [product model](product-model.en.md).

| Document                                       | Content                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| [Documentation index](index.en.md)             | The map of the documentation                                                  |
| [Product model](product-model.en.md)           | Vocabulary, entries, components, data flow and the runtime boundaries         |
| [Architecture](architecture.en.md)             | Layer responsibilities, data flow, processes and lifecycle                    |
| [Tool reference](tools.en.md)                  | The parameters and error codes of the 7 tools and of the panel's wire methods |
| [Configuration reference](configuration.en.md) | Settings fields, the lookup order and the hot-reload behaviour                |
| [Getting started](getting-started.en.md)       | Installation, prerequisites and the first task                                |
| [Features](features.en.md)                     | What each surface can do and does not do                                      |
| [Troubleshooting](troubleshooting.en.md)       | Common symptoms, causes and what to do                                        |

The rules for agents and contributors live in the repository root's `AGENTS.md`.

## Installation and build

```sh
npm install                  # dependencies, and lib/ through prepare
npm run build                # tsc declarations + the browser bundle
npm run build:client         # the browser bundle only (required after src/client/** changes)
npm run typecheck            # the harness pin check + the node, test and client tsc
npm test                     # the test-lint guards + the full vitest suite
npm run format               # prettier --write; verify with format:check
```

`prepare` is the build a consumer runs when installing from source: it transpiles the Node half, runs the real client build and proves the entry files are on disk. The declarations come from `tsc` in `npm run build`, which the publish path (`prepublishOnly` → `release:check`) runs first.

### The upstream artifact gate

```sh
npm run harness:check        # the pin, the lockfile and upstream artifact freshness
npm run deps:check           # whether the direct dependencies are all behind the registry
npm run tokens:write         # refresh the design token snapshot after a harness upgrade
```

`harness:check` reports **problems**, `deps:check` reports **work to do**: the first one failing blocks the release, the second one failing means a dependency is not in the registry yet and has to be dealt with rather than ignored.

## Local debugging

### Full plugin debugging (with the web UI)

Copy `dev.cordis.yml.example` to `dev.cordis.yml`, point its `name` at this repository's absolute path, and start the local harness. After a change under `src/client/**`, run `npm run build:client`: the browser half is a bundle, not source.

> Note: `dev.cordis.yml` carries an absolute path and is never committed; edit the template `dev.cordis.yml.example`.

### Host-only debugging

`npm run dev` runs `tsc` in watch mode. The host half is ESM source, so a rebuild is enough to see a change; the whole host does not need a restart.

### Debugging the preview panel

Most panel problems sit on the contract between the two halves: the shape of a state frame, the assembly of a resource address, or the pdf.js load. Start with the host log lines prefixed `[dsh-typst]` — the session's location, the watch's startup and its relocation are all reported there.

## Test conventions

- One behavior per spec; never `.only`, `.skip` or `.todo` (use `.runIf` when a conditional gate is needed).
- Synchronize on the promises you own; never sleep waiting.
- A spec's location is decided by the module it tests; see [tests/README.md](../tests/README.md).
- `tests/fixtures/typst-fake.cjs` is the simulated typst CLI; its output shape must stay in lockstep with what `src/typst/diagnostics.ts` parses.
- `npm run lint:test` holds the mechanical guards (size, lanes, focused cases, upstream source imports); they run together with the cases.

## Release checklist

1. `npm run format:check` — the formatting is consistent.
2. `npm run lint:test` — the test-lint guards pass.
3. `npm run style:check` — the client style guards agree with the token snapshot.
4. `npm run harness:check` (strict) — the pin, the lockfile and the upstream artifacts are fresh.
5. `npm run typecheck` — the three tsc projects pass.
6. `npm run test:coverage` — every case passes and the coverage thresholds are met.
7. `npm run build` — the declarations and the browser bundle are produced.
8. `npm run verify:pack` — the packed artifact's entries and file list are correct.

`npm run release:check` runs the whole chain in one go; it is also the content of `prepublishOnly`.

Client-facing changes additionally need `npm run smoke:discovery`, and with a browser `npm run smoke:web-composition`.

> Note: no PR workflow runs this suite, so local validation is the gate. Report the live checks you did not run.
