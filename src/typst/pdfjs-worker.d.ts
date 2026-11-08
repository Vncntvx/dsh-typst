/**
 * The pdf.js fake-worker entry has no type declarations; the module's
 * exports are assigned to `globalThis.pdfjsWorker` and never consumed
 * through a typed surface.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
