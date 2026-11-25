/**
 * The panel must open the compiler's file, not a path resolved against a cwd
 * the user has since changed.
 * @module tests/client/source
 */
import { expect, it } from "vitest";
import { workspaceSourceAddress } from "../../src/client/source.js";

it("binds a workspace-relative source path to absolute workspace root", () => {
  expect(workspaceSourceAddress("session", "/test", "main.typ")).toBe(
    "dsh-resource://file/session/session//test/main.typ",
  );
  expect(
    workspaceSourceAddress("session", "/test/sub/", "chapters/one.typ"),
  ).toBe("dsh-resource://file/session/session//test/sub/chapters/one.typ");
  expect(workspaceSourceAddress("session", "C:\\test", "main.typ")).toBe(
    "dsh-resource://file/session/session/C:/test/main.typ",
  );
});

it("refuses paths the workspace root cannot confine", () => {
  expect(
    workspaceSourceAddress("session", "/test", "../shared.typ"),
  ).toBeUndefined();
  expect(
    workspaceSourceAddress("session", "/test", "/etc/passwd"),
  ).toBeUndefined();
  expect(
    workspaceSourceAddress("session", "/test", "C:/outside.typ"),
  ).toBeUndefined();
  expect(
    workspaceSourceAddress("session", undefined, "main.typ"),
  ).toBeUndefined();
  expect(workspaceSourceAddress("session", "/test", "")).toBeUndefined();
});
