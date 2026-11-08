/** Bookmark destinations are preserved; source files never substitute for PDF outline data. */
export interface RawOutlineNode {
  readonly title: string;
  readonly dest: string | readonly unknown[] | null;
  readonly items: readonly RawOutlineNode[];
}
export interface OutlineEntry {
  readonly id: string;
  readonly title: string;
  readonly pageIndex: number | null;
  readonly depth: number;
  readonly destination: readonly unknown[] | null;
  readonly parentId: string | null;
  readonly hasChildren: boolean;
}
export interface OutlineDocument {
  getDestination(name: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}
export async function resolveOutline(
  document: OutlineDocument,
  nodes: readonly RawOutlineNode[],
): Promise<OutlineEntry[]> {
  const entries: OutlineEntry[] = [];
  async function walk(
    nodes: readonly RawOutlineNode[],
    depth: number,
    parentId: string | null,
  ): Promise<void> {
    for (const [index, node] of nodes.entries()) {
      const id = `${parentId ?? "root"}/${index}`;
      let destination =
        typeof node.dest === "string"
          ? await document.getDestination(node.dest)
          : node.dest;
      let pageIndex: number | null = null;
      if (Array.isArray(destination) && destination.length > 0) {
        const first = destination[0];
        pageIndex =
          typeof first === "number"
            ? first
            : await document.getPageIndex(first);
        if (
          pageIndex !== null &&
          (!Number.isInteger(pageIndex) || pageIndex < 0)
        )
          pageIndex = null;
      } else destination = null;
      entries.push({
        id,
        title: node.title,
        pageIndex,
        depth,
        destination,
        parentId,
        hasChildren: !!node.items?.length,
      });
      if (node.items?.length) await walk(node.items, depth + 1, id);
    }
  }
  await walk(nodes, 0, null);
  return entries;
}
