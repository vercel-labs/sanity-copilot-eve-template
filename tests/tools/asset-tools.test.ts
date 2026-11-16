import { del, get, head, list, put } from "@vercel/blob";
import { describe, expect, it, vi } from "vitest";
import { NOT_BLOB_URL_ERROR } from "#lib/blob-url.js";
import { RESERVED_PATH_ERROR } from "#lib/reserved-paths.js";
import deleteAsset from "#tools/delete_asset.js";
import downloadAsset from "#tools/download_asset.js";
import getAssetInfo from "#tools/get_asset_info.js";
import listAssets from "#tools/list_assets.js";
import uploadAsset from "#tools/upload_asset.js";
import { acceptsInput, callTool, parseInput } from "../helpers/tool.js";

vi.mock("@vercel/blob", () => ({
  del: vi.fn(),
  get: vi.fn(),
  head: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
}));

/** Origin of the private Blob store the test URLs point at. */
const STORE = "https://store.private.blob.vercel-storage.com";

/** Upload time every fake Blob result reports. */
const UPLOADED_AT = new Date("2026-11-01T09:30:00.000Z");

/** A URL under each reserved prefix, plus disguises the URL check sees through. */
const RESERVED_URLS = [
  `${STORE}/eve/memory/file/someone.md`,
  `${STORE}/user-preferences/U123.json`,
  `${STORE}/%65ve/memory/file/someone.md`,
  `${STORE}//eve/memory/file/someone.md`,
];

/**
 * URLs that are not https Vercel Blob URLs.
 *
 * @remarks
 * The first reaches a memory document if it gets to the Blob SDK: the SDK reads a string with
 * an unknown scheme as a pathname in the project's store, and the `..` segments climb to the
 * store's root.
 */
const NOT_BLOB_URLS = [
  "x://a.blob.vercel-storage.com/\\..\\..\\..\\..\\eve/memory/file/someone.md",
  "http://store.private.blob.vercel-storage.com/drafts/a.md",
  "https://example.com/drafts/a.md",
  "https://169.254.169.254/latest/meta-data/",
  "http://localhost:3000/eve/v1/info",
  "https://blob.vercel-storage.com/drafts/a.md",
  "https://evilblob.vercel-storage.com/drafts/a.md",
  "https://store.blob.vercel-storage.com.evil.example/drafts/a.md",
  "https://evil.example/?host=store.blob.vercel-storage.com",
  "https://store.blob.vercel-storage.com@evil.example/drafts/a.md",
  "file:///etc/passwd",
];

/** A valid Blob URL written so that it differs from its parsed form. */
const UNNORMALIZED_URL =
  "HTTPS://Store.Private.BLOB.vercel-storage.com/drafts/../drafts/a.md";

/**
 * Build the `put` result for a stored file.
 *
 * @param pathname - The stored pathname.
 * @param contentType - The stored content type.
 * @returns A complete `PutBlobResult`.
 */
const putResult = (pathname: string, contentType: string) => ({
  contentDisposition: `attachment; filename="${pathname}"`,
  contentType,
  downloadUrl: `${STORE}/${pathname}?download=1`,
  etag: '"etag"',
  pathname,
  url: `${STORE}/${pathname}`,
});

/**
 * Build one entry of a `list` result.
 *
 * @param pathname - The stored pathname.
 * @param size - The size in bytes.
 * @returns A complete `ListBlobResultBlob`.
 */
const listedBlob = (pathname: string, size: number) => ({
  downloadUrl: `${STORE}/${pathname}?download=1`,
  etag: '"etag"',
  pathname,
  size,
  uploadedAt: UPLOADED_AT,
  url: `${STORE}/${pathname}`,
});

/**
 * Build a successful `get` result that streams the given bytes.
 *
 * @param pathname - The stored pathname.
 * @param contentType - The stored content type.
 * @param body - The file contents.
 * @returns A `GetBlobResult` with status 200.
 */
