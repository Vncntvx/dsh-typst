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
import { TypstError } from "../errors.js";
import { parseDiagnostics } from "./diagnostics.js";
import { run } from "./locate.js";
import type { DiagnosticView } from "../contract.js";

export interface OneshotOptions {
  typst: string;
  cwd: string;
  /** Project sandbox root passed to Typst via `--root`. */
  root?: string;
  /** Extra directories searched recursively for fonts via `--font-path`. */
  fontPaths?: string[];
  main: string;
  env?: NodeJS.ProcessEnv;
  /** Where render scratch directories are created. */
  scratch: string;
  toFile?: (path: string) => string;
  timeoutMs?: number;
}

export interface CompileResult {
  ok: boolean;
  diagnostics: DiagnosticView[];
}

async function compile(
  options: OneshotOptions,
  output: string,
  extra: string[],
): Promise<CompileResult> {
  const rootArgs = options.root ? ["--root", options.root] : [];
  const fontArgs = (options.fontPaths ?? []).flatMap((dir) => [
    "--font-path",
    dir,
  ]);
  const result = await run(
    options.typst,
    ["compile", options.main, output, ...extra, ...rootArgs, ...fontArgs],
    {
      cwd: options.cwd,
      env: options.env,
      timeoutMs: options.timeoutMs ?? LIMITS.oneshotTimeoutMs,
    },
  );
  if (result.timedOut) {
    throw new TypstError(
      `typst compile did not finish within ${Math.round((options.timeoutMs ?? LIMITS.oneshotTimeoutMs) / 1e3)} s.`,
      "TYPST_TIMEOUT",
    );
  }
  const diagnostics = parseDiagnostics(result.stderr, options.toFile);
  if (
    result.code !== 0 &&
    !diagnostics.some((entry) => entry.severity === "error")
  ) {
    diagnostics.push({
      severity: "error",
      message:
        (result.stderr || result.stdout).trim().slice(0, 500) ||
        `typst exited with code ${result.code}`,
      location: null,
      hints: [],
      trace: [],
    });
  }
  return { ok: result.code === 0, diagnostics };
}

export interface RenderedImage {
  page: number;
  png: Uint8Array;
}

export interface RenderPagesResult extends CompileResult {
  images: RenderedImage[];
}

/**
 * Render the given 1-based pages to PNGs in a scratch directory and read
 * them back, page-ordered; the scratch directory is always removed.
 */
export async function renderPages(
  options: OneshotOptions,
  pages: number[],
  ppi: number,
): Promise<RenderPagesResult> {
  const dir = await mkdtemp(join(options.scratch, "render-"));
  try {
    const result = await compile(options, join(dir, "page-{p}.png"), [
      "--pages",
      pages.join(","),
      "--ppi",
      String(ppi),
    ]);
    if (!result.ok) return { ...result, images: [] };
    const images: RenderedImage[] = [];
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
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface ExportExtra {
  pdfStandard?: string;
  pages?: string;
}

/** Compile a PDF into the workspace (optionally a PDF standard and a page selection). */
export async function exportPdf(
  options: OneshotOptions,
  output: string,
  extra: ExportExtra,
): Promise<CompileResult> {
  const args: string[] = [];
  if (extra.pdfStandard) args.push("--pdf-standard", extra.pdfStandard);
  if (extra.pages) args.push("--pages", extra.pages);
  return compile(options, output, args);
}
