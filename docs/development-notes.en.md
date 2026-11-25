<p align="right"><a href="development-notes.md"><b>中文</b></a></p>

# Development Notes

Current host contract review: 2026-11-24, pin `0.2.2-rc.5`. This page keeps upstream patches only; every entry has been checked against the current implementation and tests.

## Position

This page records one situation only: we use an upstream capability (`deepseek-harness` or one of its dependencies), but an upstream defect, incompleteness, or missing capability forces a local patch while we wait for a better upstream replacement. An adapted breaking change is archived without an entry. Internal architecture constraints, test gates, and release gates belong to `architecture.md`, `tests/README.md`, and `development.md`; this page points there.

## Entry Requirements

- **Upstream**: which host package provides the capability, and the current pin or version.
- **Upstream feature**: the capability we use.
- **Upstream defect**: why the public upstream contract cannot be used directly; state the symptom and impact.
- **Local patch**: how this repository works around it, including the symbols involved.
- **Why this is a compromise**: the assumptions, costs, and things the patch cannot do.
- **Upstream expectation**: the capability that would let us delete the patch; state a decidable condition.
- **Review trigger**: when to re-check, and which upstream file, symbol, or command to inspect.
- **Verification**: how tests prove the patch.
- **Follow-up**: the removal or migration steps once upstream satisfies the expectation.

## Upgrade Review

On every harness pin bump, check each entry's "upstream expectation": if it is now provided, migrate and delete the entry in the same change; if not, update only the pin and review date. Do not add an entry for a breaking change that is already adapted.

## DN-1: The hand-written Typert manifest

- **Upstream**: `@deepseek-ai/dsh-typert-registry` and the upstream Typert generator (pin `0.2.2-rc.5`).
- **Upstream feature**: Typert generates a host manifest for a plugin, declaring the wire service, method signatures, and business types; the Loader mounts the Remote from it.
- **Upstream defect**: the public contract runs the generator from the upstream monorepo workspace root, with both `tsconfig.host.json` and `packages/` present. This repository is a standalone checkout missing both, so a generated artifact cannot serve as the published entry.
- **Local patch**: `src/typert.ts` hand-writes `TYPERT_MANIFEST`, and `src/service.ts` registers it through `ctx.typert.register()`; the `./typert` package export stays off. The method list comes from `TYPST_INVOCATIONS_HOST` in `src/status-codec.ts`, while the wire shapes shared by both halves stay in `src/wire-schemas.ts`.
- **Why this is a compromise**: people maintain the signatures by hand, so the generator's static consistency check moves to tests, and tests catch a drifted method or business type. Registration uses the public `ctx.typert.register()` contract; the generated-artifact loading path stays unused.
- **Upstream expectation**: the generator accepts a standalone package layout, or exports a public manifest builder that runs from one package's `tsconfig`. Either one lets us generate this file and delete the hand-written implementation.
- **Review trigger**: after every `npm run harness:pin`; check the upstream Typert generator's help and README for a standalone/single-package mode, and confirm `ctx.typert.register()` is still the public path for hand-written schemas.
- **Verification**: `tests/host/typert-manifest.spec.ts` asserts that the manifest's methods equal `TYPST_INVOCATIONS` one for one, that every referenced business type is declared, and that every method carries a callable signature.
- **Follow-up**: switch to the generated artifact, delete `src/typert.ts` and `TYPERT_MANIFEST`, sync the client-host contract in `architecture.md` and the harness rule in the root `AGENTS.md`, then delete this entry.
