import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { SnapshotView, TypstStateFrame } from "../contract.js";
import type { FeedbackBridge } from "./conversation.js";
import { useViewStore, type PreviewViewStore } from "./view-state.js";
import { diagnosticText } from "./ProblemsPanel.js";
import {
  identityKey,
  errorText,
  type FeedbackDraft,
  type Translate,
} from "./types.js";
import styles from "./preview.module.css";

export function feedbackText(draft: FeedbackDraft): string {
  const source = draft.source;
  return [
    draft.question,
    draft.context,
    draft.text ? `Selected text:\n${draft.text}` : "",
    source
      ? `Approximate source: ${source.file}:${source.line}-${source.endLine}\n${source.excerpt}`
      : "",
    ...draft.images.map(
      (image) =>
        `Region: ${image.main}, page ${image.page}, PDF rect [${image.rect.join(", ")}], snapshot ${identityKey(image.identity)}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function FeedbackPanel({
  draft,
  current,
  frame,
  bridge,
  store,
  t,
}: {
  draft: FeedbackDraft;
  current: SnapshotView | null;
  frame: TypstStateFrame;
  bridge: FeedbackBridge;
  store: PreviewViewStore;
  t: Translate;
}) {
  const { sending: busy, feedbackError: error, progress } = useViewStore(store);
  const update = (change: Partial<FeedbackDraft>): void =>
    store.update({ feedback: { ...draft, ...change } });
  const stale =
    draft.snapshot &&
    (!current || identityKey(draft.snapshot) !== identityKey(current));
  const diagnosticsStale =
    draft.diagnostics &&
    (draft.diagnostics.generation !== frame.generation ||
      draft.diagnostics.run !== frame.status.run ||
      draft.diagnostics.main !== frame.main);
  const submit = async (): Promise<void> => {
    if (store.getSnapshot().sending) return;
    store.update({ sending: true, feedbackError: null, progress: "" });
    const controller = new AbortController();
    let accepted = false;
    try {
      await bridge.submit(
        draft,
        feedbackText(draft),
        controller.signal,
        (loaded, total) =>
          store.update({
            progress: total
              ? `${Math.round((loaded / total) * 100)}%`
              : `${loaded}`,
          }),
        () => {
          if (accepted) return;
          accepted = true;
          if (store.getSnapshot().feedback?.id === draft.id) {
            draft.images.forEach((image) => URL.revokeObjectURL(image.url));
            store.update({ feedback: null, notice: t("feedback.accepted") });
          }
        },
      );
    } catch (failure) {
      if (!accepted) store.update({ feedbackError: errorText(failure) });
    } finally {
      store.update({ sending: false });
    }
  };
  return (
    <section className={styles.feedback} aria-label={t("feedback.review")}>
      <strong>{draft.title}</strong>
      <Button
        size="sm"
        onClick={() => store.update({ feedbackExpanded: false })}
      >
        {t("feedback.hide")}
      </Button>
      {stale && <p role="status">{t("feedback.oldSnapshot")}</p>}
      {diagnosticsStale && (
        <div role="status">
          {t("feedback.oldDiagnostics")}
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              update({
                context: `Main: ${frame.main}\nCompile: ${frame.status.run}\n\n${frame.diagnostics.map(diagnosticText).join("\n\n")}`,
                diagnostics: {
                  generation: frame.generation,
                  run: frame.status.run,
                  main: frame.main,
                },
                snapshot: frame.snapshot,
              })
            }
          >
            {t("feedback.updateDiagnostics")}
          </Button>
        </div>
      )}
      <label>
        {t("feedback.question")}
        <textarea
          disabled={busy}
          value={draft.question}
          onChange={(event) => update({ question: event.target.value })}
        />
      </label>
      <label>
        {t("feedback.context")}
        <textarea
          disabled={busy}
          value={draft.context}
          onChange={(event) => update({ context: event.target.value })}
        />
      </label>
      {draft.text && <blockquote>{draft.text}</blockquote>}
      {draft.matches && (
        <label>
          {t("selection.sourceApproximate")}
          <select
            disabled={busy}
            value={
              draft.source ? String(draft.matches.indexOf(draft.source)) : ""
            }
            onChange={(event) =>
              update({
                source:
                  event.target.value === ""
                    ? null
                    : draft.matches![Number(event.target.value)],
              })
            }
          >
            <option value="">{t("source.unspecified")}</option>
            {draft.matches.map((match, index) => (
              <option key={index} value={index}>
                {match.file}:{match.line} · {Math.round(match.score * 100)}%
              </option>
            ))}
          </select>
        </label>
      )}
      {draft.images.map((image) => (
        <figure key={image.id}>
          <img
            src={image.url}
            alt={`${image.main} · ${t("page.label")} ${image.page}`}
          />
          <figcaption>
            {image.main} · {t("page.label")} {image.page} ·{" "}
            {image.rect.map((value) => value.toFixed(1)).join(", ")}
          </figcaption>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              URL.revokeObjectURL(image.url);
              update({
                images: draft.images.filter((item) => item.id !== image.id),
              });
            }}
          >
            {t("action.remove")}
          </Button>
        </figure>
      ))}
      {error && <div role="alert">{error}</div>}
      <div className={styles.inline}>
        <Button
          size="sm"
          disabled={busy || !draft.question.trim()}
          onClick={() => void submit()}
        >
          {busy
            ? `${t("feedback.submitting")} ${progress}`
            : t("feedback.submit")}
        </Button>
        {!draft.images.length && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              store.update({ sending: true, feedbackError: null });
              void bridge
                .append(feedbackText(draft))
                .then(() =>
                  store.update({ notice: t("feedback.added"), feedback: null }),
                )
                .catch((failure) =>
                  store.update({ feedbackError: errorText(failure) }),
                )
                .finally(() => store.update({ sending: false }));
            }}
          >
            {t("selection.addToChat")}
          </Button>
        )}
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            draft.images.forEach((image) => URL.revokeObjectURL(image.url));
            store.update({ feedback: null });
          }}
        >
          {t("action.discard")}
        </Button>
      </div>
    </section>
  );
}
