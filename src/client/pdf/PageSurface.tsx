import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { HighlightView, SnapshotView } from "../../contract.js";
import type { LoadedPreview } from "./use-preview.js";
import { preparePage, captureRegion, type PreparedPage } from "./page.js";
import {
  identityKey,
  type RegionImage,
  type Translate,
  type Zoom,
} from "../types.js";
import { RegionSelector } from "../RegionSelector.js";
import styles from "../preview.module.css";

export function pageScale(
  zoom: Zoom,
  width: number,
  height: number,
  naturalWidth: number,
  naturalHeight: number,
): number {
  if (zoom.kind === "fixed") return zoom.percent / 100;
  const available = Math.max(1, width - 32) / naturalWidth;
  return Math.max(
    0.01,
    zoom.kind === "fit-width"
      ? available
      : Math.min(available, Math.max(1, height - 32) / naturalHeight),
  );
}
export const PageSurface = memo(function PageSurface({
  loaded,
  snapshot,
  index,
  root,
  width,
  height,
  zoom,
  pinned,
  region,
  highlights,
  t,
  onImage,
  onCancelRegion,
  onComment,
}: {
  loaded: LoadedPreview;
  snapshot: SnapshotView;
  index: number;
  root: HTMLDivElement | null;
  width: number;
  height: number;
  zoom: Zoom;
  pinned: boolean;
  region: boolean;
  highlights: HighlightView[];
  t: Translate;
  onImage: (image: RegionImage) => void;
  onCancelRegion: () => void;
  onComment: (id: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(index === loaded.seedIndex);
  const [natural, setNatural] = useState(
    () => loaded.sizes.get(index) ?? { width: 794, height: 1123 },
  );
  const [page, setPage] = useState<PreparedPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const current = useRef<PreparedPage | null>(null);
  const scale = pageScale(zoom, width, height, natural.width, natural.height);
  useEffect(() => {
    if (!near && index !== loaded.seedIndex) return;
    const known = loaded.sizes.get(index);
    if (known !== undefined) {
      setNatural(known);
      return;
    }
    let cancelled = false;
    void loaded.sizes
      .load(index)
      .then((size) => {
        if (!cancelled) setNatural(size);
      })
      .catch((failure) => {
        if (!cancelled) setError(String(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, index, near]);
  useEffect(() => {
    if (!box.current || !root) return;
    if (typeof IntersectionObserver === "undefined") {
      // A WebView without the observer renders every page eagerly instead of
      // throwing during mount.
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setNear(entries[0]?.isIntersecting ?? false),
      { root, rootMargin: "100% 0px" },
    );
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [root]);
  const renderQueue = useRef<Promise<void>>(Promise.resolve());
  useLayoutEffect(() => {
    if (!near && !pinned && !region) {
      current.current?.dispose();
      current.current = null;
      setPage(null);
      return;
    }
    const controller = new AbortController();
    if (loaded.seed && index === loaded.seedIndex) {
      const seed = loaded.seed;
      loaded.seed = null;
      const previous = current.current;
      current.current = seed;
      host.current?.replaceChildren(seed.canvas, seed.text);
      setPage(seed);
      previous?.dispose();
    }
    setError(null);
    renderQueue.current = renderQueue.current
      .then(async () => {
        if (controller.signal.aborted) return;
        if (
          current.current &&
          Math.abs(current.current.viewport.width - natural.width * scale) < 0.5
        )
          return;
        const candidate = await preparePage(
          loaded.document,
          index,
          scale,
          controller.signal,
        );
        if (controller.signal.aborted) {
          candidate.dispose();
          return;
        }
        const previous = current.current;
        current.current = candidate;
        host.current?.replaceChildren(candidate.canvas, candidate.text);
        setPage(candidate);
        previous?.dispose();
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        // A failed re-render must not keep showing the previous bitmap under
        // the old scale; show the page-level error and offer one retry.
        current.current?.dispose();
        current.current = null;
        setPage(null);
        setError(String(failure));
      });
    return () => controller.abort();
  }, [loaded, index, scale, near, pinned, region, retry]);
  useEffect(
    () => () => {
      current.current?.dispose();
    },
    [],
  );
  const viewWidth = natural.width * scale,
    viewHeight = natural.height * scale;
  return (
    <div
      ref={box}
      className={styles.pageSlot}
      data-page-index={index}
      style={{ width: viewWidth, height: viewHeight }}
      aria-label={`${t("page.label")} ${index + 1}`}
    >
      <div ref={host} className={styles.pagePixels} />
      {!page && (
        <div className={styles.pagePlaceholder}>
          {error === null ? (
            `${t("page.label")} ${index + 1}`
          ) : (
            <>
              <span>{error}</span>
              <Button size="sm" onClick={() => setRetry((value) => value + 1)}>
                {t("action.retry")}
              </Button>
            </>
          )}
        </div>
      )}
      {page &&
        highlights
          .filter(
            (highlight) =>
              !highlight.stale &&
              identityKey(highlight.identity) === identityKey(snapshot) &&
              highlight.pageIndex === index,
          )
          .flatMap((highlight) =>
            highlight.rects.map((rect, i) => {
              const mapped = [
                ...page.viewport.convertToViewportPoint(rect[0], rect[1]),
                ...page.viewport.convertToViewportPoint(rect[2], rect[3]),
              ];
              const left = Math.min(mapped[0], mapped[2]),
                top = Math.min(mapped[1], mapped[3]);
              return (
                <span
                  key={`${highlight.id}-${i}`}
                  className={styles.highlight}
                  style={{
                    left,
                    top,
                    width: Math.abs(mapped[2] - mapped[0]),
                    height: Math.abs(mapped[3] - mapped[1]),
                  }}
                />
              );
            }),
          )}
      {page &&
        highlights
          .filter(
            (highlight) =>
              !highlight.stale &&
              identityKey(highlight.identity) === identityKey(snapshot) &&
              highlight.pageIndex === index,
          )
          .map((highlight) => {
            const rect = highlight.rects[0];
            if (!rect) return null;
            const point = page.viewport.convertToViewportPoint(
              rect[2],
              rect[3],
            );
            return (
              <button
                key={highlight.id}
                className={styles.annotationMarker}
                style={{ top: Math.max(0, point[1]), right: 2 }}
                aria-label={highlight.comment || highlight.quote}
                onClick={() => onComment(highlight.id)}
              />
            );
          })}
      {region && page && (
        <RegionSelector
          key={`${identityKey(snapshot)}:${scale}`}
          width={viewWidth}
          height={viewHeight}
          t={t}
          onCancel={onCancelRegion}
          onCapture={async (rect) =>
            onImage(await captureRegion(page, snapshot, index, rect))
          }
        />
      )}
    </div>
  );
});
