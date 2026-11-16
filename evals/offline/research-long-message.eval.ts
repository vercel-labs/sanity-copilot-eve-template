import { defineEval } from "eve/evals";
import { asRecord, toolScript } from "../shared.js";

/**
 * A research message longer than the model router's old 16,000-character limit.
 */
const LONG_MESSAGE = "x".repeat(20_000);

/**
 * The `research` tool passes a long message to the researcher whole.
 *
 * @remarks
 * Before eve 1.0 the researcher's model router refused a message over 16,000 characters, so the
 * tool capped its input at 15,000. The tool now has no cap. The mocked researcher echoes the
 * message it received as `summary`, which shows the whole message arrived. Mock models replace
 * the router here, so this eval checks the tool and the delegation only; the router's handling
 * of a long message is tested in `tests/agents/researcher-long-message.test.ts`.
 */
export default defineEval({
  description: "research delegates a message longer than 16,000 characters.",
  async test(t) {
    await t.send(toolScript("research", { message: LONG_MESSAGE }));
    t.succeeded();
    t.event("child.opened");
    t.calledTool("research", {
      output: (value) => {
        const { summary } = asRecord(value);
        return typeof summary === "string" && summary.includes(LONG_MESSAGE);
      },
    });
  },
});
