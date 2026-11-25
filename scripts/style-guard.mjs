/**
 * The browser stylesheets' mechanical guards.
 *
 * Feature CSS in this plugin owns no design decisions. `ui-theme` publishes the
 * palette (`--dsw-*`) and the user-preference seams (`--dsh-*`), and every
 * sheet here consumes them; `ui-primitives` owns the geometry of the controls
 * this plugin reuses. Both contracts are invisible in a diff and decay without
 * a failing test, which is why they are checked mechanically:
 *
 * 1. **Token references resolve.** A misspelt or invented token is silently
 *    dropped by the browser, so the declaration does nothing and the element
 *    falls back to the inherited value. `.diagFetchError` shipped
 *    `var(--dsw-alias-label-error)` — a name the theme never defined — and read
 *    as `inherit` for as long as it existed. Every reference is now resolved
 *    against the snapshot in `tests/fixtures/style-tokens.json`.
 * 2. **Type is on the ladder.** A literal `font-size`/`line-height` opts out of
 *    the typography scale and, more importantly, out of the user's font-size
 *    axis: the reader who raised their size to 22px found these surfaces
 *    unchanged. The one legitimate literal is the 16px focus-zoom guard,
 *    which is why the exception is declared rather than the rule widened.
 * 3. **Colour comes from the palette.** A literal hex value cannot follow the
 *    dark palette, the high-contrast palette, or a brand override. The mask
 *    gradients are the exception the platform itself makes: `mask-image` reads
 *    alpha only, so `#000` there is a coverage value, not a colour.
 * 4. **Full-round radii stay round.** `corner-shape.css` caps the corner
 *    profile, so a `50%`/pill radius without a paired `corner-shape: round`
 *    renders as a squircle. The theme's own stylesheet guard enforces the
 *    pairing; feature CSS has to hold the same line.
 * 5. **State borders are one pixel.** A hairline (0.5px) border in a state
 *    colour reads as a tint rather than a mark: it was invisible at 1× and
 *    mushy at 2×. State borders carry the full pixel.
 * 6. **Hover is capability-gated.** An ungated `:hover` sticks after a tap on
 *    touch hardware, leaving the last-tapped control in its hover dress.
 * 7. **Motion is reducible.** A reader who asked for less motion gets no
 *    transition. The reduction is a hand-written list of class names in a
 *    second rule, which is exactly the kind of list that goes stale: the audit
 *    that produced this guard found eight entries naming rules that no longer
 *    animate, and thirteen classes animating with no entry at all.
 * 8. **Elevated surfaces draw their own stroke.** A menu, popover, panel or
 *    floating button sets `border: 0` and takes a `--dsw-elevation-*` shadow:
 *    its 0.5px hairline is the shadow's first layer, not a layout-consuming
 *    border beside it. A state-coloured border stays a real border.
 * 9. **Neutral separators are hairlines.** A flat border or separator in a
 *    neutral `--dsw-alias-border-*` token draws at `0.5px`, which Chromium
 *    paints as one device pixel. Dashed affordances, state-coloured borders and
 *    a rail declared in {@link NEUTRAL_BORDER_ACCENTS} keep their full pixel.
 * 10. **Weight stops at 500.** 600/700 exist for markdown headings, not for UI
 *    emphasis: a feature sheet's bold label outranked body copy and read as a
 *    second type system. Emphasis is ink or size, and the ladder's `*-strong-*`
 *    steps carry the ceiling.
 * 11. **Controls keep their material.** Feature CSS seats a `Button`, `Input`,
 *    `Checkbox`, `Tag` or `ZoomControls` (flex, width, margin, inset) and never
 *    restates its size, padding, fill, ink, border or focus dress — those
 *    belong to `ui-primitives`, and a local restatement wins or loses against
 *    it by stylesheet injection order. The two declared exceptions live in the
 *    control-ownership guard, and icons that are not controls are out of scope.
 *
 * The predicates below are exported and driven by `tests/unit/style-guard` so
 * the guards cannot decay: a parser that stopped matching the form its
 * docstring names would otherwise fail the suite green.
 * @module scripts/style-guard
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  baseClassOf,
  declarationsOf,
  lineOf,
  rulesOf,
  stripComments,
  subjectClassesOf,
} from "./shared/css-syntax.mjs";
import {
  clientSources,
  controlStyleViolations,
} from "./shared/control-style-ownership.mjs";

/* The shared reader stays part of this module's public surface: the unit tests
   drive `rulesOf`/`declarationsOf` through it, and both guards read a rule the
   same way. */
