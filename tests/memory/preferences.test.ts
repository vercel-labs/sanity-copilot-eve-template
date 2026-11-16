import { byPrincipal } from "eve/memory/scope";
import { describe, expect, it } from "vitest";
import preferences from "#memory/preferences.js";

type ScopeContext = Parameters<typeof byPrincipal>[0];

/**
 * Build the context eve passes a memory scope resolver.
 *
 * @param principal - The session's resolved principal, or `null` when nobody is signed in.
 * @returns A scope context carrying that principal.
 */
const contextFor = (principal: Record<string, unknown> | null): ScopeContext =>
  ({
    abortSignal: new AbortController().signal,
    channel: { kind: "slack" },
    session: { auth: { current: principal }, id: "session-1" },
  }) as unknown as ScopeContext;

/**
 * Resolve the preferences memory's scope for a context.
 *
 * @param context - The scope context.
 * @returns The scope key, or `null` when the session gets no memory.
 */
const scopeFor = (context: ScopeContext): unknown => {
  const { scope } = preferences;
  if (typeof scope !== "function") {
    throw new TypeError("The memory scope is not a resolver function.");
  }
  return scope(context);
};

/** A signed-in Slack user, as the Slack channel's auth resolves one. */
const ALICE = {
  authenticator: "slack",
  issuer: "T0001",
  principalId: "U0001",
  principalType: "user",
};

describe("preferences memory", () => {
  it("gives a signed-in user a scope of their own", () => {
    const scope = scopeFor(contextFor(ALICE));

    expect(scope).toBe(byPrincipal(contextFor(ALICE)));
    expect(scope).toBe(JSON.stringify(["user", "slack", "T0001", "U0001"]));
  });

  it("keeps two users apart", () => {
    const bob = { ...ALICE, principalId: "U0002" };

    expect(scopeFor(contextFor(bob))).not.toBe(scopeFor(contextFor(ALICE)));
  });

  it("keeps the same user id in two workspaces apart", () => {
    const elsewhere = { ...ALICE, issuer: "T0002" };

    expect(scopeFor(contextFor(elsewhere))).not.toBe(
      scopeFor(contextFor(ALICE))
    );
  });

  it.each(["app", "service", "local-dev", "anonymous", "runtime"])(
    "gives a %s principal no memory",
    (principalType) => {
      expect(scopeFor(contextFor({ ...ALICE, principalType }))).toBeNull();
    }
  );

  it("gives a session with no principal no memory", () => {
    expect(scopeFor(contextFor(null))).toBeNull();
  });

  it("tells the model what belongs in memory", () => {
    expect(preferences.description).toContain("Standing preferences");
  });
});
