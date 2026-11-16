import { describe, expect, it, vi } from "vitest";
import root from "#agent.js";
import {
  DEEP_RESEARCH_MODEL,
  REVIEW_MODEL,
  ROOT_MODEL,
  STANDARD_RESEARCH_MODEL,
} from "#lib/models.js";
import researcher from "#subagents/researcher/agent.js";
import reviewer from "#subagents/reviewer/agent.js";

/**
 * Ask the root agent's session usage limit whether a usage window is over budget.
 *
 * @param window - Token counts since the last approved continuation.
 * @returns `true` when the session should pause for a Continue/Stop decision.
 */
const overBudget = (window: {
  cacheReadTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}): boolean => {
  const limit = root.limits?.sessionUsage;
  if (typeof limit !== "function") {
    throw new TypeError("The root agent has no session usage limit.");
  }
  const usage = {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    ...window,
  };
  return limit({ total: usage, window: usage });
};

/**
 * Whether a model setting is one of the mock models from `agent/lib/mock-model.ts`.
 *
 * @param model - An agent definition's `model`.
 * @returns `true` for a mock model.
 */
const isMockModel = (model: unknown): boolean =>
  typeof model === "object" &&
  model !== null &&
  "provider" in model &&
  model.provider === "eve-mock";

describe("root agent", () => {
  it("runs on the root model", () => {
    expect(root.model).toBe(ROOT_MODEL);
  });

  it("compacts history at 75% of the context window", () => {
    expect(root.compaction).toEqual({ threshold: 0.75 });
  });

  it("keeps the built-in agent tool and default tools on", () => {
    expect(root).not.toHaveProperty("tool");
    expect(root).not.toHaveProperty("defaultTools");
  });

  it.each([
    [{ inputTokens: 0, outputTokens: 0 }, false],
    [{ inputTokens: 499_999, outputTokens: 19_999 }, false],
    [{ inputTokens: 500_000 }, true],
    [{ outputTokens: 20_000 }, true],
    [{ cacheReadTokens: 1_600_000, inputTokens: 2_000_000 }, false],
    [{ cacheReadTokens: 1_500_000, inputTokens: 2_000_000 }, true],
    [{ cacheReadTokens: 9_000_000, inputTokens: 9_000_000 }, false],
  ])("usage window %j pauses the session: %s", (window, expected) => {
    expect(overBudget(window)).toBe(expected);
  });
});

describe("researcher subagent", () => {
  it("is reachable only through the research tool and has no default tools", () => {
    expect(researcher).toMatchObject({ defaultTools: false, tool: false });
    expect(researcher.description).not.toBe("");
  });

  it("routes its model per call instead of naming one", () => {
    expect(researcher.model).toBeTypeOf("object");
    expect(isMockModel(researcher.model)).toBe(false);
    expect([DEEP_RESEARCH_MODEL, STANDARD_RESEARCH_MODEL]).not.toContain(
      researcher.model
    );
  });
});

describe("reviewer subagent", () => {
  it("is reachable only through the review_draft tool and has no default tools", () => {
    expect(reviewer).toMatchObject({ defaultTools: false, tool: false });
    expect(reviewer.description).not.toBe("");
  });

  it("runs on the review model", () => {
    expect(reviewer.model).toBe(REVIEW_MODEL);
  });
});

describe("with EVE_MOCK_MODEL=1", () => {
  /**
   * Load the three agent definitions fresh under the mock-model switch.
   *
   * @returns The root, researcher, and reviewer definitions.
   */
  const loadMocked = async () => {
    vi.stubEnv("EVE_MOCK_MODEL", "1");
    vi.resetModules();
    const [rootAgent, researcherAgent, reviewerAgent] = await Promise.all([
      import("#agent.js"),
      import("#subagents/researcher/agent.js"),
      import("#subagents/reviewer/agent.js"),
    ]);
    return [
      rootAgent.default,
      researcherAgent.default,
      reviewerAgent.default,
    ] as const;
  };

  it("swaps every agent's model for a mock", async () => {
    const agents = await loadMocked();

    expect(agents.map((agent) => isMockModel(agent.model))).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("leaves the rest of each agent's configuration alone", async () => {
    const [mockedRoot, mockedResearcher, mockedReviewer] = await loadMocked();

    expect(mockedRoot.compaction).toEqual(root.compaction);
    expect(mockedRoot.limits?.sessionUsage).toBeTypeOf("function");
    expect(mockedResearcher).toMatchObject({
      defaultTools: false,
      description: researcher.description,
      tool: false,
    });
    expect(mockedReviewer).toMatchObject({
      defaultTools: false,
      description: reviewer.description,
      tool: false,
    });
  });

  it.each(["0", "true", ""])(
    "keeps the root on its real model when the switch is %j",
    async (value) => {
      vi.stubEnv("EVE_MOCK_MODEL", value);
      vi.resetModules();

      const { default: agent } = await import("#agent.js");

      expect(agent.model).toBe(ROOT_MODEL);
    }
  );
});