const getResult = (
  pathname: string,
  contentType: string,
  body: string | Uint8Array<ArrayBuffer>
) => ({
  blob: {
    cacheControl: "private",
    contentDisposition: `attachment; filename="${pathname}"`,
    contentType,
    downloadUrl: `${STORE}/${pathname}?download=1`,
    etag: '"etag"',
    pathname,
    size: body.length,
    uploadedAt: UPLOADED_AT,
    url: `${STORE}/${pathname}`,
  },
  headers: new Headers(),
  statusCode: 200 as const,
  stream: new Blob([body]).stream(),
});

describe("upload_asset", () => {
  it("stores text privately, without a random suffix or overwrite, by default", async () => {
    vi.mocked(put).mockResolvedValue(
      putResult("drafts/post.md", "text/markdown")
    );

    const output = await callTool(uploadAsset, {
      content: "# Launch",
      pathname: "drafts/post.md",
    });

    expect(put).toHaveBeenCalledExactlyOnceWith("drafts/post.md", "# Launch", {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: undefined,
    });
    expect(output).toEqual({
      contentType: "text/markdown",
      pathname: "drafts/post.md",
      success: true,
      url: `${STORE}/drafts/post.md`,
    });
  });

  it("passes the content type, suffix, and overwrite options through", async () => {
    vi.mocked(put).mockResolvedValue(
      putResult("drafts/post-abc123.md", "text/markdown")
    );

    await callTool(uploadAsset, {
      addRandomSuffix: true,
      allowOverwrite: true,
      content: "# Launch",
      contentType: "text/markdown",
      pathname: "drafts/post.md",
    });

    expect(put).toHaveBeenCalledExactlyOnceWith("drafts/post.md", "# Launch", {
      access: "private",
      addRandomSuffix: true,
      allowOverwrite: true,
      contentType: "text/markdown",
    });
  });

  it("decodes base64 content into bytes before storing it", async () => {
    vi.mocked(put).mockResolvedValue(putResult("images/dot.png", "image/png"));
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);

    await callTool(uploadAsset, {
      content: bytes.toString("base64"),
      isBase64: true,
      pathname: "images/dot.png",
    });

    const [, body] = vi.mocked(put).mock.calls[0] ?? [];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body).toEqual(bytes);
  });

  it("can't be made to write a public file", async () => {
    vi.mocked(put).mockResolvedValue(
      putResult("drafts/post.md", "text/markdown")
    );
    const requested = {
      access: "public",
      content: "# Launch",
      pathname: "drafts/post.md",
    };

    expect(await parseInput(uploadAsset, requested)).not.toHaveProperty(
      "access"
    );
    await callTool(uploadAsset, requested);
    expect(vi.mocked(put).mock.calls[0]?.[2]).toMatchObject({
      access: "private",
    });
  });

  it.each([
    "eve/memory/file/someone.md",
    "user-preferences/U123.json",
    "/eve/memory/file/someone.md",
    "drafts/../eve/memory/file/someone.md",
    "%65ve/memory/file/someone.md",
    "drafts\\..\\eve\\memory\\someone.md",
  ])(
    "refuses the reserved path %s without touching storage",
    async (pathname) => {
      const output = await callTool(uploadAsset, {
        content: "not a preference",
        contentType: "text/markdown",
        pathname,
      });

      expect(put).not.toHaveBeenCalled();
      expect(output).toEqual({
        contentType: "text/markdown",
        error: RESERVED_PATH_ERROR,
        pathname,
        success: false,
        url: "",
      });
    }
  );

  it("reports a storage failure instead of throwing", async () => {
    vi.mocked(put).mockRejectedValue(new Error("This blob already exists"));

    const output = await callTool(uploadAsset, {
      content: "# Launch",
      pathname: "drafts/post.md",
    });

    expect(output).toEqual({
      contentType: "unknown",
      error: "This blob already exists",
      pathname: "drafts/post.md",
      success: false,
      url: "",
    });
  });

  it("reports a generic error when storage rejects with a non-error", async () => {
    vi.mocked(put).mockRejectedValue("boom");

    const output = await callTool(uploadAsset, {
      content: "# Launch",
      pathname: "drafts/post.md",
    });

    expect(output).toMatchObject({ error: "Upload failed", success: false });
  });

  it.each([
    { content: "x", pathname: "" },
    { pathname: "a.md" },
    { content: "x" },
    { content: 1, pathname: "a.md" },
  ])("rejects the input %j", async (input) => {
    expect(await acceptsInput(uploadAsset, input)).toBe(false);
  });
});

