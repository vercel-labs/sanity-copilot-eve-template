import { describe, expect, it } from "vitest";
import { z } from "zod";
import { askSubagent } from "#lib/subagent.js";
import { failed, settled, subagentContext } from "../helpers/subagent.js";

/** The structured result the fake subagent is asked for. */
const SCHEMA = z.object({ answer: z.string() });

describe("askSubagent", () => {
  it("sends one message to the named subagent and returns its structured result", async () => {
    const { abortSignal, agent, ctx, send } = subagentContext(
      settled("completed", { answer: "42" })
    );

    const result = await askSubagent(ctx, "reviewer", "Review this.", SCHEMA);

    expect(result).toEqual({ answer: "42" });
    expect(agent).toHaveBeenCalledExactlyOnceWith("reviewer");
    expect(send).toHaveBeenCalledExactlyOnceWith("Review this.", {
      outputSchema: SCHEMA,
      signal: abortSignal,
    });
  });

  it("fails with the subagent's error when its turn fails", async () => {
    const { ctx } = subagentContext(failed("model overloaded"));

    await expect(
      askSubagent(ctx, "researcher", "Find it.", SCHEMA)
    ).rejects.toThrow("The researcher failed: model overloaded");
  });

  it.each(["completed", "cancelled"] as const)(
    "fails when a %s turn carries no result",
    async (status) => {
      const { ctx } = subagentContext(settled(status));

      await expect(
        askSubagent(ctx, "researcher", "Find it.", SCHEMA)
      ).rejects.toThrow("The researcher stopped before returning a result.");
    }
  );
});
