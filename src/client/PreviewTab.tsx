import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Button,
  IconCloseOutlineRegular,
  IconInspectOutlineRegular,
  IconFlatListOutlineRegular,
  IconRefreshOutlineRegular,
  SegmentedTabs,
  Tag,
  type TagTone,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type {
  PropsRuntime,
  InjectFace,
  PropsLocale,
  PropsStore,
} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type { TypstStateFrame } from "../contract.js";
import { typstStateAddress, type TypstNamespace } from "./remote.js";
import { MainFileMenu } from "./MainFileMenu.js";
import { IconButton } from "./IconButton.js";
import { LinkButton } from "./LinkButton.js";
import { ProblemsPanel } from "./ProblemsPanel.js";
import { diagnosticText } from "../diagnostic-text.js";
import { SetupPanel } from "./SetupPanel.js";
import { FeedbackPanel } from "./FeedbackPanel.js";
import { OutlinePanel } from "./OutlinePanel.js";
import { Reader, type ReaderHandle } from "./pdf/Reader.js";
import {
  resolveOutline,
  type OutlineEntry,
  type RawOutlineNode,
} from "./pdf/outline.js";
import type { LoadedPreview } from "./pdf/use-preview.js";
import {
  initialPosition,
  initialTabState,
  sameTabView,
  type PreviewStoreHandle,
  type AuxiliaryView,
  type TabState,
} from "./view-state.js";
import { resolveSelection } from "./selection.js";
import { workspaceSourceAddress } from "./source.js";
import type { FeedbackBridge } from "./conversation.js";
import {
  identityKey,
  errorText,
  type FeedbackDraft,
  type NavigationHistory,
  type ReadingPosition,
  type RegionImage,
} from "./types.js";
import styles from "./preview.module.css";

declare module "@deepseek-ai/dsh-client-ui-sidebar-right/client" {
  interface SidebarRightResourceParamsMap {
    file: { readonly line?: number };
  }
}

export interface PreviewTabInjected {
  remote: TypstNamespace;
  bridge: FeedbackBridge;
}
export type PreviewTabProps = PropsRuntime<"sidebar.right.pane.tab"> &
  InjectFace<PreviewTabInjected> &
  PropsStore<PreviewStoreHandle> &
  PropsLocale<"typst">;

const retainedTabs = new WeakSet<AbortSignal>();

