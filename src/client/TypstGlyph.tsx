/**
 * The Typst mark for the right-sidebar guide: a lowercase `t` on
 * `currentColor`, sized by the guide capsule that draws it.
 */
import type { ReactNode } from "react";
import type { IconProps } from "@deepseek-ai/dsh-client-ui-primitives";

/** Draw the Typst mark at the requested size. */
export function TypstGlyph({ size = 16, className }: IconProps): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M6.95 2.3 8.55 2.95v2.55h3.15l-.4 1.35h-2.75v4.75c0 .55.22.82.66.82.4 0 .78-.22 1.1-.56l.6.98c-.5.5-1.15.78-1.9.78-1.35 0-2.06-.72-2.06-2.02V6.85H3.9l.4-1.35h2.65V2.3Z"
        fill="currentColor"
      />
    </svg>
  );
}
