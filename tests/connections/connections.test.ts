import { describe, expect, it, vi } from "vitest";
import notion from "#connections/notion.js";
import sanity from "#connections/sanity.js";
import sanityContext from "#connections/sanity-context.js";
import { dynamicResolver } from "../helpers/definitions.js";

/**
 * Ask a connection's approval policy about one qualified tool name.
 *
 * @param connection - A connection definition with an `approval` policy.
 * @param toolName - The qualified tool name eve passes, `<connection>__<tool>`.
 * @returns The policy's decision.
 */
const decide = (
  connection: { readonly approval?: unknown },
  toolName: string
): unknown => {
  const { approval } = connection;
  if (typeof approval !== "function") {
    throw new TypeError("The connection has no approval policy function.");
  }
  return approval({ toolName });
};

describe("sanity connection", () => {
  it("points at Sanity's MCP server and signs each user in through Vercel Connect", () => {
    expect(sanity.url).toBe("https://mcp.sanity.io");
    expect(sanity.auth).toMatchObject({
      principalType: "user",
      vercelConnect: { connector: "sanity/copilot-agent" },
    });
  });

  it.each([
    "patch_documents",
    "publish_documents",
    "unpublish_documents",
    "discard_drafts",
    "version_discard",
    "update_dataset",
    "deploy_schema",
    "deploy_studio",
  ])("asks for approval before sanity__%s", (tool) => {
    expect(decide(sanity, `sanity__${tool}`)).toBe("user-approval");
  });

  it.each([
    "query_documents",
    "get_schema",
    "list_datasets",
    "create_documents_from_json",
    "create_version",
    "list_releases",
  ])("runs sanity__%s without approval", (tool) => {
    expect(decide(sanity, `sanity__${tool}`)).toBe("not-applicable");
  });

  it("reads the connector UID from SANITY_CONNECTOR", async () => {
    vi.stubEnv("SANITY_CONNECTOR", "sanity/custom");
    vi.resetModules();

    const { default: connection } = await import("#connections/sanity.js");

    expect(connection.auth).toMatchObject({
      vercelConnect: { connector: "sanity/custom" },
    });
  });
});

describe("notion connection", () => {
  it("points at Notion's MCP server and signs each user in through Vercel Connect", () => {
    expect(notion.url).toBe("https://mcp.notion.com/mcp");
    expect(notion.auth).toMatchObject({
      principalType: "user",
      vercelConnect: { connector: "notion/sanity-copilot" },
    });
  });

  it.each([
    "notion-update-pages",
    "notion-move-pages",
    "notion-update-data-source",
    "notion-update-view",
  ])("asks for approval before notion__%s", (tool) => {
    expect(decide(notion, `notion__${tool}`)).toBe("user-approval");
  });

  it.each([
    "notion-create-pages",
    "notion-search",
    "notion-fetch",
    "notion-get-comments",
  ])("runs notion__%s without approval", (tool) => {
    expect(decide(notion, `notion__${tool}`)).toBe("not-applicable");
  });

  it("reads the connector UID from NOTION_CONNECTOR", async () => {
    vi.stubEnv("NOTION_CONNECTOR", "notion/custom");
    vi.resetModules();

    const { default: connection } = await import("#connections/notion.js");

    expect(connection.auth).toMatchObject({
      vercelConnect: { connector: "notion/custom" },
    });
  });
});

describe("sanity-context connection", () => {
  const resolve = dynamicResolver(sanityContext);

  it("does not exist by default", () => {
    expect(resolve({})).toBeNull();
  });

  it.each([
    ["only the URL", { SANITY_CONTEXT_MCP_URL: "https://context.example/mcp" }],
    ["only the token", { SANITY_ORGANIZATION_TOKEN: "sk-org-token" }],
    [
      "an empty token",
      {
        SANITY_CONTEXT_MCP_URL: "https://context.example/mcp",
        SANITY_ORGANIZATION_TOKEN: "",
      },
    ],
  ])("does not exist with %s set", (_label, env) => {
    for (const [name, value] of Object.entries(env)) {
      vi.stubEnv(name, value);
    }

    expect(resolve({})).toBeNull();
  });

  it("connects with the organization token when both variables are set", async () => {
    vi.stubEnv("SANITY_CONTEXT_MCP_URL", "https://context.example/mcp");
    vi.stubEnv("SANITY_ORGANIZATION_TOKEN", "sk-org-token");

    const connection = resolve({});

    expect(connection).toMatchObject({
      instanceKey: "sanity-context",
      url: "https://context.example/mcp",
    });
    expect(connection).not.toHaveProperty("approval");
    const { auth } = connection as {
      auth: { getToken: () => Promise<unknown> };
    };
    await expect(auth.getToken()).resolves.toEqual({ token: "sk-org-token" });
  });

  it("keeps the token out of the description the model reads", () => {
    vi.stubEnv("SANITY_CONTEXT_MCP_URL", "https://context.example/mcp");
    vi.stubEnv("SANITY_ORGANIZATION_TOKEN", "sk-org-token");

    const { description } = resolve({}) as { description: string };

    expect(description).toContain("read-only");
    expect(description).not.toContain("sk-org-token");
  });
});