export { declarationsOf, rulesOf, stripComments };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Directory scanned for stylesheets, relative to the repository root. */
export const STYLE_ROOT = "src";

/** Extension the guard reads. */
export const STYLE_EXTENSION = ".css";

/**
 * The one literal `font-size` the ladder allows, and the query that licenses
 * it: iOS zooms the whole page when a form control is focused below 16px, so a
 * touch-only rule must state 16px outright rather than scale with the reader.
 */
export const FOCUS_ZOOM_GUARD = { query: "pointer: coarse", value: "16px" };

/** Properties whose literal `#000` is a coverage value rather than a colour. */
export const MASK_PROPERTIES = ["mask", "mask-image", "-webkit-mask-image"];

/** Border sides, in the order a shorthand writes them. */
const SIDES = ["top", "right", "bottom", "left"];

/** A border thinner than this reads as a tint instead of a mark. */
const STATE_BORDER_FLOOR = 1;

/** An elevation token marks a rule as an elevated surface. */
const ELEVATION_TOKEN = /--dsw-elevation-/;

/** A neutral border token; the state palette stays a real border. */
const NEUTRAL_BORDER = /--dsw-alias-border-/;

/**
 * Neutral borders that are deliberately thicker than a hairline because the
 * border is the mark, not a divider: a quote rail (the bar states "this is
 * quoted copy") or an emphasis rule. A thicker neutral border anywhere else
 * reads heavier than the surface it separates, and the difference doubles on a
 * 2x screen. Declaring an entry here is the only way to opt out; the guard
 * refuses an undeclared rail instead of silently widening the rule.
 */
export const NEUTRAL_BORDER_ACCENTS = [
  {
    file: "src/client/preview.module.css",
    selector: ".annotationQuote",
    reason: "a quote rail inside an annotation card: the bar is the mark",
  },
  {
    file: "src/client/preview.module.css",
    selector: ".feedback blockquote",
    reason: "a quote rail inside the feedback draft: the bar is the mark",
  },
];

/** A state-colour token, which is exempt from the neutral hairline rule. */
const STATE_COLOR = /--dsw-alias-state-/;

/** The width a neutral flat border or separator draws at. */
const NEUTRAL_HAIRLINE = 0.5;

/**
 * Whether a declaration names a border that can carry a neutral border token:
 * `border`, `border-width`, `border-color`, a physical/logical side shorthand,
 * or a `-width`/`-color` long hand. `border-radius`, `border-style`,
 * `border-spacing` and `border-collapse` set no edge and are not borders in the
 * sense these two guards read.
 * @param property - the lower-cased property name.
 * @returns true when the property paints a border edge.
 */
function isBorderEdge(property) {
  if (property === "border" || property === "border-width") return true;
  if (property === "border-color") return true;
  if (!/^border-/.test(property)) return false;
  const rest = property.slice("border-".length);
  const side =
    "(?:top|right|bottom|left|inline-start|inline-end|block-start|block-end)";
  return new RegExp(`^${side}(?:-(?:width|color))?$`).test(rest);
}

/**
 * Every design-system token a stylesheet references. The three namespaces are
 * the static palette (`--dsw-*`), the runtime preference seams (`--dsh-*`), and
 * the host base tokens (`--ds-*`, defined in `ui-theme/src/styles/base.css`).
 * @param text - stylesheet source, or a single value.
 * @returns the referenced names, `--` prefix included.
 */
