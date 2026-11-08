import { useState } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { TypstStateFrame } from "../contract.js";
import type { TypstNamespace } from "./remote.js";
import { installCommandFor } from "./setup-commands.js";
import type { FeedbackDraft, Translate } from "./types.js";
import styles from "./preview.module.css";

export function SetupPanel({
  frame,
  t,
  remote,
  sessionId,
  onRequest,
}: {
  frame: TypstStateFrame;
  t: Translate;
  remote: TypstNamespace;
  sessionId: string;
  onRequest: (draft: FeedbackDraft) => void;
}) {
  const [pending, setPending] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const command = frame.setup.facts
    ? installCommandFor(frame.setup.facts.os)
    : null;
  const action = async (kind: "recheck" | "restart"): Promise<void> => {
    setPending(kind);
    setError(null);
    try {
      const result = await remote[kind](sessionId as never);
      if (!result.ok) throw new Error(result.error.message);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setPending(null);
    }
  };
  return (
    <div className={styles.setup}>
      <h2>{t("setup.title")}</h2>
      <p>
        {frame.toolchain.state === "missing"
          ? t("setup.missing")
          : frame.toolchain.state === "too_old"
            ? t("setup.tooOld")
            : t("setup.unusable")}{" "}
        {"error" in frame.toolchain ? frame.toolchain.error : ""}
      </p>
      <Button
        disabled={pending !== null}
        onClick={() =>
          onRequest({
            id: crypto.randomUUID(),
            title: t("setup.reviewRequest"),
            question: t("setup.request"),
            context: [
              `OS: ${frame.setup.facts?.osName ?? "unknown"} (${frame.setup.facts?.arch ?? "unknown"})`,
              `Package managers: ${frame.setup.facts?.tools.map((tool) => tool.name).join(", ") ?? "unknown"}`,
              `Searched: ${frame.setup.searched.join(", ")}`,
              command
                ? `Suggested command: ${command}`
                : "OS unknown: determine the operating system before choosing an installation command.",
              "Verify the installed typst --version.",
            ].join("\n"),
            snapshot: null,
            images: [],
          })
        }
      >
        {t("setup.reviewRequest")}
      </Button>
      <h3>{t("setup.install")}</h3>
      <p>{command ?? t("setup.unknown")}</p>
      <div className={styles.inline}>
        <Button
          disabled={pending !== null}
          onClick={() => void action("recheck")}
        >
          {pending === "recheck" ? t("action.working") : t("setup.recheck")}
        </Button>
        <Button
          disabled={pending !== null}
          onClick={() => void action("restart")}
        >
          {pending === "restart" ? t("action.working") : t("setup.restart")}
        </Button>
      </div>
      {error && <div role="alert">{error}</div>}
      <details>
        <summary>{t("setup.searched")}</summary>
        {frame.setup.searched.map((path) => (
          <p key={path}>{path}</p>
        ))}
      </details>
    </div>
  );
}
