/**
 * Build-directory ownership. A workspace session's scratch tree lives under
 * `<dataDir>/build/<harness-pid>-<nonce>/` and carries an `owner.json` naming
 * the harness process that created it. Cleanup removes only directories whose
 * recorded owner is gone; a directory without a valid owner record stays in
 * place.
 *
 * The build root is shared across workspaces, so ownership is recorded per
 * directory and cleanup operates one directory at a time.
 * @module dsh-typst/typst/owners
 */
/**
 * Remove build directories whose owner harness is gone. A directory owned by
 * this process or by another live process is never touched; a directory
 * without a valid owner record is left in place.
 * @param base - the shared `<dataDir>/build` root.
 * @param log - optional narration for a removed directory.
 */
export declare function cleanupDeadBuildDirs(base: string, log?: (message: string) => void): Promise<void>;
/**
 * Create this session's build directory under the shared root, after pruning
 * directories whose previous owners are gone.
 * @param dataDir - the plugin's private cache directory.
 * @param log - optional narration.
 * @returns the new directory, mode 0700, with a 0600 owner record.
 */
export declare function makeBuildDir(dataDir: string, log?: (message: string) => void): Promise<string>;
//# sourceMappingURL=owners.d.ts.map