describe("list_assets", () => {
  it("lists assets with ISO dates and passes the prefix and limit through", async () => {
    vi.mocked(list).mockResolvedValue({
      blobs: [listedBlob("drafts/a.md", 12), listedBlob("drafts/b.md", 34)],
      cursor: "next-page",
      hasMore: true,
    });

    const output = await callTool(listAssets, { limit: 2, prefix: "drafts/" });

    expect(list).toHaveBeenCalledExactlyOnceWith({
      limit: 2,
      prefix: "drafts/",
    });
    expect(output).toEqual({
      assets: [
        {
          pathname: "drafts/a.md",
          size: 12,
          uploadedAt: "2026-11-01T09:30:00.000Z",
          url: `${STORE}/drafts/a.md`,
        },
        {
          pathname: "drafts/b.md",
          size: 34,
          uploadedAt: "2026-11-01T09:30:00.000Z",
          url: `${STORE}/drafts/b.md`,
        },
      ],
      count: 2,
      cursor: "next-page",
      hasMore: true,
    });
  });

  it("hides files under the reserved prefixes, and counts only what it shows", async () => {
    vi.mocked(list).mockResolvedValue({
      blobs: [
        listedBlob("drafts/a.md", 12),
        listedBlob("eve/memory/file/someone.md", 99),
        listedBlob("user-preferences/U123.json", 99),
      ],
      hasMore: false,
    });

    const output = await callTool(listAssets, {});

    expect(output.assets.map((asset) => asset.pathname)).toEqual([
      "drafts/a.md",
    ]);
    expect(output.count).toBe(1);
    expect(JSON.stringify(output)).not.toContain("someone");
  });

  it("hides reserved files even when the model asks for the reserved prefix", async () => {
    vi.mocked(list).mockResolvedValue({
      blobs: [listedBlob("eve/memory/file/someone.md", 99)],
      hasMore: false,
    });

    const output = await callTool(listAssets, { prefix: "eve/memory/" });

    expect(output).toMatchObject({ assets: [], count: 0, hasMore: false });
  });

  it("returns an empty list with the error when storage fails", async () => {
    vi.mocked(list).mockRejectedValue(new Error("Store not found"));

    const output = await callTool(listAssets, {});

    expect(output).toEqual({
      assets: [],
      count: 0,
      error: "Store not found",
      hasMore: false,
    });
  });

  it.each([0, 1001, 1.5, -1])("rejects the limit %s", async (limit) => {
    expect(await acceptsInput(listAssets, { limit })).toBe(false);
  });

  it.each([1, 1000])("accepts the limit %s", async (limit) => {
    expect(await acceptsInput(listAssets, { limit })).toBe(true);
  });
});