/** One `var(--dsw|dsh|ds-…)` reference; the sole spelling every check uses. */
const TOKEN_REFERENCE = /var\(\s*(--(?:dsw|dsh|ds)-[a-z0-9-]+)/g;

/**
 * The length in a `border`/`border-width` value, in pixels.
 * @param value - the declaration value.
 * @returns the pixel width, or `undefined` when the value states none.
 */
function borderWidthOf(value) {
  const match = /(?:^|\s)(\d*\.?\d+)px\b/.exec(value);
  return match === null ? undefined : Number(match[1]);
}

/**
 * A rule's border widths, per side.
 *
 * Both the shorthand and the long hands are read, in source order, so a long
 * hand that follows a shorthand overrides it the way the cascade does.
 * @param declarations - the rule's declarations.
 * @returns the width per side, `undefined` where the rule states none.
 */
function sideWidthsOf(declarations) {
  const widths = {};
  for (const { property, value } of declarations) {
    if (property === "border") {
      const width = borderWidthOf(value);
      if (width !== undefined) for (const side of SIDES) widths[side] = width;
      continue;
    }
    if (property === "border-width") {
      const stated = expandBox(
        value.split(/\s+/).map((part) => borderWidthOf(part)),
      );
      for (const side of SIDES)
        if (stated[side] !== undefined) widths[side] = stated[side];
      continue;
    }
    const side =
      SIDES.find(
        (name) =>
          property === `border-${name}` || property === `border-${name}-width`,
      ) ??
      /^border-(inline-start|inline-end|block-start|block-end)(?:-width)?$/.exec(
        property,
      )?.[1];
    const width = side === undefined ? undefined : borderWidthOf(value);
    if (side !== undefined && width !== undefined) widths[side] = width;
  }
  return widths;
}

/**
 * Expand a one-to-four value box shorthand to its four sides, as CSS does.
 * @param values - the stated values, in source order.
 * @returns one value per side; the missing ones stay `undefined`.
 */
function expandBox(values) {
  const [first, second = first, third = first, fourth = second] = values;
  return { top: first, right: second, bottom: third, left: fourth };
}

/**
 * The sides a rule paints with a state colour.
 * @param declarations - the rule's declarations.
 * @returns the sides, empty when the rule paints no state colour.
 */
function stateSidesOf(declarations) {
  const sides = new Set();
  for (const { property, value } of declarations) {
    if (!value.includes("--dsw-alias-state-")) continue;
    if (property === "border" || property === "border-color")
      for (const side of SIDES) sides.add(side);
    else {
      const side = SIDES.find(
        (name) =>
          property === `border-${name}` || property === `border-${name}-color`,
      );
      if (side !== undefined) sides.add(side);
    }
  }
  return [...sides];
}

/**
 * Violations of the token contract: a reference to a name the palette does not
 * publish resolves to nothing, so the declaration silently does nothing.
 * @param source - one stylesheet: its repo-relative path and its source text.
 * @param palette - the published `--dsw-*` and `--dsh-*` names.
 * @returns the violations, empty when every reference resolves.
 */
export function unknownTokenViolations(source, palette) {
  const css = stripComments(source.css);
  const known = new Set([
    ...palette.dsw,
    ...(palette.dsh ?? []),
    ...(palette.ds ?? []),
  ]);
  const violations = [];
  for (const match of css.matchAll(TOKEN_REFERENCE)) {
    if (known.has(match[1])) continue;
    violations.push({
      file: source.file,
      line: lineOf(css, match.index),
      selector: "",
      detail: `var(${match[1]}) names no published token`,
      fix: "use a name from tests/fixtures/style-tokens.json, or add a --dsh-* seam there with the host code that publishes it",
    });
  }
  return violations;
}

/**
 * Violations of the typography ladder: a literal size opts out of the scale and
 * out of the reader's font-size axis.
 * @param source - one stylesheet.
 * @returns the violations, empty when every size is a token.
 */
export function bareFontScaleViolations(source) {
  const css = stripComments(source.css);
  const violations = [];
  for (const rule of rulesOf(css)) {
    for (const { property, value } of declarationsOf(rule.body)) {
      if (!["font", "font-size", "line-height"].includes(property)) continue;
      if (!/\d*\.?\d+px/.test(value) || value.includes("var(")) continue;
      const licensed =
        rule.atRules.some((at) => at.includes(FOCUS_ZOOM_GUARD.query)) &&
        value === FOCUS_ZOOM_GUARD.value;
      if (licensed) continue;
      violations.push({
        file: source.file,
        line: lineOf(css, rule.at),
        selector: rule.selector,
        detail: `${property}: ${value} is off the typography ladder`,
        fix: "use a --dsw-font-* step (it carries the reader's font-size axis)",
      });
    }
  }
  return violations;
}

/** The heaviest weight a UI surface may state; headings own the ladder's own weights. */
const WEIGHT_CEILING = 500;

/** Keyword weights and their numeric equivalents, as `font-weight` writes them. */
const WEIGHT_KEYWORDS = new Map([
  ["normal", 400],
  ["bold", 700],
  ["bolder", 700],
  ["lighter", 300],
]);

/**
 * The weight a `font-weight` or `font` shorthand states.
 * @param property - the lower-cased property name.
 * @param value - the declaration value.
 * @returns the numeric weight, or undefined when the value does not state one.
 */
function weightOf(property, value) {
  if (property === "font-weight") {
    // A weight behind `var()` is the ladder's own business.
    if (value.includes("var(")) return undefined;
    const bare = value.trim();
    if (WEIGHT_KEYWORDS.has(bare)) return WEIGHT_KEYWORDS.get(bare);
    return /^[1-9]00$/.test(bare) ? Number(bare) : undefined;
  }
  // `font` shorthand: weight sits before the size token.
  const tokens = value.split("/")[0].trim().split(/\s+/);
  for (const token of tokens) {
    if (/\d*(\.\d+)?(?:px|rem|em|%)/.test(token)) break;
    if (WEIGHT_KEYWORDS.has(token)) return WEIGHT_KEYWORDS.get(token);
    if (/^[1-9]00$/.test(token)) return Number(token);
  }
  return undefined;
}

/**
 * Violations of the weight ceiling: a UI surface states at most 500.
 *
 * A 600/700 declaration does not follow the ladder — the theme keeps its bold
 * steps for markdown headings — and a single bold label in a panel reads as a
 * second type system next to 500-weight chrome. The check reads both
 * `font-weight` and the `font` shorthand, which is how half the weights in a
 * sheet are actually written.
 * @param source - one stylesheet.
 * @returns the violations, empty when every weight stays at or below 500.
 */
export function fontWeightViolations(source) {
  const css = stripComments(source.css);
  const violations = [];
  for (const rule of rulesOf(css)) {
    for (const { property, value } of declarationsOf(rule.body)) {
      if (property !== "font-weight" && property !== "font") continue;
      const weight = weightOf(property, value);
      if (weight === undefined || weight <= WEIGHT_CEILING) continue;
      violations.push({
        file: source.file,
        line: lineOf(css, rule.at),
        selector: rule.selector,
        detail: `${property}: ${value} states weight ${weight}`,
        fix: "state 500 at most; emphasise with ink or size, or use a --dsw-font-*-strong-* step",
      });
    }
  }
  return violations;
}

/**
 * Violations of the palette contract: a literal colour cannot follow the dark
 * palette, the high-contrast palette, or a brand override.
 * @param source - one stylesheet.
 * @returns the violations, empty when every colour is a token or a mask value.
 */
export function literalColorViolations(source) {
  const css = stripComments(source.css);
  const violations = [];
  for (const rule of rulesOf(css)) {
    for (const { property, value } of declarationsOf(rule.body)) {
      const literals = [
        ...value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g),
      ].map((match) => match[0]);
      if (literals.length === 0) continue;
      const maskCoverage =
        MASK_PROPERTIES.includes(property) &&
        literals.every(
          (literal) => literal === "#000" || literal === "#000000",
        );
      if (maskCoverage) continue;
      violations.push({
        file: source.file,
        line: lineOf(css, rule.at),
        selector: rule.selector,
        detail: `${property}: ${value} states a literal colour (${literals.join(", ")})`,
        fix: "use a --dsw-alias-* colour; mask coverage is the only literal the platform allows",
      });
    }
  }
  return violations;
}

