import { get } from "@vercel/blob";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { checkBlobUrl } from "#lib/blob-url.js";

/**
 * Tool that downloads the contents of a Vercel Blob asset.
 *
 * @remarks
 * The store is private, so the asset is read through the Blob SDK with the ambient Vercel OIDC
 * credentials; no `BLOB_READ_WRITE_TOKEN` is required. Text content is returned raw; binary
 * content (images, PDFs) is returned base64-encoded with `isBase64: true`. The `url` is
 * model-supplied, so only what {@link checkBlobUrl} accepts is read: an https Vercel Blob URL
 * outside the reserved prefixes.
 */
export default defineTool({
  description:
    "Download and return the contents of a Vercel Blob asset. Use when the user wants to " +
    "read or reuse a stored file. Text is returned raw; binary files come back base64-encoded.",
  /**
   * Fetch and return the asset contents.
   *
   * @param input - Validated tool input.
   * @returns The asset `content` (raw text or base64) with its `contentType`, or
   * `success: false` with an `error` message.
   */
  async execute({ url }) {
    const checked = checkBlobUrl(url);
    if (!checked.ok) {
      return { error: checked.error, success: false, url };
    }
    try {
      const result = await get(checked.url, { access: "private" });
      if (result?.statusCode !== 200) {
        return { error: "Asset not found.", success: false, url };
      }

      const { contentType } = result.blob;
      const isText =
        contentType.startsWith("text/") || contentType.includes("json");
      const body = new Response(result.stream);
      const content = isText
        ? await body.text()
        : Buffer.from(await body.arrayBuffer()).toString("base64");

      return { content, contentType, isBase64: !isText, success: true, url };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Download failed",
        success: false,
        url,
      };
    }
  },
  inputSchema: z.object({
    url: z.url().describe("The full Vercel Blob URL of the asset to download."),
  }),
  outputSchema: z.object({
    content: z.string().optional(),
    contentType: z.string().optional(),
    error: z.string().optional(),
    isBase64: z.boolean().optional(),
    success: z.boolean(),
    url: z.string(),
  }),
});
