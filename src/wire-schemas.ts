/**
 * The wire boundary's single source: every zod schema the `typst` namespace
 * validates with, and the one shared invocation list both halves register.
 * `TYPST_INVOCATIONS` materializes each schema once through `strictCodec()`;
 * the host manifest aliases it in `src/status-codec.ts` and the browser face
 * aliases it in `src/client/status-codec.ts`. Neither half imports the
 * other's module or builds its own descriptor list, so the two sides cannot
 * disagree about a boundary.
 *
 * Client-safe: its imports are `zod`, the contract's own types, and the
 * runtime constants module, all of which
 * `scripts/client-graph-authority.mjs` allowlists.
 * @module dsh-typst/wire-schemas
 */

import { z } from "zod";
import type {
  InvocationDescriptor,
  TypertCodec,
} from "@deepseek-ai/dsh-typert-protocol";
import type {
  CompilePhase,
  DiagnosticView,
  HighlightView,
  PanelView,
  SnapshotView,
  SourceMatch,
  SourceRefView,
  ToolchainView,
  TypstStateFrame,
} from "./contract.js";

import {
  TYPST_LOCATE_SOURCE_METHOD,
  TYPST_READ_PREVIEW_METHOD,
  TYPST_SET_MAIN_METHOD,
  TYPST_STATUS_METHOD,
  TYPST_STATUS_SERVICE_KEY,
  TYPST_SETTINGS_NAMESPACE,
  TYPST_WATCH_METHOD,
} from "./constants.js";

/**
 * Wrap a wire schema in the strict codec arm Typert expects. The strict arm
 * is exactly `{ mode, typeSymbol, create }` (plus optional `encode`/`decode`
 * for byte-carrying results, which the preview result adds), so no live
 * schema property is carried and `create()` materializes on first use.
 * @param typeSymbol - the boundary type identity the manifest declares.
 * @param schema - the shared wire schema both halves validate through.
 * @returns the strict codec arm.
 */
export function strictCodec(
  typeSymbol: string,
  schema: z.ZodType,
): TypertCodec {
  return { mode: "strict", typeSymbol, create: () => schema };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const typstSourceSchema = z.enum(["setting", "path", "common", "shell"]);

export const toolchainSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("ready"),
      version: z.string(),
      path: z.string(),
      source: typstSourceSchema,
    })
    .strict(),
  z.object({ state: z.literal("missing") }).strict(),
  z
    .object({
      state: z.literal("too_old"),
      version: z.string(),
      path: z.string(),
      source: typstSourceSchema,
      error: z.string(),
    })
    .strict(),
  z
    .object({
      state: z.literal("error"),
      path: z.string().optional(),
      source: typstSourceSchema.optional(),
      error: z.string(),
    })
    .strict(),
]) satisfies z.ZodType<ToolchainView>;

export const diagnosticLocationSchema = z
  .object({
    file: z.string(),
    line: z.number().int(),
    column: z.number().int(),
  })
  .strict();

export const diagnosticPointSchema = z
  .object({
    message: z.string(),
    location: diagnosticLocationSchema.nullable(),
  })
  .strict();

export const diagnosticSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    message: z.string(),
    location: diagnosticLocationSchema.nullable(),
    excerpt: z.string().optional(),
    hints: z.array(z.string()),
    trace: z.array(diagnosticPointSchema),
  })
  .strict() satisfies z.ZodType<DiagnosticView>;

export const compilePhaseSchema = z.enum([
  "idle",
  "starting",
  "compiling",
  "ok",
  "warnings",
  "error",
  "crashed",
]) satisfies z.ZodType<CompilePhase>;

export const statusSchema = z
  .object({
    phase: compilePhaseSchema,
    run: z.number().int(),
    durationMs: z.number().optional(),
    error: z.string().optional(),
    finishedAt: z.number().optional(),
  })
  .strict();

export const previewIdentitySchema = z
  .object({
    generation: z.number().int(),
    seq: z.number().int(),
    sha256: z.string(),
  })
  .strict();

export const snapshotSchema = z
  .object({
    generation: z.number().int(),
    main: z.string(),
    run: z.number().int(),
    seq: z.number().int(),
    bytes: z.number().int(),
    pages: z.number().int(),
    sha256: z.string(),
    createdAt: z.number(),
  })
  .strict() satisfies z.ZodType<SnapshotView>;

export const sourceRefSchema = z
  .object({
    file: z.string(),
    line: z.number().int(),
    endLine: z.number().int(),
  })
  .strict() satisfies z.ZodType<SourceRefView>;

export const highlightSchema = z
  .object({
    id: z.string(),
    identity: previewIdentitySchema,
    quote: z.string(),
    comment: z.string(),
    source: sourceRefSchema.optional(),
    seq: z.number().int(),
    pageIndex: z.number().int(),
    rects: z.array(z.array(z.number())),
    stale: z.boolean(),
    createdAt: z.number(),
  })
  .strict() satisfies z.ZodType<HighlightView>;

