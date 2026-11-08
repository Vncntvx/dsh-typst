import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { OutlineEntry } from "./pdf/outline.js";
import type { Translate } from "./types.js";
import styles from "./preview.module.css";

export function OutlinePanel({
  entries,
  error,
  t,
  currentPage,
  onNavigate,
  onRetry,
  collapsedIds,
  onCollapsed,
}: {
  entries: OutlineEntry[];
  error: string | null;
  t: Translate;
  currentPage: number;
  onNavigate: (entry: OutlineEntry) => void;
  onRetry: () => void;
  collapsedIds: string[];
  onCollapsed: (ids: string[]) => void;
}) {
  const collapsed = new Set(collapsedIds);
  const setCollapsed = (update: (current: Set<string>) => Set<string>): void =>
    onCollapsed([...update(collapsed)]);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const visible = entries.filter((entry) => {
    let parent = entry.parentId;
    while (parent) {
      if (collapsed.has(parent)) return false;
      parent = byId.get(parent)?.parentId ?? null;
    }
    return true;
  });
  if (error)
    return (
      <div role="alert">
        {error}
        <Button size="sm" onClick={onRetry}>
          {t("action.retry")}
        </Button>
      </div>
    );
  if (!entries.length) return <p>{t("outline.empty")}</p>;
  const active = entries
    .filter(
      (entry) => entry.pageIndex !== null && entry.pageIndex <= currentPage,
    )
    .at(-1)?.id;
  return (
    <div
      role="tree"
      aria-label={t("toolbar.outline")}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        const row = target.closest<HTMLElement>("[role=treeitem]");
        if (!row) return;
        const index = visible.findIndex((entry) => entry.id === row.dataset.id);
        const entry = visible[index];
        if (!entry) return;
        if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "Home" ||
          event.key === "End"
        ) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? visible.length - 1
                : Math.max(
                    0,
                    Math.min(
                      visible.length - 1,
                      index + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  );
          event.currentTarget
            .querySelectorAll<HTMLElement>("[role=treeitem]")
            [next]?.focus();
        } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          setCollapsed((current) => {
            const next = new Set(current);
            if (event.key === "ArrowRight") next.delete(entry.id);
            else next.add(entry.id);
            return next;
          });
        } else if (event.key === "Enter" && entry.pageIndex !== null) {
          event.preventDefault();
          onNavigate(entry);
        }
      }}
    >
      {visible.map((entry) => (
        <div
          key={entry.id}
          data-id={entry.id}
          className={styles.outlineRow}
          role="treeitem"
          tabIndex={0}
          aria-level={entry.depth + 1}
          aria-current={entry.id === active ? "location" : undefined}
          aria-expanded={
            entry.hasChildren ? !collapsed.has(entry.id) : undefined
          }
          style={{ paddingInlineStart: 8 + entry.depth * 12 }}
        >
          {entry.hasChildren && (
            <Button
              size="sm"
              className={styles.outlineToggle}
              aria-label={t(
                collapsed.has(entry.id) ? "outline.expand" : "outline.collapse",
              )}
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(entry.id)) next.delete(entry.id);
                  else next.add(entry.id);
                  return next;
                })
              }
            >
              {collapsed.has(entry.id) ? "▸" : "▾"}
            </Button>
          )}
          <button
            type="button"
            className={styles.outlineTitleButton}
            disabled={entry.pageIndex === null}
            onClick={() => onNavigate(entry)}
            title={entry.title}
          >
            <span className={styles.outlineTitle}>{entry.title}</span>
            {entry.pageIndex !== null ? (
              <span className={styles.outlinePageBadge}>
                {entry.pageIndex + 1}
              </span>
            ) : (
              <span className={styles.outlinePageBadge}>
                {t("outline.noDestination")}
              </span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
