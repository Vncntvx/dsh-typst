/**
 * Whether a path is an executable regular file on this host.
 * @param path - candidate path.
 * @param platform - platform spelling, defaulting to the running host.
 * @returns true when the file exists and is executable (or F_OK on Windows).
 */
export declare function isExecutable(path: string, platform?: string): Promise<boolean>;
/**
 * Find one executable by name, searching PATH before explicit directories.
 * @param bin - base name without a platform suffix.
 * @param dirs - extra directories after PATH.
 * @param options - environment, platform and optional name override.
 * @returns the first executable path, or null.
 */
export declare function findExecutable(bin: string, dirs: readonly string[], options?: {
    env?: NodeJS.ProcessEnv;
    platform?: string;
    names?: readonly string[];
}): Promise<string | null>;
//# sourceMappingURL=which.d.ts.map