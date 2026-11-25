// @vitest-environment jsdom
/**
 * Direct coverage of `openPdf`: the module-worker handshake, cancellation
 * before PDF.js starts, worker failure/Blob release, and idempotent disposal.
 * @module tests/client/pdf-runtime
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getDocument: vi.fn(),
  createWorker: vi.fn(),
  destroyBridge: vi.fn(),
}));
vi.mock("pdfjs-dist", () => ({
  getDocument: api.getDocument,
  PDFWorker: { create: api.createWorker },
}));
vi.mock("../../src/client/pdf/assets.js", () => ({
  workerSource: "export const WorkerMessageHandler = {}",
  createPdfBinaryDataFactory: () =>
    class {
      fetch(): Promise<Uint8Array> {
        return Promise.resolve(new Uint8Array());
      }
    },
}));
import { openPdf } from "../../src/client/pdf/runtime.js";
import type { PdfDocument, PdfSession } from "../../src/client/pdf/document.js";

const NativeURL = URL;
const workers: ControlledWorker[] = [];
const sessions: PdfSession[] = [];
const createURL = vi.fn(() => "blob:typst-pdf-worker");
const revokeURL = vi.fn();

class ControlledWorker extends EventTarget {
  readonly terminate = vi.fn();
  constructor(
    readonly url: string,
    readonly options: WorkerOptions,
  ) {
    super();
    workers.push(this);
  }
  ready(): void {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "dsh-typst-pdf-worker-ready" },
      }),
    );
  }
}

beforeEach(() => {
  workers.length = 0;
  sessions.length = 0;
  vi.clearAllMocks();
  api.createWorker.mockReturnValue({ destroy: api.destroyBridge });
  vi.stubGlobal("Worker", ControlledWorker);
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static override createObjectURL = createURL;
      static override revokeObjectURL = revokeURL;
    },
  );
});

afterEach(async () => {
  try {
    await Promise.allSettled(sessions.map((session) => session.dispose()));
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

function setup(controller = new AbortController(), failed = vi.fn()) {
  const loading = Promise.withResolvers<PdfDocument>();
  const entered = Promise.withResolvers<unknown>();
  const destroy = vi.fn(async () => {});
  api.getDocument.mockImplementation((options: unknown) => {
    entered.resolve(options);
    return { promise: loading.promise, destroy };
  });
  const data = new TextEncoder().encode("%PDF-test");
  const session = openPdf(data, controller.signal, failed);
  sessions.push(session);
  void session.document.catch(() => {});
  return { loading, entered, destroy, controller, failed, session, data };
}

describe("openPdf Worker lifecycle", () => {
  it("starts a module worker before getDocument and disposes exactly once", async () => {
    const h = setup();
    expect(workers[0]!.options).toEqual({
      type: "module",
      name: "dsh-typst-pdf",
    });
    expect(api.getDocument).not.toHaveBeenCalled();
    workers[0]!.ready();
    const options = (await h.entered.promise) as {
      data: Uint8Array<ArrayBuffer>;
      BinaryDataFactory: unknown;
      useWorkerFetch: boolean;
      enableXfa: boolean;
    };
    expect(api.createWorker).toHaveBeenCalledWith({ port: workers[0] });
    expect(options).toMatchObject({
      useWorkerFetch: false,
      enableXfa: false,
      cMapPacked: true,
    });
    expect(typeof options.BinaryDataFactory).toBe("function");
    expect(Array.from(options.data)).toEqual(
      Array.from(new TextEncoder().encode("%PDF-test")),
    );
    expect(options.data.buffer).not.toBe(h.data.buffer);
    const document = {
      numPages: 2,
      getPage: vi.fn(),
      getOutline: vi.fn(),
      getDestination: vi.fn(),
      getPageIndex: vi.fn(),
    } satisfies PdfDocument;
    h.loading.resolve(document);
    await expect(h.session.document).resolves.toBe(document);
    await h.session.dispose();
    await h.session.dispose();
    expect(h.destroy).toHaveBeenCalledOnce();
    expect(api.destroyBridge).toHaveBeenCalledOnce();
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(revokeURL).toHaveBeenCalledExactlyOnceWith("blob:typst-pdf-worker");
  });

  it("cancels startup before the handshake without invoking PDF.js", async () => {
    const h = setup();
    h.controller.abort();
    await expect(h.session.document).rejects.toMatchObject({
      name: "AbortError",
    });
    await h.session.dispose();
    workers[0]!.ready();
    expect(api.getDocument).not.toHaveBeenCalled();
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(revokeURL).toHaveBeenCalledOnce();
  });

  it("reports a worker failure and releases its Blob without a fallback", async () => {
    const h = setup();
    workers[0]!.dispatchEvent(
      new ErrorEvent("error", { message: "worker blocked" }),
    );
    await expect(h.session.document).rejects.toThrow("worker blocked");
    expect(h.failed).toHaveBeenCalledOnce();
    expect(h.failed.mock.calls[0][0].name).toBe("PdfWorkerFailure");
    expect(api.getDocument).not.toHaveBeenCalled();
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(revokeURL).toHaveBeenCalledOnce();
  });

  it("terminates the native worker after a post-load crash", async () => {
    const h = setup();
    workers[0]!.ready();
    await h.entered.promise;
    h.loading.resolve({
      numPages: 1,
      getPage: vi.fn(),
      getOutline: vi.fn(),
      getDestination: vi.fn(),
      getPageIndex: vi.fn(),
    } satisfies PdfDocument);
    await h.session.document;
    workers[0]!.dispatchEvent(new ErrorEvent("error", { message: "crash" }));
    await h.session.dispose();
    expect(h.failed).toHaveBeenCalledOnce();
    expect(h.destroy).toHaveBeenCalledOnce();
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(revokeURL).toHaveBeenCalledOnce();
  });
});
