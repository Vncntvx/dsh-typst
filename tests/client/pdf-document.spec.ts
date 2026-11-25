// @vitest-environment jsdom
/**
 * Direct coverage of `preparePage`: pdf.js page cleanup, the cancel/cleanup
 * order on a failed text layer, and cancellation before a page is used.
 * @module tests/client/pdf-document
 */
import { describe, expect, it, vi } from "vitest";
import type { PDFPageProxy } from "pdfjs-dist";

const viewer = vi.hoisted(() => ({
  /** A test installs the promise the next text layer should render with. */
  nextRender: undefined as Promise<unknown> | undefined,
  builders: [] as {
    div: HTMLDivElement;
    render: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock("pdfjs-dist/web/pdf_viewer.mjs", () => ({
  TextLayerBuilder: class {
    div = document.createElement("div");
    render = vi.fn(() => viewer.nextRender ?? Promise.resolve());
    cancel = vi.fn();
    constructor() {
      viewer.builders.push(this);
    }
  },
}));
vi.mock("../../src/client/preview.module.css", () => ({
  default: new Proxy({}, { get: (_target, key) => String(key) }),
}));
import { preparePage } from "../../src/client/pdf/page.js";
import type { PdfDocument } from "../../src/client/pdf/document.js";

function pageProxy(
  overrides: Partial<{
    render: () => { promise: Promise<unknown>; cancel: () => void };
  }> = {},
) {
  const cleanup = vi.fn();
  const render =
    overrides.render ??
    (() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const page = {
    getViewport: () => ({ width: 200, height: 300, scale: 96 / 72 }),
    render: vi.fn(render),
    cleanup,
  } as unknown as PDFPageProxy;
  return { page, cleanup };
}

function documentOf(page: PDFPageProxy): PdfDocument {
  return {
    numPages: 1,
    getPage: vi.fn(async () => page),
  } as unknown as PdfDocument;
}

describe("preparePage", () => {
  it("releases the page's operator lists after a successful render", async () => {
    viewer.nextRender = undefined;
    const { page, cleanup } = pageProxy();
    const prepared = await preparePage(
      documentOf(page),
      0,
      0.5,
      new AbortController().signal,
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(prepared.canvas.style.width).toBe("200px");
    expect(prepared.canvas.style.height).toBe("300px");
    expect(viewer.builders).toHaveLength(1);
    expect(viewer.builders[0].render).toHaveBeenCalledOnce();
    prepared.dispose();
    prepared.dispose();
    expect(viewer.builders[0].cancel).toHaveBeenCalledOnce();
  });

  it("cancels both tasks before cleanup when the text layer fails", async () => {
    const textFailed = Promise.withResolvers<undefined>();
    const rendered = Promise.withResolvers<undefined>();
    const cancelCanvas = vi.fn();
    const { page, cleanup } = pageProxy({
      render: () => ({ promise: rendered.promise, cancel: cancelCanvas }),
    });
    viewer.builders.length = 0;
    viewer.nextRender = textFailed.promise;
    const pending = preparePage(
      documentOf(page),
      0,
      1,
      new AbortController().signal,
    );
    const rejected = expect(pending).rejects.toThrow("text failed");
    await Promise.resolve();
    textFailed.reject(new Error("text failed"));
    rendered.resolve(undefined);
    await rejected;
    const builder = viewer.builders.at(-1)!;
    expect(builder.cancel).toHaveBeenCalledOnce();
    expect(cancelCanvas).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans up a page that arrives after cancellation", async () => {
    viewer.nextRender = undefined;
    const lookup = Promise.withResolvers<PDFPageProxy>();
    const controller = new AbortController();
    const { page, cleanup } = pageProxy();
    const document = {
      numPages: 1,
      getPage: () => lookup.promise,
    } as unknown as PdfDocument;
    const pending = preparePage(document, 0, 1, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    lookup.resolve(page);
    await rejected;
    expect(cleanup).toHaveBeenCalledOnce();
    expect(page.render).not.toHaveBeenCalled();
  });

  it("cancels an active render and waits for it before cleanup", async () => {
    viewer.nextRender = undefined;
    const running = Promise.withResolvers<undefined>();
    const entered = Promise.withResolvers<undefined>();
    const controller = new AbortController();
    const cancel = vi.fn();
    const { page, cleanup } = pageProxy({
      render: () => {
        entered.resolve(undefined);
        return { promise: running.promise, cancel };
      },
    });
    const pending = preparePage(documentOf(page), 0, 1, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await entered.promise;
    controller.abort();
    expect(cancel).toHaveBeenCalledOnce();
    expect(cleanup).not.toHaveBeenCalled();
    running.resolve(undefined);
    await rejected;
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
