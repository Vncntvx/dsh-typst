import { useEffect, useState } from "react";
import { Button, Tag } from "@deepseek-ai/dsh-client-ui-primitives";
import type { DiagnosticView, TypstStateFrame } from "../contract.js";
import type { Translate } from "./types.js";
import styles from "./preview.module.css";

export function diagnosticText(diagnostic: DiagnosticView): string {
  return [
    `${diagnostic.severity}: ${diagnostic.message}`,
    diagnostic.location
      ? `${diagnostic.location.file}:${diagnostic.location.line}:${diagnostic.location.column}`
      : "",
    diagnostic.excerpt ?? "",
    ...diagnostic.hints.map((hint) => `hint: ${hint}`),
    ...diagnostic.trace.map(
      (point) =>
        `${point.location ? `${point.location.file}:${point.location.line}` : ""} ${point.message}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export function ProblemsPanel({
  frame,
  t,
  onFix,
  onSource,
}: {
  frame: TypstStateFrame;
  t: Translate;
  onFix: (diagnostics: DiagnosticView[]) => void;
  onSource: (file: string, line: number) => void;
}) {
  const [severity, setSeverity] = useState("all"),
    [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => setSelected(new Set()), [frame.status.run, frame.generation]);
  const visible = frame.diagnostics
    .map((diagnostic, index) => ({ diagnostic, index }))
    .filter(
      ({ diagnostic }) =>
        severity === "all" || diagnostic.severity === severity,
    );
  return (
    <div className={styles.stack}>
      <div className={styles.inline}>
        <select
          aria-label={t("problems.filter")}
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
        >
          <option value="all">{t("problems.all")}</option>
          <option value="error">{t("status.error")}</option>
          <option value="warning">{t("status.warnings")}</option>
        </select>
        <Button
          size="sm"
          onClick={() =>
            setSelected(new Set(visible.map((item) => item.index)))
          }
        >
          {t("problems.selectAll")}
        </Button>
        <Button
          size="sm"
          disabled={!selected.size}
          onClick={() =>
            onFix(frame.diagnostics.filter((_, index) => selected.has(index)))
          }
        >
          {t("problems.fixSelected")} ({selected.size})
        </Button>
      </div>
      {!visible.length && <p>{t("problems.empty")}</p>}
      {visible.map(({ diagnostic, index }) => (
        <article
          key={`${frame.status.run}:${index}`}
          className={styles.problemCard}
        >
          <div className={styles.problemHeader}>
            <label className={styles.problemSelect}>
              <input
                type="checkbox"
                aria-label={`${t("problems.select")} ${diagnostic.message}`}
                checked={selected.has(index)}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(index);
                    else next.delete(index);
                    return next;
                  })
                }
              />
            </label>
            <Tag
              tone={diagnostic.severity === "error" ? "danger" : "warning"}
              className={styles.problemTag}
            >
              {diagnostic.severity === "error"
                ? t("status.error")
                : t("status.warnings")}
            </Tag>
            <div className={styles.problemMessage}>{diagnostic.message}</div>
          </div>
          <div className={styles.problemActions}>
            {diagnostic.location ? (
              <Button
                size="sm"
                className={styles.problemLocation}
                onClick={() =>
                  onSource(diagnostic.location!.file, diagnostic.location!.line)
                }
              >
                {diagnostic.location.file}:{diagnostic.location.line}:
                {diagnostic.location.column}
              </Button>
            ) : (
              <span className={styles.problemUnavailable}>
                {t("source.unavailable")}
              </span>
            )}
            <Button size="sm" onClick={() => onFix([diagnostic])}>
              {t("problems.fixWithAgent")}
            </Button>
          </div>
          {diagnostic.excerpt ||
          diagnostic.hints.length ||
          diagnostic.trace.length ? (
            <details className={styles.problemDetails}>
              <summary>{t("problems.details")}</summary>
              <div className={styles.problemDetailsContent}>
                {diagnostic.excerpt && <pre>{diagnostic.excerpt}</pre>}
                {diagnostic.hints.map((hint, i) => (
                  <p key={i} className={styles.problemHint}>
                    <strong>{t("problems.hint")}:</strong> {hint}
                  </p>
                ))}
                {diagnostic.trace.map((point, i) => (
                  <div key={i} className={styles.problemTrace}>
                    {point.location ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          onSource(point.location!.file, point.location!.line)
                        }
                      >
                        {point.location.file}:{point.location.line}
                      </Button>
                    ) : (
                      <span>{t("source.unavailable")}</span>
                    )}{" "}
                    <span>{point.message}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}
