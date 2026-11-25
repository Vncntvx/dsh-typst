/**
 * Host facts for the setup page: OS name, architecture, and the package
 * managers that could install Typst. Probed once per session (and refreshed
 * when the setup page re-checks with the shell). Ported from the ZCode
 * typst-workbench server (0.2.0) `src/host/facts.ts`. Host half only.
 * @module dsh-typst/host/facts
 */
import type { HostFactsView } from "../contract.js";
interface PmSpec {
    name: string;
    bin: string;
    dirs: string[];
    version?: {
        args: string[];
        pattern: RegExp;
    };
}
/** Extra specs to probe alongside the platform defaults (cargo, for typst). */
export declare function cargoSpec(env: NodeJS.ProcessEnv): PmSpec;
/**
 * Detect the host facts the setup page shows: OS, architecture, and every
 * package manager that could install Typst.
 */
export declare function detectFacts(extra?: PmSpec[], options?: {
    env?: NodeJS.ProcessEnv;
    platform?: string;
    home?: string;
    arch?: string;
}): Promise<HostFactsView>;
export {};
//# sourceMappingURL=facts.d.ts.map