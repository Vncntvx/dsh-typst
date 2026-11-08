import "pdfjs-dist";
import type { TextLayerBuilder as TextLayerBuilderType } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { PageViewport, PDFPageProxy } from "pdfjs-dist";
import type { PdfDocument } from "./document.js";
import type { RegionImage } from "../types.js";
import type { SnapshotView } from "../../contract.js";
import styles from "../preview.module.css";

export interface PreparedPage {
  canvas: HTMLCanvasElement;
  text: HTMLDivElement;
  viewport: PageViewport;
  dispose(): void;
}
/** The PDF engine owns text geometry; product typography never participates in it. */
function styleTextLayer(layer: HTMLDivElement, viewport: PageViewport): void {
  layer.style.setProperty(
    "--total-scale-factor",
    String(viewport.scale * viewport.userUnit),
  );
  layer.style.setProperty("--scale-round-x", "1px");
  layer.style.setProperty("--scale-round-y", "1px");
  layer.style.lineHeight = "1";
  for (const span of layer.querySelectorAll<HTMLSpanElement>(
    "span:not(.markedContent)",
  )) {
    span.style.fontSize =
      "calc(var(--total-scale-factor) * var(--font-height))";
    span.style.transform =
      "rotate(var(--rotate, 0deg)) scaleX(var(--scale-x, 1))";
  }
}
/** Render to exclusively owned detached buffers. A cancelled page is never committed. */
export async function preparePage(
  document: PdfDocument,
  index: number,
  scale: number,
  signal: AbortSignal,
): Promise<PreparedPage> {
  const page: PDFPageProxy = await document.getPage(index + 1);
  signal.throwIfAborted();
  const viewport = page.getViewport({ scale: (scale * 96) / 72 });
  const canvas = window.document.createElement("canvas");
  const ratio = Math.min(
    window.devicePixelRatio || 1,
    Math.sqrt(16_777_216 / (viewport.width * viewport.height)),
  );
  canvas.width = Math.max(1, Math.ceil(viewport.width * ratio));
  canvas.height = Math.max(1, Math.ceil(viewport.height * ratio));
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  const { TextLayerBuilder } = await import("pdfjs-dist/web/pdf_viewer.mjs");
  signal.throwIfAborted();
  const layer = new TextLayerBuilder({ pdfPage: page });
  const text = layer.div;
  text.classList.add(styles.pdfText);
  const task = page.render({
    canvas,
    viewport,
    transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
  });
  const cancel = (): void => {
    task.cancel();
    layer.cancel();
  };
  signal.addEventListener("abort", cancel, { once: true });
  const renderText = layer.render({ viewport } as Parameters<
    TextLayerBuilderType["render"]
  >[0]);
  try {
    await Promise.all([task.promise, renderText]);
    signal.throwIfAborted();
    styleTextLayer(text, viewport);
  } catch (error) {
    cancel();
    await Promise.allSettled([task.promise, renderText]);
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
  let disposed = false;
  return {
    canvas,
    text,
    viewport,
    dispose() {
      if (disposed) return;
      disposed = true;
      layer.cancel();
      canvas.remove();
      text.remove();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/** Capture the selected immutable page, including blank space; coordinates stay in PDF user space. */
export async function captureRegion(
  page: PreparedPage,
  snapshot: SnapshotView,
  index: number,
  rect: number[],
): Promise<RegionImage> {
  const [left, top, right, bottom] = rect;
  const pdfA = page.viewport.convertToPdfPoint(left, top);
  const pdfB = page.viewport.convertToPdfPoint(right, bottom);
  const canvas = document.createElement("canvas");
  const ratio = page.canvas.width / page.viewport.width;
  canvas.width = Math.max(1, Math.round((right - left) * ratio));
  canvas.height = Math.max(1, Math.round((bottom - top) * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the region image.");
  context.drawImage(
    page.canvas,
    left * ratio,
    top * ratio,
    (right - left) * ratio,
    (bottom - top) * ratio,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Could not encode the region image.")),
      "image/png",
    ),
  );
  return {
    id: crypto.randomUUID(),
    page: index + 1,
    rect: [
      Math.min(pdfA[0], pdfB[0]),
      Math.min(pdfA[1], pdfB[1]),
      Math.max(pdfA[0], pdfB[0]),
      Math.max(pdfA[1], pdfB[1]),
    ],
    blob,
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
    identity: snapshot,
    main: snapshot.main,
  };
}
