/**
 * Control-style ownership: the mechanical half of "feature CSS never restyles
 * a host control".
 *
 * The rule has one direction: `ui-primitives` owns a control's material — its
 * size, padding, fill, ink, border, focus and disabled dress — and a feature
 * sheet may only place it (flex, width, margin, inset). Without a guard the
 * split decays silently: a `.headerTool { padding: 0; height: 28px }` looks
 * harmless in review, wins or loses against the primitive by stylesheet
 * injection order, and the header's hover/pressed/focus dress silently stops
 * matching every other control in the product.
 *
 * The guard connects JSX control elements to their CSS rules through the
 * module import, not by guessing a class name's spelling: `<Button
 * className={styles.foo}>` marks `.foo` as a control seat, and every rule whose
 * subject is one of those classes is checked declaration by declaration.
 *
 * Two declarations are deliberately out of scope, both machine-declared:
 * - a geometry adapter (`IconButton.module.css`) may own padding, size, radius
 *   and placement, because the host has no square icon-only variant;
 * - a rule keyed on a semantic state attribute (`[aria-pressed='true']`, …)
 *   may restate `background`/`color`: the fill of a toggled-on control is the
 *   semantic state, and the harness itself dresses its own toggles this way.
 *
 * @module dsh-typst/scripts/shared/control-style-ownership
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative } from "node:path";
import ts from "typescript";
import {
  declarationsOf,
  lineOf,
  rulesOf,
  stripComments,
  subjectClassesOf,
} from "./css-syntax.mjs";

/** The package whose controls own their own material. */
const CONTROL_MODULE = "@deepseek-ai/dsh-client-ui-primitives";

/** The primitives this plugin reuses as controls; icons and surfaces are not. */
const CONTROL_IMPORTS = new Set([
  "Button",
  "Checkbox",
  "Input",
  "SegmentedTabs",
  "Tag",
  "ZoomControls",
]);

/** A local adapter that renders a host control, so its seats are control seats. */
const LOCAL_CONTROL_SPECIFIER = /\/IconButton(?:\.js)?$/;

/** Properties a control owns. `user-select` and `font-variant-numeric` are not design. */
const OWNED =
  /^(?:padding(?:-.+)?|(?:min-|max-)?height|(?:min-|max-)?block-size|background(?:-.+)?|color|font(?:-.+)?|line-height|border(?:-.+)?|outline(?:-.+)?|box-shadow|corner-shape|gap|row-gap|column-gap|cursor|opacity)$/;

/** Geometry a declared adapter may own: placement and size, never material. */
const ADAPTER_GEOMETRY =
  /^(?:padding(?:-.+)?|(?:min-|max-)?(?:height|width|block-size|inline-size)|border(?:-[a-z]+)*-radius|corner-shape|box-sizing|display|position|inset(?:-.+)?|z-index|flex(?:-.+)?|justify-content|align-(?:items|self|content))$/;

/** A rule keyed on a semantic state attribute may restate its selected dress. */
const STATE_KEYED = /\[aria-(?:pressed|checked|current|expanded|selected)=/;

/**
 * Adapters that own control geometry by design, with the reason they exist.
 * @type {ReadonlyArray<{file: string, reason: string}>}
 */
export const CONTROL_GEOMETRY_ADAPTERS = [
  {
    file: "src/client/IconButton.module.css",
    reason:
      "the host has no square icon-only Button variant; the adapter owns 20/28px geometry and the aria-pressed dress",
  },
];

/**
 * Declared compositions: a feature seat that deliberately inlines a host
 * control whose default placement it was not designed for. Any other override
 * is refused, so a new one has to be argued for in review.
 * @type {ReadonlyArray<{file: string, selector: string, reason: string}>}
 */
export const CONTROL_COMPOSITIONS = [
  {
    file: "src/client/preview.module.css",
    selector: ".pagebar .zoom",
    reason:
      "ZoomControls is a floating panel; the page bar inlines it as one row of chrome",
  },
];

/**
 * The client sources the guard reads: the browser half, no declarations.
 * @param base - repository root.
 * @returns repo-relative path plus source text, sorted by path.
 */
export function clientSources(base) {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walk(path);
      if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".ts"))
        return [];
      if (entry.name.endsWith(".d.ts")) return [];
      return [path];
    });
  return walk(join(base, "src", "client"))
    .sort()
    .map((path) => ({
      file: relative(base, path).split("\\").join("/"),
      code: readFileSync(path, "utf8"),
    }));
}

/**
 * One violation, shaped like `StyleViolation` in `style-guard.d.mts`.
 * @typedef {{file: string, line: number, selector: string, detail: string, fix: string}} Violation
 */

/**
 * What a rule owns per CSS module: path → subject classes, or `*` for an
 * adapter that owns its whole module.
 * @typedef {Map<string, Set<string>>} Targets
 */

/** The fix every violation carries; the material stays the control's. */
const FIX =
  "use the host control's size/variant; put layout on its seat (flex, width, margin, inset) and surface decoration on its own container";

/**
 * Resolve a relative CSS module import against the importing file.
 * @param file - importing source, repo-relative.
 * @param specifier - the import's text.
 * @returns the stylesheet path, repo-relative.
 */
function resolveModule(file, specifier) {
  return posix.normalize(posix.join(posix.dirname(file), specifier));
}

/**
 * Add the classes a className expression names to a module's target set.
 * @param expression - the JSX expression.
 * @param modules - local CSS module bindings for this source.
 * @param targets - the accumulated targets.
 * @param file - the importing source.
 * @param report - sink for a computed class that cannot be read.
 */
