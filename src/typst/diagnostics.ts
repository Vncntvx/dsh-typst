/**
 * Typst output parsing: one-shot diagnostics, the `typst watch` log stream,
 * and make-deps files. Ported from the ZCode typst-workbench server
 * (0.2.0) `src/typst/diagnostics.ts` and adjusted to this repository's
 * domain error type. Host half only.
 * @module dsh-typst/typst/diagnostics
 */

import type {
  DiagnosticLocationView,
  DiagnosticPointView,
  DiagnosticView,
} from "../contract.js";

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
const HEADER = /^(error|warning|help)(?:\[[^\]]*\])?: (.*)$/;
const LOCATION = /^\s*[┌╭]─+\s*(.+):(\d+):(\d+)\s*$/;
const NOTE = /^\s*= (?:(hint|note|help): )?(.*)$/;

const stripAnsi = (text: string): string => text.replace(ANSI, "");

/**
 * Parse the diagnostics block of one compile round (stderr of a one-shot
 * compile, or the lines a `typst watch` round accumulated).
 * @param text - raw output text.
 * @param toFile - maps a path as typst printed it onto a display path.
 * @returns the parsed diagnostics in order of appearance.
 */
export function parseDiagnostics(
  text: string,
  toFile: (path: string) => string = (path) => path,
): DiagnosticView[] {
  const diagnostics: DiagnosticView[] = [];
  let target:
    { location: DiagnosticLocationView | null } | DiagnosticPointView | null =
    null;
  let current: DiagnosticView | null = null;
  for (const raw of stripAnsi(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    const header = HEADER.exec(line);
    if (header) {
      const [, kind, message] = header;
      if (kind === "help") {
        if (current) {
          const point: DiagnosticPointView = { message, location: null };
          current.trace.push(point);
          target = point;
        } else {
          target = null;
        }
      } else {
        // The header grammar only admits error|warning|help, and help took
        // the trace branch above, so the remaining kinds are exact.
        current = {
          severity: kind as DiagnosticView["severity"],
          message,
          location: null,
          hints: [],
          trace: [],
        };
        diagnostics.push(current);
        target = current;
      }
      continue;
    }
    const location = LOCATION.exec(line);
    if (location && target && !target.location) {
      target.location = {
        file: toFile(location[1]),
        line: Number(location[2]),
        column: Number(location[3]),
      };
      continue;
    }
    const note = NOTE.exec(line);
    if (note && current && /^\s*=/.test(line))
      current.hints.push(note[2].trim());
  }
  return diagnostics;
}

const STAMP = String.raw`^(?:\[[^\]]*\]\s*)?`;
const COMPILING = new RegExp(`${STAMP}compiling\\b`);
const FINISHED = new RegExp(
  `${STAMP}compiled (successfully|with warnings|with errors)(?: in ([\\d.]+)\\s*(\u00b5s|us|ms|s))?`,
);

function duration(
  value: string | undefined,
  unit: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return unit === "s" ? number * 1e3 : unit === "ms" ? number : number / 1e3;
}

/** One event the watch log emits; the watcher serializes their handling. */
export type WatchEvent =
  | { kind: "compiling" }
  | {
      kind: "finished";
      outcome: "ok" | "warnings" | "error";
      durationMs?: number;
      diagnostics: DiagnosticView[];
    }
  | { kind: "fatal"; message: string };

/**
 * Incremental parser for `typst watch` stdout/stderr. Typst prints an
 * ANSI-stamped `compiling` line per round, then `compiled …` plus any
 * diagnostics. Rounds are finalized on the next marker or when the caller
 * decides the output went quiet (`finalize`); a round with errors keeps
 * accumulating help/hint lines until then.
 */
export class WatchLog {
  private buffer = "";
  private pending: {
    outcome: "ok" | "warnings" | "error";
    durationMs?: number;
    lines: string[];
  } | null = null;

  constructor(
    private readonly emit: (event: WatchEvent) => void,
    private readonly toFile: (path: string) => string = (path) => path,
  ) {}

  /**
   * Feed one output chunk.
   * @returns whether a round is awaiting `finalize`.
   */
  feed(chunk: string): boolean {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = stripAnsi(this.buffer.slice(0, newline)).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      this.line(line);
    }
    return this.pending !== null;
  }

  private line(line: string): void {
    const trimmed = line.trim();
    if (COMPILING.test(trimmed)) {
      this.finalize();
      this.emit({ kind: "compiling" });
      return;
    }
    const finished = FINISHED.exec(trimmed);
    if (finished) {
      this.finalize();
      const outcome =
        finished[1] === "successfully"
          ? "ok"
          : finished[1] === "with warnings"
            ? "warnings"
            : "error";
      this.pending = {
        outcome,
        durationMs: duration(finished[2], finished[3]),
        lines: [],
      };
      if (outcome === "ok") this.finalize();
      return;
    }
    if (/^watching\s/.test(trimmed) || /^writing to\s/.test(trimmed)) {
      this.finalize();
      return;
    }
    if (this.pending) {
      this.pending.lines.push(line);
      return;
    }
    if (trimmed.startsWith("error: "))
      this.emit({ kind: "fatal", message: trimmed.slice(7) });
  }

  /** End the current round (next round started, or output went quiet). */
  finalize(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.emit({
      kind: "finished",
      outcome: pending.outcome,
      durationMs: pending.durationMs,
      diagnostics: parseDiagnostics(pending.lines.join("\n"), this.toFile),
    });
  }
}

/**
 * Parse a deps file: typst ≥0.14 JSON (`{ inputs: [...] }`) or the classic
 * make-deps grammar of `--make-deps`.
 * @param text - the deps file content.
 * @returns dependency paths in the order printed.
 */
export function parseDeps(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{")) {
    try {
      const value: unknown = JSON.parse(trimmed);
      if (typeof value === "object" && value !== null && "inputs" in value) {
        const inputs = (value as { inputs: unknown }).inputs;
        return Array.isArray(inputs)
          ? inputs.filter((entry): entry is string => typeof entry === "string")
          : [];
      }
      return [];
    } catch {
      return [];
    }
  }
  const body = trimmed.replace(/\\\r?\n/g, " ");
  const colon = body.search(/(?<!\\):(?=\s|$)/);
  if (colon < 0) return [];
  const deps: string[] = [];
  let currentDep = "";
  const rest = body.slice(colon + 1);
  for (let index = 0; index < rest.length; index++) {
    const char = rest[index];
    if (
      char === "\\" &&
      index + 1 < rest.length &&
      /[\s#\\:]/.test(rest[index + 1])
    ) {
      currentDep += rest[++index];
    } else if (char === "$" && rest[index + 1] === "$") {
      currentDep += "$";
      index++;
    } else if (/\s/.test(char)) {
      if (currentDep) deps.push(currentDep);
      currentDep = "";
    } else {
      currentDep += char;
    }
  }
  if (currentDep) deps.push(currentDep);
  return deps;
}
