/**
 * Text-link action: the one clickable-link language for prose-embedded
 * actions (a source location, a file:line reference).
 *
 * The host has no link-button primitive and the linked element is not a
 * `Button` (a filled or outlined control beside prose would outrank the
 * sentence it belongs to), so this plain `<button>` carries the harness
 * clickable-link dress itself: link blue at rest, weight 500, a dotted
 * 3px-offset underline on hover and keyboard focus, and the standard focus
 * ring. It is not a control adapter: nothing here is a host control's
 * material.
 * @module dsh-typst/client/LinkButton
 */

import { forwardRef, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";
import css from "./LinkButton.module.css";

/** Render one inline text-link action. */
export const LinkButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function LinkButton({ className, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(css.link, className)}
      {...rest}
    />
  );
});
