import { describe, expect, it } from "vitest";
import { isReservedPath, RESERVED_PATH_ERROR } from "#lib/reserved-paths.js";

describe("isReservedPath", () => {
  it.each([
    "eve/memory/file/someone.md",
    "eve/memory/",
    "eve/memory",
    "user-preferences/U123.json",
    "user-preferences/",
  ])("refuses %s", (pathname) => {
    expect(isReservedPath(pathname)).toBe(true);
  });

  it.each([
    "/eve/memory/file/someone.md",
    "//eve/memory/file/someone.md",
    "eve//memory/file/someone.md",
    "./eve/memory/file/someone.md",
    "eve/./memory/file/someone.md",
    "drafts/../eve/memory/file/someone.md",
    "drafts/../../user-preferences/U123.json",
    "\\eve\\memory\\file\\someone.md",
    "drafts\\..\\eve/memory/file/someone.md",
    "%65ve/memory/file/someone.md",
    "eve%2Fmemory%2Ffile%2Fsomeone.md",
    "user%2Dpreferences/U123.json",
  ])("refuses the disguised path %s", (pathname) => {
    expect(isReservedPath(pathname)).toBe(true);
  });

  it.each([
    "drafts/post.md",
    "eve/notes.md",
    "eve/memory-export.md",
    "eve/memories/post.md",
    "images/eve/memory/cover.png",
    "user-preferences.md",
    "my-user-preferences/U123.json",
    "EVE/memory/file.md",
    "reports/100%.pdf",
    "reports/100%25.pdf",
    "",
  ])("allows %s", (pathname) => {
    expect(isReservedPath(pathname)).toBe(false);
  });
});

describe("RESERVED_PATH_ERROR", () => {
  it("says the path is reserved without naming the prefixes", () => {
    expect(RESERVED_PATH_ERROR).toContain("reserved");
    expect(RESERVED_PATH_ERROR).not.toContain("eve/memory");
    expect(RESERVED_PATH_ERROR).not.toContain("user-preferences");
  });
});
