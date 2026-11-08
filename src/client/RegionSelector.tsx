import { useState, type PointerEvent } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { Translate } from "./types.js";
import styles from "./preview.module.css";

/** Single-page rectangles compose into a multi-page feedback draft. */
export function RegionSelector({
  width,
  height,
  t,
  onCapture,
  onCancel,
}: {
  width: number;
  height: number;
  t: Translate;
  onCapture: (rect: number[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [rect, setRect] = useState([
    width * 0.15,
    height * 0.15,
    width * 0.65,
    height * 0.35,
  ]);
  const [drag, setDrag] = useState<{
    x: number;
    y: number;
    corner?: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const point = (event: PointerEvent<HTMLElement>): number[] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(width, event.clientX - box.left)),
      Math.max(0, Math.min(height, event.clientY - box.top)),
    ];
  };
  const capture = async (): Promise<void> => {
    if (busy || rect[2] - rect[0] < 2 || rect[3] - rect[1] < 2) return;
    setBusy(true);
    setError(null);
    try {
      await onCapture(rect);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };
  const move = (dx: number, dy: number, resize: boolean): void =>
    setRect((current) => {
      const next = [...current];
      if (resize) {
        next[2] = Math.max(next[0] + 2, Math.min(width, next[2] + dx));
        next[3] = Math.max(next[1] + 2, Math.min(height, next[3] + dy));
      } else {
        const x = Math.max(-current[0], Math.min(width - current[2], dx));
        const y = Math.max(-current[1], Math.min(height - current[3], dy));
        next[0] += x;
        next[2] += x;
        next[1] += y;
        next[3] += y;
      }
      return next;
    });
  return (
    <>
      <div
        className={styles.regionLayer}
        tabIndex={0}
        role="group"
        aria-label={t("region.instructions")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          } else if (event.key === "Enter") {
            event.preventDefault();
            void capture();
          } else if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
              event.key,
            )
          ) {
            event.preventDefault();
            move(
              event.key === "ArrowLeft"
                ? -5
                : event.key === "ArrowRight"
                  ? 5
                  : 0,
              event.key === "ArrowUp" ? -5 : event.key === "ArrowDown" ? 5 : 0,
              event.shiftKey,
            );
          }
        }}
        onPointerDown={(event) => {
          if (busy) return;
          const [x, y] = point(event);
          event.currentTarget.setPointerCapture(event.pointerId);
          const corner = (event.target as HTMLElement).dataset.corner;
          setDrag({
            x,
            y,
            ...(corner === undefined ? {} : { corner: Number(corner) }),
          });
          if (corner === undefined) setRect([x, y, x, y]);
        }}
        onPointerMove={(event) => {
          if (!drag) return;
          const [x, y] = point(event);
          if (drag.corner === undefined)
            setRect([
              Math.min(x, drag.x),
              Math.min(y, drag.y),
              Math.max(x, drag.x),
              Math.max(y, drag.y),
            ]);
          else
            setRect((current) => {
              const next = [...current];
              next[drag.corner! % 2 === 0 ? 0 : 2] = x;
              next[drag.corner! < 2 ? 1 : 3] = y;
              return [
                Math.min(next[0], next[2]),
                Math.min(next[1], next[3]),
                Math.max(next[0], next[2]),
                Math.max(next[1], next[3]),
              ];
            });
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <div
          className={styles.regionRect}
          style={{
            left: rect[0],
            top: rect[1],
            width: rect[2] - rect[0],
            height: rect[3] - rect[1],
          }}
        >
          {[0, 1, 2, 3].map((corner) => (
            <span
              key={corner}
              data-corner={corner}
              className={styles.regionHandle}
              style={{
                left: corner % 2 ? "100%" : 0,
                top: corner < 2 ? 0 : "100%",
              }}
            />
          ))}
        </div>
      </div>
      <div className={styles.regionActions}>
        <span>{t("region.instructions")}</span>
        <Button
          size="sm"
          disabled={busy || rect[2] - rect[0] < 2 || rect[3] - rect[1] < 2}
          onClick={() => void capture()}
        >
          {busy ? t("action.working") : t("region.capture")}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {t("action.cancel")}
        </Button>
        {error && <span role="alert">{error}</span>}
      </div>
    </>
  );
}
