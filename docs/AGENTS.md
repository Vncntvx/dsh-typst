# Documentation Writing and Routing

This file governs writing, splitting, and moving documents under `docs/**` and the root `README*`. Repository-wide engineering rules live in the root `AGENTS.md`; test lanes and fixtures live in `tests/README.md`. Rules fall into two groups: the items under "Gates" fail a check, and the rest are enforced in review.

## Scope

- Read this file before adding, rewriting, moving, or deleting a document under `docs/`.
- `docs/x.md` and `docs/x.en.md` are a pair; update both in the same commit.
- This file is the single-language agent instruction for documentation. It has no `.en.md` and is excluded from the pair scan.
- The root `AGENTS.md` carries rules needed in every session. This file carries document ownership and writing rules. Neither copies the other.
- `plugin-detail.md` is a marketplace fragment: a flat bullet list with no page title and no language switch. It still keeps a zh/en pair with the same number of top-level items.

## Fact Ownership

| Document               | Owns                                                                                                                                            | Does not own                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `product-model.md`     | Domain terms, the single component and user entry points, view responsibilities, system boundaries                                              | Configuration field tables, tool parameters, build steps                                           |
| `features.md`          | What users can do, interface behavior, main-file and panel behavior                                                                             | Internal modules, algorithm constants, storage paths                                               |
| `architecture.md`      | Component topology, data flows, state and consistency, concurrency and resources, security boundaries, client-host contracts, design boundaries | Per-field configuration tables, tool parameter tables, pixel recipes, per-source-file walkthroughs |
| `tools.md`             | Tool names, parameters, return shapes, error codes, call examples                                                                               | Internal implementation, client layout                                                             |
| `configuration.md`     | Namespaces, fields, defaults, hot reload, path and name rules                                                                                   | Tool semantics, architecture rationale                                                             |
| `development.md`       | Repository layout, build, test, debug, release workflow, CI                                                                                     | Runtime behavior detail, upstream patch rationale                                                  |
| `development-notes.md` | Local patches for upstream defects or missing capabilities, each with the upstream exit condition                                               | Already-adapted breaking changes, internal invariants, test or release gates                       |
| `skills.md`            | Skill names, workflows, budgets, evidence boundaries                                                                                            | Copies of tool schemas                                                                             |
| `troubleshooting.md`   | Symptoms, checks, fixes, error codes                                                                                                            | Design rationale                                                                                   |
| `getting-started.md`   | Installation, prerequisites, first task, panel entry                                                                                            | Configuration field tables, architecture rationale                                                 |
| `tests/README.md`      | Test lanes, fixtures, ratchets, coverage floors                                                                                                 | Product behavior                                                                                   |
| `index.md`             | Reading order and navigation                                                                                                                    | Fact bodies                                                                                        |
| `plugin-detail.md`     | Marketplace component summary                                                                                                                   | Configuration fields and implementation detail                                                     |
| `docs/AGENTS.md`       | Documentation ownership, writing rules, and gates                                                                                               | Product facts, runtime behavior                                                                    |
| Root `AGENTS.md`       | Standing repository rules                                                                                                                       | Document bodies                                                                                    |

`development-notes.md` records only upstream patches. Each entry states the upstream feature, the defect, the local patch, the compromise, and the upstream change that removes it. A migrated or no-longer-needed entry is deleted; no tombstone is kept.

## Writing Rules

- Lead with the actor, behavior, trigger, and result. A reader must be able to act or judge the outcome.
- Delete redundant negative tails. When the positive result already answers the question, drop `does not …`, `is not …`, and `does not mean …`; keep a security prohibition, API usage rule, or status distinction once in its owning reference.
- Current-state documents describe what happens now. Implementation history, WP numbers, commit hashes, and debugging transcripts belong in commit messages or a ledger entry's retirement reason.
- Drop sentences that carry no information, such as "first, it is important to clarify", "at its core", "completely", or "the highest".
- Copy identifiers, commands, paths, counts, defaults, error codes, and version strings from code or tests.
- Architecture is organized by runtime concern: topology, data flow, state and consistency, concurrency and resources, security, and client-host contracts. It does not walk through source files, and every invariant names its verification.
- Use one physical line per paragraph. Keep tables, lists, and code blocks in their existing format.
- `docs/x.md` and `docs/x.en.md` state the same facts, links, and counts. Write each language naturally; do not translate sentence by sentence.
- The ledger records upstream patches: upstream feature, defect, local patch, compromise, and upstream expectation. Internal invariants belong to `architecture.md`; build, test, and release gates belong to `development.md` and `tests/README.md`.

## Gates

- `tests/host/doc-lockstep.spec.ts`: discovers every document pair except this file; every pair exists with equal heading counts; every full page opens with the language switch; the pair count stated in `docs/development.md` matches the directory. The fragment `plugin-detail.md` keeps a pair and equal bullets, but has no page title or language switch.
- `tests/host/doc-examples.spec.ts`: example calls name a registered tool, pass declared and required arguments, and use declared enum values.
- `tests/host/doc-output.spec.ts`: both tool output tables list the same fields as the registered schemas.
- `tests/host/doc-release.spec.ts`: both release checklists follow the commands in `release:check` in order.
- `npm run test:docs`: runs the documentation specs together.
- `scripts/harness-state.mjs`: the pin, lockfile, and imported upstream artifacts are consistent; run `npm run harness:check`.
- `npm run format:check`: prettier covers every document.
- `npm run lint:test`: spec-size ratchets. A new spec stays under 400 lines; a frozen spec keeps its exact baseline.
- Review-enforced: control ownership rules in the root `AGENTS.md`; development-notes field integrity and `DN-` reference integrity.

A new top-level `docs/*.md` enters the pair and example scans automatically, except this single-language agent instruction. Create its `.en.md` in the same commit, add its entry to `docs/index.md`, and change the pair count in `docs/development.md` to the actual number.

## Moving One Fact

1. Find its single owner under "Fact Ownership". If none fits, decide the owner first; do not copy the fact into several documents.
2. Confirm the target already states the constraint and its verification: a test, a command, or a gate.
3. Write it once in the target; other documents link to that path.
4. Update `.en.md` in the same commit, except for this file. When adding or removing a document pair, update `docs/index.md` and the pair count in `docs/development.md`.
5. An upstream patch that is no longer needed is deleted, not tombstoned. A migrated internal constraint lives in its owning page; a test or release rule lives in `tests/README.md` or `development.md`.
