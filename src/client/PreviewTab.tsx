import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  Button,
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
} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type { TypstStateFrame } from "../contract.js";
import { typstStateAddress, type TypstNamespace } from "./remote.js";
import { MainFileMenu } from "./MainFileMenu.js";
import { ProblemsPanel, diagnosticText } from "./ProblemsPanel.js";
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
  PreviewViewRegistry,
  initialPosition,
  useViewStore,
} from "./view-state.js";
import { resolveSelection } from "./selection.js";
import type { FeedbackBridge } from "./conversation.js";
import {
  identityKey,
  errorText,
  type FeedbackDraft,
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
  views: PreviewViewRegistry;
}
export type PreviewTabProps = PropsRuntime<"sidebar.right.pane.tab"> &
  InjectFace<PreviewTabInjected> &
  PropsLocale<"typst">;
export function PreviewTab({
  sessionId,
  t,
  remote,
  bridge,
  views,
  useResource,
  useTabInfo,
}: PreviewTabProps) {
  const [subscription, setSubscription] = useState(0);
  const resource = useResource<"typst">(
    `${typstStateAddress(sessionId as never)}?subscription=${subscription}`,
  );
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
  const viewStore = views.for(sessionId, info.tab.id, info.tab.signal);
  const state = useViewStore(viewStore);
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
  const requests = state.requests;
  const selectSeq = useRef(0);
  const selectAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    selectSeq.current++;
    selectAbort.current?.abort();
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    return () => {
      selectSeq.current++;
      selectAbort.current?.abort();
    };
  }, [loaded?.snapshot.generation, loaded?.snapshot.seq]);
  const setRequests = (
    update: (current: typeof requests) => typeof requests,
  ): void =>
    viewStore.update({ requests: update(viewStore.getSnapshot().requests) });
  const refresh = useCallback(() => {
    setRetry((value) => value + 1);
    setSubscription((value) => value + 1);
    void remote
      .status(sessionId as never)
      .then((result) => {
        if (!result.ok) viewStore.update({ notice: result.error.message });
      })
      .catch((failure) => viewStore.update({ notice: errorText(failure) }));
  }, [remote, sessionId, viewStore]);
  useEffect(
    () => info.tab.actions.bindCommands({ refresh }),
    [info.tab.actions, refresh],
  );
  useEffect(() => {
    if (!frame) return;
    if (frame.main !== state.main) {
      viewStore.update({ main: frame.main });
      setSelection(null);
      setRegion(false);
    }
    if (frame.view && frame.viewSeq > viewStore.getSnapshot().seenRequest) {
      viewStore.update({ seenRequest: frame.viewSeq });
      setRequests((current) => [
        ...current,
        { seq: frame.viewSeq, view: frame.view! },
      ]);
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
      if (frame?.main)
        viewStore.update({
          positions: {
            ...viewStore.getSnapshot().positions,
            [frame.main]: position,
          },
        });
    },
    [frame?.main, viewStore],
  );
  const draft = (value: FeedbackDraft): void => {
    if (viewStore.getSnapshot().feedback) {
      viewStore.update({ notice: t("feedback.finishDraft") });
      return;
    }
    viewStore.update({
      feedback: value,
      feedbackExpanded: true,
      feedbackError: null,
      progress: "",
    });
  };
  const source = (file: string, line: number): void => {
    const normalized = file.replaceAll("\\", "/");
    if (
      normalized.startsWith("/") ||
      normalized.split("/").includes("..") ||
      /^[A-Za-z]:/.test(normalized)
    ) {
      viewStore.update({ notice: t("source.unavailable") });
      return;
    }
    try {
      info.tab.actions.openResource(
        `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${normalized.split("/").map(encodeURIComponent).join("/")}`,
        { params: { line }, preferNewPane: true },
      );
    } catch (failure) {
      viewStore.update({ notice: errorText(failure) });
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
        viewStore.update({ notice: t("feedback.added") });
      } catch (failure) {
        viewStore.update({ notice: errorText(failure) });
      }
      return;
    }
    if (state.feedback) {
      viewStore.update({ notice: t("feedback.finishDraft") });
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
    draft(value);
    try {
      const matches = await resolveSelection(
        remote,
        sessionId,
        selection.text,
        loaded.snapshot.main,
        controller.signal,
      );
      if (
        token === selectSeq.current &&
        viewStore.getSnapshot().feedback?.id === value.id
      )
        viewStore.update({
          feedback: {
            ...viewStore.getSnapshot().feedback!,
            matches,
            source: matches.length === 1 ? matches[0] : null,
          },
        });
    } catch (failure) {
      if (!controller.signal.aborted)
        viewStore.update({ notice: errorText(failure) });
    }
  };
  const addImage = (image: RegionImage): void => {
    const current = viewStore.getSnapshot().feedback;
    if (current && current.images.length === 0) {
      URL.revokeObjectURL(image.url);
      viewStore.update({ notice: t("feedback.finishDraft") });
      return;
    }
    viewStore.update({
      feedbackExpanded: true,
      feedback: current
        ? { ...current, images: [...current.images, image] }
        : {
            id: crypto.randomUUID(),
            title: t("region.title"),
            question: "",
            context: `Typst preview: ${image.main}`,
            snapshot: loaded?.snapshot ?? null,
            images: [image],
          },
    });
    setRegion(false);
  };
  const height = state.auxiliary ? `${state.auxiliaryHeight * 100}%` : "0";
  const position = state.positions[frame?.main ?? ""] ?? initialPosition();

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
      statusLabel = `${errorsCount} ${t("status.errorCount")}`;
    } else if (warningsCount > 0) {
      statusTone = "warning";
      statusLabel = `${warningsCount} ${t("status.warningCount")}`;
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
        <div className={styles.headerCenter} role="status">
          {frame ? (
            <span
              role={errorsCount > 0 || warningsCount > 0 ? "button" : undefined}
              tabIndex={errorsCount > 0 || warningsCount > 0 ? 0 : undefined}
              style={{
                cursor:
                  errorsCount > 0 || warningsCount > 0 ? "pointer" : "default",
              }}
              onClick={() => {
                if (errorsCount > 0 || warningsCount > 0) {
                  viewStore.update({ auxiliary: "problems" });
                }
              }}
              onKeyDown={(e) => {
                if (
                  (e.key === "Enter" || e.key === " ") &&
                  (errorsCount > 0 || warningsCount > 0)
                ) {
                  viewStore.update({ auxiliary: "problems" });
                }
              }}
            >
              <Tag tone={statusTone} className={styles.statusTag}>
                {statusLabel}
              </Tag>
            </span>
          ) : (
            <Tag tone="neutral" className={styles.statusTag}>
              {resource.status === "failed"
                ? t("preview.failed")
                : t("status.starting")}
            </Tag>
          )}
        </div>
        <div className={styles.headerRight}>
          <Tooltip label={t("action.refresh")} side="bottom" delayMs={300}>
            <Button
              variant="ghost"
              size="sm"
              className={styles.headerTool}
              aria-label={t("action.refresh")}
              icon={<IconRefreshOutlineRegular size={16} />}
              onClick={refresh}
            />
          </Tooltip>
          {frame && (
            <>
              <Tooltip label={t("region.title")} side="bottom" delayMs={300}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${styles.headerTool} ${region ? styles.headerToolActive : ""}`}
                  aria-label={t("region.title")}
                  aria-pressed={region}
                  disabled={!loaded}
                  icon={<IconInspectOutlineRegular size={16} />}
                  onClick={() => {
                    if (state.feedback && !state.feedback.images.length)
                      viewStore.update({ notice: t("feedback.finishDraft") });
                    else setRegion((value) => !value);
                  }}
                />
              </Tooltip>
              <Tooltip label={t("aux.label")} side="bottom" delayMs={300}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${styles.headerTool} ${state.auxiliary ? styles.headerToolActive : ""}`}
                  aria-label={t("aux.label")}
                  icon={<IconFlatListOutlineRegular size={16} />}
                  onClick={() =>
                    viewStore.update({
                      auxiliary: state.auxiliary
                        ? null
                        : errorsCount > 0
                          ? "problems"
                          : "outline",
                    })
                  }
                >
                  {errorsCount > 0 && (
                    <span className={styles.auxBadge}>{errorsCount}</span>
                  )}
                </Button>
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
      {state.notice && (
        <div className={styles.notice} role="status">
          {state.notice}
          <Button size="sm" onClick={() => viewStore.update({ notice: null })}>
            {t("action.close")}
          </Button>
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
                              viewStore.update({ auxiliary: "annotations" });
                            }
                            setRequests((current) =>
                              current.filter(
                                (item) => item.seq !== request.seq,
                              ),
                            );
                          }}
                        >
                          {t("agent.view")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            setRequests((current) =>
                              current.filter(
                                (item) => item.seq !== request.seq,
                              ),
                            )
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
                history={state.histories[frame.main ?? ""]}
                onHistory={(history) =>
                  viewStore.update({
                    histories: {
                      ...viewStore.getSnapshot().histories,
                      [frame.main ?? ""]: history,
                    },
                  })
                }
                t={t}
                retry={retry}
                region={region}
                onCancelRegion={() => setRegion(false)}
                onImage={addImage}
                onPosition={onPosition}
                onLoaded={setLoaded}
                onText={(text, page, endPage) =>
                  setSelection({ text, page, endPage })
                }
                onComment={(id) => {
                  viewStore.update({ auxiliary: "annotations" });
                  requestAnimationFrame(() =>
                    root.current
                      ?.querySelector<HTMLElement>(`[data-annotation="${id}"]`)
                      ?.focus(),
                  );
                }}
                onOpenProblems={() =>
                  viewStore.update({ auxiliary: "problems" })
                }
              />
              {selection && (
                <div className={styles.inline}>
                  <Button size="sm" onClick={() => void textDraft(false)}>
                    {t("selection.addToChat")}
                  </Button>
                  <Button size="sm" onClick={() => void textDraft(true)}>
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
          {state.feedback && !state.feedbackExpanded && (
            <Button
              size="sm"
              onClick={() => viewStore.update({ feedbackExpanded: true })}
            >
              {t("feedback.review")}
            </Button>
          )}
          {state.feedback && state.feedbackExpanded && (
            <FeedbackPanel
              key={state.feedback.id}
              draft={state.feedback}
              current={frame.snapshot}
              frame={frame}
              bridge={bridge}
              store={viewStore}
              t={t}
            />
          )}
          {state.auxiliary && (
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
                aria-valuenow={Math.round(state.auxiliaryHeight * 100)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    viewStore.update({
                      auxiliaryHeight: Math.max(
                        0.15,
                        Math.min(
                          0.6,
                          state.auxiliaryHeight +
                            (event.key === "ArrowUp" ? 0.05 : -0.05),
                        ),
                      ),
                    });
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
                  viewStore.update({
                    auxiliaryHeight: Math.max(
                      0.15,
                      Math.min(
                        0.6,
                        (rect.bottom - event.clientY) / rect.height,
                      ),
                    ),
                  });
                }}
              />
              <div className={styles.auxiliaryHeader}>
                <SegmentedTabs
                  size="sm"
                  label={t("aux.label")}
                  value={state.auxiliary}
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
                  onChange={(value) => viewStore.update({ auxiliary: value })}
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
                    onClick={() => viewStore.update({ auxiliary: null })}
                  >
                    {t("action.close")}
                  </Button>
                </div>
              </div>
              <div
                id={auxiliaryId}
                role="tabpanel"
                aria-labelledby={`${auxiliaryId}-${state.auxiliary}`}
                className={styles.auxiliaryBody}
              >
                {state.auxiliary === "outline" ? (
                  <OutlinePanel
                    entries={outline}
                    error={outlineError}
                    t={t}
                    currentPage={position.pageIndex}
                    onNavigate={(entry) => {
                      void reader.current
                        ?.outline(entry)
                        .catch((failure) =>
                          viewStore.update({ notice: errorText(failure) }),
                        );
                    }}
                    onRetry={() => setOutlineRetry((value) => value + 1)}
                    collapsedIds={
                      state.outlineCollapsed[frame.main ?? ""] ?? []
                    }
                    onCollapsed={(ids) =>
                      viewStore.update({
                        outlineCollapsed: {
                          ...viewStore.getSnapshot().outlineCollapsed,
                          [frame.main ?? ""]: ids,
                        },
                      })
                    }
                  />
                ) : state.auxiliary === "problems" ? (
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
                        className={styles.problem}
                      >
                        <blockquote>{highlight.quote}</blockquote>
                        <p>{highlight.comment}</p>
                        {highlight.stale ? (
                          <span>{t("agent.stale")}</span>
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
                          <Button
                            size="sm"
                            onClick={() =>
                              source(
                                highlight.source!.file,
                                highlight.source!.line,
                              )
                            }
                          >
                            {highlight.source.file}:{highlight.source.line}
                          </Button>
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
