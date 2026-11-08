import type { SourceMatch } from "../contract.js";
import type { TypstNamespace } from "./remote.js";
/** Source matching enriches feedback; lack of a match never forbids it. */
export async function resolveSelection(
  remote: TypstNamespace,
  sessionId: string,
  text: string,
  focus: string | null = null,
  signal?: AbortSignal,
): Promise<SourceMatch[]> {
  const result = await remote.locateSource(
    sessionId as never,
    text.trim(),
    focus,
    signal,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.value.matches;
}
