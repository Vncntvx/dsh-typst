/**
 * Fuzzy text matching between rendered pages and `.typ` sources, plus the
 * line/excerpt helpers the diagnostics and highlights share. Ported from the
 * ZCode typst-workbench server (0.2.0) `src/domain/match.ts`. Host half only
 * (the panel performs its own in-page text search).
 * @module dsh-typst/typst/match
 */

export interface Skeleton {
  value: string;
  map: number[];
}

export interface FuzzyHit {
  start: number;
  end: number;
  score: number;
}

const FOLD: Record<string, string> = { ſ: "s", ı: "i" };

/**
 * Fold a text onto its matching skeleton: NFKC + lowercase, letters and
 * numbers only, with an offset map back onto the original string.
 */
export function skeleton(text: string): Skeleton {
  let value = "";
  const map: number[] = [];
  let index = 0;
  for (const char of text) {
    const folded = (FOLD[char] ?? char).normalize("NFKC").toLowerCase();
    for (const part of folded) {
      if (/[\p{L}\p{N}]/u.test(part)) {
        value += part;
        map.push(index);
      }
    }
    index += char.length;
  }
  return { value, map };
}

const SEED = 8;

/**
 * Find occurrences of `needle` in a skeleton haystack: exact runs first,
 * then seed-and-chain approximation tolerant of insertions, deletions and
 * reflow. Ported unchanged in behavior; see the ZCode source for the
 * chain-drift rationale.
 */
export function fuzzyFind(
  needle: string,
  hay: Skeleton,
  options: { max?: number; minScore?: number } = {},
): FuzzyHit[] {
  const max = options.max ?? 5;
  const target = skeleton(needle).value;
  if (target.length < 2 || !hay.value.length) return [];
  const toHit = (from: number, to: number, score: number): FuzzyHit => ({
    start: hay.map[from],
    end: hay.map[to - 1] + 1,
    score,
  });
  const exact: FuzzyHit[] = [];
  for (
    let at = hay.value.indexOf(target);
    at >= 0 && exact.length < max;
    at = hay.value.indexOf(target, at + 1)
  ) {
    exact.push(toHit(at, at + target.length, 1));
  }
  if (exact.length || target.length < SEED * 2) return exact;
  const step = SEED / 2;
  const seeds: { offset: number; positions: number[] }[] = [];
  for (let offset = 0; offset + SEED <= target.length; offset += step) {
    const gram = target.slice(offset, offset + SEED);
    const positions: number[] = [];
    for (
      let at = hay.value.indexOf(gram);
      at >= 0 && positions.length < 64;
      at = hay.value.indexOf(gram, at + 1)
    ) {
      positions.push(at);
    }
    seeds.push({ offset, positions });
  }
  const tailOffset = target.length - SEED;
  if (seeds.at(-1)!.offset !== tailOffset) {
    const gram = target.slice(tailOffset);
    const positions: number[] = [];
    for (
      let at = hay.value.indexOf(gram);
      at >= 0 && positions.length < 64;
      at = hay.value.indexOf(gram, at + 1)
    ) {
      positions.push(at);
    }
    seeds.push({ offset: tailOffset, positions });
  }
  const chains: {
    first: { offset: number; at: number };
    last: { offset: number; at: number };
    covered: number;
  }[] = [];
  for (const seed of seeds) {
    for (const at of seed.positions) {
      let best: (typeof chains)[number] | null = null;
      for (const chain of chains) {
        const needleGap = seed.offset - chain.last.offset;
        const hayGap = at - chain.last.at;
        if (needleGap <= 0 || hayGap <= 0) continue;
        const drift = hayGap - needleGap;
        if (drift < -Math.max(24, needleGap) || drift > 160 + needleGap * 2)
          continue;
        if (!best || chain.covered > best.covered) best = chain;
      }
      const gain = (from: number) => Math.min(SEED, seed.offset + SEED - from);
      if (best) {
        best.covered += gain(best.last.offset + SEED);
        best.last = { offset: seed.offset, at };
      } else {
        chains.push({
          first: { offset: seed.offset, at },
          last: { offset: seed.offset, at },
          covered: SEED,
        });
      }
    }
  }
  const minScore = options.minScore ?? 0.35;
  const results = chains
    .map((chain) => ({
      chain,
      score: Math.min(1, chain.covered / target.length),
    }))
    .filter(
      ({ chain, score }) => score >= minScore && chain.covered >= SEED * 2,
    )
    .sort((a, b) => b.score - a.score || a.chain.first.at - b.chain.first.at);
  const hits: FuzzyHit[] = [];
  for (const { chain, score } of results) {
    const from = Math.max(0, chain.first.at - chain.first.offset);
    const to = Math.min(
      hay.value.length,
      chain.last.at + SEED + (target.length - chain.last.offset - SEED),
    );
    const hit = toHit(from, Math.max(to, from + 1), score);
    if (hits.some((other) => other.start < hit.end && hit.start < other.end))
      continue;
    hits.push(hit);
    if (hits.length >= max) break;
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Line helpers (shared by diagnostics excerpts and source location)
// ---------------------------------------------------------------------------

export function lineStarts(text: string): number[] {
  const starts = [0];
  for (
    let index = text.indexOf("\n");
    index >= 0;
    index = text.indexOf("\n", index + 1)
  ) {
    starts.push(index + 1);
  }
  return starts;
}

export function lineColumn(
  starts: number[],
  offset: number,
): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: offset - starts[low] + 1 };
}

