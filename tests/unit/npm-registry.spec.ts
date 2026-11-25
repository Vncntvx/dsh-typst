/**
 * The public package is only trusted when its registry bytes are the bytes
 * the release gate verified, matched by SHA-512 integrity.
 * @module tests/unit/npm-registry
 */
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  assertRegistryArtifact,
  registryTarball,
  registryVersion,
} from "../../scripts/npm-registry.mjs";

/** @param {Uint8Array} bytes @returns {string} the npm-style sha512 integrity. */
const integrityOf = (bytes: Uint8Array) =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

const manifest = { name: "dsh-typst-plugin", version: "1.0.0" };

it("binds registry metadata to the verified artifact bytes", () => {
  const bytes = Buffer.from("verified tarball");
  const metadata = {
    name: manifest.name,
    version: manifest.version,
    dist: {
      tarball:
        "https://registry.npmjs.org/dsh-typst-plugin/-/dsh-typst-plugin-1.0.0.tgz",
      integrity: integrityOf(bytes),
    },
  };
  expect(() => assertRegistryArtifact(metadata, manifest, bytes)).not.toThrow();
  expect(() =>
    assertRegistryArtifact({ ...metadata, version: "1.0.1" }, manifest, bytes),
  ).toThrow("use a new version");
  expect(() =>
    assertRegistryArtifact(
      {
        ...metadata,
        dist: {
          ...metadata.dist,
          integrity: integrityOf(Buffer.from("other")),
        },
      },
      manifest,
      bytes,
    ),
  ).toThrow("use a new version");
});

it("returns undefined for a version the registry does not know yet", async () => {
  const version = await registryVersion(manifest.name, "1.0.0", {
    fetchImpl: async () => new Response(null, { status: 404 }),
    delay: async () => {},
    maxAttempts: 1,
  });
  expect(version).toBeUndefined();
});

it("refuses registry metadata whose tarball leaves the registry host", async () => {
  const body = JSON.stringify({
    name: manifest.name,
    version: manifest.version,
    dist: {
      tarball: "https://attacker.example/dsh-typst-plugin-1.0.0.tgz",
      integrity: integrityOf(Buffer.from("x")),
    },
  });
  await expect(
    registryVersion(manifest.name, manifest.version, {
      fetchImpl: async () => new Response(body, { status: 200 }),
      delay: async () => {},
      maxAttempts: 1,
    }),
  ).rejects.toThrow("leaves registry.npmjs.org");
});

it("downloads the public tarball and refuses bytes that changed", async () => {
  const bytes = Buffer.from("verified tarball");
  const metadata = {
    name: manifest.name,
    version: manifest.version,
    dist: {
      tarball:
        "https://registry.npmjs.org/dsh-typst-plugin/-/dsh-typst-plugin-1.0.0.tgz",
      integrity: integrityOf(bytes),
    },
  };
  const options = {
    fetchImpl: async () => new Response(bytes, { status: 200 }),
    delay: async () => {},
    maxAttempts: 1,
  };
  await expect(
    registryTarball(metadata, manifest, bytes, options),
  ).resolves.toEqual(bytes);
  await expect(
    registryTarball(metadata, manifest, Buffer.from("other"), options),
  ).rejects.toThrow("use a new version");
});
