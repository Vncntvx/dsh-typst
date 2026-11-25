/**
 * Every stable domain code crosses the wire as its own `typst/<reason>`.
 * @module tests/unit/remote-codes
 */
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import { expect, it } from "vitest";
import {
  rethrowRemote,
  TYPST_ERROR_CODES,
  TYPST_REMOTE_CODES,
  TypstError,
} from "../../src/errors.js";

it("maps every domain code to a unique typst remote code", () => {
  const remote = Object.values(TYPST_REMOTE_CODES);
  expect(TYPST_ERROR_CODES).toHaveLength(remote.length);
  expect(new Set(remote).size).toBe(remote.length);
  expect(remote.every((code) => code.startsWith("typst/"))).toBe(true);
  expect(remote).not.toContain("typst/domain");
});

it("rethrows every domain code with its own remote code and details", () => {
  for (const code of TYPST_ERROR_CODES) {
    try {
      rethrowRemote(new TypstError("domain failure", code));
      throw new Error("rethrowRemote returned");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteError);
      expect((error as RemoteError).code).toBe(TYPST_REMOTE_CODES[code]);
      expect((error as RemoteError).details).toEqual({ code });
    }
  }
});
