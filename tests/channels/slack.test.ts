import { connectSlackCredentials } from "@vercel/connect/eve";
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/connect/eve", async (importOriginal) => {
  const original = await importOriginal<typeof import("@vercel/connect/eve")>();
  return {
    ...original,
    connectSlackCredentials: vi.fn(original.connectSlackCredentials),
  };
});

/**
 * Load the Slack channel module fresh, so it reads the current environment.
 *
 * @returns The channel definition.
 */
const loadChannel = async () => {
  vi.resetModules();
  const { default: channel } = await import("#channels/slack.js");
  return channel;
};

describe("slack channel", () => {
  it("serves Slack events at the route the connector's trigger points to", async () => {
    const channel = await loadChannel();

    expect(
      channel.routes.map((route) => `${route.method} ${route.path}`)
    ).toEqual(["POST /eve/v1/slack"]);
  });

  it("takes its credentials from the default Vercel Connect connector", async () => {
    await loadChannel();

    expect(connectSlackCredentials).toHaveBeenCalledExactlyOnceWith(
      "slack/sanity-copilot"
    );
  });

  it("reads the connector UID from SLACK_CONNECTOR", async () => {
    vi.stubEnv("SLACK_CONNECTOR", "slack/custom");

    await loadChannel();

    expect(connectSlackCredentials).toHaveBeenCalledExactlyOnceWith(
      "slack/custom"
    );
  });
});
