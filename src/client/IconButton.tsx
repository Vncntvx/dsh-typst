/**
 * Icon-only control built on the host `Button`.
 *
 * `ui-primitives` has no square icon-only variant, so this adapter supplies
 * geometry and the persistent toggled-on dress only; fill, hover, pressed,
 * focus, disabled state and typography stay the host's. The style guard
 * (`scripts/shared/control-style-ownership.mjs`) permits this file to own the
 * geometry properties and the `aria-pressed` state, and refuses those
 * declarations anywhere else.
 * @module dsh-typst/client/IconButton
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import css from "./IconButton.module.css";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 28px (header tool) or 20px (inline row control). */
  readonly size?: "md" | "sm";
  /** The host Button's visual variant; defaults to ghost. */
  readonly variant?: "ghost" | "outline";
  /** `true` for a control that stays on: the harness's persistent `aria-pressed` dress. */
  readonly selected?: boolean;
  /** The glyph, rendered through the host Button's icon seat. */
  readonly icon: ReactNode;
}

/** Render one icon-only button over the official Button primitive. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      size = "md",
      variant = "ghost",
      selected = false,
      icon,
      className,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        type={type}
        variant={variant}
        size="sm"
        icon={icon}
        aria-pressed={selected || undefined}
        className={clsx(css.iconButton, css[size], className)}
        {...rest}
      />
    );
  },
);
