/**
 * The file chooser's grouping: which of the workspace's `.typ` files are
 * unclassified, and which are dependencies of the current main file.
 *
 * Typst's dependency report names the fragments. Other files have no
 * proven standalone compile semantics; the chooser must not imply otherwise.
 * @module dsh-typst/client/candidates
 */

/** The chooser's two groups, in the order the menu lists them. */
export interface CandidateGroups {
  /** Files not reported as dependencies; independent compilation is unverified. */
  readonly others: string[];
  /** The files the current document includes; listed apart from the rest. */
  readonly fragments: string[];
}

/**
 * Split the workspace's `.typ` files into other files and known fragments.
 *
 * A fragment that is not among the candidates is ignored: the host reports
 * what it loaded, and a file outside the candidate set is not on the menu.
 * @param candidates - every `.typ` file in the workspace.
 * @param fragments - the candidates the current document includes.
 * @returns the two groups, each keeping the candidate order.
 */
export function groupCandidates(
  candidates: readonly string[],
  fragments: readonly string[],
): CandidateGroups {
  const included = new Set(fragments);
  return {
    others: candidates.filter((candidate) => !included.has(candidate)),
    fragments: candidates.filter((candidate) => included.has(candidate)),
  };
}
