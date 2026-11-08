# The test suite

The suite is small on purpose: a Typst plugin has one process, one file format and one binary to talk to. What it does have is a long tail of timing-sensitive behaviour — a watch process that must survive, a settle that must not return early, a highlight that must survive a recompile — and those need rules that a reviewer can check by reading.

This document owns the lane layout, the fixture contract, the case-writing rules and the mechanical guards. `scripts/test-lint.mjs` enforces the parts that are mechanical; the rest are review rules.

## Layout: a spec's location is decided by what it tests

A spec lives in the lane that mirrors the `src/` module it covers. Not by when it was written, not by who wrote it, not by how big it grew.

| Lane               | Covers                                                                                              | Example                           |
| ------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------- |
| `tests/typst/`     | `src/typst/` — binary location, watch driver, diagnostics, matching, one-shot compiles              | `tests/typst/watch-log.spec.ts`   |
| `tests/workspace/` | `src/workspace/` — the session state machine                                                        | `tests/workspace/session.spec.ts` |
| `tests/tools/`     | `src/tools/` — the registered tools and their schemas                                               |                                   |
| `tests/skills/`    | `src/skills/` — the skill registration and body                                                     |                                   |
| `tests/host/`      | `src/host/` — host facts detection, and the cross-cutting documentation guards                      | `tests/host/doc-examples.spec.ts` |
| `tests/client/`    | `src/client/` — the browser half under jsdom                                                        |                                   |
| `tests/unit/`      | cross-cutting pure logic with no layer of its own (`src/constants.ts`, `src/errors.ts`, the guards) | `tests/unit/test-lint.spec.ts`    |
| `tests/fixtures/`  | shared fixtures and simulators; never a spec                                                        | `tests/fixtures/typst-fake.cjs`   |

Nested lanes are covered by their first segment (`tests/typst/locate/` is the `typst` lane).

`scripts/test-lint.mjs` refuses a spec in any other directory, so a lane that is not declared cannot be created by accident.

### Module ownership and splitting

A spec that grows past the ratchet (`MAX_SPEC_LINES` in `scripts/test-lint.mjs`) is split along its own seams, and the ratchet is lowered in the same commit. The current ceiling is `tests/workspace/session.spec.ts`; lowering it requires splitting that spec first.

The ratchets only ever move down. A ratchet that never tightens is a comment; one that tightens by itself would fail on the next unrelated commit.

## The shared layer

### The simulated typst CLI

`tests/fixtures/typst-fake.cjs` is the typst the suite talks to. It answers `--version`, emits watch output in the shape `typst watch` emits, and writes a placeholder PDF whose first bytes are `%PDF-`.

**Its output shape is a contract.** `src/typst/diagnostics.ts` parses what this file prints. When the parser changes, the fixture changes in the same commit — a parser change that the fixture does not exercise is a parser change that only breaks in production.

Two properties of the fixture are load-bearing:

- **The watch must not be `unref()`'d.** A watch whose interval is unreferenced lets the event loop drain after the first compile, the process exits, and the watcher reports a crash. This is why the fixture keeps the loop alive.
- **The PDF must be complete enough to parse.** The session spec reads the bytes back and checks the `%PDF-` header; a truncated fixture makes the snapshot assertions pass for the wrong reason.

### Helpers

Helpers live under a `helpers/` directory next to the lane that owns them and are capped at `MAX_HELPER_LINES`. A helper that outgrows the cap is split along its own seam rather than raised.

## Four rules

### One behavior per spec

A spec asserts one behavior. When a spec asserts three, a failure says three things at once and the reader has to work out which one moved.

### Never a focused or a disabled case

`.only` removes every other case from the run without saying so. `.skip` and `.todo` turn a red test into a green suite. Both are refused by `scripts/test-lint.mjs`, in their chained forms (`it.concurrent.only`, `it.only.each`) and across line breaks.

`.runIf` is the sanctioned gate. Its unconditional spelling (`runIf(false)`) is refused exactly like `skipIf(true)`: a conditional gate is the author's call, an unconditional one is a hidden decision.

### Synchronize on owned promises, never sleep

