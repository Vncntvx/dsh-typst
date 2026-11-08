/**
 * One real module Worker and PDF.js loading task per mounted preview
 * document. Ported from the harness document preview's
 * `packages/client/ui-sidebar-documentpreview/src/client/pdf/runtime.ts`
 * (same pdfjs-dist major); startup failure never falls back to main-thread
 * PDF parsing.
 * @module dsh-typst/client/pdf/runtime
 */

import { getDocument, PDFWorker } from "pdfjs-dist";
import { createPdfBinaryDataFactory, workerSource } from "./assets.js";
import type { PdfSession } from "./document.js";

const WORKER_READY = "dsh-typst-pdf-worker-ready";

/** A fatal Worker failure; the tab shows the preview-failed state. */
export class PdfWorkerFailure extends Error {
  constructor(event: Event) {
    super(`PDF worker failed: ${messageOf(event)}`);
    this.name = "PdfWorkerFailure";
  }
}

function messageOf(event: Event): string {
  if (event instanceof ErrorEvent) return event.message;
  return event.type;
}

/**
 * Open complete PDF bytes with an explicitly owned Worker. Disposal keeps the
 * Worker alive for PDF.js teardown, except after a fatal worker error, then
 * terminates the native Worker and revokes its source URL.
 * @param data - complete PDF bytes retained by the tab; the worker receives a copy.
 * @param signal - tab/body lifetime.
 * @param reportFailure - reports a fatal Worker failure, including failures after document loading.
 * @returns the pending document and idempotent asynchronous cleanup.
 */
export function openPdf(
  data: Uint8Array<ArrayBuffer>,
  signal: AbortSignal,
  reportFailure: (error: PdfWorkerFailure) => void,
): PdfSession {
  const lifetime = new AbortController();
  const stopped = AbortSignal.any([signal, lifetime.signal]);
  const failed = Promise.withResolvers<never>();
  const broken = Promise.withResolvers<undefined>();
  let url: string | undefined;
  let worker: Worker | undefined;
  let bridge: PDFWorker | undefined;
  let loading: ReturnType<typeof getDocument> | undefined;
  let closing: Promise<void> | undefined;
  let removeReady: (() => void) | undefined;

  const workerFailed = (event: Event): void => {
    const error = new PdfWorkerFailure(event);
    failed.reject(error);
    broken.resolve(undefined);
    try {
      if (!stopped.aborted) reportFailure(error);
    } catch (failure) {
      console.error("[dsh-typst] failure callback threw", failure);
    } finally {
      void dispose();
    }
  };
  const aborted = (): void => {
    failed.reject(stopped.reason);
    void dispose();
  };
  stopped.addEventListener("abort", aborted, { once: true });

  const dispose = (): Promise<void> => {
    if (closing !== undefined) return closing;
    closing = Promise.resolve()
      .then(async () => {
        try {
          if (loading !== undefined)
            await Promise.race([loading.destroy(), broken.promise]);
        } finally {
          removeReady?.();
          stopped.removeEventListener("abort", aborted);
          bridge?.destroy();
          worker?.removeEventListener("error", workerFailed);
          worker?.removeEventListener("messageerror", workerFailed);
          worker?.terminate();
          if (url !== undefined) URL.revokeObjectURL(url);
        }
      })
      .catch((error: unknown) => {
        console.error("[dsh-typst] pdf cleanup failed", error);
      });
    lifetime.abort();
    return closing;
  };

  const initialize = async () => {
    stopped.throwIfAborted();
    const BinaryDataFactory = createPdfBinaryDataFactory();
    const bytes = data.slice();
    url = URL.createObjectURL(
      new Blob(
        [
          workerSource,
          `\nself.postMessage({type:${JSON.stringify(WORKER_READY)}});\n`,
        ],
        {
          type: "text/javascript",
        },
      ),
    );
    worker = new Worker(url, { type: "module", name: "dsh-typst-pdf" });
    worker.addEventListener("error", workerFailed);
    worker.addEventListener("messageerror", workerFailed);
    const started = Promise.withResolvers<undefined>();
    const ready = (event: MessageEvent<unknown>): void => {
      if (
        typeof event.data !== "object" ||
        event.data === null ||
        !("type" in event.data) ||
        event.data.type !== WORKER_READY
      ) {
        return;
      }
      started.resolve(undefined);
    };
    worker.addEventListener("message", ready);
    removeReady = () => {
      worker?.removeEventListener("message", ready);
    };
    await Promise.race([started.promise, failed.promise]);
    removeReady();
    stopped.throwIfAborted();
    bridge = PDFWorker.create({ port: worker });
    loading = getDocument({
      data: bytes,
      worker: bridge,
      BinaryDataFactory,
      cMapPacked: true,
      useWorkerFetch: false,
      enableXfa: false,
      stopAtErrors: true,
    });
    return loading.promise;
  };

  const document = Promise.race([initialize(), failed.promise]).catch(
    async (error: unknown) => {
      await dispose();
      throw error;
    },
  );
  return { document, dispose };
}

export type { PdfDocument, PdfSession } from "./document.js";