/**
 * Violations of the corner-shape pairing: a full-round radius carries a
 * `corner-shape: round`, or the theme's corner cap renders it as a squircle.
 * @param source - one stylesheet.
 * @returns the violations, empty when every full round is paired.
 */
export function fullRoundRadiusViolations(source) {
  const css = stripComments(source.css);
  const violations = [];
  for (const rule of rulesOf(css)) {
    const declarations = declarationsOf(rule.body);
    const radius = declarations.find(
      ({ property }) => property === "border-radius",
    );
    if (radius === undefined) continue;
    const fullRound =
      /\b(?:50|100)%/.test(radius.value) ||
      /\b9{3,}(?:\.\d+)?px/.test(radius.value);
    if (!fullRound) continue;
    const paired = declarations.some(
      ({ property, value }) =>
        property === "corner-shape" && value.includes("round"),
    );
    if (paired) continue;
    violations.push({
      file: source.file,
      line: lineOf(css, rule.at),
      selector: rule.selector,
      detail: `border-radius: ${radius.value} is a full round with no corner-shape: round`,
      fix: "pair corner-shape: round with the radius, as corner-shape.css does",
    });
  }
  return violations;
}

/**
 * Resolve a rule's inherited border widths against the base classes it
 * qualifies. An attribute variant (`.badge[data-tone]`) resolves exactly; a
 * suffix-composed variant (`.itemRowActive`) resolves against the longest base
 * class name that prefixes it (`.itemRow`), which is the class whose width it
 * restates the colour of.
 * @param baseWidths - widths keyed by base class name.
 * @param key - the variant's own base class name.
 * @returns the inherited widths, empty when no base declares one.
 */
