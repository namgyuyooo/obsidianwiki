import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";

const defaultStopwords = new Set([
  "assistant",
  "chat",
  "glm",
  "obsidian",
  "wiki",
  "md",
  "기본",
  "새",
  "업무",
  "개인",
  "프로젝트",
  "현재",
  "관련",
  "문서",
  "간단히",
  "설명",
  "정리",
  "알려줘",
  "무엇",
  "뭐",
  "이것",
  "저것",
  "그것"
]);

export function parseFrontmatter(markdown = "") {
  const text = String(markdown || "");
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const data = {};
  for (const line of text.slice(3, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key) data[key] = value;
  }
  return data;
}

export function titleFromMarkdown(path = "", markdown = "") {
  const heading = String(markdown || "").match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return basename(path).replace(/\.md$/i, "") || path;
}

export function compactLine(line = "", maxChars = 240) {
  return String(line || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

export function contextBudget(mode = "standard") {
  const budgets = {
    economy: { mode: "economy", maxCards: 4, maxKeyLines: 5, maxLineChars: 180 },
    standard: { mode: "standard", maxCards: 7, maxKeyLines: 8, maxLineChars: 240 },
    deep: { mode: "deep", maxCards: 12, maxKeyLines: 14, maxLineChars: 320 }
  };
  return budgets[mode] || budgets.standard;
}

export function sparseTerms(text = "", stopwords = defaultStopwords) {
  return [...new Set(String(text || "").toLowerCase().match(/[0-9a-z가-힣_]{2,}/giu) || [])]
    .map((term) => term.replace(/(에서|으로|에게|한테|까지|부터|처럼|보다|만큼|은|는|이|가|을|를|의|에|와|과|로|도|만)$/u, ""))
    .filter((term) => term.length >= 2 && !stopwords.has(term));
}

export function extractMeaningfulLines(markdown = "", query = "", budget = contextBudget()) {
  const terms = sparseTerms(query);
  const lines = String(markdown || "").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("---"));
  const scored = lines.map((line, index) => {
    const lower = line.toLowerCase();
    let score = 0;
    if (/^#{1,4}\s/.test(line)) score += 2;
    if (terms.some((term) => lower.includes(term))) score += 8;
    if (/\d{4}-\d{1,2}-\d{1,2}|\d+\.?\d*\s*(%|억|만|천|원|개|건|회|분|초|시간)/.test(line)) score += 5;
    if (/결정|확정|완료|진행|보류|리스크|충돌|이슈|다음|액션|근거|출처|고객|납기|일정/.test(line)) score += 4;
    if (line.length > 260) score -= 1;
    return { line: compactLine(line, budget.maxLineChars), score, index };
  }).filter((item) => item.score > 0);
  return [...new Map(scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, budget.maxKeyLines)
    .sort((a, b) => a.index - b.index)
    .map((item) => [item.line, item.line])).values()];
}

export function extractWikiLinks(markdown = "") {
  const links = new Set();
  const wikiLinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  const mdLinkRegex = /\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g;
  let match;
  while ((match = wikiLinkRegex.exec(markdown))) links.add(match[1].trim());
  while ((match = mdLinkRegex.exec(markdown))) links.add(match[1].trim());
  return [...links].filter(Boolean);
}

function normalizeLinkKey(value = "") {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^.*\//, "")
    .replace(/\.md$/i, "")
    .trim()
    .toLowerCase();
}

function classifyDoc(path = "", frontmatter = {}) {
  const normalized = String(path || "").replace(/\\/g, "/");
  const parts = normalized.split("/");
  const section = parts[0] === "Wiki" && parts.length > 2
    ? parts[1]
    : parts[0] === "L1_memory"
      ? "L1_memory"
      : parts.length > 1
        ? parts.at(-2)
        : "";
  const fileName = parts.at(-1) || "";
  const baseName = fileName.replace(/\.md$/i, "");
  const lowerPath = normalized.toLowerCase();
  const lowerBase = baseName.toLowerCase();
  const type = String(frontmatter.type || "").toLowerCase();
  let division = "knowledge";
  if (/\/l1_memory\//i.test(lowerPath) || /(^|\/)l1_memory\//i.test(lowerPath)) division = "memory";
  else if (section === "Common") division = "common";
  else if (section.endsWith("_Project")) division = "project";
  else if (section.endsWith("_Account")) division = "account";
  else if (/(log|change_log|conflict_register|deletion|audit)/i.test(normalized)) division = "log";

  const rules = [
    ["hub", lowerBase === "hub" || type === "hub" || type === "project"],
    ["overview", /overview|summary|profile|project_overview/.test(lowerBase) || type === "overview"],
    ["sources", /sources|source/.test(lowerBase)],
    ["evidence", /evidence|connected|근거/.test(lowerBase) || type === "evidence"],
    ["status", /^status$|current_status|운영현황|현황/.test(lowerBase) || type === "status"],
    ["business_flow", /business[_-]?flow|flow|pipeline|프로세스|흐름/.test(lowerBase) || type === "business_flow"],
    ["ceo_brief", /ceo[_-]?brief|executive|경영진|대표/.test(lowerBase) || type === "ceo_brief"],
    ["pm_action", /pm[_-]?action|action[_-]?plan|실행계획|pm/.test(lowerBase) || type === "pm_action"],
    ["customer_followup", /customer[_-]?followup|follow[_-]?up|고객.*후속|후속/.test(lowerBase) || type === "customer_followup"],
    ["raw_evidence", /raw[_-]?evidence|source[_-]?archive|original|원문|원본/.test(lowerBase) || type === "raw_evidence"],
    ["conflict", /conflict|충돌/.test(lowerBase) || type === "conflict"],
    ["actions", /action|todo|next/.test(lowerBase) || type === "actions"],
    ["decisions", /decision|결정/.test(lowerBase) || type === "decisions"],
    ["risks", /risk|리스크/.test(lowerBase) || type === "risks"],
    ["changelog", /change_log|changelog|변경/.test(lowerBase) || type === "changelog"],
    ["memory", division === "memory" || /memory|chat/.test(lowerPath) || type.includes("memory")]
  ];
  const docKind = (rules.find(([, matched]) => matched) || ["knowledge"])[0];
  const projectKey = ["project", "account"].includes(division) ? section : division;
  return { section, division, docKind, projectKey };
}

function docKindBoost(docKind = "", path = "") {
  const lower = String(path || "").toLowerCase();
  if (docKind === "evidence" || /evidence_log/.test(lower)) return 18;
  if (docKind === "conflict" || /conflict_register/.test(lower)) return 16;
  if (docKind === "hub") return 14;
  if (docKind === "memory" || /\/l1_memory\//i.test(path)) return 14;
  if (docKind === "overview") return 9;
  if (["decisions", "risks"].includes(docKind)) return 8;
  if (docKind === "changelog") return 6;
  return 0;
}

async function walkMarkdown(root, exclude = []) {
  const files = [];
  const blocked = exclude.map((item) => String(item || ""));
  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (blocked.some((needle) => fullPath.includes(needle))) continue;
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") files.push(fullPath);
    }
  }
  await walk(root);
  return files;
}

function safeResolveInRoots(roots, path) {
  const target = isAbsolute(path) ? resolve(path) : resolve(process.cwd(), path);
  const allowed = roots.map((root) => resolve(root));
  if (!allowed.some((root) => target === root || target.startsWith(`${root}/`))) {
    throw new Error(`Path escapes wiki roots: ${path}`);
  }
  return target;
}

function estimateChars(value) {
  return JSON.stringify(value || {}).length;
}

function findSnippet(markdown = "", query = "") {
  const normalizedQuery = String(query || "").toLowerCase();
  const lines = String(markdown || "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!normalizedQuery) return lines.slice(0, 2).join(" ").slice(0, 220);
  const found = lines.find((line) => line.toLowerCase().includes(normalizedQuery));
  if (!found) return lines.slice(0, 2).join(" ").slice(0, 220);
  const index = found.toLowerCase().indexOf(normalizedQuery);
  return found.slice(Math.max(0, index - 70), Math.max(0, index - 70) + 240);
}

export class WikiRag {
  constructor(options = {}) {
    const roots = options.roots || [options.wikiRoot, options.l1Root].filter(Boolean);
    if (!roots.length) throw new Error("WikiRag requires at least one wiki root.");
    this.roots = roots.map((root) => resolve(root));
    this.exclude = options.exclude || ["node_modules", ".git", ".obsidian", "runtime"];
    this.stopwords = new Set([...(options.stopwords || []), ...defaultStopwords]);
    this.documents = [];
    this.terms = new Map();
    this.graph = { nodes: [], edges: [] };
    this.loadedAt = "";
  }

  async refresh() {
    const files = (await Promise.all(this.roots.map((root) => walkMarkdown(root, this.exclude)))).flat();
    const docs = [];
    for (const file of files) {
      const markdown = await readFile(file, "utf-8").catch(() => "");
      const fileStat = await stat(file).catch(() => null);
      const root = this.roots.find((candidate) => file === candidate || file.startsWith(`${candidate}/`)) || this.roots[0];
      const relativePath = relative(root, file).replace(/\\/g, "/");
      const rootLabel = basename(root).replace(/[\\/:*?"<>|]/g, "_") || "wiki";
      const path = relativePath.startsWith("..") ? file : `${rootLabel}/${relativePath}`;
      const frontmatter = parseFrontmatter(markdown);
      const title = titleFromMarkdown(path, markdown);
      const classification = classifyDoc(path, frontmatter);
      const headings = [...markdown.matchAll(/^#{1,4}\s+(.+)$/gm)].map((match) => match[1].trim()).slice(0, 12);
      const bodyTerms = sparseTerms(`${path} ${title} ${headings.join(" ")} ${markdown}`, this.stopwords);
      const termCounts = new Map();
      for (const term of bodyTerms) termCounts.set(term, (termCounts.get(term) || 0) + 1);
      docs.push({
        id: path,
        path,
        fullPath: file,
        root,
        title,
        frontmatter,
        headings,
        links: extractWikiLinks(markdown),
        classification,
        size: fileStat?.size || markdown.length,
        updatedAt: fileStat?.mtime?.toISOString?.() || "",
        terms: termCounts
      });
    }
    this.documents = docs;
    this.terms = this.#buildTermIndex(docs);
    this.graph = this.#buildGraph(docs);
    this.loadedAt = new Date().toISOString();
    return this.stats();
  }

  stats() {
    return {
      roots: this.roots,
      documents: this.documents.length,
      terms: this.terms.size,
      nodes: this.graph.nodes.length,
      edges: this.graph.edges.length,
      loadedAt: this.loadedAt
    };
  }

  async page(path) {
    const doc = this.documents.find((item) => item.path === path || item.fullPath === path);
    const fullPath = doc?.fullPath || safeResolveInRoots(this.roots, path);
    const markdown = await readFile(fullPath, "utf-8");
    return {
      path: doc?.path || path,
      fullPath,
      title: doc?.title || titleFromMarkdown(path, markdown),
      frontmatter: doc?.frontmatter || parseFrontmatter(markdown),
      markdown
    };
  }

  search(query = "", options = {}) {
    const limit = Number(options.limit || 12);
    const terms = sparseTerms(query, this.stopwords);
    if (!terms.length) return [];
    const scores = new Map();
    const matched = new Map();
    for (const term of terms) {
      const postings = this.terms.get(term) || [];
      for (const posting of postings) {
        scores.set(posting.path, (scores.get(posting.path) || 0) + posting.score);
        matched.set(posting.path, [...new Set([...(matched.get(posting.path) || []), term])]);
      }
    }
    const docsByPath = new Map(this.documents.map((doc) => [doc.path, doc]));
    const ranked = [...scores.entries()].map(([path, score]) => {
      const doc = docsByPath.get(path);
      const boost = docKindBoost(doc?.classification?.docKind, path);
      return {
        title: doc?.title || path,
        path,
        score: score + boost,
        rawScore: score,
        matchedTerms: matched.get(path) || [],
        headings: doc?.headings || [],
        classification: doc?.classification || {},
        updatedAt: doc?.updatedAt || ""
      };
    }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    if (options.expandGraph === false) return ranked.slice(0, limit);
    return this.#expandGraph(ranked.slice(0, limit), options).slice(0, limit);
  }

  async context(query = "", options = {}) {
    const budget = contextBudget(options.mode || "standard");
    const results = options.results || this.search(query, { ...options, limit: options.limit || budget.maxCards });
    const cards = [];
    for (const result of results.slice(0, budget.maxCards)) {
      const page = await this.page(result.path);
      const keyLines = extractMeaningfulLines(page.markdown, query, budget);
      const card = {
        title: page.title,
        path: page.path,
        score: result.score,
        classification: result.classification || classifyDoc(page.path, page.frontmatter),
        snippet: findSnippet(page.markdown, query),
        keyLines,
        numbers: extractMeaningfulLines(page.markdown, "\\d", { ...budget, maxKeyLines: Math.ceil(budget.maxKeyLines / 2) }),
        estimatedChars: 0
      };
      card.estimatedChars = estimateChars(card);
      cards.push(card);
    }
    return {
      query,
      mode: budget.mode,
      cards,
      estimatedChars: cards.reduce((sum, card) => sum + card.estimatedChars, 0)
    };
  }

  async answer(query = "", options = {}) {
    const context = await this.context(query, options);
    const llm = options.llm || openAiCompatibleLlmFromEnv();
    if (!llm) return { provider: "local", query, context, answer: localBrief(query, context.cards) };
    const prompt = options.systemPrompt || [
      "You answer only from the provided wiki evidence cards.",
      "Write in Korean unless the user asks otherwise.",
      "Cite Markdown paths in the answer.",
      "If evidence is missing, say what is missing."
    ].join(" ");
    const content = await llm({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify({ query, evidence: context.cards }) }
      ],
      model: options.model,
      temperature: options.temperature ?? 0.1,
      maxTokens: options.maxTokens || 1200
    });
    return { provider: "llm", query, context, answer: content };
  }

  #buildTermIndex(docs) {
    const termIndex = new Map();
    const docCount = docs.length || 1;
    const docFreq = new Map();
    for (const doc of docs) {
      for (const term of doc.terms.keys()) docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
    for (const doc of docs) {
      for (const [term, count] of doc.terms.entries()) {
        const idf = Math.log(1 + (docCount - (docFreq.get(term) || 0) + 0.5) / ((docFreq.get(term) || 0) + 0.5));
        const titleBoost = `${doc.title} ${doc.path}`.toLowerCase().includes(term) ? 2.0 : 1.0;
        const score = Number((count * idf * titleBoost).toFixed(4));
        if (!termIndex.has(term)) termIndex.set(term, []);
        termIndex.get(term).push({ path: doc.path, score });
      }
    }
    for (const postings of termIndex.values()) postings.sort((a, b) => b.score - a.score);
    return termIndex;
  }

  #buildGraph(docs) {
    const byTitle = new Map();
    const byBasename = new Map();
    for (const doc of docs) {
      byTitle.set(normalizeLinkKey(doc.title), doc);
      byBasename.set(normalizeLinkKey(doc.path), doc);
    }
    const edges = [];
    for (const doc of docs) {
      for (const link of doc.links) {
        const target = byTitle.get(normalizeLinkKey(link)) || byBasename.get(normalizeLinkKey(link));
        if (!target || target.path === doc.path) continue;
        edges.push({ source: doc.path, target: target.path, label: link });
      }
    }
    const degree = new Map(docs.map((doc) => [doc.path, 0]));
    for (const edge of edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
    return {
      nodes: docs.map((doc) => ({
        id: doc.path,
        title: doc.title,
        type: doc.frontmatter.type || doc.classification.docKind,
        degree: degree.get(doc.path) || 0
      })).sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title)),
      edges
    };
  }

  #expandGraph(results, options = {}) {
    const limit = Number(options.graphLimit || 8);
    const byPath = new Map(this.documents.map((doc) => [doc.path, doc]));
    const adjacency = new Map();
    for (const edge of this.graph.edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
      adjacency.get(edge.source).push(edge.target);
      adjacency.get(edge.target).push(edge.source);
    }
    const seen = new Set(results.map((item) => item.path));
    const expanded = [...results];
    for (const seed of results.slice(0, Number(options.seedLimit || 4))) {
      for (const neighbor of adjacency.get(seed.path) || []) {
        if (seen.has(neighbor)) continue;
        const doc = byPath.get(neighbor);
        if (!doc) continue;
        seen.add(neighbor);
        expanded.push({
          title: doc.title,
          path: doc.path,
          score: seed.score * 0.45 + docKindBoost(doc.classification.docKind, doc.path),
          rawScore: 0,
          matchedTerms: [],
          graphHop: 1,
          via: seed.path,
          headings: doc.headings,
          classification: doc.classification,
          updatedAt: doc.updatedAt
        });
        if (expanded.length >= results.length + limit) break;
      }
      if (expanded.length >= results.length + limit) break;
    }
    return expanded.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  }
}

export function localBrief(query = "", cards = []) {
  const top = cards.slice(0, 6);
  if (!top.length) return `검색어 "${query}"에 맞는 위키 근거를 찾지 못했습니다.`;
  return [
    `검색어 "${query}" 기준 상위 근거 ${top.length}개를 찾았습니다.`,
    "",
    ...top.map((card) => `- ${card.title} (${card.path}): ${(card.keyLines || [card.snippet]).filter(Boolean).slice(0, 2).join(" / ")}`)
  ].join("\n");
}

export function openAiCompatibleLlmFromEnv(env = process.env) {
  const apiKey = env.WIKI_RAG_LLM_API_KEY || env.OPENAI_API_KEY || env.GLM_API_KEY;
  const apiUrl = env.WIKI_RAG_LLM_API_URL || env.OPENAI_BASE_URL || env.GLM_API_URL;
  const model = env.WIKI_RAG_LLM_MODEL || env.OPENAI_MODEL || env.GLM_MODEL || "gpt-4.1-mini";
  if (!apiKey || !apiUrl) return null;
  return async function complete({ messages, temperature = 0.1, maxTokens = 1200, model: requestedModel }) {
    const endpoint = String(apiUrl).replace(/\/+$/, "").endsWith("/chat/completions")
      ? String(apiUrl).replace(/\/+$/, "")
      : `${String(apiUrl).replace(/\/+$/, "")}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: requestedModel || model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false
      })
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) throw new Error(payload.error?.message || text || response.statusText);
    return payload.choices?.[0]?.message?.content || payload.choices?.[0]?.message?.reasoning_content || "";
  };
}

export async function createWikiRag(options = {}) {
  const rag = new WikiRag(options);
  if (options.autoRefresh !== false) await rag.refresh();
  return rag;
}

export function rootsFromEnv(env = process.env) {
  const roots = String(env.WIKI_RAG_ROOTS || "")
    .split(":")
    .map((item) => item.trim())
    .filter(Boolean);
  if (roots.length) return roots;
  return [env.WIKI_RAG_WIKI_ROOT, env.WIKI_RAG_L1_ROOT].filter(Boolean);
}

export function assertReadableRoots(roots = []) {
  const missing = roots.filter((root) => !existsSync(root));
  if (missing.length) throw new Error(`Missing wiki root(s): ${missing.join(", ")}`);
  return roots;
}