export const panelViewSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("page"),
      pageIndex: z.number().int(),
      identity: previewIdentitySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("highlight"),
      id: z.string(),
      identity: previewIdentitySchema,
    })
    .strict(),
]) satisfies z.ZodType<Exclude<PanelView, null>>;

export const packageManagerSchema = z
  .object({
    name: z.string(),
    version: z.string().optional(),
    path: z.string(),
  })
  .strict();

export const hostFactsSchema = z
  .object({
    os: z.enum(["macos", "windows", "linux", "other"]),
    osName: z.string(),
    arch: z.string(),
    tools: z.array(packageManagerSchema),
  })
  .strict();

export const setupSchema = z
  .object({
    facts: hostFactsSchema.nullable(),
    searched: z.array(z.string()),
  })
  .strict();

export const typstStateFrameSchema = z
  .object({
    version: z.number().int(),
    generation: z.number().int(),
    previewError: z.string().nullable(),
    discovery: z
      .object({
        scanning: z.boolean(),
        includeExcluded: z.boolean(),
        visited: z.number().int(),
        errors: z.array(z.string()),
      })
      .strict(),
    toolchain: toolchainSchema,
    workspace: z.string(),
    main: z.string().nullable(),
    candidates: z.array(z.string()),
    fragments: z.array(z.string()),
    status: statusSchema,
    diagnostics: z.array(diagnosticSchema),
    snapshot: snapshotSchema.nullable(),
    highlights: z.array(highlightSchema),
    view: z.union([panelViewSchema, z.null()]),
    viewSeq: z.number().int(),
    setup: setupSchema,
  })
  .strict() satisfies z.ZodType<TypstStateFrame>;

export const setMainResultSchema = z.object({ main: z.string() }).strict();

export const sourceMatchSchema = z
  .object({
    file: z.string(),
    line: z.number().int(),
    column: z.number().int(),
    endLine: z.number().int(),
    excerpt: z.string(),
    score: z.number(),
  })
  .strict() satisfies z.ZodType<SourceMatch>;

export const locateSourceResultSchema = z
  .object({ matches: z.array(sourceMatchSchema) })
  .strict();

export const previewBytesSchema = z
  .object({
    generation: z.number().int(),
    seq: z.number().int(),
    sha256: z.string(),
    data: z.custom<Uint8Array>(),
  })
  .strict();

export const recheckResultSchema = typstStateFrameSchema;

// ---------------------------------------------------------------------------
// Invocation descriptors
// ---------------------------------------------------------------------------

const SERVICE = TYPST_STATUS_SERVICE_KEY;
const NAMESPACE = TYPST_SETTINGS_NAMESPACE;

/** One strict result codec keyed to the manifest's declared symbol. */
function resultCodec(
  typeSymbol: string,
  schema: z.ZodType,
): InvocationDescriptor["result"] {
  return strictCodec(typeSymbol, schema);
}

/**
 * Strict result codec that projects one typed binary field into the RPC's
 * byte attachments: the preview PDF never rides JSON as base64.
 */
function bytesCodec(
  typeSymbol: string,
  schema: z.ZodType,
  byteField: string,
): TypertCodec {
  return {
    mode: "strict",
    typeSymbol,
    create: () => schema,
    encode: (value, writeBytes) => {
      const record = value as Record<string, unknown>;
      const { [byteField]: data, ...rest } = record;
      return {
        ...rest,
        [byteField]: writeBytes(data as Uint8Array, [byteField]),
      };
    },
  };
}

/** The scope lookup parameter every endpoint takes (registered by the service). */
function scopeParameter(): InvocationDescriptor["parameters"][number] {
  return {
    name: "typstScope",
    wire: "typstScopeId",
    source: "lookup",
    lookup: "typstScope",
    codec: strictCodec("@deepseek-ai/dsh-typst#TypstScopeId", z.string()),
  };
}

/** The typst state frame result codec, shared by `status`, `watch`, and `recheck`. */
export const stateFrameCodec = resultCodec(
  "@deepseek-ai/dsh-typst/types#TypstStateFrame",
  typstStateFrameSchema,
);

/** `status`: the current state frame, first push of the panel's data. */
export const typstStatusInvocation: InvocationDescriptor = {
  id: "dsh-typst/status",
  service: SERVICE,
  namespace: NAMESPACE,
  method: TYPST_STATUS_METHOD,
  invocation: { kind: "direct" },
  cancellation: { parameter: "signal" },
  parameters: [scopeParameter()],
  result: stateFrameCodec,
};

