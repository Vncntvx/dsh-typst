/**
 * Locating and version-checking the typst binary: the configured path, then
 * PATH, then common install locations, then the login shell (version
 * managers). Ported from the ZCode typst-workbench server (0.2.0)
 * `src/typst/locate.ts`. Host half only.
 * @module dsh-typst/typst/locate
 */
import type { TypstSource } from "../contract.js";
import type { ProcessRunner } from "./process.js";
/** Parse `typst 0.13.1`-style version output. */
export declare function parseVersion(text: string): [number, number, number] | null;
export declare function compareVersion(a: readonly number[], b: readonly number[]): number;
export declare const versionText: (version: readonly number[]) => string;
export declare function atLeast(version: string, required: readonly number[]): boolean;
/** Common typst install directories per platform. */
export declare function commonDirs(platform: string, env: NodeJS.ProcessEnv, home: string): string[];
/**
 * The directories the lookup covers, in report order (for the setup page's
 * "where we looked" list), `~`-abbreviated.
 */
export declare function searchedDirs(platform: string, env: NodeJS.ProcessEnv, home: string, arch?: string): string[];
export type Toolchain = {
    state: "ready";
    path: string;
    source: TypstSource;
    version: string;
} | {
    state: "missing";
} | {
    state: "too_old";
    path: string;
    source: TypstSource;
    version: string;
    error: string;
} | {
    state: "error";
    path?: string;
    source?: TypstSource;
    error: string;
};
export interface LocateOptions {
    /** The configured "Typst path" setting; wins when executable. */
    setting?: string;
    env?: NodeJS.ProcessEnv;
    platform?: string;
    home?: string;
    /** Directory list overriding the common defaults (tests). */
    common?: string[];
    /** Skip the login-shell probe (the panel's periodic recheck does). */
    shell?: boolean;
    /** The harness subprocess runner used for the version and login-shell probes. */
    process: ProcessRunner;
    /** Child working directory for those probes. */
    cwd?: string;
}
/**
 * Locate a usable typst and check its version.
 * @returns the toolchain state; `ready` carries path/source/version.
 */
export declare function locateTypst(options: LocateOptions): Promise<Toolchain>;
//# sourceMappingURL=locate.d.ts.map