function resolveBaseWidths(baseWidths, key) {
  const exact = baseWidths.get(key);
  if (exact !== undefined) return exact;
  let best = "";
  let widths = {};
  for (const [base, candidate] of baseWidths) {
    if (key.startsWith(base) && base.length > best.length) {
      best = base;
      widths = candidate;
    }
  }
  return widths;
}

/**
 * Violations of the state-border floor: a hairline in a state colour reads as a
 * tint, not a mark, so a state border is at least one pixel.
 *
 * A variant rule usually restates only the colour, taking its width from the
 * class it qualifies; the effective width is therefore resolved across the
 * pair, both for attribute variants and for suffix-composed class names. A
 * variant that neither states nor inherits a full pixel is the failure this
 * catches.
 * @param source - one stylesheet.
 * @returns the violations, empty when every state border is full weight.
 */
export function stateBorderViolations(source) {
  const css = stripComments(source.css);
  const rules = rulesOf(css);
  const baseWidths = new Map();
  for (const rule of rules) {
    if (rule.selector.includes("[") || rule.selector.includes(":")) continue;
    const key = baseClassOf(rule.selector);
    if (key === undefined || baseWidths.has(key)) continue;
    const widths = sideWidthsOf(declarationsOf(rule.body));
    if (Object.keys(widths).length > 0) baseWidths.set(key, widths);
  }
  const violations = [];
  for (const rule of rules) {
    const declarations = declarationsOf(rule.body);
    const sides = stateSidesOf(declarations);
    if (sides.length === 0) continue;
    const stated = sideWidthsOf(declarations);
    const inherited = resolveBaseWidths(
      baseWidths,
      baseClassOf(rule.selector) ?? "",
    );
    const thin = sides.filter((side) => {
      const width = stated[side] ?? inherited[side];
      return width !== undefined && width < STATE_BORDER_FLOOR;
    });
    if (thin.length === 0) continue;
    violations.push({
      file: source.file,
      line: lineOf(css, rule.at),
      selector: rule.selector,
      detail: `state border on ${thin.join("/")} is a hairline`,
      fix: "set border-width: 1px alongside the state colour",
    });
  }
  return violations;
}

/**
 * Violations of the elevated-surface contract: a surface that takes an
 * `--dsw-elevation-*` shadow draws its hairline as the shadow's first layer, so
 * it sets `border: 0` rather than pairing the shadow with a neutral
 * `--dsw-alias-border-*` border. A border beside the elevation stroke double
 * draws the outline and shifts layout by its width. State-coloured borders stay
 * real borders and are out of scope.
 * @param source - one stylesheet.
 * @returns the violations, empty when no elevated rule pairs a neutral border.
 */
