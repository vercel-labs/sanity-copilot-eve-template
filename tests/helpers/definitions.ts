/**
 * Read the resolver out of an eve `defineDynamic` definition.
 *
 * @remarks
 * A dynamic definition is an object that carries its resolver function under a symbol key and
 * nothing a test can call by name. eve runs that function before each model call. Finding the
 * one function-valued symbol property keeps the tests off the symbol's exact name.
 *
 * @param definition - The default export of a file that uses `defineDynamic`.
 * @returns The resolver function.
 * @throws When the definition carries no resolver.
 */
export const dynamicResolver = (
  definition: object
): ((context: unknown) => unknown) => {
  for (const key of Object.getOwnPropertySymbols(definition)) {
    const value: unknown = Reflect.get(definition, key);
    if (typeof value === "function") {
      return (context) => Reflect.apply(value, definition, [context]);
    }
  }
  throw new TypeError("The definition is not dynamic.");
};

/**
 * Whether a tool file's default export is eve's `disableTool()` sentinel.
 *
 * @param definition - The default export of a file under a `tools/` folder.
 * @returns `true` when the file removes a built-in tool rather than defining one.
 */
export const isDisabledTool = (definition: object): boolean =>
  Object.getOwnPropertySymbols(definition).some(
    (key) => key.description === "eve.disabled-tool"
  ) && !("execute" in definition);
