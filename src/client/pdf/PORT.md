# PDF.js port

The panel's PDF reader is a port of the harness document preview at
`packages/client/ui-sidebar-documentpreview/src/client/pdf/*`.

- **pdfjs-dist**: `6.3.289`, exact, in `dependencies`. The server half
  (`src/typst/pdf-extract.ts`) imports it at runtime, so an installed plugin
  must resolve it; the client half is also bundled into `lib/client.js` by
  `scripts/build-client.mjs`. It cannot live in `devDependencies`.
- **Upstream version**: the sibling harness at the pinned `0.2.2-rc.5`
  declares the same `pdfjs-dist` version.
- **Ported**: the real module-Worker handshake (`runtime.ts`), the binary-data
  factory and worker source (`assets.ts`), page/text-layer ownership and
  cancellation (`page.ts`), page dimensions (`page-size.ts`), and outline
  extraction from PDF bookmarks (`outline.ts`).
- **Kept local**: `Reader.tsx`, `PageSurface.tsx`, and `use-preview.ts` are the
  plugin's own panel integration (right-sidebar resource, selection toolbar).
- **Deliberate difference**: a PDF Worker failure is terminal for the tab; it
  never falls back to main-thread parsing. A `.pdf` already in the workspace
  remains owned by the host's built-in document preview, not this plugin.
