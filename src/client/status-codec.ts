/**
 * Client alias of the shared wire boundary: the mounted `typst` namespace's
 * invocation descriptors are exactly the shared list (`wire-schemas.ts`),
 * materialized with the same zod factories. Host half aliases it in
 * `src/status-codec.ts`; neither side can drift.
 * @module dsh-typst/client/status-codec
 */

import type { InvocationDescriptor } from "@deepseek-ai/dsh-typert-protocol";
import { TYPST_INVOCATIONS } from "../wire-schemas.js";

/** Client Typert contribution invocations (same shared list as the host). */
export const TYPST_INVOCATIONS_CLIENT: readonly InvocationDescriptor[] =
  TYPST_INVOCATIONS;
