import { webSearch } from "eve/tools/web_search";

/** The framework `web_search` tool, re-added after the researcher's `defaultTools: false`. */
export default webSearch({ provider: "exa" });
