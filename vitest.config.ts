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
      // The package entry is a pure re-export module and declarations are
      // types-only. `contract.ts` is a type-only wire surface (no runtime
      // statements), so it would otherwise report 0% forever.
      exclude: ["src/index.ts", "src/contract.ts", "src/**/*.d.ts"],
      // Ratchet floors, set just under the measured whole-tree values. They
      // may only move up as tests land; a drop fails `test:coverage`.
      thresholds: {
        statements: 60,
        branches: 45,
        functions: 54,
        lines: 62,
      },
    },
  },
});
