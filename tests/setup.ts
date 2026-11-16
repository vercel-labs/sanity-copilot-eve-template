/**
 * Environment variables that change what the agent's modules export.
 *
 * @remarks
 * `EVE_MOCK_MODEL` swaps every model for a mock, the `*_CONNECTOR` variables replace the default
 * connector UIDs, and the two Sanity Context variables turn on an optional connection. A
 * developer's shell or a pulled `.env` may set any of them, so each test file starts with all of
 * them unset and stubs the ones it needs with `vi.stubEnv`.
 */
const CONFIG_ENV = [
  "EVE_MOCK_MODEL",
  "NOTION_CONNECTOR",
  "SANITY_CONNECTOR",
  "SANITY_CONTEXT_MCP_URL",
  "SANITY_ORGANIZATION_TOKEN",
  "SLACK_CONNECTOR",
];

for (const name of CONFIG_ENV) {
  Reflect.deleteProperty(process.env, name);
}
