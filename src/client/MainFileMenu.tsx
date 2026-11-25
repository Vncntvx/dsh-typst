import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Checkbox,
  FileTypeIcon,
  IconChevronDownOutlineRegular,
  IconSearchOutlineRegular,
  Input,
  MenuGroup,
  MenuItemButton,
  MenuSurface,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { TypstStateFrame } from "../contract.js";
import type { TypstNamespace } from "./remote.js";
import { groupCandidates } from "./candidates.js";
import type { Translate } from "./types.js";
import { errorText } from "./types.js";
import styles from "./preview.module.css";

/**
 * The panel header's main-file picker. The card is the harness `MenuSurface`
 * portaled to the body, so neither the sidebar's overflow nor the tab body's
 * clip can crop it. Its `role="group"` holds the search field, path form and
 * scan controls; only the candidate rows live inside a nested `role="menu"`.
 * That split is what the ARIA menu pattern requires, and it keeps the arrow /
 * Home / End keys from a document-level menu handler away from the text fields.
 */
export function MainFileMenu({
  frame,
  remote,
  sessionId,
  t,
}: {
  frame: TypstStateFrame;
  remote: TypstNamespace;
  sessionId: string;
  t: Translate;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [path, setPath] = useState(""),
    [pending, setPending] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const indexing = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const cardId = `${id}-card`;
  // The card is portaled to the body, so CSS anchor positioning connects it
  // to this trigger through a per-instance anchor name. The harness menus
  // use the same mechanism, so the card tracks zoom and panning natively.
  const anchorName = `--dsh-typst-menu-${id.replaceAll(":", "")}`;

  // The trigger carries the anchor name; the card names it as its own
  // position anchor. Both are inline because the name is per instance.
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    trigger.style.setProperty("anchor-name", anchorName);
    return () => {
      trigger.style.removeProperty("anchor-name");
    };
  }, [anchorName]);
  useEffect(() => () => indexing.current?.abort(), []);

  // The card is portaled: dismissal has to watch both the trigger wrapper and
  // the card, and Escape must return focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) === true) return;
      if (cardRef.current?.contains(target) === true) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const discover = async (includeExcluded: boolean): Promise<void> => {
    indexing.current?.abort();
    const controller = new AbortController();
    indexing.current = controller;
    setError(null);
    try {
      const result = await remote.discover(
        sessionId as never,
        includeExcluded,
        controller.signal,
      );
      if (!controller.signal.aborted && !result.ok)
        setError(result.error.message);
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorText(failure));
    } finally {
      if (indexing.current === controller) {
        indexing.current = null;
      }
    }
  };

  const pick = async (candidate: string): Promise<void> => {
    const id = ++request.current;
    setPending(candidate);
    setError(null);
    try {
      const result = await remote.setMain(sessionId as never, candidate);
      if (!result.ok) throw new Error(result.error.message);
      // Close only on success: a failed switch stays visible in the open card
      // instead of writing into an unmounted one.
      setOpen(false);
      triggerRef.current?.focus();
    } catch (failure) {
      if (id === request.current) setError(errorText(failure));
    } finally {
      if (id === request.current) setPending(null);
    }
  };

  const groups = groupCandidates(frame.candidates, frame.fragments);
  const filterList = (files: readonly string[]) =>
    files.filter((file) =>
      file.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );

  const currentFiles = frame.main ? filterList([frame.main]) : [];
  const otherFiles = filterList(
    groups.others.filter((file) => file !== frame.main),
  );
  const fragmentFiles = filterList(
    groups.fragments.filter((file) => file !== frame.main),
  );
  const visible =
    currentFiles.length + otherFiles.length + fragmentFiles.length;

  const rows = (files: readonly string[]) =>
    files.map((file) => (
      <MenuItemButton
        key={file}
        current={file === frame.main}
        icon={<FileTypeIcon path={file} size={16} />}
        onSelect={() => void pick(file)}
      >
        {file}
      </MenuItemButton>
    ));

  /** Arrow keys are scoped to the candidate list, never the whole card. */
  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not(:disabled)',
      ) ?? []),
    ];
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className={styles.mainFile} ref={rootRef}>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        className={styles.mainFileTrigger}
        icon={<FileTypeIcon path={frame.main ?? "document.typ"} size={16} />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        aria-label={frame.main ?? t("main.choose")}
        title={
          pending
            ? `${t("action.working")} ${pending}`
            : (frame.main ?? t("main.choose"))
        }
        onClick={() => {
          setOpen((value) => !value);
          setError(null);
        }}
      >
        <span className={styles.mainFileLabel}>
          {pending
            ? `${t("action.working")} ${pending}`
            : (frame.main ?? t("main.choose"))}
        </span>
        <IconChevronDownOutlineRegular
          size={13}
          className={`${styles.mainFileChevron}${open ? ` ${styles.mainFileChevronOpen}` : ""}`}
        />
      </Button>
      {open &&
        createPortal(
          <MenuSurface
            ref={cardRef}
            id={cardId}
            className={styles.mainFileCard}
            role="group"
            aria-label={t("main.choose")}
            style={{ positionAnchor: anchorName } as CSSProperties}
          >
            <div className={styles.mainFileSearch} role="search">
              <IconSearchOutlineRegular
                className={styles.mainFileSearchIcon}
                size={14}
              />
              <input
                className={styles.mainFileSearchInput}
                type="text"
                role="searchbox"
                aria-label={t("main.search")}
                placeholder={t("main.search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
            </div>
            {visible === 0 ? (
              <p className={styles.mainFileEmpty} role="status">
                {query === "" ? t("main.noFiles") : t("main.noMatch")}
              </p>
            ) : (
              <div
                ref={listRef}
                className={styles.mainFileList}
                role="menu"
                aria-label={t("main.choose")}
                onKeyDown={onListKeyDown}
              >
                {currentFiles.length > 0 && (
                  <MenuGroup label={t("main.current")}>
                    {rows(currentFiles)}
                  </MenuGroup>
                )}
                {otherFiles.length > 0 && (
                  <MenuGroup label={t("main.others")}>
                    {rows(otherFiles)}
                  </MenuGroup>
                )}
                {fragmentFiles.length > 0 && (
                  <MenuGroup label={t("main.fragments")}>
                    {rows(fragmentFiles)}
                  </MenuGroup>
                )}
              </div>
            )}
            <div className={styles.mainFileFooter} role="group">
              <form
                className={styles.mainFilePathForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (path.trim()) void pick(path.trim());
                }}
              >
                <Input
                  className={styles.mainFilePath}
                  aria-label={t("main.path")}
                  placeholder={t("main.path")}
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={path.trim() === ""}
                >
                  {t("main.open")}
                </Button>
              </form>
              <div className={styles.mainFileScan}>
                <Checkbox
                  checked={frame.discovery.includeExcluded}
                  onChange={(next) => void discover(next)}
                  label={t("main.includeExcluded")}
                />
                <Button
                  size="sm"
                  disabled={frame.discovery.scanning}
                  onClick={() => void discover(frame.discovery.includeExcluded)}
                >
                  {t("action.refresh")}
                </Button>
              </div>
              {frame.discovery.scanning && (
                <p className={styles.mainFileHint} role="status">
                  {t("main.scanning")} {frame.discovery.visited}
                </p>
              )}
              {error && (
                <p
                  className={`${styles.mainFileHint} ${styles.mainFileError}`}
                  role="alert"
                >
                  {error}
                </p>
              )}
              {!!frame.discovery.errors.length && (
                <details className={styles.mainFileHint}>
                  <summary>
                    {t("main.scanErrors")} ({frame.discovery.errors.length})
                  </summary>
                  {frame.discovery.errors.map((err) => (
                    <p key={err}>{err}</p>
                  ))}
                </details>
              )}
            </div>
          </MenuSurface>,
          document.body,
        )}
    </div>
  );
}
