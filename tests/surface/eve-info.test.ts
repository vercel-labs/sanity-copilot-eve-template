import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { ROOT_MODEL } from "#lib/models.js";

/** Repository root, two levels above this file's folder. */
const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

/**
 * The parts of `eve info --json` the tests read.
 */
interface AgentInfo {
  readonly channels: readonly {
    readonly method: string;
    readonly name: string;
    readonly urlPath: string;
  }[];
  readonly diagnostics: { readonly errors: number; readonly warnings: number };
  readonly instructions: string;
  readonly model: string;
  readonly schedules: readonly string[];
  readonly skills: readonly string[];
  readonly status: string;
  readonly subagents: readonly string[];
  readonly toolInputSchemas: {
    readonly root: Readonly<Partial<Record<string, JsonSchema>>>;
    readonly subagents: Readonly<
      Partial<Record<string, Readonly<Record<string, JsonSchema>>>>
    >;
  };
  readonly tools: readonly string[];
}

/**
 * A JSON Schema object, as eve hands a tool's input schema to the model.
 */
interface JsonSchema {
  readonly additionalProperties?: boolean;
  readonly properties?: Readonly<
    Partial<Record<string, Readonly<Record<string, unknown>>>>
  >;
  readonly required?: readonly string[];
}

/**
 * Run `eve info --json` against this repository and parse the result.
 *
 * @remarks
 * `eve info` compiles the agent the way `eve build` does and prints the surface eve resolved
 * from the filesystem, so these tests check what the model is actually offered rather than
 * what the files appear to declare. Compiling needs the AI Gateway model catalog, which eve
 * downloads without credentials and caches under `.eve/cache/`; with that copy in place the
 * command runs offline. The CLI is started with
 * `process.execPath` so the test doesn't depend on a shell shim, and without `EVE_MOCK_MODEL`
 * so it reports the real model.
 *
 * @returns The resolved agent surface.
 */
const readAgentInfo = async (): Promise<AgentInfo> => {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve("eve/package.json");
  const { bin } = JSON.parse(await readFile(packagePath, "utf8")) as {
    bin: { eve: string };
  };
  const env = { ...process.env };
  Reflect.deleteProperty(env, "EVE_MOCK_MODEL");
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(dirname(packagePath), bin.eve), "info", "--json"],
    { cwd: ROOT_DIR, env, maxBuffer: 16 * 1024 * 1024 }
  );
  return JSON.parse(stdout) as AgentInfo;
};

describe("the agent surface eve resolves", () => {
  let info: AgentInfo;

  beforeAll(async () => {
    info = await readAgentInfo();
  }, 120_000);

  it("compiles with no errors or warnings", () => {
    expect(info.status).toBe("ready");
    expect(info.diagnostics).toEqual({ errors: 0, warnings: 0 });
  });

  it("runs the root agent on the root model", () => {
    expect(info.model).toBe(ROOT_MODEL);
  });

  it("uses instructions.md as the system prompt", () => {
    expect(info.instructions).toBe("instructions.md (system)");
  });

  it("offers the root exactly its seven authored tools and four built-ins", () => {
    expect([...info.tools].sort()).toEqual([
      "agent",
      "delete_asset",
      "download_asset",
      "get_asset_info",
      "list_assets",
      "read_file",
      "research",
      "review_draft",
      "upload_asset",
      "web_fetch",
      "web_search",
    ]);
  });

  it.each(["bash", "write_file", "edit_file"])(
    "keeps %s away from the root",
    (tool) => {
      expect(info.tools).not.toContain(tool);
      expect(info.toolInputSchemas.root).not.toHaveProperty(tool);
    }
  );

  it("hides the subagents from the root model, which reaches them through its tools", () => {
    expect([...info.subagents].sort()).toEqual(["researcher", "reviewer"]);
    expect(info.tools).not.toContain("researcher");
    expect(info.tools).not.toContain("reviewer");
  });

  it("shows web_fetch as the researcher's only tool with an input schema", () => {
    const tools = Object.keys(info.toolInputSchemas.subagents.researcher ?? {});

    expect(tools).toEqual(["web_fetch"]);
  });

  it("shows read_file as the reviewer's only tool", () => {
    const tools = Object.keys(info.toolInputSchemas.subagents.reviewer ?? {});

    expect(tools).toEqual(["read_file"]);
  });

  it("loads all seven skills", () => {
    expect([...info.skills].sort()).toEqual([
      "content-experimentation-best-practices",
      "content-modeling-best-practices",
      "portable-text-conversion",
      "portable-text-serialization",
      "sanity-best-practices",
      "seo-aeo-best-practices",
      "writing-quality",
    ]);
  });

  it("serves Slack events and the eve session routes, and no schedules", () => {
    const routes = info.channels.map(
      (route) => `${route.name} ${route.method} ${route.urlPath}`
    );

    expect(routes).toContain("slack POST /eve/v1/slack");
    expect(routes).toContain("eve POST /eve/v1/session");
    expect(routes).toContain("eve GET /eve/v1/session/:sessionId/stream");
    expect(info.schedules).toEqual([]);
  });

  it("tells the model research takes a message of any length and an optional depth", () => {
    const schema = info.toolInputSchemas.root.research;

    expect(schema?.required).toEqual(["message"]);
    expect(schema?.additionalProperties).toBe(false);
    expect(schema?.properties?.depth?.enum).toEqual([
      "quick",
      "standard",
      "deep",
    ]);
    expect(schema?.properties?.message).toMatchObject({
      minLength: 1,
      type: "string",
    });
    expect(schema?.properties?.message).not.toHaveProperty("maxLength");
  });

  it("gives the model no way to choose an upload's access level", () => {
    const schema = info.toolInputSchemas.root.upload_asset;

    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual([
      "addRandomSuffix",
      "allowOverwrite",
      "content",
      "contentType",
      "isBase64",
      "pathname",
    ]);
    expect(schema?.required).toEqual(["content", "pathname"]);
    expect(schema?.additionalProperties).toBe(false);
  });

  it.each(["delete_asset", "download_asset", "get_asset_info"])(
    "tells the model %s takes one URL",
    (tool) => {
      const schema = info.toolInputSchemas.root[tool];

      expect(schema?.required).toEqual(["url"]);
      expect(schema?.properties?.url).toMatchObject({
        format: "uri",
        type: "string",
      });
      expect(schema?.additionalProperties).toBe(false);
    }
  );
});