export function PreviewTab({
  sessionId,
  t,
  remote,
  bridge,
  useStore,
  actions,
  useResource,
  useTabInfo,
}: PreviewTabProps) {
  const resource = useResource<"typst">(typstStateAddress(sessionId as never));
  const lastFrame = useRef<{
    sessionId: string;
    frame: TypstStateFrame;
  } | null>(null);
  if (resource.value) lastFrame.current = { sessionId, frame: resource.value };
  const frame =
    resource.value ??
    (lastFrame.current?.sessionId === sessionId
      ? lastFrame.current.frame
      : undefined);
  const auxiliaryId = useId();
  const info = useTabInfo();
  const tabId = info.tab.id;
  const tabSignal = info.tab.signal;
  const main = frame?.main ?? "";
  // The outline follows the current document's page. Positions for other
  // documents do not affect the visible tab.
  const view: TabState =
    useStore(
      (value) => value.byTab[tabId],
      (a, b) => sameTabView(a, b, main),
    ) ?? initialTabState();
  const reader = useRef<ReaderHandle>(null),
    root = useRef<HTMLDivElement>(null);
  const [retry, setRetry] = useState(0),
    [region, setRegion] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null),
    [outline, setOutline] = useState<OutlineEntry[]>([]),
    [outlineError, setOutlineError] = useState<string | null>(null),
    [outlineRetry, setOutlineRetry] = useState(0);
  const [selection, setSelection] = useState<{
    text: string;
    page: number;
    endPage: number;
  } | null>(null);
  useEffect(() => {
    // Hiding a tab unmounts its body while its record remains open.
    if (tabSignal.aborted) {
      actions.forget(tabId);
      return;
    }
    if (retainedTabs.has(tabSignal)) return;
    retainedTabs.add(tabSignal);
    tabSignal.addEventListener("abort", () => actions.forget(tabId), {
      once: true,
    });
  }, [actions, tabId, tabSignal]);
  const requests = view.requests;
  const set = useCallback(
    (run: (value: PreviewTabProps["actions"]) => void) => {
      if (!tabSignal.aborted) run(actions);
    },
    [actions, tabSignal],
  );
  const selectSeq = useRef(0);
  const selectAbort = useRef<AbortController | null>(null);
  const pendingDraft = useRef<string | null>(null);
  useEffect(() => {
    if (view.feedback?.id !== pendingDraft.current) pendingDraft.current = null;
  }, [view.feedback?.id]);
  useEffect(() => {
    selectSeq.current++;
    selectAbort.current?.abort();
    setSelection(null);
    const active = window.getSelection();
    const anchor = active?.anchorNode ?? null;
    const element =
      anchor === null
        ? null
        : anchor.nodeType === 1
          ? (anchor as Element)
          : anchor.parentElement;
    // Clear the PDF text-layer selection only; a selection in the chat area
    // or an input must survive a recompile.
    if (element?.closest("[data-page-index]") !== null && element !== null)
      active?.removeAllRanges();
    return () => {
      selectSeq.current++;
      selectAbort.current?.abort();
    };
  }, [loaded?.snapshot.generation, loaded?.snapshot.seq]);
  useEffect(() => {
    // A region captured while the draft is being submitted would never be
    // sent (and its blob URL would be orphaned); leave the mode instead.
    if (view.sending) setRegion(false);
  }, [view.sending]);
  useEffect(() => {
    // Reopening the auxiliary panel starts at the remembered split, not the
    // full height left by a previous expand.
    if (!view.auxiliary) setExpanded(false);
  }, [view.auxiliary]);
  const refresh = useCallback(() => {
    setRetry((value) => value + 1);
    void remote
      .restart(sessionId as never)
      .then((result) => {
        if (!result.ok) set((a) => a.setNotice(tabId, result.error.message));
      })
      .catch((failure) => set((a) => a.setNotice(tabId, errorText(failure))));
  }, [remote, sessionId, set, tabId]);
  useEffect(
    () => info.tab.actions.bindCommands({ refresh }),
    [info.tab.actions, refresh],
  );
  useEffect(() => {
    if (!frame) return;
    if (frame.main !== view.main) {
      set((a) => a.setMain(tabId, frame.main));
      setSelection(null);
      setRegion(false);
    }
    if (frame.view && frame.viewSeq > view.seenRequest) {
      set((a) => {
        a.markRequestSeen(tabId, frame.viewSeq);
        a.pushRequest(tabId, { seq: frame.viewSeq, view: frame.view! });
      });
    }
  }, [frame?.main, frame?.viewSeq]);
  useEffect(() => {
    let stale = false;
    setOutline([]);
    setOutlineError(null);
    if (loaded)
      void loaded.document
        .getOutline()
        .then((nodes) =>
          resolveOutline(loaded.document, (nodes ?? []) as RawOutlineNode[]),
        )
        .then((entries) => {
          if (!stale) setOutline(entries);
        })
        .catch((failure) => {
          if (!stale) setOutlineError(errorText(failure));
        });
    return () => {
      stale = true;
    };
  }, [loaded, outlineRetry]);
  const onPosition = useCallback(
    (position: ReadingPosition) => {
      if (frame?.main) set((a) => a.setPosition(tabId, frame.main!, position));
    },
    [frame?.main, set, tabId],
  );
  const onHistory = useCallback(
    (history: NavigationHistory) =>
      set((a) => a.setHistory(tabId, frame?.main ?? "", history)),
    [frame?.main, set, tabId],
  );
  const onText = useCallback(
    (text: string, page: number, endPage: number) =>
      setSelection({ text, page, endPage }),
    [setSelection],
  );
  const onCancelRegion = useCallback(() => setRegion(false), [setRegion]);
  const onLoaded = useCallback(
    (value: LoadedPreview | null) => setLoaded(value),
    [setLoaded],
  );
  const onComment = useCallback(
    (id: string) => {
      set((a) => a.setAuxiliary(tabId, "annotations"));
      requestAnimationFrame(() =>
        root.current
          ?.querySelector<HTMLElement>(`[data-annotation="${id}"]`)
          ?.focus(),
      );
    },
    [set, tabId, root],
  );
  const onOpenProblems = useCallback(
    () => set((a) => a.setAuxiliary(tabId, "problems")),
    [set, tabId],
  );
  const draft = (value: FeedbackDraft): void => {
    if (view.feedback) {
      set((a) => a.setNotice(tabId, t("feedback.finishDraft")));
      return;
    }
    set((a) => {
      a.setFeedback(tabId, value);
      a.setFeedbackExpanded(tabId, true);
      a.setFeedbackError(tabId, null);
      a.setProgress(tabId, "");
    });
  };
  const source = (file: string, line: number): void => {
    const address = workspaceSourceAddress(
      sessionId,
      frame?.workspaceRoot,
      file,
    );
    if (address === undefined) {
      set((a) => a.setNotice(tabId, t("source.unavailable")));
      return;
    }
    try {
      info.tab.actions.openResource(address, {
        params: { line },
        preferNewPane: true,
      });
    } catch (failure) {
      set((a) => a.setNotice(tabId, errorText(failure)));
    }
  };
  const textDraft = async (ask: boolean): Promise<void> => {
    if (!selection || !loaded) return;
    const token = ++selectSeq.current;
    selectAbort.current?.abort();
    const controller = new AbortController();
    selectAbort.current = controller;
    const context = `Typst preview: ${loaded.snapshot.main}\nPages: ${selection.page}-${selection.endPage}\nSnapshot: ${identityKey(loaded.snapshot)}`;
    if (!ask) {
      try {
        await bridge.append(`${context}\n\n${selection.text}`);
        set((a) => a.setNotice(tabId, t("feedback.added")));
      } catch (failure) {
        set((a) => a.setNotice(tabId, errorText(failure)));
      }
      return;
    }
    const hasDraft = view.feedback !== null;
    if (hasDraft) {
      set((a) => a.setNotice(tabId, t("feedback.finishDraft")));
      return;
    }
    const value: FeedbackDraft = {
      id: crypto.randomUUID(),
      title: t("selection.ask"),
      question: "",
      context,
      snapshot: loaded.snapshot,
      images: [],
      text: selection.text,
      source: null,
      matches: [],
    };
    pendingDraft.current = value.id;
    draft(value);
    try {
      const matches = await resolveSelection(
        remote,
        sessionId,
        selection.text,
        null,
        controller.signal,
      );
      if (token === selectSeq.current && pendingDraft.current === value.id) {
        pendingDraft.current = null;
        const change: Partial<FeedbackDraft> = {
          matches,
          source: matches.length === 1 ? matches[0] : null,
        };
        set((a) => a.patchFeedback(tabId, change));
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        set((a) => a.setNotice(tabId, errorText(failure)));
    }
  };
  const addImage = useCallback(
    (image: RegionImage): void => {
      if (tabSignal.aborted) {
        URL.revokeObjectURL(image.url);
        return;
      }
      const current = view.feedback;
      if (current && current.images.length === 0) {
        URL.revokeObjectURL(image.url);
        set((a) => a.setNotice(tabId, t("feedback.finishDraft")));
        return;
      }
      set((a) => {
        a.setFeedbackExpanded(tabId, true);
        a.setFeedback(
          tabId,
          current
            ? { ...current, images: [...current.images, image] }
            : {
                id: crypto.randomUUID(),
                title: t("region.title"),
                question: "",
                context: `Typst preview: ${image.main}`,
                snapshot: loaded?.snapshot ?? null,
                images: [image],
              },
        );
      });
      setRegion(false);
    },
    [view.feedback, set, tabId, tabSignal, t, loaded?.snapshot, setRegion],
  );
  const height = view.auxiliary ? `${view.auxiliaryHeight * 100}%` : "0";
  const position = view.positions[frame?.main ?? ""] ?? initialPosition();

  const errorsCount = frame
    ? frame.diagnostics.filter((item) => item.severity === "error").length
    : 0;
  const warningsCount = frame
    ? frame.diagnostics.filter((item) => item.severity === "warning").length
    : 0;

  let statusTone: TagTone = "neutral";
  let statusLabel = "";
  if (frame) {
    if (frame.status.phase === "compiling") {
      statusTone = "neutral";
      statusLabel = t("status.compiling");
    } else if (errorsCount > 0) {
      statusTone = "danger";
      statusLabel = `${errorsCount} ${t(errorsCount === 1 ? "status.errorCountOne" : "status.errorCount")}`;
    } else if (warningsCount > 0) {
      statusTone = "warning";
      statusLabel = `${warningsCount} ${t(warningsCount === 1 ? "status.warningCountOne" : "status.warningCount")}`;
    } else if (frame.status.phase === "ok") {
      statusTone = "success";
      statusLabel = `${t("status.ok")}${frame.status.durationMs !== undefined ? ` · ${frame.status.durationMs}ms` : ""}`;
    } else {
      statusTone = "neutral";
      statusLabel = t(`status.${frame.status.phase}`);
    }
  }

  return (
    <div className={styles.root} ref={root}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {frame && (
            <MainFileMenu
              frame={frame}
              remote={remote}
              sessionId={sessionId}
              t={t}
            />
          )}
        </div>
        <div className={styles.headerCenter}>
          {frame ? (
            errorsCount > 0 || warningsCount > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => set((a) => a.setAuxiliary(tabId, "problems"))}
              >
                <Tag tone={statusTone} className={styles.statusTag}>
                  {statusLabel}
                </Tag>
              </Button>
            ) : (
              <div role="status">
                <Tag tone={statusTone} className={styles.statusTag}>
                  {statusLabel}
                </Tag>
              </div>
            )
          ) : (
            <div role="status">
              <Tag tone="neutral" className={styles.statusTag}>
                {resource.status === "failed"
                  ? t("preview.failed")
                  : t("status.starting")}
              </Tag>
            </div>
          )}
        </div>
        <div className={styles.headerRight}>
          <Tooltip
            label={t("action.refresh")}
            side="bottom"
            portal
            delayMs={300}
          >
            <IconButton
              aria-label={t("action.refresh")}
              icon={<IconRefreshOutlineRegular size={16} />}
              onClick={refresh}
            />
          </Tooltip>
          {frame && (
            <>
              <Tooltip
                label={t("region.title")}
                side="bottom"
                portal
                delayMs={300}
              >
                <IconButton
                  selected={region}
                  aria-label={t("region.title")}
                  disabled={!loaded || view.sending}
                  icon={<IconInspectOutlineRegular size={16} />}
                  onClick={() => {
                    if (view.feedback && !view.feedback.images.length)
                      set((a) => a.setNotice(tabId, t("feedback.finishDraft")));
                    else setRegion((value) => !value);
                  }}
                />
              </Tooltip>
              <Tooltip
                label={t("aux.label")}
                side="bottom"
                portal
                delayMs={300}
              >
                <IconButton
                  selected={view.auxiliary !== null}
                  aria-label={t("aux.label")}
                  icon={<IconFlatListOutlineRegular size={16} />}
                  onClick={() =>
                    set((a) =>
                      a.setAuxiliary(
                        tabId,
                        view.auxiliary
                          ? null
                          : errorsCount > 0
                            ? "problems"
                            : "outline",
                      ),
                    )
                  }
                >
                  {errorsCount > 0 && (
                    <span className={styles.auxBadge}>{errorsCount}</span>
                  )}
                </IconButton>
              </Tooltip>
            </>
          )}
        </div>
      </div>
      {resource.status === "failed" && (
        <div className={styles.banner} role="alert">
          {t("preview.disconnected")} · {errorText(resource.failure)}
          <Button size="sm" onClick={refresh}>
            {t("action.retry")}
          </Button>
        </div>
      )}
      {view.notice && (
        <div className={styles.notice} role="status">
          {view.notice}
          <IconButton
            size="sm"
            aria-label={t("action.close")}
            icon={<IconCloseOutlineRegular size={14} />}
            onClick={() => set((a) => a.setNotice(tabId, null))}
          />
        </div>
      )}
      {!frame ? (
        <div className={styles.center}>
          {resource.failure
            ? errorText(resource.failure)
            : t("status.starting")}
        </div>
      ) : (
        <>
          {frame.toolchain.state !== "ready" ? (
            <SetupPanel
              frame={frame}
              remote={remote}
              sessionId={sessionId}
              t={t}
              onRequest={draft}
            />
          ) : (
            <>
              {requests.length > 0 && (
                <div
                  className={styles.notifications}
                  role="region"
                  aria-live="polite"
                  aria-label={t("agent.notifications")}
                >
                  {requests.map((request) => {
                    const expired =
                      !loaded ||
                      identityKey(request.view.identity) !==
                        identityKey(loaded.snapshot);
                    return (
                      <div className={styles.inline} key={request.seq}>
                        <span>
                          {expired ? t("agent.expired") : t("agent.request")}
                        </span>
                        <Button
                          size="sm"
                          disabled={expired}
                          aria-label={`${t("agent.view")} ${
                            request.view.kind === "page"
                              ? `${t("page.label")} ${request.view.pageIndex + 1}`
                              : request.view.id
                          }`}
                          onClick={() => {
                            if (request.view.kind === "page")
                              reader.current?.navigate(request.view.pageIndex);
                            else {
                              const id = request.view.id;
                              const highlight = frame.highlights.find(
                                (item) => item.id === id,
                              );
                              if (highlight && !highlight.stale)
                                void reader.current?.highlight(highlight);
                              set((a) => a.setAuxiliary(tabId, "annotations"));
                            }
                            set((a) => a.dropRequest(tabId, request.seq));
                          }}
                        >
                          {t("agent.view")}
                        </Button>
                        <Button
                          size="sm"
                          aria-label={`${t("action.dismiss")} ${
                            request.view.kind === "page"
                              ? `${t("page.label")} ${request.view.pageIndex + 1}`
                              : request.view.id
                          }`}
                          onClick={() =>
                            set((a) => a.dropRequest(tabId, request.seq))
                          }
                        >
                          {t("action.dismiss")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <Reader
                key={`${sessionId}:${frame.main}`}
                ref={reader}
                frame={frame}
                remote={remote}
                sessionId={sessionId}
                initial={position}
                history={view.histories[frame.main ?? ""]}
                onHistory={onHistory}
                t={t}
                retry={retry}
                region={region}
                onCancelRegion={onCancelRegion}
                onImage={addImage}
                onPosition={onPosition}
                onLoaded={onLoaded}
                onText={onText}
                onComment={onComment}
                onOpenProblems={onOpenProblems}
              />
              {selection && (
                // Two symmetric ways to use the selection, then a dismissal:
                // the pair carries the outline, so neither claims priority,
                // and dismissing stays quiet.
                <div className={styles.selectionBar}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void textDraft(false)}
                  >
                    {t("selection.addToChat")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void textDraft(true)}
                  >
                    {t("selection.ask")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      window.getSelection()?.removeAllRanges();
                      setSelection(null);
                    }}
                  >
                    {t("action.dismiss")}
                  </Button>
                </div>
              )}
            </>
          )}
          {view.feedback && !view.feedbackExpanded && (
            <Button
              size="sm"
              onClick={() => set((a) => a.setFeedbackExpanded(tabId, true))}
            >
              {t("feedback.review")}
            </Button>
          )}
          {view.feedback && view.feedbackExpanded && (
            <FeedbackPanel
              key={view.feedback.id}
              draft={view.feedback}
              current={frame.snapshot}
              frame={frame}
              bridge={bridge}
              tabId={tabId}
              busy={view.sending}
              error={view.feedbackError}
              progress={view.progress}
              set={set}
              t={t}
            />
          )}
          {view.auxiliary && (
            <section
              className={`${styles.auxiliary} ${expanded ? styles.auxiliaryExpanded : ""}`}
              style={{ height: expanded ? "100%" : height }}
            >
              <div
                className={styles.splitter}
                role="separator"
                aria-label={t("aux.resize")}
                aria-orientation="horizontal"
                aria-valuemin={15}
                aria-valuemax={60}
                aria-valuenow={Math.min(
                  60,
                  Math.round(view.auxiliaryHeight * 100),
                )}
                aria-valuetext={expanded ? t("aux.maximized") : undefined}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    set((a) =>
                      a.setAuxiliaryHeight(
                        tabId,
                        view.auxiliaryHeight +
                          (event.key === "ArrowUp" ? 0.05 : -0.05),
                      ),
                    );
                  }
                }}
                onPointerDown={(event) =>
                  event.currentTarget.setPointerCapture(event.pointerId)
                }
                onPointerMove={(event) => {
                  if (
                    !event.currentTarget.hasPointerCapture(event.pointerId) ||
                    !root.current
                  )
                    return;
                  const rect = root.current.getBoundingClientRect();
                  set((a) =>
                    a.setAuxiliaryHeight(
                      tabId,
                      (rect.bottom - event.clientY) / rect.height,
                    ),
                  );
                }}
              />
              <div className={styles.auxiliaryHeader}>
                <SegmentedTabs
                  size="sm"
                  label={t("aux.label")}
                  value={view.auxiliary}
                  items={[
                    {
                      value: "outline",
                      label: t("toolbar.outline"),
                      id: `${auxiliaryId}-outline`,
                      panelId: auxiliaryId,
                    },
                    {
                      value: "problems",
                      label: `${t("toolbar.problems")}${frame.diagnostics.length ? ` (${frame.diagnostics.length})` : ""}`,
                      id: `${auxiliaryId}-problems`,
                      panelId: auxiliaryId,
                    },
                    {
                      value: "annotations",
                      label: `${t("agent.annotations")}${frame.highlights.length ? ` (${frame.highlights.length})` : ""}`,
                      id: `${auxiliaryId}-annotations`,
                      panelId: auxiliaryId,
                    },
                  ]}
                  onChange={(value: AuxiliaryView) =>
                    set((a) => a.setAuxiliary(tabId, value))
                  }
                />
                <div className={styles.auxiliaryHeaderActions}>
                  <Button
                    size="sm"
                    onClick={() => setExpanded((value) => !value)}
                  >
                    {t(expanded ? "aux.return" : "aux.expand")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => set((a) => a.setAuxiliary(tabId, null))}
                  >
                    {t("action.close")}
                  </Button>
                </div>
              </div>
              <div
                id={auxiliaryId}
                role="tabpanel"
                aria-labelledby={`${auxiliaryId}-${view.auxiliary}`}
                className={styles.auxiliaryBody}
              >
                {view.auxiliary === "outline" ? (
                  <OutlinePanel
                    entries={outline}
                    error={outlineError}
                    t={t}
                    currentPage={position.pageIndex}
                    onNavigate={(entry) => {
                      void reader.current
                        ?.outline(entry)
                        .catch((failure) =>
                          set((a) => a.setNotice(tabId, errorText(failure))),
                        );
                    }}
                    onRetry={() => setOutlineRetry((value) => value + 1)}
                    collapsedIds={view.outlineCollapsed[frame.main ?? ""] ?? []}
                    onCollapsed={(ids) =>
                      set((a) =>
                        a.setOutlineCollapsed(tabId, frame.main ?? "", ids),
                      )
                    }
                  />
                ) : view.auxiliary === "problems" ? (
                  <ProblemsPanel
                    frame={frame}
                    t={t}
                    onSource={source}
                    onFix={(diagnostics) =>
                      draft({
                        id: crypto.randomUUID(),
                        title: t("problems.fixWithAgent"),
                        question: t("problems.request"),
                        context: `Main: ${frame.main}\nCompile: ${frame.status.run}\n\n${diagnostics.map(diagnosticText).join("\n\n")}`,
                        snapshot: frame.snapshot,
                        diagnostics: {
                          generation: frame.generation,
                          run: frame.status.run,
                          main: frame.main,
                        },
                        images: [],
                      })
                    }
                  />
                ) : (
                  <div className={styles.stack}>
                    {!frame.highlights.length && <p>{t("agent.empty")}</p>}
                    {frame.highlights.map((highlight) => (
                      <article
                        key={highlight.id}
                        data-annotation={highlight.id}
                        tabIndex={-1}
                        className={styles.entryCard}
                      >
                        <blockquote className={styles.annotationQuote}>
                          {highlight.quote}
                        </blockquote>
                        <p className={styles.annotationComment}>
                          {highlight.comment}
                        </p>
                        {highlight.stale ? (
                          <span className={styles.annotationStale}>
                            {t("agent.stale")}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() =>
                              void reader.current?.highlight(highlight)
                            }
                          >
                            {t("agent.view")} · {highlight.pageIndex + 1}
                          </Button>
                        )}
                        {highlight.source && (
                          <LinkButton
                            onClick={() =>
                              source(
                                highlight.source!.file,
                                highlight.source!.line,
                              )
                            }
                          >
                            {highlight.source.file}:{highlight.source.line}
                          </LinkButton>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
