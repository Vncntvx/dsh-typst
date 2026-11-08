import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Button,
  FileTypeIcon,
  IconChevronLeftOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCodeOutlineRegular,
  ZoomControls,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { TypstStateFrame, HighlightView } from "../../contract.js";
import type { TypstNamespace } from "../remote.js";
import type { OutlineEntry } from "./outline.js";
import { usePreview, type LoadedPreview } from "./use-preview.js";
import { PageSurface, pageScale } from "./PageSurface.js";
import {
  identityKey,
  type ReadingPosition,
  type NavigationHistory,
  type RegionImage,
  type Translate,
} from "../types.js";
import styles from "../preview.module.css";

export interface ReaderHandle {
  navigate(pageIndex: number, point?: number[]): void;
  outline(entry: OutlineEntry): Promise<void>;
  highlight(highlight: HighlightView): Promise<void>;
  back(): void;
  forward(): void;
  position(): ReadingPosition;
}
export const Reader = forwardRef<
  ReaderHandle,
  {
    frame: TypstStateFrame;
    remote: TypstNamespace;
    sessionId: string;
    initial: ReadingPosition;
    history?: NavigationHistory;
    onHistory: (history: NavigationHistory) => void;
    t: Translate;
    retry: number;
    region: boolean;
    onCancelRegion: () => void;
    onImage: (image: RegionImage) => void;
    onPosition: (position: ReadingPosition) => void;
    onLoaded: (loaded: LoadedPreview | null) => void;
    onText: (text: string, page: number, endPage: number) => void;
    onComment: (id: string) => void;
    onOpenProblems?: () => void;
  }
