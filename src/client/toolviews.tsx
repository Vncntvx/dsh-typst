/**
 * The Typst panel's tool cards: the `typst_render_pages` card resolves the
 * durable image attachments from the result content and shows them inline.
 * The attachment bytes never ride the card metadata; `loadImage` is the
 * Gateway-authorized loader every Tool view receives.
 * @module dsh-typst/client/toolviews
 */

import type { ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import { createElement, useEffect, useState } from "react";
import type {} from "@deepseek-ai/dsh-client-ui-tool/client";
import type {
  PropsLocale,
  PropsRuntime,
} from "@deepseek-ai/dsh-client-ui-slots";
import { NS } from "./locales.js";
import styles from "./preview.module.css";

type RenderToolViewProps = PropsRuntime<
  "tool.call.toolview",
  "typst_render_pages"
> &
  PropsLocale<typeof NS>;

interface RenderMeta {
  pages?: number[];
  total?: number;
  images?: { page: number; attachment: ImageAttachmentRef }[];
}

/** Narrow the persisted metadata; malformed replay data declines to text. */
function renderMeta(block: unknown): RenderMeta | null {
  if (
    block === undefined ||
    typeof block !== "object" ||
    block === null ||
    !("meta" in block) ||
    typeof block.meta !== "object" ||
    block.meta === null
  )
    return null;
  const meta = block.meta as Record<string, unknown>;
  const images = meta.images;
  if (!Array.isArray(images)) return { ...meta, images: [] } as RenderMeta;
  const checked: { page: number; attachment: ImageAttachmentRef }[] = [];
  for (const entry of images) {
    if (typeof entry !== "object" || entry === null) continue;
    const value = entry as Record<string, unknown>;
    if (typeof value.page !== "number" || !Number.isInteger(value.page))
      continue;
    if (typeof value.attachment !== "object" || value.attachment === null)
      continue;
    checked.push({
      page: value.page,
      attachment: value.attachment as ImageAttachmentRef,
    });
  }
  return { ...meta, images: checked } as RenderMeta;
}

/** The model-facing text of a settled result, used when no image was returned. */
function resultText(block: unknown): string {
  if (typeof block !== "object" || block === null || !("content" in block))
    return "";
  const content = block.content;
  if (!Array.isArray(content)) return "";
  const text = content
    .filter(
      (part): part is { type: "text"; text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
  return text;
}

/**
 * The `typst_render_pages` card: the rendered pages as images, or the
 * model-facing text when the call has not settled or returned no image.
 * @param props - the runtime block, image loader and locale props.
 */
export function RenderPagesToolView(
  props: RenderToolViewProps,
): ReturnType<typeof createElement> {
  const meta = renderMeta(props.block);
  const images = meta?.images ?? [];
  const [urls, setUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    let cancelled = false;
    for (const image of images) {
      void props
        .loadImage(image.attachment)
        .then((url) => {
          if (!cancelled) {
            setUrls((previous) => ({ ...previous, [image.page]: url }));
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [props.block, props.loadImage]);

  if (images.length === 0) {
    const text = resultText(props.block);
    return createElement(
      "div",
      { className: styles.resultCard },
      text.length > 0 ? text : "Rendering pages…",
    );
  }
  return createElement(
    "div",
    { className: styles.renderGrid },
    images.map((image) => {
      const url = urls[image.page];
      return url === undefined
        ? createElement(
            "div",
            { key: image.page, className: styles.renderImage },
            `${props.t("page.label")} ${image.page}`,
          )
        : createElement("img", {
            key: image.page,
            className: styles.renderImage,
            src: url,
            alt: `${props.t("page.label")} ${image.page}`,
          });
    }),
  );
}

/** The toolview registrations, keyed by tool name (one card; the rest are generic). */
export const TOOLVIEW_REGISTRATIONS = [
  ["typst_render_pages", RenderPagesToolView],
] as const;
