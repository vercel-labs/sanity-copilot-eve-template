import { defineAgent } from "eve";

/**
 * Fresh-context web-research subagent.
 *
 * @remarks
 * The root delegates here when a task needs an outside fact: a statistic, a competitor detail,
 * a primary-source link, or a claim to verify. The researcher runs in a fresh child session and
 * inherits none of the root's skills, connections, or tools. `defaultTools: false` drops eve's
 * optional defaults (`bash`, file tools, the root-copy `agent`), and this folder's `tools/`
 * re-exports only the framework `web_search` and `web_fetch`, so it is web-only and never
 * opens a sandbox. It works solely
 * from what the root packs into `message` plus what it fetches, so every claim must be grounded
 * in a real source: the root weaves in only cited `findings` and surfaces `gaps` to the user.
 *
 * `tool: false` hides the derived subagent tool: the root calls the researcher through the
 * `research` workflow tool (`agent/tools/research.ts`), which requests the structured, cited
 * result per turn (eve no longer accepts `outputSchema` on `defineAgent`). Keep `description`
 * in step with that tool's description.
 *
 * @see The research methodology and output contract in this folder's `instructions.md`.
 */
export default defineAgent({
  defaultTools: false,
  description:
    "Research a topic on the open web for facts, statistics, primary sources, and links the " +
    "caller doesn't already have. Runs refined searches against reliable sources and returns " +
    "cited findings with confidence levels, plus the gaps it couldn't verify. The caller " +
    "passes the question and any known context in the message.",
  model: "openai/gpt-5.6-terra",
  tool: false,
});