function collectClasses(expression, modules, targets, file, report) {
  if (expression === undefined) return;
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    modules.has(expression.expression.text)
  ) {
    const path = modules.get(expression.expression.text);
    const names = targets.get(path) ?? new Set();
    names.add(`.${expression.name.text}`);
    targets.set(path, names);
    return;
  }
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    modules.has(expression.expression.text)
  ) {
    const path = modules.get(expression.expression.text);
    const names = targets.get(path) ?? new Set();
    if (ts.isStringLiteral(expression.argumentExpression)) {
      names.add(`.${expression.argumentExpression.text}`);
      targets.set(path, names);
    } else if (
      CONTROL_GEOMETRY_ADAPTERS.some((adapter) => adapter.file === file)
    ) {
      names.add("*");
      targets.set(path, names);
    } else {
      report(
        "className",
        "computed CSS module class has no statically verifiable control ownership",
        expression.getStart(),
      );
    }
    return;
  }
  if (ts.isParenthesizedExpression(expression))
    collectClasses(expression.expression, modules, targets, file, report);
  if (ts.isConditionalExpression(expression)) {
    collectClasses(expression.whenTrue, modules, targets, file, report);
    collectClasses(expression.whenFalse, modules, targets, file, report);
  }
  if (ts.isBinaryExpression(expression)) {
    collectClasses(expression.left, modules, targets, file, report);
    collectClasses(expression.right, modules, targets, file, report);
  }
  if (ts.isTemplateExpression(expression)) {
    collectClasses(expression.head, modules, targets, file, report);
    for (const span of expression.templateSpans)
      collectClasses(span.expression, modules, targets, file, report);
  }
}

/**
 * The CSS property name an inline style key sets.
 * @param name - the object literal key.
 * @returns the css property, camel case folded to kebab case.
 */
function cssPropertyOf(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Read the control seats out of one client source and register them.
 * @param file - repo-relative path.
 * @param code - source text.
 * @param targets - the accumulated targets.
 * @param violation - sink for a violation at a source offset.
 */
function scanSource(file, code, targets, violation) {
  const sf = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  /** @type {Map<string, string>} */
  const modules = new Map();
  /** @type {Set<string>} */
  const controls = new Set();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    if (clause === undefined || clause.isTypeOnly) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const bind = (local, imported) => {
      if (specifier === CONTROL_MODULE && CONTROL_IMPORTS.has(imported))
        controls.add(local);
      else if (LOCAL_CONTROL_SPECIFIER.test(specifier)) controls.add(local);
      else if (specifier.endsWith(".module.css"))
        modules.set(local, resolveModule(file, specifier));
    };
    if (clause.name !== undefined) bind(clause.name.text, "default");
    const bindings = clause.namedBindings;
    if (bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) bind(bindings.name.text, "namespace");
    else
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        bind(element.name.text, (element.propertyName ?? element.name).text);
      }
  }
  if (controls.size === 0) return;
  /** @param {string} selector @param {string} detail @param {number} at */
  const report = (selector, detail, at) =>
    violation(
      file,
      sf.getLineAndCharacterOfPosition(at).line + 1,
      selector,
      detail,
    );
  const visit = (node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      controls.has(node.tagName.text)
    ) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        const name = attribute.name.getText(sf);
        if (name === "className" && attribute.initializer !== undefined) {
          if (ts.isJsxExpression(attribute.initializer))
            collectClasses(
              attribute.initializer.expression,
              modules,
              targets,
              file,
              report,
            );
          continue;
        }
        if (
          name !== "style" ||
          attribute.initializer === undefined ||
          !ts.isJsxExpression(attribute.initializer) ||
          attribute.initializer.expression === undefined ||
          !ts.isObjectLiteralExpression(attribute.initializer.expression)
        )
          continue;
        for (const property of attribute.initializer.expression.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = property.name.getText(sf).replace(/^["']|["']$/g, "");
          const cssName = cssPropertyOf(key);
          if (!OWNED.test(cssName)) continue;
          report(
            node.tagName.text,
            `inline ${cssName} overrides host control design`,
            property.getStart(),
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * Every place a feature sheet restyles a host control.
 * @param codeSources - client sources with repo-relative paths.
 * @param styles - stylesheets with repo-relative paths.
 * @returns the violations, empty when the split holds.
 */
export function controlStyleViolations(codeSources, styles) {
  /** @type {Targets} */
  const targets = new Map();
  /** @type {Violation[]} */
  const violations = [];
  /** @param {string} file @param {number} line @param {string} selector @param {string} detail */
  const violation = (file, line, selector, detail) =>
    violations.push({ file, line, selector, detail, fix: FIX });
  for (const { file, code } of codeSources)
    scanSource(file, code, targets, violation);
  for (const sheet of styles) {
    const names = targets.get(sheet.file);
    if (names === undefined) continue;
    const css = stripComments(sheet.css);
    for (const rule of rulesOf(css)) {
      if (
        CONTROL_COMPOSITIONS.some(
          (composition) =>
            composition.file === sheet.file &&
            rule.selector.replace(/\s+/g, " ").includes(composition.selector),
        )
      )
        continue;
      const subjects = subjectClassesOf(rule.selector);
      if (!names.has("*") && !subjects.some((name) => names.has(name)))
        continue;
      const adapter = CONTROL_GEOMETRY_ADAPTERS.some(
        (entry) => entry.file === sheet.file,
      );
      for (const declaration of declarationsOf(rule.body)) {
        if (!OWNED.test(declaration.property)) continue;
        if (adapter && ADAPTER_GEOMETRY.test(declaration.property)) continue;
        if (
          STATE_KEYED.test(rule.selector) &&
          /^(?:background(?:-.+)?|color)$/.test(declaration.property)
        )
          continue;
        violation(
          sheet.file,
          lineOf(css, rule.at),
          rule.selector,
          `${declaration.property} overrides host control design`,
        );
      }
    }
  }
  return violations;
}
