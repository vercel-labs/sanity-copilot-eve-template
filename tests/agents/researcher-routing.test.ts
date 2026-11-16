import { auto } from "eve/models";
import { describe, expect, it, vi } from "vitest";
import {
  DECISION_MODEL,
  DEEP_RESEARCH_MODEL,
  STANDARD_RESEARCH_MODEL,
} from "#lib/models.js";
import researcher from "#subagents/researcher/agent.js";

vi.mock("eve/models", () => ({
  auto: vi.fn((config: object) => ({ routed: config })),
}));

/**
 * The configuration the researcher passed to eve's `auto()` model router.
 *
 * @remarks
 * `auto` is mocked to hand its configuration back, so the router's settings can be read. The
 * call happens once, when the researcher's module loads.
 */
const [routing] = vi.mocked(auto).mock.calls[0] ?? [];

describe("the researcher's model router", () => {
  it("is the researcher's model", () => {
    expect(researcher.model).toEqual({ routed: routing });
  });

  it("decides with the decision model", () => {
    expect(routing?.model).toBe(DECISION_MODEL);
  });

  it("falls back to the standard research model when the decision fails", () => {
    expect(routing?.fallback).toBe(STANDARD_RESEARCH_MODEL);
  });

  it("offers exactly the deep and the standard research model", () => {
    expect(Object.keys(routing?.options ?? {}).sort()).toEqual(
      [DEEP_RESEARCH_MODEL, STANDARD_RESEARCH_MODEL].sort()
    );
  });

  it("sends requests marked deep to the deep model", () => {
    const description = routing?.options[DEEP_RESEARCH_MODEL];

    expect(description).toContain("Research depth: deep");
    expect(description).not.toContain("Research depth: quick");
    expect(description).not.toContain("Research depth: standard");
  });

  it("sends requests marked quick or standard to the standard model", () => {
    const description = routing?.options[STANDARD_RESEARCH_MODEL];

    expect(description).toContain("Research depth: quick");
    expect(description).toContain("Research depth: standard");
    expect(description).not.toContain("Research depth: deep");
  });
});
