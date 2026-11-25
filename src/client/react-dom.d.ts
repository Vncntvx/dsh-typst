/**
 * The browser bundle keeps `react-dom` external on the shell's module table,
 * and this repository carries no `@types/react-dom` package. Only `createPortal`
 * is used, so the client graph declares that one typed seam locally.
 */
declare module "react-dom" {
  import type { ReactNode } from "react";
  export function createPortal(
    children: ReactNode,
    container: Element | DocumentFragment,
  ): ReactNode;
}
