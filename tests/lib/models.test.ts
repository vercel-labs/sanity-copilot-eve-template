import { describe, expect, it } from "vitest";
import {
  DECISION_MODEL,
  DEEP_RESEARCH_MODEL,
  REVIEW_MODEL,
  ROOT_MODEL,
  STANDARD_RESEARCH_MODEL,
} from "#lib/models.js";

/** An AI Gateway model id: `provider/model`, lowercase, no spaces. */
const GATEWAY_ID = /^[a-z0-9-]+\/[a-z0-9][a-z0-9.-]*$/;

describe("model ids", () => {
  it("runs the root agent on Claude Fable 5.2", () => {
    expect(ROOT_MODEL).toBe("anthropic/claude-fable-5.2");
  });

  it.each([
    ["ROOT_MODEL", ROOT_MODEL],
    ["REVIEW_MODEL", REVIEW_MODEL],
    ["DEEP_RESEARCH_MODEL", DEEP_RESEARCH_MODEL],
    ["STANDARD_RESEARCH_MODEL", STANDARD_RESEARCH_MODEL],
    ["DECISION_MODEL", DECISION_MODEL],
  ])("%s is an AI Gateway id", (_name, id) => {
    expect(id).toMatch(GATEWAY_ID);
  });

  it("names two different research models for the router to choose between", () => {
    expect(DEEP_RESEARCH_MODEL).not.toBe(STANDARD_RESEARCH_MODEL);
  });
});
