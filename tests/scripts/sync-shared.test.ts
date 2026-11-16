import { execFile } from "node:child_process";
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

/** Repository root, two levels above this file's folder. */
const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

/** The folder that holds the single source of each shared file. */
const SOURCE = "shared-references";

/** The root agent's copy of the shared files. */
const ROOT_COPY = "agent/skills/writing-quality/references";

/** The reviewer subagent's copy of the shared files. */
const REVIEWER_COPY =
  "agent/subagents/reviewer/skills/writing-quality/references";

/** Every folder that receives a copy. */
const TARGETS = [ROOT_COPY, REVIEWER_COPY];

/** One of the shared files, used to make a copy go stale. */
const SHARED_FILE = "ai-phrases-to-avoid.md";

/**
 * The outcome of one run of the sync script.
 */
interface ScriptRun {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Copy the script and the folders it works on into a scratch directory.
 *
 * @remarks
 * The script resolves its paths from its own location, so a copy under a scratch root works on
 * the scratch folders and never touches the repository. The root is resolved to its real path,
 * because the script reports real paths and the system temp directory may be a symlink.
 *
 * @returns The scratch root.
 */
const createSandbox = async (): Promise<string> => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "sync-shared-")));
  await Promise.all(
    ["scripts/sync-shared.mjs", SOURCE, ...TARGETS].map((path) =>
      cp(join(ROOT_DIR, path), join(root, path), { recursive: true })
    )
  );
  return root;
};

/**
 * Run the sync script from a root directory.
 *
 * @param root - The directory that holds `scripts/sync-shared.mjs`.
 * @param args - Extra command-line arguments, such as `--check`.
 * @returns The exit code and output.
 */
const runScript = async (
  root: string,
  ...args: readonly string[]
): Promise<ScriptRun> => {
  try {
    const { stderr, stdout } = await promisify(execFile)(process.execPath, [
      join(root, "scripts/sync-shared.mjs"),
      ...args,
    ]);
    return { code: 0, stderr, stdout };
  } catch (error) {
    const { code, stderr, stdout } = error as ScriptRun;
    return { code, stderr, stdout };
  }
};

describe("the shared references in this repository", () => {
  it("are copied word for word into both writing-quality skills", async () => {
    const names = (await readdir(join(ROOT_DIR, SOURCE))).filter((name) =>
      name.endsWith(".md")
    );

    expect(names.sort()).toEqual([
      "ai-phrases-to-avoid.md",
      "plain-english-alternatives.md",
    ]);
    const pairs = names.flatMap((name) =>
      TARGETS.map((target) => [
        join(ROOT_DIR, SOURCE, name),
        join(ROOT_DIR, target, name),
      ])
    );
    const contents = await Promise.all(
      pairs.map((pair) =>
        Promise.all(pair.map((path) => readFile(path, "utf8")))
      )
    );

    expect(contents).toHaveLength(4);
    for (const [source, copy] of contents) {
      expect(copy).toBe(source);
    }
  });
});

describe("scripts/sync-shared.mjs", () => {
  const sandboxes: string[] = [];

  /**
   * Create a scratch copy that is removed after the test.
   *
   * @returns The scratch root.
   */
  const sandbox = async (): Promise<string> => {
    const root = await createSandbox();
    sandboxes.push(root);
    return root;
  };

  afterEach(async () => {
    await Promise.all(
      sandboxes
        .splice(0)
        .map((root) => rm(root, { force: true, recursive: true }))
    );
  });

  it("passes --check when every copy matches its source", async () => {
    const root = await sandbox();

    const run = await runScript(root, "--check");

    expect(run).toMatchObject({
      code: 0,
      stdout: "Shared references are up to date.\n",
    });
  });

  it("fails --check on a stale copy, names it, and leaves it alone", async () => {
    const root = await sandbox();
    const stale = join(root, REVIEWER_COPY, SHARED_FILE);
    await writeFile(stale, "edited by hand\n");

    const run = await runScript(root, "--check");

    expect(run.code).toBe(1);
    expect(run.stderr).toContain(`Out of date: ${stale}.`);
    expect(run.stderr).toContain("pnpm sync:shared");
    expect(await readFile(stale, "utf8")).toBe("edited by hand\n");
  });

  it("fails --check when a copy is missing", async () => {
    const root = await sandbox();
    const missing = join(root, ROOT_COPY, SHARED_FILE);
    await rm(missing);

    const run = await runScript(root, "--check");

    expect(run.code).toBe(1);
    expect(run.stderr).toContain(missing);
  });

  it("rewrites stale and missing copies from the source, then passes --check", async () => {
    const root = await sandbox();
    const source = await readFile(join(root, SOURCE, SHARED_FILE), "utf8");
    const stale = join(root, REVIEWER_COPY, SHARED_FILE);
    const missing = join(root, ROOT_COPY, SHARED_FILE);
    await writeFile(stale, "edited by hand\n");
    await rm(missing);

    const sync = await runScript(root);

    expect(sync).toMatchObject({
      code: 0,
      stdout: "Synced 2 shared reference file(s).\n",
    });
    expect(await readFile(stale, "utf8")).toBe(source);
    expect(await readFile(missing, "utf8")).toBe(source);
    expect(await runScript(root, "--check")).toMatchObject({ code: 0 });
  });

  it("copies an edit to a source file into both skills", async () => {
    const root = await sandbox();
    await writeFile(join(root, SOURCE, SHARED_FILE), "new rule\n");

    await runScript(root);

    const copies = await Promise.all(
      TARGETS.map((target) => readFile(join(root, target, SHARED_FILE), "utf8"))
    );

    expect(copies).toEqual(["new rule\n", "new rule\n"]);
  });

  it("leaves the files each skill maintains by hand untouched", async () => {
    const root = await sandbox();
    const handKept = join(root, REVIEWER_COPY, "web-content-specs.md");
    const before = await readFile(handKept, "utf8");

    await runScript(root);

    expect(await readFile(handKept, "utf8")).toBe(before);
  });
});
