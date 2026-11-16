import { describe, expect, it } from "vitest";
import { REVIEW_SCHEMA } from "#lib/review-schema.js";
import researcher from "#subagents/researcher/agent.js";
import reviewer from "#subagents/reviewer/agent.js";
import research from "#tools/research.js";
import reviewDraft from "#tools/review_draft.js";
import { failed, settled, subagentContext } from "../helpers/subagent.js";
import { acceptsInput, parseInput } from "../helpers/tool.js";

/** A researcher result that satisfies the `research` tool's output schema. */
const FINDINGS = {
  findings: [
    {
      claim: "RFC 7540 was published in May 2015.",
      confidence: "high",
      notes: "Obsoleted by RFC 9113 in 2022.",
      sources: [
        { title: "RFC 7540", url: "https://www.rfc-editor.org/rfc/rfc7540" },
      ],
    },
  ],
  gaps: ["No source for adoption figures."],
  summary: "HTTP/2 was first specified in RFC 7540 in 2015.",
};

describe("research", () => {
  it("prefixes the depth and returns the researcher's findings", async () => {
    const { abortSignal, agent, ctx, send } = subagentContext(
      settled("completed", FINDINGS)
    );
    const input = await parseInput(research, {
      depth: "deep",
      message: "How does QUIC handle loss?",
    });

    const output = await research.execute(input, ctx);

    expect(output).toEqual(FINDINGS);
    expect(agent).toHaveBeenCalledExactlyOnceWith("researcher");
    expect(send).toHaveBeenCalledExactlyOnceWith(
      "Research depth: deep\n\nHow does QUIC handle loss?",
      { outputSchema: research.outputSchema, signal: abortSignal }
    );
  });

  it("sends the message as written when no depth is given", async () => {
    const { ctx, send } = subagentContext(settled("completed", FINDINGS));
    const input = await parseInput(research, {
      message: "When was RFC 7540 published?",
    });

    await research.execute(input, ctx);

    expect(send.mock.calls[0]?.[0]).toBe("When was RFC 7540 published?");
  });

  it("fails the call when the researcher fails", async () => {
    const { ctx } = subagentContext(failed("search unavailable"));

    await expect(
      research.execute({ message: "When was RFC 7540 published?" }, ctx)
    ).rejects.toThrow("The researcher failed: search unavailable");
  });

  it.each(["quick", "standard", "deep"])(
    "accepts the depth %s",
    async (depth) => {
      expect(await acceptsInput(research, { depth, message: "Question" })).toBe(
        true
      );
    }
  );

  it("accepts a message longer than the router's old 16,000-character limit", async () => {
    expect(await acceptsInput(research, { message: "x".repeat(100_000) })).toBe(
      true
    );
  });

  it.each([
    ["an empty message", { message: "" }],
    ["a missing message", { depth: "quick" }],
    ["an unknown depth", { depth: "exhaustive", message: "Question" }],
  ])("rejects %s", async (_label, input) => {
    expect(await acceptsInput(research, input)).toBe(false);
  });

  it("declares an output that needs sourced findings, a known confidence, and gaps", async () => {
    const output = { inputSchema: research.outputSchema };
    const [finding] = FINDINGS.findings;

    expect(await acceptsInput(output, FINDINGS)).toBe(true);
    expect(
      await acceptsInput(output, {
        ...FINDINGS,
        findings: [{ ...finding, sources: [] }],
      })
    ).toBe(false);
    expect(
      await acceptsInput(output, {
        ...FINDINGS,
        findings: [{ ...finding, confidence: "certain" }],
      })
    ).toBe(false);
    expect(await acceptsInput(output, { ...FINDINGS, gaps: undefined })).toBe(
      false
    );
  });

  it("describes the same job as the subagent it fronts", () => {
    expect(research.description.startsWith(researcher.description)).toBe(true);
  });
});

describe("review_draft", () => {
  it("sends the draft to the reviewer and returns its verdict", async () => {
    const verdict = { issues: [], verdict: "ready" };
    const { abortSignal, agent, ctx, send } = subagentContext(
      settled("completed", verdict)
    );
    const input = await parseInput(reviewDraft, {
      message: "Draft:\nExport reports in one click.",
    });

    const output = await reviewDraft.execute(input, ctx);

    expect(output).toEqual(verdict);
    expect(agent).toHaveBeenCalledExactlyOnceWith("reviewer");
    expect(send).toHaveBeenCalledExactlyOnceWith(
      "Draft:\nExport reports in one click.",
      { outputSchema: REVIEW_SCHEMA, signal: abortSignal }
    );
  });

  it("declares the reviewer's verdict schema as its output", () => {
    expect(reviewDraft.outputSchema).toBe(REVIEW_SCHEMA);
  });

  it("fails the call when the reviewer stops without a verdict", async () => {
    const { ctx } = subagentContext(settled("cancelled"));

    await expect(
      reviewDraft.execute({ message: "Draft" }, ctx)
    ).rejects.toThrow("The reviewer stopped before returning a result.");
  });

  it("rejects an empty or missing draft", async () => {
    expect(await acceptsInput(reviewDraft, { message: "" })).toBe(false);
    expect(await acceptsInput(reviewDraft, {})).toBe(false);
  });

  it("describes the same job as the subagent it fronts", () => {
    expect(reviewDraft.description.startsWith(reviewer.description)).toBe(true);
  });
});