export function elevatedSurfaceViolations(source) {
  const css = stripComments(source.css);
  const violations = [];
  for (const rule of rulesOf(css)) {
    const declarations = declarationsOf(rule.body);
    const elevated = declarations.some(({ value }) =>
      ELEVATION_TOKEN.test(value),
    );
    if (!elevated) continue;
    for (const { property, value } of declarations) {
      if (!isBorderEdge(property)) continue;
      if (!NEUTRAL_BORDER.test(value)) continue;
      if (STATE_COLOR.test(value)) continue;
      violations.push({
        file: source.file,
        line: lineOf(css, rule.at),
        selector: rule.selector,
        detail: `${property}: ${value} pairs a neutral border with an elevation shadow`,
        fix: "set border: 0 and let the --dsw-elevation-* shadow draw the hairline stroke",
      });
    }
  }
  return violations;
}

/**
 * Violations of the neutral-hairline contract: a flat border or separator in a
 * neutral `--dsw-alias-border-*` token draws at `0.5px`, the one device pixel
 * Chromium paints for a hairline. Dashed/dotted affordances and state-coloured
 * borders keep their full pixel and are out of scope, and so is a rail declared
 * in {@link NEUTRAL_BORDER_ACCENTS} — a bar that is the mark rather than a
 * divider between two surfaces. The effective width is
 * read the way `sideWidthsOf` reads it — a long hand follows a shorthand in
 * source order, and a variant may inherit a width from the base class it
 * qualifies — so a `border-color`-only restatement is judged by the width it
 * actually paints.
 * @param source - one stylesheet.
 * @returns the violations, empty when every neutral border is a hairline.
 */
export function neutralHairlineViolations(source) {
  const css = stripComments(source.css);
  const rules = rulesOf(css);
  const baseWidths = new Map();
  for (const rule of rules) {
    if (rule.selector.includes("[") || rule.selector.includes(":")) continue;
    const key = baseClassOf(rule.selector);
    if (key === undefined || baseWidths.has(key)) continue;
    const widths = sideWidthsOf(declarationsOf(rule.body));
    if (Object.keys(widths).length > 0) baseWidths.set(key, widths);
  }
  const violations = [];
  for (const rule of rules) {
    if (
      NEUTRAL_BORDER_ACCENTS.some(
        (accent) =>
          accent.file === source.file &&
          rule.selector.includes(accent.selector),
      )
    ) {
      continue;
    }
    const declarations = declarationsOf(rule.body);
    const stated = sideWidthsOf(declarations);
    const inherited = resolveBaseWidths(
      baseWidths,
      baseClassOf(rule.selector) ?? "",
    );
    for (const { property, value } of declarations) {
      if (!isBorderEdge(property)) continue;
      if (!NEUTRAL_BORDER.test(value)) continue;
      if (STATE_COLOR.test(value)) continue;
      if (/\b(?:dashed|dotted)\b/.test(value)) continue;
      const side = /^border-(top|right|bottom|left)(?:-width|-color)?$/.exec(
        property,
      )?.[1];
      const widths =
        side === undefined ? Object.values(stated) : [stated[side]];
      const effective = widths.map((width) => width ?? inherited[side]);
      if (effective.length === 0) effective.push(...Object.values(inherited));
      for (const width of effective) {
        if (width === undefined || width === NEUTRAL_HAIRLINE) continue;
        violations.push({
          file: source.file,
          line: lineOf(css, rule.at),
          selector: rule.selector,
          detail: `${property}: ${value} states a ${width}px neutral border`,
          fix: "draw a neutral flat border at 0.5px; dashed affordances and state-coloured borders keep 1px, a decorative rail needs an entry in NEUTRAL_BORDER_ACCENTS",
        });
        break;
      }
    }
  }
  return violations;
}

/**
 * Violations of the hover gate: an ungated `:hover` sticks after a tap on touch
 * hardware.
 * @param source - one stylesheet.
 * @returns the violations, empty when every hover rule is gated.
 */
export function hoverMediaViolations(source) {
  const css = stripComments(source.css);
  const violations = [];
  for (const rule of rulesOf(css)) {
    if (!rule.selector.includes(":hover")) continue;
    if (rule.atRules.some((at) => /hover\s*:\s*hover/.test(at))) continue;
    violations.push({
      file: source.file,
      line: lineOf(css, rule.at),
      selector: rule.selector,
      detail: "hover styling is not gated on a hover-capable pointer",
      fix: "move it inside @media (hover: hover)",
    });
  }
  return violations;
}

