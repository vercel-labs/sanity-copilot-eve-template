import { isReservedPath, RESERVED_PATH_ERROR } from "./reserved-paths.js";

/**
 * Host suffix a Blob URL's hostname must end with.
 */
const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

/**
 * Error returned by an asset tool given a URL that is not an https Vercel Blob URL.
 */
export const NOT_BLOB_URL_ERROR = `Only Vercel Blob URLs (https://*${BLOB_HOST_SUFFIX}/...) are accepted.`;

/**
 * Error returned by an asset tool given a Blob URL whose path can't be percent-decoded.
 */
export const MALFORMED_URL_ERROR =
  "That URL's path has a malformed percent-escape. Write a literal % as %25.";

/**
 * The outcome of checking a model-supplied Blob URL: the URL to hand the Blob SDK, or the error
 * to return instead.
 */
export type BlobUrlCheck =
  | { readonly error: string; readonly ok: false }
  | { readonly ok: true; readonly url: string };

/**
 * Check a model-supplied URL before an asset tool passes it to the Blob SDK.
 *
 * @remarks
 * The asset tools that address a file by URL (`download_asset`, `get_asset_info`, and
 * `delete_asset`) take that URL from the model, so it is checked here, in one place, and the
 * tools pass on only what this function returns:
 *
 * - It must be an `https:` URL on a `*.blob.vercel-storage.com` host, on the default port and
 *   without credentials. That keeps the tools from being pointed at an internal or third-party
 *   address (an SSRF vector).
 *   The scheme matters as much as the host: the Blob SDK treats anything that doesn't start
 *   with `http://` or `https://` as a pathname in the project's own store, so a URL with
 *   another scheme would be read as a path, with `..` segments free to climb out of it.
 * - Its path must not fall under a reserved prefix (see {@link isReservedPath}). A URL path is
 *   percent-encoded, so it is decoded before that check: `%65ve/memory/x` names the same object
 *   as `eve/memory/x`. A path with a malformed escape is refused, since what it addresses can't
 *   be known.
 *
 * The returned `url` is the parsed URL written back out, not the input string, so the SDK
 * requests exactly the address that was checked.
 *
 * @param input - The URL as the model supplied it.
 * @returns `ok: true` with the URL to pass to the Blob SDK, or `ok: false` with the error.
 */
export const checkBlobUrl = (input: string): BlobUrlCheck => {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { error: NOT_BLOB_URL_ERROR, ok: false };
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.endsWith(BLOB_HOST_SUFFIX) ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    return { error: NOT_BLOB_URL_ERROR, ok: false };
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return { error: MALFORMED_URL_ERROR, ok: false };
  }
  if (isReservedPath(pathname)) {
    return { error: RESERVED_PATH_ERROR, ok: false };
  }
  return { ok: true, url: parsed.href };
};
