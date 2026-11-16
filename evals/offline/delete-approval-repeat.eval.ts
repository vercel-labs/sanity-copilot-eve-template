import { defineEval } from "eve/evals";
import { asRecord, toolScript } from "../shared.js";

/**
 * The scripted `delete_asset` call each turn sends.
 *
 * @remarks
 * The URL is under a reserved prefix, so once a call is approved the tool refuses it before it
 * reaches the Blob SDK. The eval then never touches storage, whatever credentials are present.
 */
const DELETE = toolScript("delete_asset", {
  url: "https://example.private.blob.vercel-storage.com/eve/memory/file/someone/MEMORY.md",
});

/**
 * Approving one `delete_asset` call does not approve the next one in the same session.
 *
 * @remarks
 * `delete_asset` is gated with `always()`. A policy that remembers an approval, such as
 * `once()`, would let the second call run unasked.
 */
export default defineEval({
  description: "delete_asset asks again after an earlier call was approved.",
  async test(t) {
    const { session } = await t.send(DELETE);
    session.requireInteraction({
      optionIds: ["approve", "deny"],
      toolName: "delete_asset",
    });
    await session.respondAll("approve");
    t.calledTool("delete_asset", {
      count: 1,
      output: (value) => asRecord(value).deleted === false,
      status: "completed",
    });

    await session.send(DELETE);
    session.requireInteraction({
      optionIds: ["approve", "deny"],
      toolName: "delete_asset",
    });
    await session.respondAll("deny");
    t.calledTool("delete_asset", { count: 1, status: "rejected" });
  },
});
