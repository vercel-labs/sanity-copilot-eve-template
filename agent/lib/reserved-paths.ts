/**
 * Blob path prefixes the general-purpose asset tools refuse.
 *
 * @remarks
 * `eve/memory/` is where eve's file memory keeps each user's preferences in the project's Blob
 * store. Nothing in the agent reads or writes `user-preferences/`, but an older store may still
 * hold per-user preference files there, and the asset tools must not expose them.
 * The asset tools (`upload_asset`, `list_assets`, `get_asset_info`, `download_asset`,
 * `delete_asset`) treat both as off-limits, so they can't be used as a side channel to read or
 * overwrite another user's preferences.
 */
const RESERVED_PREFIXES = ["eve/memory/", "user-preferences/"] as const;

/**
 * Error returned by an asset tool asked to touch a reserved path.
 */
export const RESERVED_PATH_ERROR =
  "That path is reserved for user preferences and isn't available to the asset tools.";

/** Characters that separate the segments of a pathname: a slash or a backslash. */
const SEPARATORS = /[\\/]/;

/**
 * Reduce a Blob pathname to the form the reserved-prefix check compares.
 *
 * @remarks
 * Drops empty and `.` segments and resolves `..`, so `/eve/memory/x`, `eve//memory/x`, and
 * `drafts/../eve/memory/x` all compare as `eve/memory/x/`. A backslash counts as a separator
 * too, because URL parsers read it as a slash. The trailing slash lets a prefix match the
 * folder itself as well as the files under it.
 *
 * @param pathname - A Blob object pathname, with or without a leading slash.
 * @returns The normalized pathname, ending in a slash.
 */
const normalizePath = (pathname: string): string => {
  const segments: string[] = [];
  for (const segment of pathname.split(SEPARATORS)) {
    if (segment === "..") {
      segments.pop();
    } else if (segment !== "" && segment !== ".") {
      segments.push(segment);
    }
  }
  return `${segments.join("/")}/`;
};

/**
 * Whether a Blob pathname falls under a reserved prefix.
 *
 * @remarks
 * The pathname is normalized first (see {@link normalizePath}), so a leading slash, a doubled
 * slash, a backslash, or a `..` segment can't step around the check. Its percent-decoded form
 * is checked as well, so `%65ve/memory/x` is refused whether or not the store would decode it;
 * a pathname that can't be decoded is checked as written. The asset tools that take a URL check
 * it with `checkBlobUrl` (`agent/lib/blob-url.ts`), which applies this to the URL's decoded
 * path.
 *
 * @param pathname - A Blob object pathname, e.g. `drafts/post.md`.
 * @returns `true` when the path is reserved.
 */
export const isReservedPath = (pathname: string): boolean => {
  const forms = [pathname];
  try {
    forms.push(decodeURIComponent(pathname));
  } catch {
    forms.length = 1;
  }
  return forms.some((form) => {
    const normalized = normalizePath(form);
    return RESERVED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  });
};
