/**
 * The `typst` skill: every agent tool it names exists, and the registration
 * goes through the host's skills service.
 * @module tests/skills/typst
 */

import { describe, expect, it } from "vitest";
import type { SkillRegistration } from "@deepseek-ai/dsh-skill";
import { TYPST_TOOL_NAMES } from "../../src/constants.js";
import { registerTypstSkill, typstSkill } from "../../src/skills/typst.js";

describe("typst skill", () => {
  it("names every registered tool and is model/user invocable", () => {
    const skill = typstSkill();
    expect(skill.name).toBe("typst");
    expect(skill.invocation).toEqual({
      modelInvocable: true,
      userInvocable: true,
    });
    for (const tool of TYPST_TOOL_NAMES) expect(skill.content).toContain(tool);
  });

  it("registers through the skills service", () => {
    let registered: SkillRegistration | undefined;
    const ctx = {
      inject: (deps: string[], body: (host: unknown) => void) => {
        expect(deps).toEqual(["skills"]);
        body({
          effect: (fn: () => () => void) => fn(),
          skills: {
            register: (skill: SkillRegistration) => {
              registered = skill;
              return () => undefined;
            },
          },
        });
      },
    };
    registerTypstSkill(ctx as never);
    expect(registered?.name).toBe("typst");
  });
});
