/**
 * Minimal browser global for the Playwright page callbacks in
 * `discovery-smoke.mjs`. Those callbacks are serialized and run inside the
 * page, where `document` exists; the Node-facing build scripts otherwise have
 * no DOM types. Rather than pulling the whole `dom` lib into
 * `tsconfig.scripts.json` (which would make every browser global silently
 * resolve and would force `NodeListOf` iterator plumbing), declare only the
 * one value the callbacks read, with the narrowest shape that fits.
 * Script-mode on purpose: no top-level import/export, so this augments the
 * global scope and does not shadow a same-named `.mjs` sibling.
 */

/** The `document.querySelector` result shape the preview smoke inspects. */
declare const document: {
  querySelectorAll(selector: string): Array<{ readonly width: number }>;
};
