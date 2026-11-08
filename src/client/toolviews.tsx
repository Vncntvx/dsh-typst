/**
 * The Typst panel's tool cards: the `typst_render_pages` card shows the
 * rendered page images inline (they ride the call's presentation meta, the
 * sanctioned replayable channel); every other tool keeps the generic card.
 * @module dsh-typst/client/toolviews
 */

import { createElement } from "react";
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
  images?: { page: number; dataUrl: string }[];
}

/**
 * The `typst_render_pages` card: the rendered pages as images.
 * @param props - the runtime block and locale props.
 */
export function RenderPagesToolView(
  props: RenderToolViewProps,
): ReturnType<typeof createElement> {
  const meta: RenderMeta | null =
    props.block !== undefined &&
    typeof props.block === "object" &&
    props.block !== null &&
    "meta" in props.block &&
    typeof props.block.meta === "object" &&
    props.block.meta !== null
      ? (props.block.meta as RenderMeta)
      : null;
  const images = meta?.images ?? [];
  if (images.length === 0) return createElement("div", null);
  return createElement(
    "div",
    { className: styles.renderGrid },
    images.map((image) =>
      createElement("img", {
        key: image.page,
        className: styles.renderImage,
        src: image.dataUrl,
        alt: `page ${image.page}`,
      }),
    ),
  );
}

/** The toolview registrations, keyed by tool name (one card; the rest are generic). */
export const TOOLVIEW_REGISTRATIONS = [
  ["typst_render_pages", RenderPagesToolView],
] as const;