/**
 * Violations of the reduced-motion contract: a class that animates a property
 * has to stop animating it when the reader asked for less motion.
 *
 * The reduction is a hand-written list of class names in a second rule, so it
 * rots in exactly the way the audit found: a rule is deleted or renamed and the
 * list keeps naming the class, or a new transition is added and the list never
 * hears about it. Twelve classes were animating with no reduction at all. The
 * host does not hold this line consistently (64 of its sheets declare a
 * transition, 40 reduce it); this repository does, because a list nobody checks
 * is a list that is wrong.
 * @param source - one stylesheet.
 * @returns the violations, empty when every animated class is reduced.
 */
export function unreducedMotionViolations(source) {
  const css = stripComments(source.css);
  const animated = new Map();
  const reduced = new Set();
  for (const rule of rulesOf(css)) {
    const subjects = subjectClassesOf(rule.selector);
    if (
      rule.atRules.some((at) => /prefers-reduced-motion\s*:\s*reduce/.test(at))
    ) {
      for (const subject of subjects) reduced.add(subject);
      continue;
    }
    const animates = declarationsOf(rule.body).some(
      ({ property }) =>
        property === "transition" || property === "transition-property",
    );
    if (!animates) continue;
    for (const subject of subjects)
      if (!animated.has(subject)) animated.set(subject, rule.at);
  }
  const violations = [];
  for (const [subject, at] of animated) {
    if (reduced.has(subject)) continue;
    violations.push({
      file: source.file,
      line: lineOf(css, at),
      selector: subject,
      detail: `${subject} animates with no prefers-reduced-motion reduction`,
      fix: "add it to a `@media (prefers-reduced-motion: reduce)` block in this sheet with `transition: none`",
    });
  }
  return violations;
}

/** Every stylesheet guard, in the order they are reported. */
export const STYLE_GUARDS = [
  unknownTokenViolations,
  bareFontScaleViolations,
  fontWeightViolations,
  literalColorViolations,
  fullRoundRadiusViolations,
  stateBorderViolations,
  elevatedSurfaceViolations,
  neutralHairlineViolations,
  hoverMediaViolations,
  unreducedMotionViolations,
];

/**
 * Run every guard over every stylesheet.
 * @param sources - the stylesheets, as repo-relative path plus source text.
 * @param palette - the published token names.
 * @returns the violations, empty when the stylesheets conform.
 */
export function styleViolations(sources, palette) {
  const violations = [];
  for (const guard of STYLE_GUARDS) {
    for (const source of sources) {
      for (const violation of guard(source, palette))
        violations.push(violation);
    }
  }
  return violations;
}

/**
 * Every stylesheet under the scanned root.
 * @param base - the repository root; defaults to the one this script lives in.
 * @returns the sources, sorted by path.
 */
export function styleSources(base = root) {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      return entry.name.endsWith(STYLE_EXTENSION) ? [path] : [];
    });
  return walk(join(base, STYLE_ROOT))
    .sort()
    .map((path) => ({
      file: relative(base, path).split("\\").join("/"),
      css: readFileSync(path, "utf8"),
    }));
}

/**
 * Format one violation as the CLI prints it.
 * @param violation - the violation.
 * @returns three indented lines.
 */
export function formatViolation(violation) {
  const where =
    violation.line === 0
      ? violation.file
      : `${violation.file}:${violation.line}`;
  return [
    `  ${where}  ${violation.selector}`.trimEnd(),
    `    ${violation.detail}`,
    `    fix: ${violation.fix}`,
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const palette = JSON.parse(
    readFileSync(join(root, "tests", "fixtures", "style-tokens.json"), "utf8"),
  );
  const styles = styleSources();
  const sources = clientSources(root);
  const violations = [
    ...styleViolations(styles, palette),
    ...controlStyleViolations(sources, styles),
  ];
  if (violations.length > 0) {
    console.error(`style-guard: ${violations.length} violation(s)`);
    for (const violation of violations)
      console.error(formatViolation(violation));
    process.exit(1);
  }
  console.log(
    `style-guard ok: ${styles.length} stylesheets, ${sources.length} client sources`,
  );
}