>(function Reader(
  {
    frame,
    remote,
    sessionId,
    initial,
    history: savedHistory,
    onHistory,
    t,
    retry,
    region,
    onCancelRegion,
    onImage,
    onPosition,
    onLoaded,
    onText,
    onComment,
    onOpenProblems,
  },
  ref,
) {
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ width: 520, height: 600 });
  const [position, setPosition] = useState(initial);
  const live = useRef(position);
  live.current = position;
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [pageDraft, setPageDraft] = useState(String(initial.pageIndex + 1));
  const history = useRef<NavigationHistory>(
    savedHistory ?? {
      items: [initial],
      index: 0,
    },
  );
  const pending = useRef<ReadingPosition | null>(initial);
  const [natural, setNatural] = useState({ width: 794, height: 1123 });
  const scale = pageScale(
    position.zoom,
    box.width,
    box.height,
    natural.width,
    natural.height,
  );
  const { loaded, error, loading } = usePreview(
    remote,
    sessionId,
    frame.snapshot,
    position.pageIndex,
    scale,
    retry,
  );
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const navigation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    if (loaded)
      void loaded.document
        .getPage(Math.min(position.pageIndex + 1, loaded.document.numPages))
        .then((page) => {
          if (!cancelled) {
            const viewport = page.getViewport({ scale: 96 / 72 });
            setNatural({ width: viewport.width, height: viewport.height });
          }
        })
        .catch((failure) => {
          if (!cancelled) setNavigationError(String(failure));
        });
    return () => {
      cancelled = true;
    };
  }, [loaded, position.pageIndex]);
  useEffect(() => onLoaded(loaded), [loaded, onLoaded]);
  useLayoutEffect(() => {
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setBox({ width: rect.width, height: rect.height });
      pending.current = live.current;
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);
  const capture = useCallback((): ReadingPosition => {
    if (!stage) return live.current;
    const boundary = stage.getBoundingClientRect();
    let pageIndex = live.current.pageIndex;
    let chosen: HTMLElement | null = null;
    for (const node of stage.querySelectorAll<HTMLElement>(
      "[data-page-index]",
    )) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom > boundary.top + 16 && rect.top < boundary.bottom) {
        pageIndex = Number(node.dataset.pageIndex);
        chosen = node;
        break;
      }
    }
    const rect = chosen?.getBoundingClientRect();
    return {
      ...live.current,
      pageIndex,
      x: rect ? Math.max(0, (boundary.left - rect.left) / rect.width) : 0,
      y: rect ? Math.max(0, (boundary.top + 16 - rect.top) / rect.height) : 0,
    };
  }, [stage]);
  const move = useCallback(
    (next: ReadingPosition, record = true) => {
      if (record) {
        const h = history.current;
        h.items = h.items.slice(0, h.index + 1);
        h.items[h.index] = capture();
        h.items.push(next);
        h.index++;
        onHistory({ items: [...h.items], index: h.index });
      }
      pending.current = next;
      setPosition(next);
      onPosition(next);
    },
    [capture, onPosition, onHistory],
  );
  useLayoutEffect(() => {
    if (!loaded || !stage || !pending.current) return;
    const request = pending.current;
    const apply = (): void => {
      const page = stage.querySelector<HTMLElement>(
        `[data-page-index="${Math.min(request.pageIndex, loaded.document.numPages - 1)}"]`,
      );
      if (!page) return;
      const rect = page.getBoundingClientRect(),
        boundary = stage.getBoundingClientRect();
      stage.scrollTop += rect.top - boundary.top - 16 + request.y * rect.height;
      stage.scrollLeft +=
        rect.left - boundary.left - 16 + request.x * rect.width;
    };
    const handle = requestAnimationFrame(() => {
      apply();
      pending.current = null;
    });
    return () => cancelAnimationFrame(handle);
  }, [loaded, stage, position.zoom, position.mode, position.pageIndex, box]);
  useEffect(() => {
    if (loaded && position.pageIndex >= loaded.document.numPages)
      move(
        { ...position, pageIndex: loaded.document.numPages - 1, y: 0 },
        false,
      );
  }, [loaded, position.pageIndex, move]);
  useEffect(() => {
    setPageDraft(String(position.pageIndex + 1));
  }, [position.pageIndex]);
  useImperativeHandle(
    ref,
    () => ({
      position: capture,
      navigate(pageIndex, point) {
        if (!loaded || pageIndex < 0 || pageIndex >= loaded.document.numPages)
          return;
        navigation.current++;
        const next = {
          ...capture(),
          pageIndex,
          x: point?.[0] ?? 0,
          y: point?.[1] ?? 0,
        };
        move(next);
      },
      async outline(entry) {
        if (!loaded || entry.pageIndex === null || !entry.destination) return;
        const token = ++navigation.current;
        const page = await loaded.document.getPage(entry.pageIndex + 1),
          viewport = page.getViewport({ scale: 96 / 72 });
        if (loadedRef.current !== loaded || navigation.current !== token)
          return;
        const destination = entry.destination;
        const kind = (destination[1] as { name?: string })?.name;
        let zoom = live.current.zoom;
        let x = 0,
          y = 0;
        const num = (value: unknown, fallback: number): number =>
          typeof value === "number" ? value : fallback;
        if (kind === "XYZ") {
          const point = viewport.convertToViewportPoint(
            num(destination[2], page.view[0]),
            num(destination[3], page.view[3]),
          );
          x = point[0] / viewport.width;
          y = point[1] / viewport.height;
          if (typeof destination[4] === "number" && destination[4] > 0)
            zoom = {
              kind: "fixed",
              percent: Math.max(25, Math.min(400, destination[4] * 100)),
            };
        } else if (kind === "Fit" || kind === "FitB")
          zoom = { kind: "fit-page" };
        else if (kind === "FitH" || kind === "FitBH") {
          zoom = { kind: "fit-width" };
          const point = viewport.convertToViewportPoint(
            page.view[0],
            num(destination[2], page.view[3]),
          );
          y = point[1] / viewport.height;
        } else if (kind === "FitV" || kind === "FitBV") {
          const point = viewport.convertToViewportPoint(
            num(destination[2], page.view[0]),
            page.view[3],
          );
          x = point[0] / viewport.width;
          zoom = {
            kind: "fixed",
            percent: Math.max(
              25,
              Math.min(400, ((box.height - 32) / viewport.height) * 100),
            ),
          };
        } else if (kind === "FitR") {
          const rect = [
            ...viewport.convertToViewportPoint(
              num(destination[2], 0),
              num(destination[3], 0),
            ),
            ...viewport.convertToViewportPoint(
              num(destination[4], 0),
              num(destination[5], 0),
            ),
          ];
          x = Math.min(rect[0], rect[2]) / viewport.width;
          y = Math.min(rect[1], rect[3]) / viewport.height;
          zoom = {
            kind: "fixed",
            percent: Math.max(
              25,
              Math.min(
                400,
                100 *
                  Math.min(
                    (box.width - 32) / Math.abs(rect[2] - rect[0]),
                    (box.height - 32) / Math.abs(rect[3] - rect[1]),
                  ),
              ),
            ),
          };
        }
        move({ ...capture(), pageIndex: entry.pageIndex, x, y, zoom });
      },
      async highlight(highlight) {
        if (
          !loaded ||
          identityKey(highlight.identity) !== identityKey(loaded.snapshot) ||
          highlight.stale
        )
          return;
        const token = ++navigation.current;
        const page = await loaded.document.getPage(highlight.pageIndex + 1);
        if (loadedRef.current !== loaded || navigation.current !== token)
          return;
        const viewport = page.getViewport({ scale: 96 / 72 });
        const rect = highlight.rects[0];
        const point = rect
          ? viewport.convertToViewportPoint(rect[0], rect[3])
          : [0, 0];
        move({
          ...capture(),
          pageIndex: highlight.pageIndex,
          x: point[0] / viewport.width,
          y: Math.max(0, point[1] / viewport.height - 0.1),
        });
      },
      back() {
        const h = history.current;
        if (h.index > 0) {
          h.items[h.index] = capture();
          move(h.items[--h.index], false);
          onHistory({ items: [...h.items], index: h.index });
        }
      },
      forward() {
        const h = history.current;
        if (h.index < h.items.length - 1) {
          h.items[h.index] = capture();
          move(h.items[++h.index], false);
          onHistory({ items: [...h.items], index: h.index });
        }
      },
    }),
    [loaded, capture, move, box, onHistory],
  );
  const selectText = (): void => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !stage) return;
    const element = (node: Node | null): HTMLElement | null =>
      node instanceof Element
        ? node.closest("[data-page-index]")
        : (node?.parentElement?.closest("[data-page-index]") ?? null);
    const first = element(selection.anchorNode),
      last = element(selection.focusNode);
    if (!first || !last || !stage.contains(first) || !stage.contains(last))
      return;
    const a = Number(first.dataset.pageIndex),
      b = Number(last.dataset.pageIndex);
    setPinned(
      new Set(
        Array.from(
          { length: Math.abs(a - b) + 1 },
          (_, index) => Math.min(a, b) + index,
        ),
      ),
    );
    const text = selection.toString().trim();
    if (text) onText(text, Math.min(a, b) + 1, Math.max(a, b) + 1);
  };
  useEffect(() => {
    const listener = (): void => {
      if (window.getSelection()?.isCollapsed) setPinned(new Set());
    };
    document.addEventListener("selectionchange", listener);
    return () => document.removeEventListener("selectionchange", listener);
  }, []);
  const pages = loaded?.document.numPages ?? 0;
  const old =
    loaded &&
    (loading ||
      frame.status.phase === "compiling" ||
      frame.status.phase === "error" ||
      frame.status.phase === "crashed" ||
      loaded.snapshot.run !== frame.status.run);
  const setZoom = (zoom: ReadingPosition["zoom"]): void =>
    move({ ...capture(), zoom }, false);
  return (
    <div className={styles.reader}>
      {(old || error || frame.previewError || navigationError) && (
        <div className={styles.banner} role="status">
          {old
            ? `${t("preview.previous")} · ${new Date(loaded.snapshot.createdAt).toLocaleTimeString()} · ${loaded.snapshot.main}`
            : ""}
          {error || frame.previewError || navigationError}
        </div>
      )}
      <div
        ref={setStage}
        className={styles.stage}
        tabIndex={0}
        aria-label={t("preview.reading")}
        onScroll={() => {
          if (pending.current) return;
          const next = capture();
          setPosition(next);
          onPosition(next);
        }}
        onPointerUp={() => {
          if (!region) selectText();
        }}
        onKeyUp={(event) => {
          if (event.key === "Shift") selectText();
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            move({
              ...capture(),
              pageIndex: Math.max(
                0,
                Math.min(
                  pages - 1,
                  position.pageIndex + (event.key === "ArrowLeft" ? -1 : 1),
                ),
              ),
              y: 0,
            });
          }
        }}
      >
        {!loaded ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              {frame.main === null ? (
                <IconCodeOutlineRegular size={28} />
              ) : (
                <FileTypeIcon path={frame.main} size={28} />
              )}
            </div>
            <h3 className={styles.emptyTitle}>
              {frame.status.phase === "error"
                ? t("preview.noPreviewTitle")
                : frame.main === null
                  ? t("main.choose")
                  : t("status.starting")}
            </h3>
            <p className={styles.emptyDescription}>
              {error ??
                frame.previewError ??
                (frame.main === null
                  ? t("main.pickPrompt")
                  : frame.status.phase === "error"
                    ? t("preview.fixErrors")
                    : t("preview.noPreview"))}
            </p>
            {frame.status.phase === "error" && onOpenProblems && (
              <Button
                variant="primary"
                size="sm"
                className={styles.emptyAction}
                onClick={onOpenProblems}
              >
                {t("preview.viewProblems")}
              </Button>
            )}
          </div>
        ) : (
          <div
            className={styles.pages}
            data-preview-identity={identityKey(loaded.snapshot)}
          >
            {Array.from({ length: pages }, (_, index) =>
              position.mode === "single" &&
              index !== position.pageIndex ? null : (
                <PageSurface
                  key={`${identityKey(loaded.snapshot)}:${index}`}
                  loaded={loaded}
                  snapshot={loaded.snapshot}
                  index={index}
                  root={stage}
                  width={box.width}
                  height={box.height}
                  zoom={position.zoom}
                  pinned={pinned.has(index)}
                  region={region && index === position.pageIndex}
                  highlights={frame.highlights}
                  t={t}
                  onImage={onImage}
                  onCancelRegion={onCancelRegion}
                  onComment={onComment}
                />
              ),
            )}
          </div>
        )}
      </div>
      {loaded && (
        <div className={styles.pagebar}>
          <Button
            size="sm"
            className={styles.historyNav}
            aria-label={t("navigation.back")}
            disabled={history.current.index === 0}
            onClick={() =>
              ref && typeof ref !== "function" && ref.current?.back()
            }
          >
            ↶
          </Button>
          <Button
            size="sm"
            className={styles.historyNav}
            aria-label={t("navigation.forward")}
            disabled={history.current.index >= history.current.items.length - 1}
            onClick={() =>
              ref && typeof ref !== "function" && ref.current?.forward()
            }
          >
            ↷
          </Button>
          <button
            type="button"
            className={styles.pageNavBtn}
            aria-label={t("page.previous")}
            disabled={!pages || position.pageIndex === 0}
            onClick={() =>
              move({ ...capture(), pageIndex: position.pageIndex - 1, y: 0 })
            }
          >
            <IconChevronLeftOutlineRegular />
          </button>
          <form
            className={styles.pageInputForm}
            onSubmit={(event) => {
              event.preventDefault();
              const value = Number(pageDraft);
              if (Number.isInteger(value) && value >= 1 && value <= pages)
                move({ ...capture(), pageIndex: value - 1, y: 0 });
              else setPageDraft(String(position.pageIndex + 1));
            }}
          >
            <input
              aria-label={t("page.label")}
              inputMode="numeric"
              className={styles.pageInput}
              value={pages ? pageDraft : "0"}
              onChange={(event) => setPageDraft(event.target.value)}
              onBlur={() => setPageDraft(String(position.pageIndex + 1))}
            />
            <span className={styles.pageTotal}>/ {pages}</span>
          </form>
          <button
            type="button"
            className={styles.pageNavBtn}
            aria-label={t("page.next")}
            disabled={!pages || position.pageIndex >= pages - 1}
            onClick={() =>
              move({ ...capture(), pageIndex: position.pageIndex + 1, y: 0 })
            }
          >
            <IconChevronRightOutlineRegular />
          </button>
          <select
            aria-label={t("reader.mode")}
            value={position.mode}
            onChange={(event) =>
              move(
                {
                  ...capture(),
                  mode: event.target.value as ReadingPosition["mode"],
                },
                false,
              )
            }
          >
            <option value="continuous">{t("reader.continuous")}</option>
            <option value="single">{t("reader.single")}</option>
          </select>
          <select
            aria-label={t("reader.fit")}
            value={position.zoom.kind}
            onChange={(event) =>
              event.target.value === "fixed"
                ? setZoom({ kind: "fixed", percent: 100 })
                : setZoom({
                    kind: event.target.value as "fit-width" | "fit-page",
                  })
            }
          >
            <option value="fit-width">{t("toolbar.zoom.fitWidth")}</option>
            <option value="fit-page">{t("toolbar.zoom.fitPage")}</option>
            <option value="fixed">{t("reader.fixed")}</option>
          </select>
          <ZoomControls
            className={styles.zoom}
            visible
            zoom={scale}
            labels={{
              controls: t("reader.zoom"),
              menu: t("reader.zoom"),
              out: t("reader.zoomOut"),
              into: t("reader.zoomIn"),
              value: (value) => `${value}%`,
            }}
            onZoom={(value) => setZoom({ kind: "fixed", percent: value * 100 })}
            onActiveChange={() => {}}
          />
        </div>
      )}
    </div>
  );
});
