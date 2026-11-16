import { describe, expect, it } from "vitest";
import { toolScript } from "#evals/shared.js";
import { SCRIPTED_MODEL, structuredReplyModel } from "#lib/mock-model.js";

/**
 * One generated content part: text, or a tool call with JSON-encoded input.
 */
interface ContentPart {
  readonly input?: string;
  readonly text?: string;
  readonly toolName?: string;
  readonly type: string;
}

/**
 * A model the tests call directly through the AI SDK's `doGenerate`.
 */
interface GeneratingModel {
  readonly doGenerate: (options: never) => PromiseLike<{
    readonly content: readonly ContentPart[];
  }>;
}

/**
 * Build a user message in the AI SDK's prompt format.
 *
 * @param text - The message text.
 * @returns The prompt message.
 */
const user = (text: string) => ({
  content: [{ text, type: "text" }],
  role: "user",
});

/**
 * Build the assistant tool call and tool result messages for one settled call.
 *
 * @param toolName - The tool that ran.
 * @param value - The tool's JSON output.
 * @returns The two prompt messages, in order.
 */
const settledCall = (toolName: string, value: unknown) => [
  {
    content: [{ input: {}, toolCallId: "call-1", toolName, type: "tool-call" }],
    role: "assistant",
  },
  {
    content: [
      {
        output: { type: "json", value },
        toolCallId: "call-1",
        toolName,
        type: "tool-result",
      },
    ],
    role: "tool",
  },
];

/**
 * Run one model step and return what the mock generated.
 *
 * @param model - The mock model.
 * @param prompt - The conversation so far.
 * @returns The generated content parts.
 */
const generate = async (
  model: GeneratingModel,
  prompt: readonly object[]
): Promise<readonly ContentPart[]> => {
  const { content } = await model.doGenerate({ prompt, tools: [] } as never);
  return content;
};

describe("SCRIPTED_MODEL", () => {
  it("calls the tool a scripted message names, with its input", async () => {
    const script = toolScript("upload_asset", { pathname: "a.md" });

    const content = await generate(SCRIPTED_MODEL, [user(script)]);

    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({
      toolName: "upload_asset",
      type: "tool-call",
    });
    expect(JSON.parse(content[0]?.input ?? "")).toEqual({ pathname: "a.md" });
  });

  it("calls a scripted tool with empty input when the script gives none", async () => {
    const content = await generate(SCRIPTED_MODEL, [
      user(JSON.stringify({ tool: "list_assets" })),
    ]);

    expect(content[0]).toMatchObject({ toolName: "list_assets" });
    expect(JSON.parse(content[0]?.input ?? "")).toEqual({});
  });

  it("replies with the tool results once the tool has settled", async () => {
    const content = await generate(SCRIPTED_MODEL, [
      user(toolScript("upload_asset", { pathname: "a.md" })),
      ...settledCall("upload_asset", { success: true }),
    ]);

    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("text");
    expect(JSON.parse(content[0]?.text ?? "")).toMatchObject([
      { name: "upload_asset", output: { success: true } },
    ]);
  });

  it.each([
    "What do you remember about me?",
    '{"input":{"a":1}}',
    '{"tool":42}',
    '["tool"]',
    "null",
  ])(
    "echoes every user message for the unscripted message %j",
    async (message) => {
      const content = await generate(SCRIPTED_MODEL, [
        user("Remembered: prefers British spelling."),
        user(message),
      ]);

      expect(content).toEqual([
        {
          text: `Remembered: prefers British spelling.\n${message}`,
          type: "text",
        },
      ]);
    }
  );
});

describe("structuredReplyModel", () => {
  const model = structuredReplyModel((message) => ({ echo: message }));

  it("delivers the built result through eve's structured-reply tool", async () => {
    const content = await generate(model, [user("the request")]);

    expect(content).toHaveLength(1);
    expect(content[0]).toMatchObject({
      toolName: "eve__reply",
      type: "tool-call",
    });
    expect(JSON.parse(content[0]?.input ?? "")).toEqual({
      echo: "the request",
    });
  });

  it("finishes with plain text once the reply tool has settled", async () => {
    const content = await generate(model, [
      user("the request"),
      ...settledCall("eve__reply", { ok: true }),
    ]);

    expect(content).toEqual([{ text: "Done.", type: "text" }]);
  });
});
