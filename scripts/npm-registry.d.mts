export interface RegistryMetadata {
  name: string;
  version: string;
  dist: { tarball: string; integrity?: string };
}
export function assertRegistryArtifact(
  metadata: RegistryMetadata,
  manifest: { name: string; version: string },
  bytes: Uint8Array,
): void;
export function registryVersion(
  name: string,
  version: string,
  options?: {
    fetchImpl?: typeof fetch;
    delay?: (ms: number) => Promise<void>;
    maxAttempts?: number;
    delayMs?: number;
    waitForPublication?: boolean;
  },
): Promise<RegistryMetadata | undefined>;
export function registryTarball(
  metadata: RegistryMetadata,
  manifest: { name: string; version: string },
  expectedBytes: Uint8Array,
  options?: {
    fetchImpl?: typeof fetch;
    delay?: (ms: number) => Promise<void>;
    maxAttempts?: number;
    delayMs?: number;
  },
): Promise<Buffer>;
