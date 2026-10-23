import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { serveSubagentTask, subagentMessageInput } from "#lib/subagent-task.js";

/** One real, fetched source backing a finding. */
const source = z.strictObject({
  title: z.string().describe("The source's title or publication name."),
  url: z.string().describe("The source URL, as visited."),
});

/**
 * The researcher's structured result: cited findings plus the gaps it couldn't verify.
 *
 * @remarks
 * Requested on every researcher turn, so the reply is validated against it before it reaches
 * the root. Strict objects mirror the original JSON Schema's `additionalProperties: false`.
 */
const researchResult = z.strictObject({
  findings: z
    .array(
      z.strictObject({
        claim: z
          .string()
          .describe("A single, specific factual claim the draft can rely on."),
        confidence: z
          .enum(["high", "medium", "low"])
          .describe(
            "'high' = multiple strong independent sources; 'low' = single or weaker source."
          ),
        notes: z
          .string()
          .describe(
            "Caveats: date-sensitivity, scope limits, or where sources disagree."
          ),
        sources: z
          .array(source)
          .min(1)
          .describe(
            "The real, fetched sources backing the claim; never empty, never invented."
          ),
      })
    )
    .describe(
      "One entry per verified factual claim; every entry carries at least one real source."
    ),
  gaps: z
    .array(z.string())
    .describe(
      "What could not be found or verified; surfaced to the caller rather than guessed at."
    ),
  summary: z
    .string()
    .describe(
      "A 1-3 sentence synthesis of what the research establishes, for the root to scan first."
    ),
});

/**
 * Model-facing entry point to the `researcher` subagent.
 *
 * @remarks
 * Stands in for the tool eve would derive from `agent/subagents/researcher/` (hidden there with
 * `tool: false`), adding the structured result eve no longer takes on `defineAgent`. It keeps the
 * derived tool's `{ message, taskId? }` input and task behavior: each call runs as a resumable
 * task in a fresh child session, so several researches can run at once.
 */
export default defineWorkflowTool({
  description:
    "Research a topic on the open web for facts, statistics, primary sources, and links the " +
    "caller doesn't already have. Runs refined searches against reliable sources and returns " +
    "cited findings with confidence levels, plus the gaps it couldn't verify. The caller " +
    "passes the question and any known context in the message. It does not see this " +
    "conversation, so put everything it needs in message.",
  inputSchema: subagentMessageInput,
  outputSchema: researchResult,
  async serve(receive, ctx) {
    "use workflow";
    return await serveSubagentTask(receive, ctx, "researcher", researchResult);
  },
});
