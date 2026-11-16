import { describe, expect, it } from "vitest";
import webFetch from "#subagents/researcher/tools/web_fetch.js";
import webSearch from "#subagents/researcher/tools/web_search.js";
import readFile from "#subagents/reviewer/tools/read_file.js";
import bash from "#tools/bash.js";
import editFile from "#tools/edit_file.js";
import writeFile from "#tools/write_file.js";
import { isDisabledTool } from "../helpers/definitions.js";

describe("root built-in tools", () => {
  it.each([
    ["bash", bash],
    ["write_file", writeFile],
    ["edit_file", editFile],
  ])("disables %s", (_name, definition) => {
    expect(isDisabledTool(definition)).toBe(true);
  });
});

describe("subagent built-in tools", () => {
  it("gives the researcher web search run by Parallel", () => {
    expect(webSearch).toMatchObject({ provider: "parallel" });
    expect(webSearch).not.toHaveProperty("fallback");
  });

  it("gives the researcher eve's own web fetch, unchanged", async () => {
    const { default: builtIn } = await import("eve/tools/web_fetch");

    expect(webFetch).toBe(builtIn);
    expect(isDisabledTool(webFetch)).toBe(false);
  });

  it("gives the reviewer eve's own file read, unchanged", async () => {
    const { default: builtIn } = await import("eve/tools/read_file");

    expect(readFile).toBe(builtIn);
    expect(isDisabledTool(readFile)).toBe(false);
  });
});
