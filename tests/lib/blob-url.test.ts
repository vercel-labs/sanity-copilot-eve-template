import { describe, expect, it } from "vitest";
import {
  checkBlobUrl,
  MALFORMED_URL_ERROR,
  NOT_BLOB_URL_ERROR,
} from "#lib/blob-url.js";
import { RESERVED_PATH_ERROR } from "#lib/reserved-paths.js";

/** Origin of the private Blob store the test URLs point at. */
const STORE = "https://store.private.blob.vercel-storage.com";

describe("checkBlobUrl", () => {
  it.each([
    `${STORE}/drafts/post.md`,
    `${STORE}/drafts/launch%20post.md`,
    `${STORE}/images/eve/memory/cover.png`,
    `${STORE}/drafts/post.md?download=1`,
    `${STORE}/?prefix=eve/memory/`,
    `${STORE}/drafts/post.md#eve/memory/`,
    `${STORE}/reports/100%25.pdf`,
  ])("accepts %s as written", (url) => {
    expect(checkBlobUrl(url)).toEqual({ ok: true, url });
  });

  it("returns the parsed URL, not the input string", () => {
    expect(
      checkBlobUrl("HTTPS://Store.Private.BLOB.vercel-storage.com/a/../b.md")
    ).toEqual({ ok: true, url: `${STORE}/b.md` });
    expect(checkBlobUrl(`${STORE}\\drafts\\post.md`)).toEqual({
      ok: true,
      url: `${STORE}/drafts/post.md`,
    });
  });

  it.each([
    `${STORE}/eve/memory/file/someone.md`,
    `${STORE}/user-preferences/U123.json`,
    `${STORE}//eve/memory/file/someone.md`,
    `${STORE}/drafts/../eve/memory/file/someone.md`,
    `${STORE}/eve/memory/file/someone.md?download=1`,
    `${STORE}\\eve\\memory\\file\\someone.md`,
  ])("refuses the reserved URL %s", (url) => {
    expect(checkBlobUrl(url)).toEqual({
      error: RESERVED_PATH_ERROR,
      ok: false,
    });
  });

  it.each([
    `${STORE}/%65ve/memory/file/someone.md`,
    `${STORE}/eve%2Fmemory%2Ffile%2Fsomeone.md`,
    `${STORE}/eve/%6Demory/file/someone.md`,
    `${STORE}/drafts/%2E%2E/eve/memory/file/someone.md`,
    `${STORE}/drafts%5C..%5Ceve/memory/file/someone.md`,
    `${STORE}/user%2Dpreferences/U123.json`,
    `${STORE}/%2565ve/memory/file/someone.md`,
    `${STORE}/eve%252Fmemory%252Ffile%252Fsomeone.md`,
  ])("refuses the percent-encoded reserved URL %s", (url) => {
    expect(checkBlobUrl(url)).toEqual({
      error: RESERVED_PATH_ERROR,
      ok: false,
    });
  });

  it.each([
    "x://a.blob.vercel-storage.com/\\..\\..\\..\\..\\eve/memory/file/someone.md",
    "x://a.blob.vercel-storage.com/drafts/post.md",
    "http://store.private.blob.vercel-storage.com/drafts/post.md",
    "ftp://store.private.blob.vercel-storage.com/drafts/post.md",
    "blob:https://store.private.blob.vercel-storage.com/drafts/post.md",
    "x:eve/memory/file/someone.md",
    "file:///etc/passwd",
  ])("refuses %s, which is not an https URL", (url) => {
    expect(checkBlobUrl(url)).toEqual({ error: NOT_BLOB_URL_ERROR, ok: false });
  });

  it.each([
    "https://example.com/drafts/post.md",
    "https://169.254.169.254/latest/meta-data/",
    "https://localhost:3000/eve/v1/info",
    "https://blob.vercel-storage.com/drafts/post.md",
    "https://evilblob.vercel-storage.com/drafts/post.md",
    "https://store.blob.vercel-storage.com.evil.example/drafts/post.md",
    "https://evil.example/?host=store.blob.vercel-storage.com",
    "https://store.blob.vercel-storage.com@evil.example/drafts/post.md",
    "https://evil.example/store.blob.vercel-storage.com/drafts/post.md",
    "https://store.private.blob.vercel-storage.com:8443/drafts/post.md",
    "https://store.private.blob.vercel-storage.com./drafts/post.md",
  ])("refuses %s, which is not on a Blob host", (url) => {
    expect(checkBlobUrl(url)).toEqual({ error: NOT_BLOB_URL_ERROR, ok: false });
  });

  it.each([
    "https://user@store.private.blob.vercel-storage.com/drafts/post.md",
    "https://user:secret@store.private.blob.vercel-storage.com/drafts/post.md",
  ])("refuses %s, which carries credentials", (url) => {
    expect(checkBlobUrl(url)).toEqual({ error: NOT_BLOB_URL_ERROR, ok: false });
  });

  it.each([
    `${STORE}/eve/memory/%E0%A4%A`,
    `${STORE}/reports/50%.md`,
    `${STORE}/reports/Q3%E9.pdf`,
  ])("refuses %s, whose path can't be decoded, and says why", (url) => {
    expect(checkBlobUrl(url)).toEqual({
      error: MALFORMED_URL_ERROR,
      ok: false,
    });
  });

  it.each(["drafts/post.md", "not a url", ""])(
    "refuses %j, which can't be read as a URL",
    (url) => {
      expect(checkBlobUrl(url)).toEqual({
        error: NOT_BLOB_URL_ERROR,
        ok: false,
      });
    }
  );

  it("explains a refusal without naming the reserved prefixes", () => {
    expect(NOT_BLOB_URL_ERROR).toContain("blob.vercel-storage.com");
    expect(NOT_BLOB_URL_ERROR).not.toContain("eve/memory");
  });
});
