/**
 * Host-only alias of the shared wire boundary: the host Typert manifest's
 * invocations are exactly the shared list (`wire-schemas.ts`), materialized
 * with real zod factories. The client arm (`src/client/status-codec.ts`)
 * aliases the same list, so neither side can drift.
 * @module dsh-typst/status-codec
 */
import type { InvocationDescriptor } from "@deepseek-ai/dsh-typert-protocol";
/** Host Typert manifest invocations (real zod factory). */
export declare const TYPST_INVOCATIONS_HOST: readonly InvocationDescriptor[];
//# sourceMappingURL=status-codec.d.ts.map