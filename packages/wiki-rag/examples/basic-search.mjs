import { createWikiRag, rootsFromEnv } from "../src/index.mjs";

const query = process.argv.slice(2).join(" ") || "다음 액션";
const roots = rootsFromEnv();

if (!roots.length) {
  console.error("Set WIKI_RAG_ROOTS or WIKI_RAG_WIKI_ROOT before running this example.");
  process.exit(1);
}

const rag = await createWikiRag({ roots });
const context = await rag.context(query, { mode: "standard", limit: 5 });

console.log(JSON.stringify({
  stats: rag.stats(),
  query,
  context
}, null, 2));
