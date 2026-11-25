/**
 * Settings normalization: defaults, path expansion, name validation, and
 * volatile references that stay live across a commit.
 * @module tests/unit/config
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createVolatile, updateVolatile } from "@deepseek-ai/cosmokit";
import {
  Config,
  readResolvedConfig,
  settingsChanged,
  toLiveEntry,
} from "../../src/config.js";

describe("readResolvedConfig", () => {
  it("fills every field's default when nothing is configured", () => {
    expect(readResolvedConfig({})).toEqual({
      typstPath: "",
      fontPaths: [],
      packagePath: "",
      excludeDirs: [],
    });
  });

  it("trims paths, expands a leading ~ and keeps each entry once", () => {
    const home = homedir();
    const resolved = readResolvedConfig({
      typstPath: "  ~/bin/typst  ",
      fontPaths: [" ~/Fonts/zh ", "", 42, "~/Fonts/zh", "/Library/Fonts"],
      packagePath: " ~/typst-packages ",
    });
    expect(resolved.typstPath).toBe(join(home, "bin/typst"));
    expect(resolved.fontPaths).toEqual([
      join(home, "Fonts/zh"),
      "/Library/Fonts",
    ]);
    expect(resolved.packagePath).toBe(join(home, "typst-packages"));
  });

  it("keeps bare directory names and drops path-shaped exclusions", () => {
    const resolved = readResolvedConfig({
      excludeDirs: [
        "vendor",
        "vendor/",
        "a/b",
        "..",
        ".",
        "",
        "VENDOR",
        "Generated",
      ],
    });
    expect(resolved.excludeDirs).toEqual(["vendor", "Generated"]);
  });

  it("reads volatile references live, so a commit is visible without rebuilding", () => {
    const fonts = createVolatile<string[]>([]);
    const live = toLiveEntry({
      typstPath: createVolatile(""),
      fontPaths: fonts,
      packagePath: createVolatile(""),
      excludeDirs: createVolatile<string[]>([]),
    });
    expect(readResolvedConfig(live).fontPaths).toEqual([]);
    updateVolatile(fonts, createVolatile(["/Fonts/Brand"]));
    expect(readResolvedConfig(live).fontPaths).toEqual(["/Fonts/Brand"]);
  });
});

describe("Config schema", () => {
  it("wraps every field volatile and rejects path-shaped exclusions at commit time", () => {
    const entry = Config({});
    expect(readResolvedConfig(entry)).toEqual({
      typstPath: "",
      fontPaths: [],
      packagePath: "",
      excludeDirs: [],
    });
    expect(() => Config({ excludeDirs: ["vendor/generated"] })).toThrow();
  });
});

describe("settingsChanged", () => {
  const base = {
    typstPath: "",
    fontPaths: [],
    packagePath: "",
    excludeDirs: [],
  };

  it("reports nothing when the commit repeats the applied values", () => {
    expect(settingsChanged(base, { ...base })).toBeNull();
  });

  it("restarts the watch for fonts or packages but not for exclusions", () => {
    expect(settingsChanged(base, { ...base, fontPaths: ["/Fonts"] })).toEqual({
      toolchain: true,
      discovery: false,
    });
    expect(
      settingsChanged(base, { ...base, packagePath: "/Packages" }),
    ).toEqual({ toolchain: true, discovery: false });
    expect(settingsChanged(base, { ...base, excludeDirs: ["vendor"] })).toEqual(
      { toolchain: false, discovery: true },
    );
  });
});
