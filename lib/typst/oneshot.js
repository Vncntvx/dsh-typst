/**
 * One-shot typst compiles that do not touch the preview: rendering pages to
 * PNG for the agent to look at, and exporting PDFs into the workspace.
 * Ported from the ZCode typst-workbench server (0.2.0) `src/typst/
 * oneshot.ts`. Host half only.
 * @module dsh-typst/typst/oneshot
 */
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { LIMITS } from "../constants.js";
import { TYPST_TIMEOUT, TypstError } from "../errors.js";
import { parseDiagnostics } from "./diagnostics.js";
import { typstFlags } from "./flags.js";
async function compile(options, output, extra) {
    const result = await options.process.run([
        options.typst,
        "compile",
        options.main,
        output,
        ...extra,
        ...typstFlags(options),
    ], {
        cwd: options.cwd,
        timeoutMs: options.timeoutMs ?? LIMITS.oneshotTimeoutMs,
        ...(options.env === undefined ? {} : { env: options.env }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (result.timedOut) {
        throw new TypstError(`typst compile did not finish within ${Math.round((options.timeoutMs ?? LIMITS.oneshotTimeoutMs) / 1e3)} s.`, TYPST_TIMEOUT);
    }
    const diagnostics = parseDiagnostics(result.stderr, options.toFile);
    if (result.code !== 0 &&
        !diagnostics.some((entry) => entry.severity === "error")) {
        diagnostics.push({
            severity: "error",
            message: (result.stderr || result.stdout).trim().slice(0, 500) ||
                `typst exited with code ${result.code}`,
            location: null,
            hints: [],
            trace: [],
        });
    }
    return { ok: result.code === 0, diagnostics };
}
/**
 * Render the given 1-based pages to PNGs in a scratch directory and read
 * them back, page-ordered; the scratch directory is always removed.
 */
export async function renderPages(options, pages, ppi) {
    const dir = await mkdtemp(join(options.scratch, "render-"));
    try {
        const result = await compile(options, join(dir, "page-{p}.png"), [
            "--pages",
            pages.join(","),
            "--ppi",
            String(ppi),
        ]);
        if (!result.ok)
            return { ...result, images: [] };
        const images = [];
        for (const name of await readdir(dir)) {
            const match = /^page-(\d+)\.png$/.exec(name);
            if (match) {
                images.push({
                    page: Number(match[1]),
                    png: new Uint8Array(await readFile(join(dir, name))),
                });
            }
        }
        images.sort((a, b) => a.page - b.page);
        return { ...result, images };
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
}
/** Compile a PDF into the workspace (optionally a PDF standard and a page selection). */
export async function exportPdf(options, output, extra) {
    const args = [];
    if (extra.pdfStandard)
        args.push("--pdf-standard", extra.pdfStandard);
    if (extra.pages)
        args.push("--pages", extra.pages);
    return compile(options, output, args);
}
//# sourceMappingURL=oneshot.js.map