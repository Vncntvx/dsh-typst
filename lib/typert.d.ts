/**
 * The hand-written host Typert manifest for the typst Remote. Registered
 * through `ctx.typert.register` in the service body, not as a generated
 * `./typert` artifact: Typert's generator runs only inside a workspace root
 * that contains both `tsconfig.host.json` and `packages/`, and this
 * repository is a standalone checkout with neither. The registry documents
 * `ctx.typert.register()` as the path for hand-written wire schemas. No
 * `./typert` export is declared on purpose: the production Loader row is the
 * npm package `dsh-typst-plugin`, and registering the same `package#face`
 * twice fails with "already registered". The wire namespace remains `typst`
 * (the Cordis service key / `TYPST_REMOTE_NAMESPACE`), independent of the
 * package identity. The strict registry is the Host Gateway's preferred
 * resolution path and needs no `@Remote` markers.
 *
 * Invocations come from `status-codec.ts` (host zod factories); the client
 * half mounts its own codecs in `client/status-codec.ts`. Both arms
 * materialize the same strict schemas from the client-safe
 * `wire-schemas.ts`. Structural endpoint identity is shared through
 * `contract.ts`.
 * @module dsh-typst/typert
 */
import type { TypertContribution } from "@deepseek-ai/dsh-typert-registry/types";
/** The typst namespace's host manifest (strict codecs owned by this half). */
export declare const TYPERT_MANIFEST: TypertContribution;
//# sourceMappingURL=typert.d.ts.map