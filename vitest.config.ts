import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  test: {
    // The published harness client packages ship their CSS modules and keep
    // their runtime third-party imports in `devDependencies` (the shell bundles
    // them). A registry install must be transformed here: left external, Node
    // loads `lib/index.js` directly and throws ERR_UNKNOWN_FILE_EXTENSION on
    // `.module.css`, while its bare imports need the devDependencies that
    // mirror them in this manifest.
    server: { deps: { inline: [/@deepseek-ai\/dsh-client-/] } },
    include: ["tests/**/*.spec.{ts,tsx}"],
    setupFiles: ["tests/client/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // The package entry is a pure re-export module and the ambient
      // `*.d.ts` declarations are types-only: none has runtime statements.
      exclude: [
        "src/index.ts",
        "src/client/css-modules.d.ts",
        "src/client/build-info-globals.d.ts",
      ],
      // Thresholds are ratchets: each floor is raised to just under the
      // layer's measured value once the layer carries real behavior. The
      // first milestones establish the layers; the polish milestone sets
      // the floors from evidence (the dsh-zotero practice).
    },
  },
});
