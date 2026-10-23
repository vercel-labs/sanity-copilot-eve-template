import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { serveSubagentTask, subagentMessageInput } from "#lib/subagent-task.js";

/**
 * The reviewer's structured verdict.
 *
 * @remarks
 * Requested on every reviewer turn, so the reply is validated against it before it reaches the
 * root. Strict objects mirror the original JSON Schema's `additionalProperties: false`.
 */
const reviewVerdict = z.strictObject({
  issues: z
    .array(
      z.strictObject({
        fix: z.string().describe("A concrete suggested change."),
        quote: z
          .string()
          .describe("The offending excerpt, quoted from the draft."),
        rule: z
          .string()
          .describe("The rubric rule or reference the excerpt breaks."),
        severity: z.enum(["high", "medium", "low"]),
      })
    )
    .describe(
      "One entry per concrete problem; empty when the verdict is 'ready'."
    ),
  verdict: z
    .enum(["ready", "revise"])
    .describe(
      "'ready' = clean enough to send as-is; 'revise' = fix the issues first."
    ),
});

/**
 * Model-facing entry point to the `reviewer` subagent.
 *
 * @remarks
 * Stands in for the tool eve would derive from `agent/subagents/reviewer/` (hidden there with
 * `tool: false`), adding the structured verdict eve no longer takes on `defineAgent`. It keeps
 * the derived tool's `{ message, taskId? }` input and task behavior: each call runs as a
 * resumable task in a fresh child session.
 */
export default defineWorkflowTool({
  description:
    "Review a finished content draft with fresh context against the writing-quality rubric " +
    "(AI-tells, plain English, structure, web-content specs) before it goes to the user. The " +
    "caller passes the full draft plus any voice or audience context in the message; the " +
    "reviewer loads its own rubric and returns a verdict with concrete issues. It does not see " +
    "this conversation, so put everything it needs in message.",
  inputSchema: subagentMessageInput,
  outputSchema: reviewVerdict,
  async serve(receive, ctx) {
    "use workflow";
    return await serveSubagentTask(receive, ctx, "reviewer", reviewVerdict);
  },
});
