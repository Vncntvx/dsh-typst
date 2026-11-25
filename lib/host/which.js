/**
 * Host executable lookup shared by toolchain detection and host facts.
 * One PATH + common-directory search keeps the two discovery paths from
 * disagreeing about the same binary.
 * @module dsh-typst/host/which
 */
import { access, constants, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";
/**
 * Whether a path is an executable regular file on this host.
 * @param path - candidate path.
 * @param platform - platform spelling, defaulting to the running host.
 * @returns true when the file exists and is executable (or F_OK on Windows).
 */
export async function isExecutable(path, platform = process.platform) {
    try {
        if (!(await stat(path)).isFile())
            return false;
        await access(path, platform === "win32" ? constants.F_OK : constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Find one executable by name, searching PATH before explicit directories.
 * @param bin - base name without a platform suffix.
 * @param dirs - extra directories after PATH.
 * @param options - environment, platform and optional name override.
 * @returns the first executable path, or null.
 */
export async function findExecutable(bin, dirs, options = {}) {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const names = options.names ??
        (platform === "win32" ? [`${bin}.exe`, `${bin}.cmd`, bin] : [bin]);
    const path = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean);
    for (const dir of [...path, ...dirs]) {
        if (!dir)
            continue;
        for (const name of names) {
            const candidate = join(dir, name);
            if (await isExecutable(candidate, platform))
                return candidate;
        }
    }
    return null;
}
//# sourceMappingURL=which.js.map