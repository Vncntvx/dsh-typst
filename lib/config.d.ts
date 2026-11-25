/**
 * Plugin configuration. The schema fills defaults and every field is
 * `volatile`, so a settings commit lands in the running fiber without
 * remounting and the workbench reads it per request. Structural reactions
 * (changed toolchain inputs restart every live session) ride
 * `loader/volatile-update` in the service.
 *
 * Paths are normalized on read rather than on write: a leading `~` expands to
 * the user's home directory on every platform (the CLI itself does not
 * expand it), whitespace is trimmed, and repeated entries are dropped. A
 * relative font or package path keeps its meaning: both compiles run with the
 * workspace as their working directory, so typst resolves it there.
 * @module dsh-typst/config
 */
import type { Volatile } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
export interface Config {
    /**
     * Full path of the typst executable. Empty looks typst up on PATH, in the
     * common install locations, and finally in the login shell; set it only
     * when Typst is installed somewhere else.
     */
    typstPath?: Volatile<string>;
    /**
     * Extra font directories passed to typst as `--font-path`, in order after
     * the workspace's own `fonts/` and `assets/fonts/`. A leading `~` means the
     * user's home directory.
     */
    fontPaths?: Volatile<string[]>;
    /**
     * Local package directory passed to typst as `--package-path`: private
     * `@local` packages, or an offline mirror of `@preview`. Empty uses typst's
     * default location.
     */
    packagePath?: Volatile<string>;
    /**
     * Directory names skipped while scanning for the main file, in addition to
     * the built-in build-output list. Names only — no separators — matched at
     * any depth and without case on every platform. The panel's "include
     * excluded directories" toggle reveals them together with the built-ins.
     */
    excludeDirs?: Volatile<string[]>;
}
/** The plain values the workbench and its sessions compile with. */
export interface ResolvedConfig {
    typstPath: string;
    fontPaths: string[];
    packagePath: string;
    excludeDirs: string[];
}
/**
 * Every field is `volatile`: the settings page edits the live entry, and the
 * loader commits volatile edits into the running fiber without remounting.
 * `excludeDirs` rejects path-shaped entries at commit time instead of
 * silently never matching them.
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    typstPath: Schema<string, string, "volatile-defined">;
    fontPaths: Schema<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    packagePath: Schema<string, string, "volatile-defined">;
    excludeDirs: Schema<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    typstPath: Schema<string, string, "volatile-defined">;
    fontPaths: Schema<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
    packagePath: Schema<string, string, "volatile-defined">;
    excludeDirs: Schema<NoInfer<string[]>, NoInfer<string[]>, "volatile-defined">;
}>>, "plain">;
/** The live entry the service holds: volatile references re-read per access. */
export interface LiveEntry {
    typstPath: string | Volatile<string>;
    fontPaths: string[] | Volatile<string[]>;
    packagePath: string | Volatile<string>;
    excludeDirs: string[] | Volatile<string[]>;
}
/**
 * Read the live config values per request. The entry already passed the
 * schema (the loader applies `Config` before the constructor runs), so this
 * only unwraps volatile references and normalizes.
 * @param entry - the live entry the service holds.
 * @returns the plain current values.
 */
export declare function readResolvedConfig(entry: Config | object): ResolvedConfig;
/**
 * Accept a loader entry (volatile references) or plain written values and
 * normalize to the live-entry shape the service holds. Validation stays
 * minimal: an empty string means "look typst up"; an empty list means "none".
 * @param entry - what the loader handed the constructor or the settings page wrote.
 * @returns the live entry.
 */
export declare function toLiveEntry(entry: Config | object): LiveEntry;
/** Which live behaviour a committed settings change has to re-apply. */
export interface SettingsChange {
    /** The typst binary, fonts or packages changed: every watch must restart. */
    toolchain: boolean;
    /** The exclusion list changed: discovery must run again. */
    discovery: boolean;
}
/**
 * Compare the settings a session is running with the ones just committed.
 * @param previous - the snapshot already applied.
 * @param next - the snapshot read after the commit.
 * @returns `null` when nothing observable changed, otherwise the affected behaviours.
 */
export declare function settingsChanged(previous: ResolvedConfig, next: ResolvedConfig): SettingsChange | null;
/** Order-sensitive list equality for the resolved string lists. */
export declare function sameList(a: readonly string[], b: readonly string[]): boolean;
//# sourceMappingURL=config.d.ts.map