export function lineRange(
  text: string,
  starts: number[],
  from: number,
  to: number,
): { start: number; end: number } {
  const start = starts[Math.max(1, from) - 1] ?? text.length;
  const next = starts[Math.min(to, starts.length)];
  return { start, end: next === undefined ? text.length : next - 1 };
}

export function excerpt(
  text: string,
  from: number,
  to: number,
  maxLines = 8,
): string {
  const lines = text
    .split("\n")
    .slice(from - 1, Math.min(to, from + maxLines - 1));
  const more =
    to - from + 1 > maxLines
      ? `\n\u2026 (${to - from + 1 - maxLines} more lines)`
      : "";
  return lines.join("\n").replace(/\s+$/, "") + more;
}

// ---------------------------------------------------------------------------
// Rendered text → source location
// ---------------------------------------------------------------------------

export interface SourceFile {
  path: string;
  text: string;
}

export type { SourceMatch } from "../contract.js";
import type { SourceMatch } from "../contract.js";

/**
 * Locate rendered text inside the project's source files: fuzzy-find in
 * every file, optionally re-anchoring around a focus passage, and report
 * the best candidates. Reliable for prose; approximate for math, generated
 * text and function output (the panel says so).
 * @param files - the workspace source files to search.
 * @param text - the rendered text to locate.
 * @param focus - a secondary passage expected near the target, when known.
 * @param max - candidate budget.
 */
export function locateInSources(
  files: SourceFile[],
  text: string,
  focus?: string,
  max = 3,
): SourceMatch[] {
  const candidates: (SourceMatch & { start: number })[] = [];
  for (const file of files) {
    const hay = skeleton(file.text);
    const starts = lineStarts(file.text);
    for (const hit of fuzzyFind(text, hay, { max })) {
      let { start, end } = hit;
      if (focus && skeleton(focus).value.length >= 2) {
        const windowStart = Math.max(0, start - 400);
        const windowText = file.text.slice(
          windowStart,
          Math.min(file.text.length, end + 400),
        );
        const inner = fuzzyFind(focus, skeleton(windowText), { max: 1 })[0];
        if (inner) {
          start = windowStart + inner.start;
          end = windowStart + inner.end;
        }
      }
      const from = lineColumn(starts, start);
      const to = lineColumn(starts, Math.max(start, end - 1));
      candidates.push({
        file: file.path,
        line: from.line,
        column: from.column,
        endLine: to.line,
        excerpt: excerpt(file.text, from.line, to.line),
        score: hit.score,
        start,
      });
    }
  }
  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ start: _start, ...rest }) => rest);
}