describe("get_asset_info", () => {
  it("returns the asset's metadata", async () => {
    vi.mocked(head).mockResolvedValue({
      cacheControl: "private",
      contentDisposition: 'attachment; filename="a.md"',
      contentType: "text/markdown",
      downloadUrl: `${STORE}/drafts/a.md?download=1`,
      etag: '"etag"',
      pathname: "drafts/a.md",
      size: 12,
      uploadedAt: UPLOADED_AT,
      url: `${STORE}/drafts/a.md`,
    });

    const output = await callTool(getAssetInfo, {
      url: `${STORE}/drafts/a.md`,
    });

    expect(head).toHaveBeenCalledExactlyOnceWith(`${STORE}/drafts/a.md`);
    expect(output).toEqual({
      contentType: "text/markdown",
      exists: true,
      pathname: "drafts/a.md",
      size: 12,
      uploadedAt: "2026-11-01T09:30:00.000Z",
      url: `${STORE}/drafts/a.md`,
    });
    expect(JSON.stringify(output)).not.toContain("download=1");
  });

  it.each(RESERVED_URLS)(
    "refuses the reserved URL %s without a lookup",
    async (url) => {
      const output = await callTool(getAssetInfo, { url });

      expect(head).not.toHaveBeenCalled();
      expect(output).toEqual({
        error: RESERVED_PATH_ERROR,
        exists: false,
        url,
      });
    }
  );

  it.each(NOT_BLOB_URLS)(
    "refuses the non-Blob URL %s without a lookup",
    async (url) => {
      const output = await callTool(getAssetInfo, { url });

      expect(head).not.toHaveBeenCalled();
      expect(output).toEqual({ error: NOT_BLOB_URL_ERROR, exists: false, url });
    }
  );

  it("passes the Blob SDK the parsed URL, not the string the model wrote", async () => {
    vi.mocked(head).mockRejectedValue(new Error("not found"));

    await callTool(getAssetInfo, { url: UNNORMALIZED_URL });

    expect(head).toHaveBeenCalledExactlyOnceWith(`${STORE}/drafts/a.md`);
  });

  it("reports a missing asset as not existing", async () => {
    vi.mocked(head).mockRejectedValue(
      new Error("The requested blob does not exist")
    );

    const output = await callTool(getAssetInfo, {
      url: `${STORE}/drafts/missing.md`,
    });

    expect(output).toEqual({
      error: "The requested blob does not exist",
      exists: false,
      url: `${STORE}/drafts/missing.md`,
    });
  });

  it("rejects input that isn't a URL", async () => {
    expect(await acceptsInput(getAssetInfo, { url: "drafts/a.md" })).toBe(
      false
    );
    expect(await acceptsInput(getAssetInfo, {})).toBe(false);
  });
});

describe("download_asset", () => {
  it("reads text content through the Blob SDK with private access", async () => {
    vi.mocked(get).mockResolvedValue(
      getResult("drafts/a.md", "text/markdown", "# Launch")
    );

    const output = await callTool(downloadAsset, {
      url: `${STORE}/drafts/a.md`,
    });

    expect(get).toHaveBeenCalledExactlyOnceWith(`${STORE}/drafts/a.md`, {
      access: "private",
    });
    expect(output).toEqual({
      content: "# Launch",
      contentType: "text/markdown",
      isBase64: false,
      success: true,
      url: `${STORE}/drafts/a.md`,
    });
  });

  it("returns JSON as text", async () => {
    vi.mocked(get).mockResolvedValue(
      getResult("data/a.json", "application/json", '{"a":1}')
    );

    const output = await callTool(downloadAsset, {
      url: `${STORE}/data/a.json`,
    });

    expect(output).toMatchObject({ content: '{"a":1}', isBase64: false });
  });

  it("returns binary content base64-encoded", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    vi.mocked(get).mockResolvedValue(
      getResult("images/dot.png", "image/png", bytes)
    );

    const output = await callTool(downloadAsset, {
      url: `${STORE}/images/dot.png`,
    });

    expect(output).toMatchObject({
      contentType: "image/png",
      isBase64: true,
      success: true,
    });
    expect(Buffer.from(output.content ?? "", "base64")).toEqual(
      Buffer.from(bytes)
    );
  });

  it.each(RESERVED_URLS)(
    "refuses the reserved URL %s without a read",
    async (url) => {
      const output = await callTool(downloadAsset, { url });

      expect(get).not.toHaveBeenCalled();
      expect(output).toEqual({
        error: RESERVED_PATH_ERROR,
        success: false,
        url,
      });
    }
  );

  it.each(NOT_BLOB_URLS)(
    "refuses the non-Blob URL %s without a request",
    async (url) => {
      const output = await callTool(downloadAsset, { url });

      expect(get).not.toHaveBeenCalled();
      expect(output).toEqual({
        error: NOT_BLOB_URL_ERROR,
        success: false,
        url,
      });
    }
  );

  it("passes the Blob SDK the parsed URL, not the string the model wrote", async () => {
    vi.mocked(get).mockResolvedValue(
      getResult("drafts/a.md", "text/markdown", "# Launch")
    );

    const output = await callTool(downloadAsset, { url: UNNORMALIZED_URL });

    expect(get).toHaveBeenCalledExactlyOnceWith(`${STORE}/drafts/a.md`, {
      access: "private",
    });
    expect(output).toMatchObject({ success: true, url: UNNORMALIZED_URL });
  });

  it("reports a missing asset", async () => {
    vi.mocked(get).mockResolvedValue(null);

    const output = await callTool(downloadAsset, {
      url: `${STORE}/drafts/missing.md`,
    });

    expect(output).toEqual({
      error: "Asset not found.",
      success: false,
      url: `${STORE}/drafts/missing.md`,
    });
  });

  it("reports a read failure instead of throwing", async () => {
    vi.mocked(get).mockRejectedValue(new Error("Access denied"));

    const output = await callTool(downloadAsset, {
      url: `${STORE}/drafts/a.md`,
    });

    expect(output).toEqual({
      error: "Access denied",
      success: false,
      url: `${STORE}/drafts/a.md`,
    });
  });

  it("rejects input that isn't a URL", async () => {
    expect(await acceptsInput(downloadAsset, { url: "drafts/a.md" })).toBe(
      false
    );
    expect(await acceptsInput(downloadAsset, {})).toBe(false);
  });
});

