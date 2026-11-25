import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { registeredTools } from "../tools/helpers/tool-registry.js";

it.each([
  ["tools.md", "输出"],
  ["tools.en.md", "Output"],
])("documents the registered output fields in %s", (file, heading) => {
  const text = readFileSync(
    new URL(`../../docs/${file}`, import.meta.url),
    "utf8",
  );
  const sections = text.split(/^## /m).slice(1);
  for (const [name, tool] of registeredTools()) {
    const section = sections.find((value) => value.startsWith(`${name}\n`));
    expect(section, `${file} is missing ${name}`).toBeDefined();
    const output = section
      ?.split(/^### /m)
      .find((value) => value.startsWith(`${heading}\n`));
    const fields = Array.from(
      (output ?? "").matchAll(/^\|\s*`(\w+)`\s*\|/gm),
      ([, field]) => field,
    );
    expect(fields.sort(), `${file} output for ${name}`).toEqual(
      Object.keys(tool.output.schema.properties ?? {}).sort(),
    );
  }
});
