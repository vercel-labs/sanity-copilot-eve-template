import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * The parts of a `package.json` the tests read.
 */
interface PackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly engines?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly version: string;
}

/** An exact version: three numbers, with an optional prerelease tag and no range operator. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** A stable eve 1.x version: no prerelease tag. */
const STABLE_EVE_1 = /^1\.\d+\.\d+$/;

/** A caret range over a release version, such as `^7.0.172`. */
const CARET_RANGE = /^\^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Read and parse a `package.json`.
 *
 * @param path - The file to read, as a path or file URL.
 * @returns The parsed manifest.
 */
const readPackage = async (path: URL | string): Promise<PackageJson> =>
  JSON.parse(await readFile(path, "utf8")) as PackageJson;

/**
 * Split a release version into its three numbers.
 *
 * @param version - A version such as `7.0.173`.
 * @returns The major, minor, and patch numbers.
 */
const parseVersion = (version: string): number[] =>
  version.split("-")[0]?.split(".").map(Number) ?? [];

/**
 * Whether a release version satisfies a caret range with a major version above zero.
 *
 * @param version - The pinned version, such as `7.0.173`.
 * @param range - The range, such as `^7.0.172`.
 * @returns `true` when the version has the same major and is not older than the range's floor.
 * @throws When the range is not a caret range.
 */
const satisfiesCaret = (version: string, range: string): boolean => {
  const floor = CARET_RANGE.exec(range)?.slice(1).map(Number);
  if (!floor) {
    throw new TypeError(`Not a caret range: ${range}`);
  }
  const [major = 0, minor = 0, patch = 0] = parseVersion(version);
  const [floorMajor = 0, floorMinor = 0, floorPatch = 0] = floor;
  if (major !== floorMajor) {
    return false;
  }
  return minor === floorMinor ? patch >= floorPatch : minor > floorMinor;
};

const project = await readPackage(
  new URL("../../package.json", import.meta.url)
);
const eve = await readPackage(
  createRequire(import.meta.url).resolve("eve/package.json")
);
const direct = { ...project.dependencies, ...project.devDependencies };

describe("package.json", () => {
  it.each(Object.entries(direct))(
    "pins %s to an exact version",
    (_name, version) => {
      expect(version).toMatch(EXACT_VERSION);
    }
  );

  it("depends on a stable eve 1.x release, and that version is installed", () => {
    expect(project.dependencies?.eve).toMatch(STABLE_EVE_1);
    expect(eve.version).toBe(project.dependencies?.eve);
  });

  it.each(["ai", "@vercel/connect"])(
    "pins a %s version eve accepts as a peer",
    (name) => {
      const range = eve.peerDependencies?.[name] ?? "";

      expect(satisfiesCaret(project.dependencies?.[name] ?? "", range)).toBe(
        true
      );
    }
  );

  it("runs on a Node.js major eve supports, with matching Node types", () => {
    const minimum = Number(eve.engines?.node.replace(">=", ""));
    const major = Number(project.engines?.node.replace(".x", ""));

    expect(major).toBeGreaterThanOrEqual(minimum);
    expect(direct["@types/node"]?.split(".")[0]).toBe(String(major));
  });

  it("does not list vite, which would make Vercel detect a Vite app instead of eve", () => {
    expect(direct).not.toHaveProperty("vite");
    expect(direct).toHaveProperty("eve");
  });
});

describe("satisfiesCaret", () => {
  it.each([
    ["7.0.172", "^7.0.172", true],
    ["7.0.173", "^7.0.172", true],
    ["7.1.0", "^7.0.172", true],
    ["7.0.171", "^7.0.172", false],
    ["8.0.0", "^7.0.172", false],
    ["2.9.3", "^2.7.0", true],
    ["2.6.9", "^2.7.0", false],
  ])("%s against %s is %s", (version, range, expected) => {
    expect(satisfiesCaret(version, range)).toBe(expected);
  });
});
