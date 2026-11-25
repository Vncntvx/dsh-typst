import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const { scripts } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };

it.each([
  ["development.md", "发布检查清单"],
  ["development.en.md", "Release checklist"],
])("documents the release gate in order in %s", (file, heading) => {
  const text = readFileSync(
    new URL(`../../docs/${file}`, import.meta.url),
    "utf8",
  );
  const section = text
    .split(/^## /m)
    .find((value) => value.startsWith(`${heading}\n`));
  const commands = Array.from(
    (section ?? "").matchAll(/^\d+\. `([^`]+)`/gm),
    ([, command]) => command,
  );
  expect(commands).toEqual(
    scripts["release:check"].split("&&").map((command) => command.trim()),
  );
});

it("runs the release gate before publishing", () => {
  expect(scripts.prepublishOnly).toBe("npm run release:check");
});
