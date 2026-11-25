/**
 * The CSS reader shared by the stylesheet guards and the control-ownership
 * guard: rules flattened out of at-rules, declarations, subject classes and
 * source offsets. Nothing here decides a rule — it only reads a stylesheet the
 * way the guards below describe, so the two consumers cannot disagree about
 * what a rule is.
 * @module dsh-typst/scripts/shared/css-syntax
 */

/**
 * Blank out comment bodies while preserving every offset, so a match position
 * still maps to its real line.
 * @param css - stylesheet source.
 * @returns same-length text with comments replaced by spaces.
 */
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
}

/**
 * The index of the `}` closing the block opened at `open`.
 * @param css - stylesheet source.
 * @param open - index of the `{`.
 * @returns index of the matching `}`, or the text length when unbalanced.
 */
function closingBraceOf(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return css.length;
}

/**
 * Every style rule in a stylesheet, flattening nested at-rules.
 *
 * A rule knows the at-rule preludes it sits under, which is what the hover and
 * focus-zoom exceptions are written against. At-rule blocks are recursed into,
 * so a rule inside `@media` is reported like any other; `@keyframes` steps fall
 * out as selectors (`from`, `40%`), and no guard reads them.
 * @param css - stylesheet source, comments already stripped.
 * @returns the rules, in source order.
 */
export function rulesOf(css) {
  const rules = [];
  const walk = (start, end, atRules) => {
    let buffer = "";
    let preludeAt = -1;
    let i = start;
    while (i < end) {
      const char = css[i];
      if (char === "}") {
        buffer = "";
        preludeAt = -1;
        i += 1;
        continue;
      }
      if (char === "{") {
        const close = closingBraceOf(css, i);
        const prelude = buffer.trim();
        if (prelude.startsWith("@"))
          walk(i + 1, Math.min(close, end), [...atRules, prelude]);
        else
          rules.push({
            selector: prelude,
            body: css.slice(i + 1, close),
            atRules,
            at: preludeAt,
          });
        buffer = "";
        preludeAt = -1;
        i = close + 1;
        continue;
      }
      if (preludeAt === -1) {
        if (/\s/.test(char)) {
          i += 1;
          continue;
        }
        preludeAt = i;
      }
      buffer += char;
      i += 1;
    }
  };
  walk(0, css.length, []);
  return rules;
}

/**
 * The declarations of one rule body.
 * @param body - the text between a rule's braces.
 * @returns property/value pairs, property lower-cased, value trimmed.
 */
export function declarationsOf(body) {
  const declarations = [];
  const push = (chunk) => {
    const colon = chunk.indexOf(":");
    if (colon === -1) return;
    const property = chunk.slice(0, colon).trim().toLowerCase();
    const value = chunk.slice(colon + 1).trim();
    if (property === "" || value === "") return;
    declarations.push({ property, value });
  };
  let buffer = "";
  for (const char of body) {
    if (char === ";") {
      push(buffer);
      buffer = "";
    } else buffer += char;
  }
  push(buffer);
  return declarations;
}

/**
 * The classes a rule actually styles: the last compound of each selector.
 *
 * `.row:hover .icon` styles `.icon`, not `.row`, so the subject — not the
 * qualifying ancestor — is what a guard holds against its own list. Pseudo-
 * classes and their arguments are stripped before the names are read, so
 * `.link:not(.x)` yields `.link`.
 * @param selector - a rule's selector list.
 * @returns the subject classes, de-duplicated, in source order.
 */
export function subjectClassesOf(selector) {
  const subjects = new Set();
  for (const one of selector.split(",")) {
    const compound =
      one
        .trim()
        .split(/[\s>+~]+/)
        .filter(Boolean)
        .pop() ?? "";
    const bare = compound.replace(/::?[A-Za-z-]+(\([^)]*\))?/g, "");
    for (const match of bare.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g))
      subjects.add(`.${match[1]}`);
  }
  return [...subjects];
}

/**
 * The first class of a simple selector, used as the inheritance key for
 * variant rules that restate only one property.
 * @param selector - one selector from a rule's list.
 * @returns the class, `.` prefix included, or undefined.
 */
export function baseClassOf(selector) {
  const match = /^\.([A-Za-z0-9_-]+)/.exec(selector.trim());
  return match === null ? undefined : `.${match[1]}`;
}

/**
 * The line a source offset falls on.
 * @param css - stylesheet source.
 * @param at - the offset, or `-1` when unknown.
 * @returns the 1-based line number.
 */
export function lineOf(css, at) {
  if (at < 0) return 0;
  let line = 1;
  for (let i = 0; i < at && i < css.length; i += 1)
    if (css[i] === "\n") line += 1;
  return line;
}
