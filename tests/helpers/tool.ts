import type { ToolContext, ToolDefinition } from "eve/tools";
import { expect } from "vitest";

/**
 * The outcome of a Standard Schema validation: the parsed value, or the issues found.
 */
type ValidationResult =
  | { readonly issues?: undefined; readonly value: unknown }
  | { readonly issues: readonly { readonly message: string }[] };

/**
 * The Standard Schema interface eve validates tool input and output through.
 *
 * @remarks
 * eve's tool types accept any Standard Schema, so a tool's `inputSchema` is not typed as a Zod
 * schema. The tests validate through the same library-neutral interface the runtime uses.
 */
interface StandardSchema {
  readonly "~standard": {
    readonly validate: (
      value: unknown
    ) => Promise<ValidationResult> | ValidationResult;
  };
}

/**
 * Whether a tool schema implements Standard Schema validation.
 *
 * @param schema - A tool's `inputSchema` or `outputSchema`.
 * @returns `true` when the schema can validate a value.
 */
const isStandardSchema = (schema: unknown): schema is StandardSchema =>
  typeof schema === "object" && schema !== null && "~standard" in schema;

/**
 * Validate a value with a tool schema.
 *
 * @param schema - A tool's `inputSchema` or `outputSchema`.
 * @param value - The value to validate.
 * @returns The validation result.
 * @throws When the schema is a plain JSON Schema object, which can't validate.
 */
const validate = async (
  schema: unknown,
  value: unknown
): Promise<ValidationResult> => {
  if (!isStandardSchema(schema)) {
    throw new TypeError("The tool schema does not implement Standard Schema.");
  }
  return await schema["~standard"].validate(value);
};

/**
 * Whether a tool's `inputSchema` accepts the given arguments.
 *
 * @param tool - A tool definition.
 * @param rawInput - The arguments as the model would send them.
 * @returns `true` when the arguments pass validation.
 */
export const acceptsInput = async (
  tool: { readonly inputSchema: unknown },
  rawInput: unknown
): Promise<boolean> =>
  (await validate(tool.inputSchema, rawInput)).issues === undefined;

/**
 * Parse arguments with a tool's `inputSchema`, as eve does before it calls `execute`.
 *
 * @param tool - A tool definition.
 * @param rawInput - The arguments as the model would send them.
 * @returns The parsed input `execute` receives.
 * @throws When the arguments fail validation.
 */
export const parseInput = async <TInput>(
  tool: Pick<ToolDefinition<TInput>, "inputSchema">,
  rawInput: unknown
): Promise<TInput> => {
  const result = await validate(tool.inputSchema, rawInput);
  if (result.issues) {
    throw new Error(
      `Invalid tool input: ${result.issues.map((issue) => issue.message).join("; ")}`
    );
  }
  return result.value as TInput;
};

/**
 * Tool context for tools that never read it.
 *
 * @remarks
 * The asset tools take only their input, so an empty object stands in for the session context
 * eve would pass.
 */
const UNUSED_CONTEXT = {} as ToolContext;

/**
 * Call a tool with the input validation eve applies, then check its output against its schema.
 *
 * @remarks
 * eve parses the model's arguments with the tool's `inputSchema` before `execute` runs, so a
 * test that skipped that step could pass input the real tool never receives. eve does not
 * validate a tool's output at runtime, so the output check here is stricter than the runtime:
 * the output is parsed with `outputSchema` and compared with what `execute` returned, which
 * fails when the tool returns a value, or a field, its schema doesn't declare.
 *
 * @param tool - The tool definition, as default-exported from `agent/tools/<name>.ts`.
 * @param rawInput - The arguments as the model would send them.
 * @returns The tool's validated output.
 * @throws When the input or the output fails its schema.
 */
export const callTool = async <TInput, TOutput>(
  tool: ToolDefinition<TInput, TOutput>,
  rawInput: unknown
): Promise<TOutput> => {
  const input = await parseInput(tool, rawInput);
  const output = await tool.execute(input, UNUSED_CONTEXT);
  const result = await validate(tool.outputSchema, output);
  if (result.issues) {
    throw new Error(
      `Invalid tool output: ${result.issues.map((issue) => issue.message).join("; ")}`
    );
  }
  expect(output).toEqual(result.value);
  return output as TOutput;
};
