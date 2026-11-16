import { describe, expect, it } from "vitest";
import { REVIEW_SCHEMA } from "#lib/review-schema.js";

/** One well-formed review issue. */
const ISSUE = {
  fix: "Cut the opening sentence.",
  quote: "In today's fast-paced digital landscape",
  rule: "ai-phrases-to-avoid: stock openers",
  severity: "high",
};

describe("REVIEW_SCHEMA", () => {
  it("accepts a ready verdict with no issues", () => {
    expect(REVIEW_SCHEMA.parse({ issues: [], verdict: "ready" })).toEqual({
      issues: [],
      verdict: "ready",
    });
  });

  it("accepts a revise verdict with issues", () => {
    const verdict = { issues: [ISSUE], verdict: "revise" };

    expect(REVIEW_SCHEMA.parse(verdict)).toEqual(verdict);
  });

  it.each([
    ["an unknown verdict", { issues: [], verdict: "approve" }],
    ["a missing verdict", { issues: [] }],
    ["missing issues", { verdict: "ready" }],
    [
      "an unknown severity",
      { issues: [{ ...ISSUE, severity: "critical" }], verdict: "revise" },
    ],
    [
      "an issue without a fix",
      { issues: [{ ...ISSUE, fix: undefined }], verdict: "revise" },
    ],
  ])("rejects %s", (_label, value) => {
    expect(REVIEW_SCHEMA.safeParse(value).success).toBe(false);
  });
});
