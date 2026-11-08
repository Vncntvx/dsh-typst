import { useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  FileTypeIcon,
  IconChevronDownOutlineRegular,
  IconSearchOutlineRegular,
  Input,
  Menu,
  MenuGroup,
  MenuItemButton,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { TypstStateFrame } from "../contract.js";
import type { TypstNamespace } from "./remote.js";
import { groupCandidates } from "./candidates.js";
import type { Translate } from "./types.js";
import styles from "./preview.module.css";

/**
 * The panel header's main-file picker. The trigger is the harness's compact
 * ghost button; the dropdown is the harness `Menu` in portal mode (so neither
 * the sidebar's overflow nor the tab body's clip can crop it) whose card holds
 * the search field, the grouped candidate rows and the secondary controls in
 * three flat sections. Native primitives own every control, and the card is
 * narrower than the menu's readable bound, which is what keeps the footer's
 * form from overflowing the card.
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
  useEffect(() => () => indexing.current?.abort(), []);

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
      if (!controller.signal.aborted) setError(String(failure));
    } finally {
      if (indexing.current === controller) {
        indexing.current = null;
      }
    }
  };

  const pick = async (candidate: string): Promise<void> => {
    const id = ++request.current;
    setOpen(false);
    setPending(candidate);
    setError(null);
    try {
      const result = await remote.setMain(sessionId as never, candidate);
      if (!result.ok) throw new Error(result.error.message);
    } catch (failure) {
      if (id === request.current) setError(String(failure));
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

  return (
    <div className={styles.mainFile}>
      <Menu
        open={open}
        portal
        onClose={() => setOpen(false)}
        anchor={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.mainFileTrigger}
            icon={
              <FileTypeIcon path={frame.main ?? "document.typ"} size={16} />
            }
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={frame.main ?? t("main.choose")}
            title={
              pending
                ? `${t("action.working")} ${pending}`
                : (frame.main ?? t("main.choose"))
            }
            onClick={() => setOpen((value) => !value)}
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
        }
      >
        <div className={styles.mainFileCard}>
          <div className={styles.mainFileSearch}>
            <Input
              className={styles.mainFileSearchInput}
              icon={<IconSearchOutlineRegular size={16} />}
              type="text"
              role="searchbox"
              aria-label={t("main.search")}
              placeholder={t("main.search")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              // The menu card opens with its filter focused, like the app's
              // own searchable menus.
              autoFocus
            />
          </div>
          <div className={styles.mainFileList}>
            {visible === 0 ? (
              <p className={styles.mainFileHint} role="status">
                {query === "" ? t("main.noFiles") : t("main.noMatch")}
              </p>
            ) : (
              <>
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
              </>
            )}
          </div>
          <div className={styles.mainFileFooter}>
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
            <p className={styles.mainFileHint}>{t("main.switchRecompiles")}</p>
          </div>
        </div>
      </Menu>
    </div>
  );
}
