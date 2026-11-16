import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STANDARD_RESEARCH_MODEL } from "#lib/models.js";
import researcher from "#subagents/researcher/agent.js";
import { dynamicResolver } from "../helpers/definitions.js";

/**
 * Tests of the claim the `research` tool's missing length cap rests on.
 *
 * @remarks
 * Before eve 1.0 the router refused a message over 16,000 characters before it called the
 * decision model, and its `fallback` did not cover that refusal, so `research` capped its input.
 * These tests run eve's real router with the researcher's own configuration. Only the HTTP call
 * to the decision model is replaced, with the answer a provider gives to an over-long input.
 */

/**
 * Build the context eve passes a model router before a turn's first model call.
 *
 * @remarks
 * The router reads the turn's opening text and the earlier messages, and memoizes its choice
 * for the turn. This is the smallest context that lets it run.
 *
 * @param text - The research message that opens the turn.
 * @returns The router's context.
 */
const turnContext = (text: string) => ({
  memo: (
    _key: unknown,
    compute: (options: { abortSignal: AbortSignal }) => unknown
  ) => compute({ abortSignal: new AbortController().signal }),
  messages: () => Promise.resolve([{ content: text, role: "user" }]),
  turn: { id: "turn-1", input: [{ kind: "text", text }], status: "running" },
});

describe("the researcher's model router, given a long message", () => {
  const route = dynamicResolver(researcher.model as object);

  beforeEach(() => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { error: { message: "The input is too long for this model." } },
            { status: 400 }
          )
        )
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([1000, 16_001, 100_000])(
    "sends a %d-character message to the decision model whole, and falls back when it is refused",
    async (length) => {
      const message = "x".repeat(length);

      const choice = await route(turnContext(message));

      expect(choice).toBe(STANDARD_RESEARCH_MODEL);
      expect(fetch).toHaveBeenCalledOnce();
      const [, request] = vi.mocked(fetch).mock.calls[0] ?? [];
      expect(String(request?.body)).toContain(message);
    }
  );
});
