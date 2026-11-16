import { localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The principal eve's `localDev()` authenticator admits for a trusted local request.
 */
const LOCAL_PRINCIPAL = {
  authenticator: "local-dev",
  principalId: "local-dev",
  principalType: "local-dev",
};

vi.mock("eve/channels/auth", () => {
  const localDevAuth = vi.fn();
  const oidcAuth = vi.fn();
  return { localDev: () => localDevAuth, vercelOidc: () => oidcAuth };
});

vi.mock("eve/channels/eve", () => ({
  eveChannel: vi.fn((config: object) => config),
}));

/**
 * Load the eve channel module and return the authenticators it registers, in order.
 *
 * @remarks
 * `eveChannel` is mocked to hand its configuration back, so the list the module passes as
 * `auth` can be read and each entry called directly.
 *
 * @returns The `auth` list.
 */
const loadAuth = async (): Promise<
  readonly ((request: Request) => Promise<unknown>)[]
> => {
  vi.resetModules();
  await import("#channels/eve.js");
  const [config] = vi.mocked(eveChannel).mock.calls.at(-1) ?? [];
  return (config as { auth: ((request: Request) => Promise<unknown>)[] }).auth;
};

describe("eve channel auth", () => {
  const request = new Request("http://127.0.0.1:2000/eve/v1/session");
  const localDevAuth = vi.mocked(localDev());

  beforeEach(() => {
    vi.mocked(eveChannel).mockImplementation((config) => config as never);
  });

  it("tries Vercel OIDC before the local fallback", async () => {
    const auth = await loadAuth();

    expect(auth).toHaveLength(2);
    expect(auth[0]).toBe(vercelOidc());
    expect(auth[1]).not.toBe(localDev());
  });

  it("presents a trusted local session as a signed-in user who can read agent info", async () => {
    localDevAuth.mockResolvedValue(LOCAL_PRINCIPAL as never);
    const [, localDevUser] = await loadAuth();

    await expect(localDevUser?.(request)).resolves.toEqual({
      ...LOCAL_PRINCIPAL,
      allowAgentInfo: true,
      principalType: "user",
    });
    expect(localDevAuth).toHaveBeenCalledExactlyOnceWith(request);
  });

  it("admits nobody the local authenticator rejects", async () => {
    localDevAuth.mockResolvedValue(null);
    const [, localDevUser] = await loadAuth();

    await expect(localDevUser?.(request)).resolves.toBeNull();
  });
});
