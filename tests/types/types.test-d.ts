import type { WorkflowToolContext } from "eve/tools";
import { describe, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import root from "#agent.js";
import { asRecord, hasFindings, toolScript } from "#evals/shared.js";
import { type BlobUrlCheck, checkBlobUrl } from "#lib/blob-url.js";
import type {
  DECISION_MODEL,
  DEEP_RESEARCH_MODEL,
  REVIEW_MODEL,
  ROOT_MODEL,
  STANDARD_RESEARCH_MODEL,
} from "#lib/models.js";
import { isReservedPath, RESERVED_PATH_ERROR } from "#lib/reserved-paths.js";
import { REVIEW_SCHEMA } from "#lib/review-schema.js";
import { askSubagent } from "#lib/subagent.js";
import type deleteAsset from "#tools/delete_asset.js";
import type downloadAsset from "#tools/download_asset.js";
import type getAssetInfo from "#tools/get_asset_info.js";
import type listAssets from "#tools/list_assets.js";
import research from "#tools/research.js";
import reviewDraft from "#tools/review_draft.js";
import type uploadAsset from "#tools/upload_asset.js";

/**
 * Type-level tests.
 *
 * @remarks
 * This file is not run by `pnpm test`: Vitest collects `*.test.ts` only, and `expectTypeOf` does
 * nothing at runtime. Its assertions are checked by `pnpm typecheck` (`tsc` includes `tests/`),
 * and a wrong type there fails the typecheck. They pin the types the
 * model-facing contract rests on, so a schema or signature change has to be made on purpose.
 * Each `@ts-expect-error` line fails the typecheck if the call it marks ever becomes valid.
 */

/** The input type of a tool's `execute`. */
type InputOf<TTool extends { execute: (input: never, ctx: never) => unknown }> =
  Parameters<TTool["execute"]>[0];

/**
 * The output type of a tool's `execute`.
 *
 * @remarks
 * A workflow tool's `execute` is typed as returning a promise or an async iterable of its
 * output; the iterable form is dropped so both kinds of tool compare by their output.
 */
type OutputOf<
  TTool extends { execute: (input: never, ctx: never) => unknown },
> = Exclude<Awaited<ReturnType<TTool["execute"]>>, AsyncIterable<unknown>>;

/** The reviewer's verdict, written out by hand. */
interface Verdict {
  issues: {
    fix: string;
    quote: string;
    rule: string;
    severity: "high" | "low" | "medium";
  }[];
  verdict: "ready" | "revise";
}

/** The researcher's result, written out by hand. */
interface Findings {
  findings: {
    claim: string;
    confidence: "high" | "low" | "medium";
    notes: string;
    sources: { title: string; url: string }[];
  }[];
  gaps: string[];
  summary: string;
}

describe("model ids", () => {
  it("are literal types, not plain strings", () => {
    expectTypeOf<string>().not.toExtend<typeof ROOT_MODEL>();
    expectTypeOf<string>().not.toExtend<typeof REVIEW_MODEL>();
    expectTypeOf<string>().not.toExtend<typeof DEEP_RESEARCH_MODEL>();
    expectTypeOf<string>().not.toExtend<typeof STANDARD_RESEARCH_MODEL>();
    expectTypeOf<string>().not.toExtend<typeof DECISION_MODEL>();
  });

  it("give the root agent a model eve accepts", () => {
    expectTypeOf(root.model).not.toBeAny();
    expectTypeOf<typeof ROOT_MODEL>().toExtend<typeof root.model>();
  });
});

describe("reserved paths", () => {
  it("take a string and answer with a boolean", () => {
    expectTypeOf(isReservedPath).toEqualTypeOf<(pathname: string) => boolean>();
    expectTypeOf(checkBlobUrl).toEqualTypeOf<(input: string) => BlobUrlCheck>();
    expectTypeOf(RESERVED_PATH_ERROR).toBeString();
  });

  it("reject a non-string path", () => {
    const parsed = new URL("https://example.com");
    // @ts-expect-error a pathname must be a string
    expectTypeOf(isReservedPath).toBeCallableWith(42);
    // @ts-expect-error a URL must be a string, not a URL object
    expectTypeOf(checkBlobUrl).toBeCallableWith(parsed);
  });
});

describe("the reviewer's verdict schema", () => {
  it("infers the verdict shape", () => {
    expectTypeOf<z.infer<typeof REVIEW_SCHEMA>>().toEqualTypeOf<Verdict>();
  });
});

describe("askSubagent", () => {
  it("returns the type its schema describes", () => {
    expectTypeOf(
      askSubagent<typeof REVIEW_SCHEMA>
    ).returns.resolves.toEqualTypeOf<Verdict>();
  });

  it("needs only the context's agent() and abortSignal", () => {
    expectTypeOf(askSubagent)
      .parameter(0)
      .toEqualTypeOf<Pick<WorkflowToolContext, "abortSignal" | "agent">>();
    expectTypeOf(askSubagent).parameter(1).toBeString();
    expectTypeOf(askSubagent).parameter(2).toBeString();
  });

  it("rejects an output schema that isn't a Zod schema", () => {
    const ctx = {} as WorkflowToolContext;
    const jsonSchema = { type: "object" };
    const ask = expectTypeOf(askSubagent);
    ask.toBeCallableWith(ctx, "reviewer", "Draft", REVIEW_SCHEMA);
    // @ts-expect-error a JSON Schema object is not a Zod schema
    ask.toBeCallableWith(ctx, "reviewer", "Draft", jsonSchema);
  });
});

describe("asset tool types", () => {
  it("upload_asset takes content and a pathname, and has no access option", () => {
    expectTypeOf<InputOf<typeof uploadAsset>>().toEqualTypeOf<{
      addRandomSuffix?: boolean | undefined;
      allowOverwrite?: boolean | undefined;
      content: string;
      contentType?: string | undefined;
      isBase64?: boolean | undefined;
      pathname: string;
    }>();
    expectTypeOf<InputOf<typeof uploadAsset>>().not.toHaveProperty("access");
    expectTypeOf<OutputOf<typeof uploadAsset>>().toExtend<{
      contentType: string;
      error?: string;
      pathname: string;
      success: boolean;
      url: string;
    }>();
  });

  it("list_assets takes an optional limit and prefix", () => {
    expectTypeOf<InputOf<typeof listAssets>>().toEqualTypeOf<{
      limit?: number | undefined;
      prefix?: string | undefined;
    }>();
    expectTypeOf<OutputOf<typeof listAssets>>().toExtend<{
      assets: {
        pathname: string;
        size: number;
        uploadedAt: string;
        url: string;
      }[];
      count: number;
      cursor?: string;
      error?: string;
      hasMore: boolean;
    }>();
  });

  it("the URL tools take exactly one URL string", () => {
    expectTypeOf<InputOf<typeof getAssetInfo>>().toEqualTypeOf<{
      url: string;
    }>();
    expectTypeOf<InputOf<typeof downloadAsset>>().toEqualTypeOf<{
      url: string;
    }>();
    expectTypeOf<InputOf<typeof deleteAsset>>().toEqualTypeOf<{
      url: string;
    }>();
  });

  it("report success and failure in one output shape per tool", () => {
    expectTypeOf<OutputOf<typeof getAssetInfo>>().toExtend<{
      contentType?: string;
      error?: string;
      exists: boolean;
      pathname?: string;
      size?: number;
      uploadedAt?: string;
      url: string;
    }>();
    expectTypeOf<OutputOf<typeof downloadAsset>>().toExtend<{
      content?: string;
      contentType?: string;
      error?: string;
      isBase64?: boolean;
      success: boolean;
      url: string;
    }>();
    expectTypeOf<OutputOf<typeof deleteAsset>>().toExtend<{
      deleted: boolean;
      error?: string;
      success: boolean;
      url: string;
    }>();
  });
});

describe("delegating tool types", () => {
  it("research takes a message and an optional depth, and returns findings", () => {
    expectTypeOf<InputOf<typeof research>>().toEqualTypeOf<{
      depth?: "deep" | "quick" | "standard" | undefined;
      message: string;
    }>();
    expectTypeOf<OutputOf<typeof research>>().toEqualTypeOf<Findings>();
  });

  it("review_draft takes a message and returns the reviewer's verdict", () => {
    expectTypeOf<InputOf<typeof reviewDraft>>().toEqualTypeOf<{
      message: string;
    }>();
    expectTypeOf<OutputOf<typeof reviewDraft>>().toEqualTypeOf<Verdict>();
  });

  it("run only with a workflow tool context", () => {
    expectTypeOf(research.execute)
      .parameter(1)
      .toEqualTypeOf<WorkflowToolContext>();
    expectTypeOf(reviewDraft.execute)
      .parameter(1)
      .toEqualTypeOf<WorkflowToolContext>();
  });
});

describe("eval helpers", () => {
  it("have the signatures the evals rely on", () => {
    expectTypeOf(asRecord).toEqualTypeOf<
      (value: unknown) => Record<string, unknown>
    >();
    expectTypeOf(hasFindings).toEqualTypeOf<(value: unknown) => boolean>();
    expectTypeOf(toolScript).toEqualTypeOf<
      (tool: string, input: unknown) => string
    >();
  });
});
