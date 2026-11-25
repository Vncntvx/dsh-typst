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
import { homedir } from "node:os";
import { join } from "node:path";
import { isVolatile } from "@deepseek-ai/cosmokit";
import Schema from "@deepseek-ai/schemastery";
import { TYPST_DIRECTORY_NAME } from "./constants.js";
/**
 * Every field is `volatile`: the settings page edits the live entry, and the
 * loader commits volatile edits into the running fiber without remounting.
 * `excludeDirs` rejects path-shaped entries at commit time instead of
 * silently never matching them.
 */
export const Config = Schema.object({
    typstPath: Schema.string().default("").volatile(),
    fontPaths: Schema.array(Schema.string()).default([]).volatile(),
    packagePath: Schema.string().default("").volatile(),
    excludeDirs: Schema.array(Schema.string().pattern(TYPST_DIRECTORY_NAME))
        .default([])
        .volatile(),
});
/**
 * Read the current value behind a volatile reference. Plain values pass
 * through untouched, so callers holding pre-resolution input need no
 * wrapping.
 * @param value - a field value, possibly a volatile reference.
 * @returns the current plain value.
 */
function current(value) {
    return isVolatile(value) ? value.get() : value;
}
/**
 * Unwrap every top-level field of an entry to its plain value.
 * @param config - a Loader-resolved `Config` or human-written values.
 * @returns the plain field map, without schema defaults.
 */
function unwrapConfig(config) {
    return Object.fromEntries(Object.entries(config ?? {}).map(([key, value]) => [key, current(value)]));
}
/**
 * Expand a leading `~` to the home directory. Both separator spellings are
 * accepted so a path typed on Windows and a path typed on macOS mean the same
 * thing to the user.
 * @param path - a configured path.
 * @returns the expanded path.
 */
function expandHome(path) {
    if (path === "~")
        return homedir();
    if (path.startsWith("~/") || path.startsWith("~\\")) {
        return join(homedir(), path.slice(2));
    }
    return path;
}
/** A trimmed, `~`-expanded path, or `""`. */
function pathText(value) {
    return typeof value === "string" ? expandHome(value.trim()) : "";
}
/** A trimmed, `~`-expanded, de-duplicated, order-preserving path list. */
function pathList(value) {
    if (!Array.isArray(value))
        return [];
    const paths = [];
    const seen = new Set();
    for (const item of value) {
        if (typeof item !== "string")
            continue;
        const path = expandHome(item.trim());
        if (!path || seen.has(path))
            continue;
        seen.add(path);
        paths.push(path);
    }
    return paths;
}
/** A trimmed, de-duplicated list of bare directory names; path-shaped entries are dropped. */
function nameList(value) {
    if (!Array.isArray(value))
        return [];
    const names = [];
    const seen = new Set();
    for (const item of value) {
        if (typeof item !== "string")
            continue;
        const name = item.trim();
        if (!TYPST_DIRECTORY_NAME.test(name))
            continue;
        const key = name.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        names.push(name);
    }
    return names;
}
/**
 * Read the live config values per request. The entry already passed the
 * schema (the loader applies `Config` before the constructor runs), so this
 * only unwraps volatile references and normalizes.
 * @param entry - the live entry the service holds.
 * @returns the plain current values.
 */
export function readResolvedConfig(entry) {
    const plain = unwrapConfig(entry);
    return {
        typstPath: pathText(plain.typstPath),
        fontPaths: pathList(plain.fontPaths),
        packagePath: pathText(plain.packagePath),
        excludeDirs: nameList(plain.excludeDirs),
    };
}
/**
 * Accept a loader entry (volatile references) or plain written values and
 * normalize to the live-entry shape the service holds. Validation stays
 * minimal: an empty string means "look typst up"; an empty list means "none".
 * @param entry - what the loader handed the constructor or the settings page wrote.
 * @returns the live entry.
 */
export function toLiveEntry(entry) {
    const value = entry;
    return {
        typstPath: liveValue(value.typstPath, "string", ""),
        fontPaths: liveValue(value.fontPaths, "array", []),
        packagePath: liveValue(value.packagePath, "string", ""),
        excludeDirs: liveValue(value.excludeDirs, "array", []),
    };
}
/**
 * Compare the settings a session is running with the ones just committed.
 * @param previous - the snapshot already applied.
 * @param next - the snapshot read after the commit.
 * @returns `null` when nothing observable changed, otherwise the affected behaviours.
 */
export function settingsChanged(previous, next) {
    const toolchain = previous.typstPath !== next.typstPath ||
        previous.packagePath !== next.packagePath ||
        !sameList(previous.fontPaths, next.fontPaths);
    const discovery = !sameList(previous.excludeDirs, next.excludeDirs);
    return toolchain || discovery ? { toolchain, discovery } : null;
}
/** Order-sensitive list equality for the resolved string lists. */
export function sameList(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}
/** Keep a volatile reference, a plain value of the expected shape, or the fallback. */
function liveValue(value, shape, fallback) {
    if (isVolatile(value))
        return value;
    if (shape === "string" && typeof value === "string")
        return value;
    if (shape === "array" && Array.isArray(value))
        return value;
    return fallback;
}
//# sourceMappingURL=config.js.map