A `setTimeout` in a test is a bet that the machine is fast enough. Wait on the promise you own — the session's settle, the deferred you resolved yourself — and let the test fail by timing out rather than by racing.

The session spec is the hard case: it waits for a real watch process to compile. It waits by asking the session to settle, not by sleeping long enough and hoping.

### Do not weaken the assertion to make it pass

A test that starts asserting less is a test that was removed with extra steps. When a behavior changes, change the expectation to the new fact and make the failure message say what the new fact is.

## Guards

`scripts/test-lint.mjs` holds the rules that decay silently. Run it with `npm run lint:test`; `npm test` runs it before the cases.

| Guard              | What it refuses                                                                         |
| ------------------ | --------------------------------------------------------------------------------------- |
| Control bytes      | A text file carrying a raw control byte (the NUL-byte corruption)                       |
| Extension coverage | A file extension under the text roots that is neither declared text nor declared binary |
| Spec size          | A spec above `MAX_SPEC_LINES`                                                           |
| Helper size        | A helper above `MAX_HELPER_LINES`, or a baselined helper that grew                      |
| Lanes              | A spec in a directory no lane declares                                                  |
| Focus              | `.only`, `.skip`, `.todo`, and the unconditional conditional gates                      |
| Upstream source    | An import into an upstream package's unpublished `src/` tree                            |

The last one matters for installs: the published `@deepseek-ai/*` packages advertise `"./src/*"` in their exports but ship only `lib/**` and `locale/*.json`, so such an import resolves in a sibling checkout and fails in a registry-only install.

The guards' own predicates are driven by `tests/unit/test-lint.spec.ts`: a regex that stopped matching the form its docstring names would otherwise fail the suite green.

## The documentation guards

`tests/host/doc-examples.spec.ts` guards the documentation rather than the code, and it lives in the suite because a documentation error is a defect of the same kind as a broken call.

It checks four things:

- **Every documented call names a tool the registry answers.** A call to a tool that no longer exists is a reader's dead end.
- **Every documented argument is one the tool declares.** A README that prints `pdf_standard` where the schema says `pdfStandard` teaches the model a call the tool rejects.
- **Every required argument is present, and every enum value is one the tool declares.**
- **Every zh/en document pair carries the same number of headings.** The two files are translations of each other; a section that exists on one side only is a section that was forgotten.

The spec registers the tools with a stub context, so it exercises the real schemas without running a tool.

## Validation

- Iterating: `npx vitest run <spec>`.
- Before a commit: `npm test` (guards + cases).
- Release-bound: `npm run release:check`.
- The session spec spawns a real process and is the slowest lane; it is the first thing to suspect when a run is slow, and the first thing to run alone when a failure looks like a timing artifact.

### The session spec's known fragility

The session lane is the one that talks to a real process, and it is the one that flakes: under load, the first watch round can miss the settle deadline, and the cases that follow fail on a phase that is not `ok` rather than on an assertion about the behaviour.

The shape of a flaky failure is specific, and it is worth recognising before spending an hour on it:

- `The document has not compiled successfully yet` from `WorkspaceSession.highlight`, or
- `expected undefined to be defined` on `state.highlights[0]`, or
- a `TYPST_TIMEOUT` from `settle`.

All three are the same fact: the compile did not finish when the case looked at it. Run the lane alone (`npx vitest run tests/workspace/session.spec.ts`) to confirm before changing anything; if it passes alone, the failure is load, not the behaviour under test.

## Not here, on purpose

- No snapshot tests: they replace one brittle assertion with a file nobody reads.
- No test-only shims in `src/`: a production module exports behavior, and a shim in `src/` is a second implementation waiting to drift.
- No spec written to reach a branch. If a branch is unreachable, say so in the code; if it is reachable but untested, that is a finding to report, not a spec to invent.
- No mocking of the typst binary beyond `tests/fixtures/typst-fake.cjs`: the session's real subject is the process, and a mocked process would test the mock.
- No prose linting of the documents beyond what `doc-examples.spec.ts` checks: a rule that cannot fail a case is a rule nobody reads.
