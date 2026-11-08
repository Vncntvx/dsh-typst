import type { TypstStateFrame } from "../../../src/contract.js";
export function frame(): TypstStateFrame {
  return {
    version: 1,
    generation: 1,
    workspace: "test",
    main: "main.typ",
    candidates: ["main.typ", "slides.typ"],
    fragments: [],
    previewError: null,
    discovery: {
      scanning: false,
      includeExcluded: false,
      visited: 2,
      errors: [],
    },
    toolchain: {
      state: "ready",
      path: "typst",
      version: "0.15.1",
      source: "path",
    },
    status: { phase: "ok", run: 1 },
    snapshot: {
      generation: 1,
      seq: 1,
      sha256: "one",
      main: "main.typ",
      run: 1,
      bytes: 20,
      pages: 2,
      createdAt: 1,
    },
    diagnostics: [],
    highlights: [],
    view: null,
    viewSeq: 0,
    setup: { facts: null, searched: [] },
  };
}
