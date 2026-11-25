/**
 * The `typst` skill: the agent-facing guidance for working on Typst
 * documents with the workbench. Ported from the ZCode typst-workbench's
 * SKILL.md and adapted to this plugin's tool names and the panel's message
 * protocol. Host half only.
 * @module dsh-typst/skills
 */
import type { SkillRegistration } from "@deepseek-ai/dsh-skill";
/** The skill registration the service mounts. */
export declare function typstSkill(): SkillRegistration;
/** Register the skill on the host's skill registry. */
export declare function registerTypstSkill(ctx: import("@deepseek-ai/cordis").Context): void;
//# sourceMappingURL=typst.d.ts.map