import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for the deterministic test suite under `tests/`.
 *
 * @remarks
 * The suite never calls a model, a connector, or the Blob store: `@vercel/blob` is mocked, or
 * run for real with the network intercepted, and the agent surface is read from
 * `eve info --json`. Like `eve build`, that command needs the AI
 * Gateway model catalog: eve fetches it without credentials, refreshes it when the copy cached
 * under `.eve/cache/` is more than five minutes old, and falls back to that copy when offline,
 * so only a first run needs the network. `tests/setup.ts` clears the environment variables that
 * change module-level config. `unstubEnvs` restores the variables a test stubbed, and
 * `mockReset` clears each mock's recorded calls and stubbed results before the next test, so no
 * test depends on the one before it. `isolate` stays on: one file mocks `@vercel/blob` and
 * another runs the real SDK with the network intercepted, so the files must not share a module
 * cache. Type-level assertions (`expectTypeOf`, `@ts-expect-error`) live in
 * `tests/types/types.test-d.ts`, which Vitest does not run; `pnpm typecheck` checks them.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    isolate: true,
    mockReset: true,
    setupFiles: ["tests/setup.ts"],
    unstubEnvs: true,
  },
});
