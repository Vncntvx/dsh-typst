/** The release channel guards the publishing workflow applies before a ref moves. */
export interface ReleaseSourceFacts {
  actualSha: string;
  expectedSha: string;
  status: string;
}
export interface ReleaseTargetFacts {
  branch: string;
  remote: string;
  remoteUrl?: string;
}
export interface ReleaseChannelState {
  sourceSha: string;
  artifactDigest: string;
}
export const RELEASE_CHANNELS: readonly string[];
export function assertReleaseSource(source: ReleaseSourceFacts): void;
export function assertReleaseTarget(target: ReleaseTargetFacts): void;
export function assertReleaseAdvance(advance: {
  branch: string;
  sourceSha: string;
  mainSha: string;
  previous: ReleaseChannelState | undefined;
  sourceDescendsFromPrevious: boolean;
  mainDescendsFromSource: boolean;
  artifactDigest: string;
}): void;
