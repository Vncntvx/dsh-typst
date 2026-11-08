/**
 * Watch-log parsing: diagnostic blocks, watch rounds, make-deps parsing.
 * @module tests/unit/watch-log
 */

import { describe, expect, it } from "vitest";
import {
  parseDeps,
  parseDiagnostics,
  WatchLog,
} from "../../src/typst/diagnostics.js";

describe("parseDiagnostics", () => {
  it("parses error location, excerpt line and hints", () => {
    const text = [
      "error: unknown variable: nope",
      "  ┌─ main.typ:3:5",
      "3 | #nope[]",
      "  = hint: check the spelling",
    ].join("\n");
    const diagnostics = parseDiagnostics(text);
    expect(diagnostics).toHaveLength(1);
    const diagnostic = diagnostics[0];
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.message).toBe("unknown variable: nope");
    expect(diagnostic.location).toEqual({
      file: "main.typ",
      line: 3,
      column: 5,
    });
    expect(diagnostic.hints).toEqual(["check the spelling"]);
  });

  it("parses warnings and trace points from help headers", () => {
    const text = [
      "warning: unused variable",
      "  ┌─ sections/intro.typ:12:1",
      "help: consider removing it",
      "  = note: variables start with #",
    ].join("\n");
    const diagnostics = parseDiagnostics(text);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("warning");
    expect(diagnostics[0].location?.file).toBe("sections/intro.typ");
    expect(diagnostics[0].trace).toEqual([
      { message: "consider removing it", location: null },
    ]);
    expect(diagnostics[0].hints).toEqual(["variables start with #"]);
  });

  it("maps printed paths through toFile and strips ANSI", () => {
    const text = "\u001b[1merror\u001b[0m: broken\n  ┌─ /abs/other.typ:1:1\n";
    const diagnostics = parseDiagnostics(text, (path) =>
      path.replace("/abs/", ""),
    );
    expect(diagnostics[0].location).toEqual({
      file: "other.typ",
      line: 1,
      column: 1,
    });
  });
});

describe("WatchLog", () => {
  it("emits compiling, then finished with parsed diagnostics", () => {
    const events: unknown[] = [];
    const log = new WatchLog((event) => events.push(event));
    log.feed("watching the project\n");
    log.feed("compiling main.typ…\n");
    log.feed("compiled with errors in 3ms\n");
    log.feed("error: broken\n  ┌─ main.typ:1:1\n");
    // An error round is held until the next marker or finalize.
    expect(events).toEqual([{ kind: "compiling" }]);
    log.finalize();
    expect(events.at(-1)).toMatchObject({ kind: "finished", outcome: "error" });
  });

  it("finalizes an ok round immediately", () => {
    const events: unknown[] = [];
    const log = new WatchLog((event) => events.push(event));
    log.feed("compiling main.typ…\n");
    log.feed("compiled successfully in 12.5ms\n");
    expect(events).toEqual([
      { kind: "compiling" },
      { kind: "finished", outcome: "ok", durationMs: 12.5, diagnostics: [] },
    ]);
  });

  it("holds an error round until finalize (quiet window)", () => {
    const events: unknown[] = [];
    const log = new WatchLog((event) => events.push(event));
    log.feed("compiling main.typ…\n");
    log.feed("compiled with errors\n");
    log.feed("error: broken\n");
    expect(log.feed("more context\n")).toBe(true);
    expect(events).toHaveLength(1);
    log.finalize();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ kind: "finished", outcome: "error" });
  });

  it("treats a bare `error: ` line outside a round as fatal", () => {
    const events: unknown[] = [];
    const log = new WatchLog((event) => events.push(event));
    log.feed("error: main.typ not found\n");
    expect(events).toEqual([{ kind: "fatal", message: "main.typ not found" }]);
  });
});

describe("parseDeps", () => {
  it("parses the JSON form (typst >= 0.14)", () => {
    expect(parseDeps('{"inputs":["/w/main.typ","/w/lib/a.typ"]}')).toEqual([
      "/w/main.typ",
      "/w/lib/a.typ",
    ]);
  });

  it("parses the make-deps form", () => {
    const text = "/w/preview.pdf: \\\n  /w/main.typ \\\n  /w/lib/a.typ\n";
    expect(parseDeps(text)).toEqual(["/w/main.typ", "/w/lib/a.typ"]);
  });

  it("returns nothing on empty input", () => {
    expect(parseDeps("")).toEqual([]);
  });
});
