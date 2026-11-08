import { useEffect, useRef, useState } from "react";
import type { SnapshotView } from "../../contract.js";
import type { TypstNamespace } from "../remote.js";
import type { PdfSession, PdfDocument } from "./document.js";
import { openPdf } from "./runtime.js";
import { preparePage, type PreparedPage } from "./page.js";
import { errorText, identityKey } from "../types.js";

export interface LoadedPreview {
  session: PdfSession;
  document: PdfDocument;
  snapshot: SnapshotView;
  seed: PreparedPage | null;
  seedIndex: number;
}
/** Keep a readable previous document until the replacement's first page and text are ready. */
export function usePreview(
  remote: TypstNamespace,
  sessionId: string,
  snapshot: SnapshotView | null,
  target: number,
  scale: number,
  retry: number,
) {
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<LoadedPreview | null>(null);
  const retired = useRef<LoadedPreview[]>([]);
  const key = snapshot ? identityKey(snapshot) : "";
  useEffect(() => {
    if (!snapshot) {
      const old = current.current;
      current.current = null;
      setLoaded(null);
      old?.seed?.dispose();
      void old?.session.dispose();
      return;
    }
    const controller = new AbortController();
    let candidate: PdfSession | null = null;
    let seed: PreparedPage | null = null;
    let committed = false;
    setError(null);
    void (async () => {
      const result = await remote.readPreview(
        sessionId as never,
        {
          generation: snapshot.generation,
          seq: snapshot.seq,
          sha256: snapshot.sha256,
        },
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (!result.ok) throw new Error(result.error.message);
      if (identityKey(result.value) !== key)
        throw new Error(
          "The preview response does not match the requested document.",
        );
      candidate = openPdf(result.value.data, controller.signal, (failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
      const document = await candidate.document;
      const seedIndex = Math.min(target, document.numPages - 1);
      seed = await preparePage(document, seedIndex, scale, controller.signal);
      controller.signal.throwIfAborted();
      const next = { session: candidate, document, snapshot, seed, seedIndex };
      const previous = current.current;
      current.current = next;
      committed = true;
      setLoaded(next);
      // React commits the replacement before the prior document's resources are retired.
      if (previous) retired.current.push(previous);
    })().catch((failure) => {
      seed?.dispose();
      seed = null;
      void candidate?.dispose();
      candidate = null;
      if (!controller.signal.aborted) setError(errorText(failure));
    });
    return () => {
      if (!committed) {
        controller.abort();
        seed?.dispose();
        void candidate?.dispose();
      }
    };
  }, [key, remote, sessionId, retry]);
  useEffect(() => {
    for (const old of retired.current.splice(0)) {
      old.seed?.dispose();
      void old.session.dispose();
    }
  }, [loaded]);
  useEffect(
    () => () => {
      for (const old of retired.current.splice(0)) {
        old.seed?.dispose();
        void old.session.dispose();
      }
      current.current?.seed?.dispose();
      void current.current?.session.dispose();
      current.current = null;
    },
    [],
  );
  const visible =
    loaded?.snapshot.generation === snapshot?.generation ? loaded : null;
  return {
    loaded: visible,
    error,
    loading: key !== (visible ? identityKey(visible.snapshot) : ""),
  };
}
