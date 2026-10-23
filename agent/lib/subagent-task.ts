import type {
  AgentMessageResult,
  AgentSendOptions,
  AgentSession,
  WorkflowServeCall,
  WorkflowServeContext,
  WorkflowServeReceive,
} from "eve/tools";
import { z } from "zod";

/**
 * Model-facing input for a subagent wrapper tool.
 *
 * @remarks
 * The same `{ message }` shape eve gives a derived subagent tool. eve adds the optional `taskId`
 * itself because the wrappers are `serve` tools, so it must not be declared here.
 */
export const subagentMessageInput = z.object({
  message: z
    .string()
    .min(1)
    .describe(
      "The message to send to the agent, with everything it needs to do the work."
    ),
});

/** A validated call to a subagent wrapper tool. */
type SubagentCall = WorkflowServeCall<z.infer<typeof subagentMessageInput>>;

/** One message in flight to the child session. */
interface PendingTurn<TOutput> {
  readonly result: Promise<AgentMessageResult<TOutput>>;
  readonly signal: AbortSignal;
}

/** Whichever settles first: the next model call to this task, or the running turn. */
type NextEvent<TOutput> =
  | { readonly call: SubagentCall; readonly kind: "call" }
  | { readonly kind: "result"; readonly result: AgentMessageResult<TOutput> };

/**
 * Send one call's message to the child, requesting structured output for its turn.
 *
 * @param session - The child session the task owns.
 * @param call - The call whose message to deliver.
 * @param outputSchema - The schema the child's reply must match.
 * @returns The pending turn, tagged with the call's abort signal.
 */
const sendTurn = <TOutput>(
  session: AgentSession,
  call: SubagentCall,
  outputSchema: NonNullable<AgentSendOptions<TOutput>["outputSchema"]>
): PendingTurn<TOutput> => ({
  result: session
    .send<TOutput>(call.input.message, {
      outputSchema,
      signal: call.abortSignal,
    })
    .then((response) => response.result()),
  signal: call.abortSignal,
});

/**
 * Wait for the next call to the task or the end of the running turn.
 *
 * @param nextCall - The pending `receive()` promise; kept by the caller so a call that wins the
 * race is never lost.
 * @param turn - The turn in flight.
 * @returns The event that settled first.
 */
const nextEvent = async <TOutput>(
  nextCall: Promise<SubagentCall>,
  turn: PendingTurn<TOutput>
): Promise<NextEvent<TOutput>> =>
  await Promise.race([
    turn.result.then((result) => ({ kind: "result" as const, result })),
    nextCall.then((call) => ({ call, kind: "call" as const })),
  ]);

/**
 * Run a declared subagent as a resumable task whose replies match `outputSchema`.
 *
 * @remarks
 * eve 0.69 removed `outputSchema` from `defineAgent`; structured output is now requested per
 * turn through `ctx.agent(name).send(message, { outputSchema })`. This is eve's own agent-tool
 * loop (`agentToolServeWorkflow`) with that one addition, so a wrapper tool keeps the derived
 * tool's behavior: each call without `taskId` starts a task with a fresh child session, calls
 * made with its `taskId` continue the same child, a call that arrives mid-turn joins that turn,
 * a cancelled turn leaves the task idle and reusable, and a failed turn ends the task.
 *
 * Call it from a `serve` body that starts with `"use workflow"`. The subagent should set
 * `tool: false` so the model sees only the wrapper. The wrapper needs its own name: eve 0.83's
 * build still rejects a tool that shares a declared subagent's name even when the subagent is
 * hidden, although eve's docs describe that pattern.
 *
 * @param receive - The `serve` body's `receive`.
 * @param ctx - The `serve` body's context.
 * @param agentName - The subagent to delegate to: its folder name under `agent/subagents/`.
 * @param outputSchema - The schema each child reply must match.
 * @returns Never; the task ends when the session ends or a turn fails.
 * @throws When a child turn fails or ends without a structured result. The task then ends and
 * the model is told to start a new one.
 */
export const serveSubagentTask = async <TOutput>(
  receive: WorkflowServeReceive<z.infer<typeof subagentMessageInput>>,
  ctx: WorkflowServeContext<TOutput>,
  agentName: string,
  outputSchema: NonNullable<AgentSendOptions<TOutput>["outputSchema"]>
): Promise<TOutput> => {
  const session = ctx.agent(agentName);
  let turn = sendTurn(session, await receive(), outputSchema);
  let nextCall = receive();
  for (;;) {
    // The loop is a sequential event pump: each wait decides what the next one is.
    // biome-ignore lint/performance/noAwaitInLoops: each iteration depends on the previous event.
    const event = await nextEvent(nextCall, turn);
    if (event.kind === "call") {
      // A cancelled turn must settle before its replacement starts on the same session.
      if (turn.signal.aborted) {
        await turn.result.catch(() => undefined);
      }
      turn = sendTurn(session, event.call, outputSchema);
      nextCall = receive();
      continue;
    }
    if (!turn.signal.aborted) {
      const { data, error, status } = event.result;
      if (status === "failed") {
        throw new Error(
          `The agent's turn failed: ${error?.message ?? "no reason given"}\n` +
            `This task has ended; to retry, call ${ctx.toolName} without taskId.`
        );
      }
      // A call that arrived after the child read its last message starts the next turn
      // instead of being settled by this reply.
      const pending = receive();
      if (pending !== nextCall) {
        turn = sendTurn(session, await nextCall, outputSchema);
        nextCall = pending;
        continue;
      }
      if (data === undefined) {
        // Replying is the only thing that settles the waiting calls; never leave them hanging.
        throw new Error(
          `The agent ended its turn without a structured result (status: ${status}).\n` +
            `This task has ended; to retry, call ${ctx.toolName} without taskId.`
        );
      }
      ctx.reply(data);
    }
    // Idle (or cancelled): wait for the next call by taskId.
    turn = sendTurn(session, await nextCall, outputSchema);
    nextCall = receive();
  }
};
