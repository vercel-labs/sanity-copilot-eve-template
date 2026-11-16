import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import deleteAsset from "#tools/delete_asset.js";
import downloadAsset from "#tools/download_asset.js";
import getAssetInfo from "#tools/get_asset_info.js";
import { callTool } from "../helpers/tool.js";

/**
 * One intercepted HTTP request, as undici's mock passes it to a reply callback.
 */
interface InterceptedRequest {
  readonly method: string;
  readonly origin: string;
  readonly path: string;
}

/**
 * The parts of undici's `MockAgent` the tests use.
 */
interface MockAgent {
  readonly close: () => Promise<void>;
  readonly disableNetConnect: () => void;
  readonly get: (origin: RegExp) => {
    readonly intercept: (match: {
      readonly method: () => boolean;
      readonly path: () => boolean;
    }) => {
      readonly reply: (respond: (request: InterceptedRequest) => object) => {
        readonly persist: () => void;
      };
    };
  };
}

/**
 * The parts of the undici module the tests use.
 */
interface Undici {
  readonly getGlobalDispatcher: () => unknown;
  readonly MockAgent: new () => MockAgent;
  readonly setGlobalDispatcher: (dispatcher: unknown) => void;
}

/**
 * The copy of undici the Blob SDK sends its requests through.
 *
 * @remarks
 * Resolved from `@vercel/blob`'s own location, so the mock replaces the dispatcher the SDK
 * really uses rather than another installed copy.
 */
const undici = createRequire(
  createRequire(import.meta.url).resolve("@vercel/blob")
)("undici") as Undici;

/** Matches every origin, so the mock intercepts whatever host the SDK calls. */
const ANY_ORIGIN = /.*/;

/** Origin of the store the stubbed token belongs to. */
const STORE = "https://storeid.private.blob.vercel-storage.com";

/**
 * URLs the asset tools must refuse before the Blob SDK sees them.
 *
 * @remarks
 * Each one would address a memory document, or leave the store, if it were passed on: the SDK
 * requests an http(s) URL as written, and reads anything else as a pathname in the store.
 */
const REFUSED_URLS = [
  `${STORE}/eve/memory/file/someone/MEMORY.md`,
  `${STORE}/%65ve/memory/file/someone/MEMORY.md`,
  `${STORE}/eve%2Fmemory%2Ffile%2Fsomeone%2FMEMORY.md`,
  `${STORE}/drafts/../eve/memory/file/someone/MEMORY.md`,
  `${STORE}/user-preferences/U123.json`,
  "x://a.blob.vercel-storage.com/\\..\\..\\..\\..\\eve/memory/file/someone/MEMORY.md",
  "x://a.blob.vercel-storage.com/eve/memory/file/someone/MEMORY.md",
  "http://storeid.private.blob.vercel-storage.com/drafts/a.md",
  "https://storeid.private.blob.vercel-storage.com:8443/drafts/a.md",
  `${STORE}/%2565ve/memory/file/someone/MEMORY.md`,
  "https://example.com/drafts/a.md",
  "https://169.254.169.254/latest/meta-data/",
];

describe("the asset tools against the real Blob SDK, with the network intercepted", () => {
  const requests: string[] = [];
  let agent: MockAgent;
  let previous: unknown;

  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_STOREID_secret");
    requests.length = 0;
    agent = new undici.MockAgent();
    agent.disableNetConnect();
    agent
      .get(ANY_ORIGIN)
      .intercept({ method: () => true, path: () => true })
      .reply((request) => {
        requests.push(`${request.method} ${request.origin}${request.path}`);
        return {
          data: "# Launch",
          responseOptions: { headers: { "content-type": "text/markdown" } },
          statusCode: 200,
        };
      })
      .persist();
    previous = undici.getGlobalDispatcher();
    undici.setGlobalDispatcher(agent);
  });

  afterEach(async () => {
    undici.setGlobalDispatcher(previous);
    await agent.close();
  });

  it("download_asset requests exactly the URL it was given", async () => {
    const output = await callTool(downloadAsset, {
      url: `${STORE}/drafts/a.md`,
    });

    expect(requests).toEqual([`GET ${STORE}/drafts/a.md`]);
    expect(output).toMatchObject({ content: "# Launch", success: true });
  });

  it("download_asset requests the parsed form of a URL written another way", async () => {
    await callTool(downloadAsset, {
      url: "HTTPS://StoreID.Private.BLOB.vercel-storage.com/drafts/../drafts/a.md",
    });

    expect(requests).toEqual([`GET ${STORE}/drafts/a.md`]);
  });

  it.each(REFUSED_URLS)(
    "download_asset sends no request for %s",
    async (url) => {
      const output = await callTool(downloadAsset, { url });

      expect(requests).toEqual([]);
      expect(output.success).toBe(false);
      expect(output.content).toBeUndefined();
    }
  );

  it.each(REFUSED_URLS)(
    "get_asset_info sends no request for %s",
    async (url) => {
      const output = await callTool(getAssetInfo, { url });

      expect(requests).toEqual([]);
      expect(output.exists).toBe(false);
    }
  );

  it.each(REFUSED_URLS)("delete_asset sends no request for %s", async (url) => {
    const output = await callTool(deleteAsset, { url });

    expect(requests).toEqual([]);
    expect(output.deleted).toBe(false);
  });
});