describe("delete_asset", () => {
  it("is gated on approval", async () => {
    const { approval } = deleteAsset;

    expect(approval).toBeTypeOf("function");
    await expect(
      Promise.resolve(
        typeof approval === "function" ? approval({} as never) : approval
      )
    ).resolves.toBe("user-approval");
  });

  it("deletes the asset by URL", async () => {
    vi.mocked(del).mockResolvedValue(undefined);

    const output = await callTool(deleteAsset, { url: `${STORE}/drafts/a.md` });

    expect(del).toHaveBeenCalledExactlyOnceWith(`${STORE}/drafts/a.md`);
    expect(output).toEqual({
      deleted: true,
      success: true,
      url: `${STORE}/drafts/a.md`,
    });
  });

  it.each(RESERVED_URLS)(
    "refuses the reserved URL %s without deleting",
    async (url) => {
      const output = await callTool(deleteAsset, { url });

      expect(del).not.toHaveBeenCalled();
      expect(output).toEqual({
        deleted: false,
        error: RESERVED_PATH_ERROR,
        success: false,
        url,
      });
    }
  );

  it.each(NOT_BLOB_URLS)(
    "refuses the non-Blob URL %s without deleting",
    async (url) => {
      const output = await callTool(deleteAsset, { url });

      expect(del).not.toHaveBeenCalled();
      expect(output).toEqual({
        deleted: false,
        error: NOT_BLOB_URL_ERROR,
        success: false,
        url,
      });
    }
  );

  it("passes the Blob SDK the parsed URL, not the string the model wrote", async () => {
    vi.mocked(del).mockResolvedValue(undefined);

    await callTool(deleteAsset, { url: UNNORMALIZED_URL });

    expect(del).toHaveBeenCalledExactlyOnceWith(`${STORE}/drafts/a.md`);
  });

  it("reports a delete failure instead of throwing", async () => {
    vi.mocked(del).mockRejectedValue(new Error("Access denied"));

    const output = await callTool(deleteAsset, { url: `${STORE}/drafts/a.md` });

    expect(output).toEqual({
      deleted: false,
      error: "Access denied",
      success: false,
      url: `${STORE}/drafts/a.md`,
    });
  });

  it("rejects input that isn't a URL", async () => {
    expect(await acceptsInput(deleteAsset, { url: "drafts/a.md" })).toBe(false);
    expect(await acceptsInput(deleteAsset, {})).toBe(false);
  });
});
