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
import type { InvocationDescriptor, TypertCodec } from "@deepseek-ai/dsh-typert-protocol";
/**
 * Wrap a wire schema in the strict codec arm Typert expects. The strict arm
 * is exactly `{ mode, typeSymbol, create }` (plus optional `encode`/`decode`
 * for byte-carrying results, which the preview result adds), so no live
 * schema property is carried and `create()` materializes on first use.
 * @param typeSymbol - the boundary type identity the manifest declares.
 * @param schema - the shared wire schema both halves validate through.
 * @returns the strict codec arm.
 */
export declare function strictCodec(typeSymbol: string, schema: z.ZodType): TypertCodec;
export declare const typstSourceSchema: z.ZodEnum<{
    setting: "setting";
    path: "path";
    common: "common";
    shell: "shell";
}>;
export declare const toolchainSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"ready">;
    version: z.ZodString;
    path: z.ZodString;
    source: z.ZodEnum<{
        setting: "setting";
        path: "path";
        common: "common";
        shell: "shell";
    }>;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"missing">;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"too_old">;
    version: z.ZodString;
    path: z.ZodString;
    source: z.ZodEnum<{
        setting: "setting";
        path: "path";
        common: "common";
        shell: "shell";
    }>;
    error: z.ZodString;
}, z.core.$strict>, z.ZodObject<{
    state: z.ZodLiteral<"error">;
    path: z.ZodOptional<z.ZodString>;
    source: z.ZodOptional<z.ZodEnum<{
        setting: "setting";
        path: "path";
        common: "common";
        shell: "shell";
    }>>;
    error: z.ZodString;
}, z.core.$strict>], "state">;
export declare const diagnosticLocationSchema: z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNumber;
    column: z.ZodNumber;
}, z.core.$strict>;
export declare const diagnosticPointSchema: z.ZodObject<{
    message: z.ZodString;
    location: z.ZodNullable<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        column: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const diagnosticSchema: z.ZodObject<{
    severity: z.ZodEnum<{
        error: "error";
        warning: "warning";
    }>;
    message: z.ZodString;
    location: z.ZodNullable<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        column: z.ZodNumber;
    }, z.core.$strict>>;
    excerpt: z.ZodOptional<z.ZodString>;
    hints: z.ZodArray<z.ZodString>;
    trace: z.ZodArray<z.ZodObject<{
        message: z.ZodString;
        location: z.ZodNullable<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
            column: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const compilePhaseSchema: z.ZodEnum<{
    error: "error";
    idle: "idle";
    starting: "starting";
    compiling: "compiling";
    ok: "ok";
    warnings: "warnings";
    crashed: "crashed";
}>;
export declare const statusSchema: z.ZodObject<{
    phase: z.ZodEnum<{
        error: "error";
        idle: "idle";
        starting: "starting";
        compiling: "compiling";
        ok: "ok";
        warnings: "warnings";
        crashed: "crashed";
    }>;
    run: z.ZodNumber;
    durationMs: z.ZodOptional<z.ZodNumber>;
    error: z.ZodOptional<z.ZodString>;
    finishedAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const previewIdentitySchema: z.ZodObject<{
    generation: z.ZodNumber;
    seq: z.ZodNumber;
    sha256: z.ZodString;
}, z.core.$strict>;
export declare const snapshotSchema: z.ZodObject<{
    generation: z.ZodNumber;
    main: z.ZodString;
    run: z.ZodNumber;
    seq: z.ZodNumber;
    bytes: z.ZodNumber;
    pages: z.ZodNumber;
    sha256: z.ZodString;
    createdAt: z.ZodNumber;
}, z.core.$strict>;
export declare const sourceRefSchema: z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNumber;
    endLine: z.ZodNumber;
}, z.core.$strict>;
export declare const highlightSchema: z.ZodObject<{
    id: z.ZodString;
    identity: z.ZodObject<{
        generation: z.ZodNumber;
        seq: z.ZodNumber;
        sha256: z.ZodString;
    }, z.core.$strict>;
    quote: z.ZodString;
    comment: z.ZodString;
    source: z.ZodOptional<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        endLine: z.ZodNumber;
    }, z.core.$strict>>;
    seq: z.ZodNumber;
    pageIndex: z.ZodNumber;
    startOffset: z.ZodOptional<z.ZodNumber>;
    occurrence: z.ZodOptional<z.ZodNumber>;
    rects: z.ZodArray<z.ZodArray<z.ZodNumber>>;
    stale: z.ZodBoolean;
    createdAt: z.ZodNumber;
}, z.core.$strict>;
export declare const panelViewSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"page">;
    pageIndex: z.ZodNumber;
    identity: z.ZodObject<{
        generation: z.ZodNumber;
        seq: z.ZodNumber;
        sha256: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"highlight">;
    id: z.ZodString;
    identity: z.ZodObject<{
        generation: z.ZodNumber;
        seq: z.ZodNumber;
        sha256: z.ZodString;
    }, z.core.$strict>;
}, z.core.$strict>], "kind">;
export declare const packageManagerSchema: z.ZodObject<{
    name: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
    path: z.ZodString;
}, z.core.$strict>;
export declare const hostFactsSchema: z.ZodObject<{
    os: z.ZodEnum<{
        macos: "macos";
        windows: "windows";
        linux: "linux";
        other: "other";
    }>;
    osName: z.ZodString;
    arch: z.ZodString;
    tools: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        version: z.ZodOptional<z.ZodString>;
        path: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const setupSchema: z.ZodObject<{
    facts: z.ZodNullable<z.ZodObject<{
        os: z.ZodEnum<{
            macos: "macos";
            windows: "windows";
            linux: "linux";
            other: "other";
        }>;
        osName: z.ZodString;
        arch: z.ZodString;
        tools: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            version: z.ZodOptional<z.ZodString>;
            path: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    searched: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const typstStateFrameSchema: z.ZodObject<{
    version: z.ZodNumber;
    generation: z.ZodNumber;
    previewError: z.ZodNullable<z.ZodString>;
    discovery: z.ZodObject<{
        scanning: z.ZodBoolean;
        includeExcluded: z.ZodBoolean;
        visited: z.ZodNumber;
        errors: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    toolchain: z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"ready">;
        version: z.ZodString;
        path: z.ZodString;
        source: z.ZodEnum<{
            setting: "setting";
            path: "path";
            common: "common";
            shell: "shell";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"missing">;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"too_old">;
        version: z.ZodString;
        path: z.ZodString;
        source: z.ZodEnum<{
            setting: "setting";
            path: "path";
            common: "common";
            shell: "shell";
        }>;
        error: z.ZodString;
    }, z.core.$strict>, z.ZodObject<{
        state: z.ZodLiteral<"error">;
        path: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodEnum<{
            setting: "setting";
            path: "path";
            common: "common";
            shell: "shell";
        }>>;
        error: z.ZodString;
    }, z.core.$strict>], "state">;
    workspace: z.ZodString;
    workspaceRoot: z.ZodString;
    main: z.ZodNullable<z.ZodString>;
    candidates: z.ZodArray<z.ZodString>;
    fragments: z.ZodArray<z.ZodString>;
    status: z.ZodObject<{
        phase: z.ZodEnum<{
            error: "error";
            idle: "idle";
            starting: "starting";
            compiling: "compiling";
            ok: "ok";
            warnings: "warnings";
            crashed: "crashed";
        }>;
        run: z.ZodNumber;
        durationMs: z.ZodOptional<z.ZodNumber>;
        error: z.ZodOptional<z.ZodString>;
        finishedAt: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>;
    diagnostics: z.ZodArray<z.ZodObject<{
        severity: z.ZodEnum<{
            error: "error";
            warning: "warning";
        }>;
        message: z.ZodString;
        location: z.ZodNullable<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
            column: z.ZodNumber;
        }, z.core.$strict>>;
        excerpt: z.ZodOptional<z.ZodString>;
        hints: z.ZodArray<z.ZodString>;
        trace: z.ZodArray<z.ZodObject<{
            message: z.ZodString;
            location: z.ZodNullable<z.ZodObject<{
                file: z.ZodString;
                line: z.ZodNumber;
                column: z.ZodNumber;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    diagnosticsTotal: z.ZodNumber;
    diagnosticsTruncated: z.ZodBoolean;
    snapshot: z.ZodNullable<z.ZodObject<{
        generation: z.ZodNumber;
        main: z.ZodString;
        run: z.ZodNumber;
        seq: z.ZodNumber;
        bytes: z.ZodNumber;
        pages: z.ZodNumber;
        sha256: z.ZodString;
        createdAt: z.ZodNumber;
    }, z.core.$strict>>;
    highlights: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        identity: z.ZodObject<{
            generation: z.ZodNumber;
            seq: z.ZodNumber;
            sha256: z.ZodString;
        }, z.core.$strict>;
        quote: z.ZodString;
        comment: z.ZodString;
        source: z.ZodOptional<z.ZodObject<{
            file: z.ZodString;
            line: z.ZodNumber;
            endLine: z.ZodNumber;
        }, z.core.$strict>>;
        seq: z.ZodNumber;
        pageIndex: z.ZodNumber;
        startOffset: z.ZodOptional<z.ZodNumber>;
        occurrence: z.ZodOptional<z.ZodNumber>;
        rects: z.ZodArray<z.ZodArray<z.ZodNumber>>;
        stale: z.ZodBoolean;
        createdAt: z.ZodNumber;
    }, z.core.$strict>>;
    view: z.ZodUnion<readonly [z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"page">;
        pageIndex: z.ZodNumber;
        identity: z.ZodObject<{
            generation: z.ZodNumber;
            seq: z.ZodNumber;
            sha256: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"highlight">;
        id: z.ZodString;
        identity: z.ZodObject<{
            generation: z.ZodNumber;
            seq: z.ZodNumber;
            sha256: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>], "kind">, z.ZodNull]>;
    viewSeq: z.ZodNumber;
    setup: z.ZodObject<{
        facts: z.ZodNullable<z.ZodObject<{
            os: z.ZodEnum<{
                macos: "macos";
                windows: "windows";
                linux: "linux";
                other: "other";
            }>;
            osName: z.ZodString;
            arch: z.ZodString;
            tools: z.ZodArray<z.ZodObject<{
                name: z.ZodString;
                version: z.ZodOptional<z.ZodString>;
                path: z.ZodString;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
        searched: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const setMainResultSchema: z.ZodObject<{
    main: z.ZodString;
}, z.core.$strict>;
export declare const sourceMatchSchema: z.ZodObject<{
    file: z.ZodString;
    line: z.ZodNumber;
    column: z.ZodNumber;
    endLine: z.ZodNumber;
    excerpt: z.ZodString;
    score: z.ZodNumber;
}, z.core.$strict>;
export declare const locateSourceResultSchema: z.ZodObject<{
    matches: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        column: z.ZodNumber;
        endLine: z.ZodNumber;
        excerpt: z.ZodString;
        score: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const previewBytesSchema: z.ZodObject<{
    generation: z.ZodNumber;
    seq: z.ZodNumber;
    sha256: z.ZodString;
    data: z.ZodInstanceOf<Uint8Array<ArrayBuffer>>;
}, z.core.$strict>;
/** The typst state frame result codec, shared by `status`, `watch`, and `recheck`. */
export declare const stateFrameCodec: TypertCodec<unknown>;
/** `status`: the current state frame, first push of the panel's data. */
export declare const typstStatusInvocation: InvocationDescriptor;
/** `setMain`: choose the main `.typ` file; the frame updates follow on the stream. */
export declare const typstSetMainInvocation: InvocationDescriptor;
/**
 * `watch`: the live state stream. `mode: 'stream'`: the first yielded frame
 * is the current state, one frame follows every relevant change.
 */
export declare const typstWatchInvocation: InvocationDescriptor;
/**
 * `readPreview`: the current preview PDF's bytes. The strict codec projects
 * the `data` field into the RPC's byte attachments on the wire.
 */
export declare const typstReadPreviewInvocation: InvocationDescriptor;
/** `locateSource`: match rendered text against the workspace's sources. */
export declare const typstLocateSourceInvocation: InvocationDescriptor;
/** `recheck`: look Typst up again (the setup page's refresh), returning the new frame. */
export declare const typstRecheckInvocation: InvocationDescriptor;
/** `restart`: stop the watch, relocate typst, rescan, restart (the panel's restart button). */
export declare const typstRestartInvocation: InvocationDescriptor;
/** Explicit index refresh; the stream reports incremental progress. */
export declare const typstDiscoverInvocation: InvocationDescriptor;
/** Both halves register exactly this list. */
export declare const TYPST_INVOCATIONS: readonly InvocationDescriptor[];
//# sourceMappingURL=wire-schemas.d.ts.map