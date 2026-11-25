/**
 * Workspace path containment. A path is resolved against the workspace root,
 * the deepest existing ancestor is canonicalized (`realpath`), and the
 * nonexistent tail is appended to that canonical ancestor. The result is the
 * canonical absolute path a caller should use — not the lexical spelling it
 * passed in — so a casing alias, a `/var` → `/private/var` symlink, or a
 * symlinked directory cannot make the checked path differ from the used path.
 *
 * A target that exists and resolves outside the root is refused. A dangling
 * symlink resolves to its lexical in-workspace location here; callers that
 * write (exportPdf) must additionally refuse a symlink target.
 * @module dsh-typst/workspace/containment
 */
import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, } from "node:path";
/** Whether `target` is the root or lives under it, using path segments. */
export function isWithin(root, target) {
    const rel = relative(root, target);
    return (rel === "" ||
        (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)));
}
/**
 * Resolve one path inside a canonical workspace root.
 * @param root - the canonical workspace root (already `realpath`ed).
 * @param input - absolute or root-relative input path.
 * @returns the canonical absolute path.
 * @throws an Error whose `code` is `TYPST_PATH_OUTSIDE_WORKSPACE` when the
 * resolved target escapes the root.
 */
export async function resolveInside(root, input) {
    const absolute = resolve(root, input);
    let existing = absolute;
    const tail = [];
    for (;;) {
        try {
            const canonical = await realpath(existing);
            const target = tail.length === 0 ? canonical : join(canonical, ...tail);
            if (!isWithin(root, target))
                break;
            return target;
        }
        catch {
            const parent = dirname(existing);
            if (parent === existing)
                break;
            tail.unshift(basename(existing));
            existing = parent;
        }
    }
    const error = new Error(`${input} is outside the workspace.`);
    error.code = "TYPST_PATH_OUTSIDE_WORKSPACE";
    throw error;
}
//# sourceMappingURL=containment.js.map