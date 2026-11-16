import type { AgentMessageResult, WorkflowToolContext } from "eve/tools";
import { vi } from "vitest";

/**
 * Build a workflow tool context whose `agent()` answers every turn with one fixed result.
 *
 * @remarks
 * Stands in for the child session eve opens when a workflow tool calls `ctx.agent(name)`. The
 * returned spies record which subagent was opened and what was sent to it.
 *
 * @param result - The settled turn the subagent returns.
 * @returns The context to pass to the tool, with the `agent` and `send` spies.
 */
export const subagentContext = (result: AgentMessageResult) => {
  const send = vi.fn((_message: string, _options?: object) =>
    Promise.resolve({ result: () => Promise.resolve(result) })
  );
  const agent = vi.fn((_name: string) => ({ send }));
  const { signal: abortSignal } = new AbortController();
  return {
    abortSignal,
    agent,
    ctx: { abortSignal, agent } as unknown as WorkflowToolContext,
    send,
  };
};

/**
 * Build a subagent turn that settled without failing.
 *
 * @param status - How the turn ended.
 * @param data - The structured result the subagent delivered, if any.
 * @returns The settled turn.
 */
export const settled = (
  status: "cancelled" | "completed",
  data?: unknown
): AgentMessageResult => ({
  data,
  reply: undefined,
  sessionEnded: false,
  status,
});

/**
 * Build a failed subagent turn.
 *
 * @param message - The child's error message.
 * @returns The settled turn.
 */
export const failed = (message: string): AgentMessageResult => ({
  data: undefined,
  error: { message },
  reply: undefined,
  sessionEnded: false,
  status: "failed",
});
