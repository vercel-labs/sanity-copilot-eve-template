import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

const localDevAuth = localDev();

/**
 * Dev-only fallback: present a trusted local session as an authenticated user.
 *
 * @remarks
 * The Sanity and Notion connections are user-scoped, so they need a `principalType: "user"`
 * session. In production the Slack channel supplies one. In the eve dev TUI, `vercelOidc()` runs
 * first and resolves a linked developer's Vercel OIDC token to their own user, so each developer
 * keeps their own Connect grants and preferences. This shim only catches what's left: an
 * unlinked local session, which `localDev()` would resolve to a `local-dev` principal that isn't
 * a user, so user-scoped tool calls would fail with `principal_required`. It defers the trust
 * decision to `localDev()` — returning `null` for anything it would reject, so it never affects
 * production — and only upgrades the resolved principal to a user. Every unlinked session shares
 * that one user. Drop it if you don't exercise user-scoped connections from the dev TUI.
 */
const localDevUser: AuthFn<Request> = async (request) => {
  const local = await localDevAuth(request);
  return local ? { ...local, principalType: "user" } : null;
};

/**
 * eve HTTP channel auth, tried in order until one recognizes the caller.
 *
 * @remarks
 * `vercelOidc()` must come before the local fallback; otherwise the synthetic local principal
 * shadows a real Vercel user.
 */
export default eveChannel({ auth: [vercelOidc(), localDevUser] });
