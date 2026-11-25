/**
 * The control-ownership guard, driven as a pure predicate.
 *
 * The guard's whole value is that it connects a JSX control's className to the
 * rule that styles it. A parser that stopped resolving the CSS-module import,
 * or a rule widened to admit a restated control fill, would fail the suite
 * green — the sheet would still pass `style:check` while the control's hover
 * dress changed. These cases pin the shapes the guard admits and refuses.
 * @module tests/unit/control-style-ownership
 */

import { describe, expect, it } from "vitest";
import { controlStyleViolations } from "../../scripts/shared/control-style-ownership.mjs";

/** A client source that seats a host control with one class. */
const SEAT = `
import styles from "./x.module.css";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
export const A = () => <Button className={styles.seat} />;
`;

const SOURCE = { file: "src/client/x.tsx", code: SEAT };

const sheet = (file: string, css: string) => ({ file, css });

const violations = (css: string, file = "src/client/x.module.css") =>
  controlStyleViolations([SOURCE], [sheet(file, css)]);

describe("the control-ownership guard", () => {
  it("refuses a feature sheet that restates a control's padding", () => {
    const found = violations(".seat { padding: 0 4px; }");
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toContain("padding");
    expect(found[0]?.fix).toContain("host control");
  });

  it("refuses a restated fill, ink and height", () => {
    for (const declaration of [
      "background: var(--dsw-alias-bg-layer-2)",
      "color: var(--dsw-alias-label-secondary)",
      "height: 28px",
      "font: var(--dsw-font-xs-13)",
      "border: 0.5px solid var(--dsw-alias-border-l3)",
      "gap: 6px",
    ]) {
      expect(violations(`.seat { ${declaration}; }`)).toHaveLength(1);
    }
  });

  it("leaves a layout-only seat alone", () => {
    expect(
      violations(
        ".seat { min-width: 0; max-width: 100%; margin-inline-start: 8px; }",
      ),
    ).toEqual([]);
  });

  it("ignores classes on elements that are not controls", () => {
    const code = `
import styles from "./x.module.css";
export const A = () => <div className={styles.seat} />;
`;
    expect(
      controlStyleViolations(
        [{ file: "src/client/x.tsx", code }],
        [sheet("src/client/x.module.css", ".seat { padding: 0; }")],
      ),
    ).toEqual([]);
  });

  it("refuses an inline design property on a control", () => {
    const code = `
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
export const A = () => <Button style={{ padding: 0, flex: "none" }} />;
`;
    const found = controlStyleViolations(
      [{ file: "src/client/x.tsx", code }],
      [],
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toContain("inline padding");
  });

  it("refuses a computed class it cannot verify", () => {
    const code = `
import styles from "./x.module.css";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
export const A = ({ size }: { size: string }) => (
  <Button className={styles[size]} />
);
`;
    const found = controlStyleViolations(
      [{ file: "src/client/x.tsx", code }],
      [sheet("src/client/x.module.css", ".md { padding: 0; }")],
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.detail).toContain("computed CSS module class");
  });

  it("permits adapter geometry in a declared adapter file", () => {
    const code = `
import css from "./IconButton.module.css";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
export const A = () => <Button className={css.box} size="sm" />;
`;
    expect(
      controlStyleViolations(
        [{ file: "src/client/IconButton.tsx", code }],
        [
          sheet(
            "src/client/IconButton.module.css",
            ".box.box { width: 20px; height: 20px; padding: 0; border-radius: var(--dsw-radius-sm); }",
          ),
        ],
      ),
    ).toEqual([]);
  });

  it("permits only a state-keyed background in an adapter", () => {
    const code = `
import css from "./IconButton.module.css";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
export const A = () => <Button className={css.box} size="sm" />;
`;
    const found = (declaration: string) =>
      controlStyleViolations(
        [{ file: "src/client/IconButton.tsx", code }],
        [
          sheet(
            "src/client/IconButton.module.css",
            `.box.box${declaration} { background: var(--dsw-alias-interactive-bg-active); }`,
          ),
        ],
      );
    expect(found("[aria-pressed='true']")).toEqual([]);
    expect(found("")).toHaveLength(1);
  });

  it("permits the declared composition in its own sheet only", () => {
    const code = (module: string) => `
import styles from "${module}";
import { ZoomControls } from "@deepseek-ai/dsh-client-ui-primitives";
export const A = () => <ZoomControls className={styles.zoom} visible />;
`;
    const rule =
      ".pagebar .zoom { position: static; border: 0; background: transparent; }";
    expect(
      controlStyleViolations(
        [{ file: "src/client/x.tsx", code: code("./preview.module.css") }],
        [sheet("src/client/preview.module.css", rule)],
      ),
    ).toEqual([]);
    // Outside the declared sheet the same override is refused: `border` and
    // `background` are control material, `position` only placement.
    const undeclared = controlStyleViolations(
      [{ file: "src/client/x.tsx", code: code("./x.module.css") }],
      [sheet("src/client/x.module.css", rule)],
    );
    expect(undeclared.map((violation) => violation.detail)).toEqual([
      "border overrides host control design",
      "background overrides host control design",
    ]);
  });
});
