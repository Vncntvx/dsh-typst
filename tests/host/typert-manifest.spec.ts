/**
 * The hand-written Typert manifest and the shared invocation descriptors
 * must name exactly the same methods; a drift means the Gateway documents a
 * surface the runtime does not implement (or the reverse).
 * @module tests/host/typert-manifest
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import { TYPERT_MANIFEST } from "../../src/typert.js";
import { TYPST_INVOCATIONS } from "../../src/wire-schemas.js";

const sourceFiles = {
  TypstScope: "remote.ts",
  TypstStateFrame: "contract.ts",
  PreviewIdentity: "contract.ts",
  PreviewBytes: "contract.ts",
  SourceMatch: "contract.ts",
  DiscoveryView: "contract.ts",
};

function propertiesOf(text: string, name: string): string[] {
  const source = ts.createSourceFile("types.ts", text, ts.ScriptTarget.Latest);
  const declaration = source.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  );
  if (!declaration) throw new Error(`Missing interface ${name}`);
  return declaration.members
    .filter(ts.isPropertySignature)
    .map((member) => member.name.getText(source))
    .sort();
}

it("declares one method per shared invocation", () => {
  const service = TYPERT_MANIFEST.model?.services[0];
  const methods = service?.members
    .filter((member) => member.kind === "method")
    .map((member) => member.name);
  expect(methods).toEqual(
    TYPST_INVOCATIONS.map((invocation) => invocation.method),
  );
});

it("names every referenced business type", () => {
  const service = TYPERT_MANIFEST.model?.services[0];
  const declarations = service?.types?.map((type) => type.name) ?? [];
  const signatures = (service?.members ?? []).map((member) =>
    member.kind === "method" ? member.signature : "",
  );
  for (const type of Object.keys(sourceFiles)) {
    expect(declarations).toContain(type);
    expect(signatures.some((signature) => signature.includes(type))).toBe(true);
  }
});

it.each(Object.entries(sourceFiles))(
  "declares all own fields of %s",
  (name, file) => {
    const source = readFileSync(
      new URL(`../../src/${file}`, import.meta.url),
      "utf8",
    );
    const declaration = TYPERT_MANIFEST.model?.services[0]?.types?.find(
      (type) => type.name === name,
    );
    expect(propertiesOf(declaration?.declaration ?? "", name)).toEqual(
      propertiesOf(source, name),
    );
  },
);

it("declares every method as a callable signature", () => {
  const service = TYPERT_MANIFEST.model?.services[0];
  for (const member of service?.members ?? []) {
    if (member.kind !== "method") continue;
    expect(member.signature).toContain(`${member.name}(`);
    expect(member.signature).toMatch(/(Promise|AsyncIterable)<.+>/);
  }
});
