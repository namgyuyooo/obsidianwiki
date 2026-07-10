#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertReadableRoots, createWikiRag, rootsFromEnv } from "./index.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(moduleDir, "..");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk.toString();
  if (!body) return {};
  return JSON.parse(body);
}

async function main() {
  if (process.argv.includes("--smoke")) {
    const roots = assertReadableRoots(rootsFromEnv());
    const rag = await createWikiRag({ roots });
    console.log(JSON.stringify(rag.stats(), null, 2));
    return;
  }

  const roots = assertReadableRoots(rootsFromEnv());
  const rag = await createWikiRag({ roots });
  const host = process.env.WIKI_RAG_HOST || "127.0.0.1";
  const port = Number(process.env.WIKI_RAG_PORT || 8797);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
      if (url.pathname === "/" && req.method === "GET") {
        const readme = await readFile(join(packageRoot, "README.md"), "utf-8");
        return sendText(res, 200, readme);
      }
      if (url.pathname === "/health" && req.method === "GET") {
        return sendJson(res, 200, { status: "ok", stats: rag.stats() });
      }
      if (url.pathname === "/refresh" && req.method === "POST") {
        return sendJson(res, 200, { status: "refreshed", stats: await rag.refresh() });
      }
      if (url.pathname === "/search" && req.method === "GET") {
        const query = url.searchParams.get("q") || "";
        const limit = Number(url.searchParams.get("limit") || 12);
        return sendJson(res, 200, { query, results: rag.search(query, { limit }) });
      }
      if (url.pathname === "/context" && req.method === "POST") {
        const body = await readBody(req);
        return sendJson(res, 200, await rag.context(body.query || "", body));
      }
      if (url.pathname === "/answer" && req.method === "POST") {
        const body = await readBody(req);
        return sendJson(res, 200, await rag.answer(body.query || "", body));
      }
      if (url.pathname === "/page" && req.method === "GET") {
        const path = url.searchParams.get("path") || "";
        return sendJson(res, 200, await rag.page(path));
      }
      return sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  });

  server.listen(port, host, () => {
    console.log(`wiki-rag server listening at http://${host}:${port}`);
    console.log(`roots: ${roots.join(", ")}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