/** `setMain`: choose the main `.typ` file; the frame updates follow on the stream. */
export const typstSetMainInvocation: InvocationDescriptor = {
  id: "dsh-typst/setMain",
  service: SERVICE,
  namespace: NAMESPACE,
  method: TYPST_SET_MAIN_METHOD,
  invocation: { kind: "direct" },
  cancellation: { parameter: "signal" },
  parameters: [
    scopeParameter(),
    {
      name: "path",
      wire: "path",
      source: "json",
      codec: strictCodec(
        "@deepseek-ai/dsh-typst#setMain.path",
        z.string().min(1).max(1024),
      ),
    },
  ],
  result: resultCodec(
    "@deepseek-ai/dsh-typst/types#SetMainResult",
    setMainResultSchema,
  ),
};

/**
 * `watch`: the live state stream. `mode: 'stream'`: the first yielded frame
 * is the current state, one frame follows every relevant change.
 */
export const typstWatchInvocation: InvocationDescriptor = {
  id: "dsh-typst/watch",
  service: SERVICE,
  namespace: NAMESPACE,
  method: TYPST_WATCH_METHOD,
  mode: "stream",
  invocation: { kind: "direct" },
  cancellation: { parameter: "signal" },
  parameters: [scopeParameter()],
  result: stateFrameCodec,
};

/**
 * `readPreview`: the current preview PDF's bytes. The strict codec projects
 * the `data` field into the RPC's byte attachments on the wire.
 */
export const typstReadPreviewInvocation: InvocationDescriptor = {
  id: "dsh-typst/readPreview",
  service: SERVICE,
  namespace: NAMESPACE,
  method: TYPST_READ_PREVIEW_METHOD,
  invocation: { kind: "direct" },
  cancellation: { parameter: "signal" },
  parameters: [
    scopeParameter(),
    {
      name: "identity",
      wire: "identity",
      source: "json",
      codec: strictCodec("dsh-typst#PreviewIdentity", previewIdentitySchema),
    },
  ],
  result: bytesCodec(
    "@deepseek-ai/dsh-typst/types#PreviewBytes",
    previewBytesSchema,
    "data",
  ),
};

/** `locateSource`: match rendered text against the workspace's sources. */
export const typstLocateSourceInvocation: InvocationDescriptor = {
  id: "dsh-typst/locateSource",
  service: SERVICE,
  namespace: NAMESPACE,
  method: TYPST_LOCATE_SOURCE_METHOD,
  invocation: { kind: "direct" },
  cancellation: { parameter: "signal" },
  parameters: [
    scopeParameter(),
    {
      name: "text",
      wire: "text",
      source: "json",
      codec: strictCodec(
        "@deepseek-ai/dsh-typst#locateSource.text",
        z.string().min(1).max(20_000),
      ),
    },
    {
      name: "focus",
      wire: "focus",
      source: "json",
      codec: strictCodec(
        "@deepseek-ai/dsh-typst#locateSource.focus",
        z.string().min(1).max(20_000).nullable(),
      ),
    },
  ],
  result: resultCodec(
    "@deepseek-ai/dsh-typst/types#LocateSourceResult",
    locateSourceResultSchema,
  ),
};

/** `recheck`: look Typst up again (the setup page's refresh), returning the new frame. */
export const typstRecheckInvocation: InvocationDescriptor = {
  id: "dsh-typst/recheck",
  service: SERVICE,
  namespace: NAMESPACE,
  method: "recheck",
  invocation: { kind: "direct" },
  cancellation: { parameter: "signal" },
  parameters: [scopeParameter()],
  result: stateFrameCodec,
};

/** `restart`: stop the watch, relocate typst, rescan, restart (the panel's restart button). */
export const typstRestartInvocation: InvocationDescriptor = {
  id: "dsh-typst/restart",
  service: SERVICE,
  namespace: NAMESPACE,
  method: "restart",
  invocation: { kind: "direct" },
  cancellation: { parameter: "signal" },
  parameters: [scopeParameter()],
  result: stateFrameCodec,
};

/** Explicit index refresh; the stream reports incremental progress. */
export const typstDiscoverInvocation: InvocationDescriptor = {
  id: "dsh-typst/discover",
  service: SERVICE,
  namespace: NAMESPACE,
  method: "discover",
  invocation: { kind: "direct" },
  cancellation: { parameter: "signal" },
  parameters: [
    scopeParameter(),
    {
      name: "includeExcluded",
      wire: "includeExcluded",
      source: "json",
      codec: strictCodec("dsh-typst#discover.includeExcluded", z.boolean()),
    },
  ],
  result: resultCodec("dsh-typst#DiscoverResult", z.object({}).strict()),
};

/** Both halves register exactly this list. */
export const TYPST_INVOCATIONS: readonly InvocationDescriptor[] = [
  typstStatusInvocation,
  typstSetMainInvocation,
  typstWatchInvocation,
  typstReadPreviewInvocation,
  typstLocateSourceInvocation,
  typstRecheckInvocation,
  typstRestartInvocation,
  typstDiscoverInvocation,
];
