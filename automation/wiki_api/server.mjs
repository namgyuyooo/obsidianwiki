import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { extname, join, normalize, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const frontendRoot = join(repoRoot, "automation/wiki_frontend");
const wikiRoot = join(repoRoot, "obsidian/Wiki");
const l1Root = join(repoRoot, "obsidian/L1_memory");
const driveWikifySrc = join(repoRoot, "automation/drive_wikify/src");
const driveWikifyEnv = join(repoRoot, "automation/drive_wikify/config/.env");
const driveRuntime = join(repoRoot, "automation/drive_wikify/runtime");
const apiRuntime = join(repoRoot, "automation/wiki_api/runtime");
const runHistoryPath = join(apiRuntime, "runs.json");
const paperclipTasksPath = join(apiRuntime, "paperclip_tasks.json");
const paperclipEventsPath = join(apiRuntime, "paperclip_events.json");
const schedulesPath = join(apiRuntime, "schedules.json");
const skillOutputsRoot = join(apiRuntime, "skill_outputs");
const chatProjectsPath = join(apiRuntime, "chat_projects.json");
const chatGlobalSettingsPath = join(apiRuntime, "chat_global_settings.json");
const activeJobs = new Map();

const host = process.env.WIKI_API_HOST || "127.0.0.1";
const port = Number(process.env.WIKI_API_PORT || 8787);
const editableSettings = new Set([
  "RCLONE_REMOTE",
  "RCLONE_REMOTE_PATH",
  "RCLONE_MIRROR_ROOT",
  "RCLONE_BWLIMIT",
  "RCLONE_TPSLIMIT",
  "RCLONE_CHECKERS",
  "RCLONE_TRANSFERS",
  "DRIVE_NAME",
  "MANIFEST_PATH",
  "RUN_OUTPUT_PATH",
  "MAX_FOLDERS_PER_RUN",
  "MAX_FILES_PER_FOLDER",
  "MAX_FETCH_DOCS",
  "CHUNK_SIZE_MIN_CHARS",
  "CHUNK_SIZE_MAX_CHARS",
  "CLEANUP_LOCAL_MIRROR",
  "AUTO_CREATE_PROJECT_SPACE",
  "GLM_API_URL",
  "GLM_API_KEY",
  "GLM_MODEL",
  "GLM_THINKING_TYPE",
  "GLM_THINKING_BUDGET_TOKENS",
  "OPENCLAW_WEBHOOK_URL",
  "OPENCLAW_API_KEY",
  "PAPERCLIP_URL",
  "PAPERCLIP_API_KEY",
]);
const sensitiveSettings = new Set(["GLM_API_KEY", "OPENCLAW_API_KEY", "PAPERCLIP_API_KEY"]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function safeJoin(root, target) {
  const resolved = resolve(root, target || "");
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error("Path escapes allowed root");
  }
  return resolved;
}

async function readJsonFile(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return fallback;
  }
}

async function readEnvFile() {
  const text = await readFile(driveWikifyEnv, "utf-8").catch(() => "");
  const values = {};
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const [key, ...rest] = line.split("=");
    values[key.trim()] = rest.join("=").trim();
  }
  return { text, lines, values };
}

async function writeEnvValues(updates) {
  const { lines, values } = await readEnvFile();
  const nextValues = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (!editableSettings.has(key)) {
      throw new Error(`Setting is not editable: ${key}`);
    }
    const normalizedValue = String(value ?? "").trim();
    if (sensitiveSettings.has(key) && !normalizedValue) {
      continue;
    }
    nextValues[key] = normalizedValue;
  }
  if (updates?.DRIVE_DELETE_SOURCE === "true") {
    throw new Error("DRIVE_DELETE_SOURCE cannot be changed from this UI");
  }

  const seen = new Set();
  const nextLines = lines.map((line) => {
    if (!line.includes("=") || line.trim().startsWith("#")) return line;
    const [key] = line.split("=");
    const normalizedKey = key.trim();
    if (!Object.prototype.hasOwnProperty.call(nextValues, normalizedKey)) return line;
    seen.add(normalizedKey);
    return `${normalizedKey}=${nextValues[normalizedKey]}`;
  });

  for (const [key, value] of Object.entries(nextValues)) {
    if (!seen.has(key) && !Object.prototype.hasOwnProperty.call(values, key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  if (!nextLines.some((line) => line.startsWith("DRIVE_DELETE_SOURCE="))) {
    nextLines.unshift("DRIVE_DELETE_SOURCE=false");
  } else {
    for (let index = 0; index < nextLines.length; index += 1) {
      if (nextLines[index].startsWith("DRIVE_DELETE_SOURCE=")) {
        nextLines[index] = "DRIVE_DELETE_SOURCE=false";
      }
    }
  }

  await writeFile(driveWikifyEnv, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf-8");
  return (await readEnvFile()).values;
}

async function appendRunHistory(entry) {
  await mkdir(apiRuntime, { recursive: true });
  const history = await readJsonFile(runHistoryPath, []);
  history.unshift(entry);
  await writeFile(runHistoryPath, JSON.stringify(history.slice(0, 100), null, 2), "utf-8");
  return history.slice(0, 100);
}

async function updateRunHistory(runId, updates) {
  await mkdir(apiRuntime, { recursive: true });
  const history = await readJsonFile(runHistoryPath, []);
  const next = history.map((entry) => (entry.runId === runId ? { ...entry, ...updates, updatedAt: new Date().toISOString() } : entry));
  await writeFile(runHistoryPath, JSON.stringify(next.slice(0, 100), null, 2), "utf-8");
  return next.find((entry) => entry.runId === runId);
}

async function prependJsonHistory(path, entry, limit = 100) {
  await mkdir(apiRuntime, { recursive: true });
  const history = await readJsonFile(path, []);
  history.unshift(entry);
  const trimmed = history.slice(0, limit);
  await writeFile(path, JSON.stringify(trimmed, null, 2), "utf-8");
  return trimmed;
}

async function walkMarkdown(root) {
  const files = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }
  await walk(root);
  return files;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith("---")) return {};
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return {};
  const lines = markdown.slice(3, end).split("\n");
  const data = {};
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    data[key] = value;
  }
  return data;
}

function titleFromMarkdown(path, markdown) {
  const heading = markdown.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return path.split("/").pop()?.replace(/\.md$/, "") || path;
}

function findSnippet(markdown, query) {
  const normalizedQuery = query.toLowerCase();
  const lines = markdown.split("\n").map((line) => line.trim()).filter(Boolean);
  const found = lines.find((line) => line.toLowerCase().includes(normalizedQuery));
  if (!found) return lines.slice(0, 2).join(" ").slice(0, 220);
  const index = found.toLowerCase().indexOf(normalizedQuery);
  const start = Math.max(0, index - 70);
  return found.slice(start, start + 240);
}

async function searchWiki(query) {
  const roots = [wikiRoot, l1Root];
  const files = (await Promise.all(roots.map(walkMarkdown))).flat();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf-8");
    const haystack = `${relative(repoRoot, file)}\n${markdown}`.toLowerCase();
    const score = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
    if (!score) continue;
    const path = relative(repoRoot, file);
    results.push({
      title: titleFromMarkdown(path, markdown),
      path,
      frontmatter: parseFrontmatter(markdown),
      snippet: findSnippet(markdown, query),
      score,
    });
  }
  return results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 40);
}

async function wikiIndex() {
  const roots = [wikiRoot, l1Root];
  const files = (await Promise.all(roots.map(walkMarkdown))).flat();
  const pages = [];
  for (const file of files) {
    const markdown = await readFile(file, "utf-8");
    const fileStat = await stat(file).catch(() => null);
    const path = relative(repoRoot, file);
    const frontmatter = parseFrontmatter(markdown);
    const section = path.startsWith("obsidian/L1_memory/") ? "L1_memory" : path.split("/")[2] || "Wiki";
    pages.push({
      title: titleFromMarkdown(path, markdown),
      path,
      section,
      frontmatter,
      updatedAt: fileStat?.mtime?.toISOString?.() || "",
      size: fileStat?.size || markdown.length,
    });
  }
  return pages.sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title));
}

function extractWikiLinks(markdown) {
  const links = new Set();
  const wikiLinkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  const mdLinkRegex = /\[[^\]]+\]\(([^)]+\.md)(?:#[^)]+)?\)/g;
  let match;
  while ((match = wikiLinkRegex.exec(markdown))) {
    links.add(match[1].trim());
  }
  while ((match = mdLinkRegex.exec(markdown))) {
    links.add(match[1].trim());
  }
  return [...links].filter(Boolean);
}

function normalizeLinkKey(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^.*\//, "")
    .replace(/\.md$/i, "")
    .trim()
    .toLowerCase();
}

async function wikiGraph() {
  const pages = await wikiIndex();
  const byTitle = new Map();
  const byBasename = new Map();
  for (const page of pages) {
    byTitle.set(normalizeLinkKey(page.title), page);
    byBasename.set(normalizeLinkKey(page.path), page);
  }

  const nodes = pages.map((page) => ({
    id: page.path,
    title: page.title,
    section: page.section,
    type: page.frontmatter?.type || "page",
    size: page.size,
  }));
  const edges = [];
  for (const page of pages) {
    const fullPath = resolve(repoRoot, page.path);
    const markdown = await readFile(fullPath, "utf-8");
    for (const link of extractWikiLinks(markdown)) {
      const target = byTitle.get(normalizeLinkKey(link)) || byBasename.get(normalizeLinkKey(link));
      if (!target || target.path === page.path) continue;
      edges.push({ source: page.path, target: target.path, label: link });
    }
  }

  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  return {
    nodes: nodes
      .map((node) => ({ ...node, degree: degree.get(node.id) || 0 }))
      .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
      .slice(0, 180),
    edges: edges.slice(0, 420),
  };
}

function localSearchBrief(query, results) {
  const top = results.slice(0, 8);
  const projectHints = [...new Set(top.map((item) => item.frontmatter.project || item.frontmatter.title || "").filter(Boolean))].slice(0, 6);
  const conflictHints = top
    .filter((item) => /(충돌|상이|다름|불일치|변경|확인 필요)/.test(`${item.title} ${item.snippet}`))
    .map((item) => `${item.title}: ${item.snippet}`)
    .slice(0, 5);
  const summaryLines = [
    `검색어 "${query}" 기준으로 ${results.length}개 문서를 찾았습니다.`,
    top.length ? `상위 근거는 ${top.map((item) => item.title).join(", ")} 입니다.` : "아직 근거 문서가 없습니다.",
    projectHints.length ? `프로젝트/공간 후보: ${projectHints.join(", ")}` : "프로젝트 후보는 문서 제목과 경로 기준으로 추가 판단이 필요합니다.",
  ];
  return {
    provider: "local-search-brief",
    summaryMarkdown: summaryLines.map((line) => `- ${line}`).join("\n"),
    keyFindings: top.map((item) => item.snippet).filter(Boolean).slice(0, 5),
    relatedProjects: projectHints,
    conflictCandidates: conflictHints,
    nextActions: [
      "상위 근거 Markdown을 열어 원문 표현과 수치를 확인",
      "중복/충돌 후보가 있으면 프로젝트 분기 또는 Conflict Register 반영",
      "GLM rate limit이 풀리면 같은 검색어로 재정리",
    ],
  };
}

async function searchWikiBrief(query, selectedPaths = []) {
  const allResults = query ? await searchWiki(query) : [];
  const selected = new Set((selectedPaths || []).filter(Boolean));
  const results = selected.size ? allResults.filter((item) => selected.has(item.path)) : allResults;
  const evidence = [];
  for (const item of results.slice(0, 12)) {
    const page = await pageByPath(item.path).catch(() => null);
    evidence.push({
      title: item.title,
      path: item.path,
      snippet: item.snippet,
      score: item.score,
      frontmatter: item.frontmatter,
      excerpt: page?.markdown?.slice(0, 4000) || item.snippet,
    });
  }
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const model = process.env.GLM_MODEL || env.GLM_MODEL || "glm-4.5";

  if (!query || !apiKey || !apiUrl || !evidence.length) {
    return { query, results: allResults, selectedResults: results, brief: localSearchBrief(query, results) };
  }

  try {
    const { payload, endpoint } = await requestGlmChatCompletion(apiUrl, apiKey, {
        model,
        messages: [
          {
            role: "system",
            content: [
              "당신은 사용자가 선택한 Obsidian Markdown 근거만 정리하는 한국어 리서치 보조자다.",
              "반드시 선택된 근거 Markdown path를 함께 언급하고, 선택되지 않은 문서는 근거로 쓰지 않는다.",
              "출력은 JSON 객체만 반환한다: summaryMarkdown, keyFindings, relatedProjects, conflictCandidates, nextActions.",
              "summaryMarkdown은 짧은 한국어 bullet markdown으로 작성한다.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({ query, evidence }),
          },
        ],
        temperature: 0.1,
        max_tokens: 1200,
        thinking: glmThinkingOptions(env),
        response_format: { type: "json_object" },
    });
    const content = glmMessageContent(payload);
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summaryMarkdown: content, keyFindings: [], relatedProjects: [], conflictCandidates: [], nextActions: [] };
    }
    return {
      query,
      results: allResults,
      selectedResults: results,
      brief: {
        provider: "glm",
        model,
        endpoint,
        ...parsed,
      },
    };
  } catch (error) {
    return {
      query,
      results: allResults,
      selectedResults: results,
      brief: {
        ...localSearchBrief(query, results),
        upstreamStatus: error.message,
      },
    };
  }
}

async function pageByPath(path) {
  const normalized = normalize(path);
  const allowed = [wikiRoot, l1Root, join(repoRoot, "automation/drive_wikify/runtime")];
  for (const root of allowed) {
    const fullPath = resolve(repoRoot, normalized);
    if (fullPath === root || fullPath.startsWith(`${root}/`)) {
      const markdown = await readFile(fullPath, "utf-8");
      return {
        path: relative(repoRoot, fullPath),
        title: titleFromMarkdown(path, markdown),
        frontmatter: parseFrontmatter(markdown),
        markdown,
      };
    }
  }
  throw new Error("Page path is outside readable wiki roots");
}

async function collectStatus() {
  const manifestPath = join(driveRuntime, "manifest.json");
  const runOutputPath = join(driveRuntime, "run_output.json");
  const deletionLogPath = join(driveRuntime, "deletion_log.jsonl");
  const { values: env } = await readEnvFile();
  const manifest = await readJsonFile(manifestPath, { documents: [] });
  const runOutput = await readJsonFile(runOutputPath, { results: [] });
  const deletionLog = await readFile(deletionLogPath, "utf-8").catch("");
  const deletionCount = deletionLog.split("\n").filter(Boolean).length;

  return {
    status: {
      targetDrive: env.RCLONE_REMOTE_PATH || `${env.RCLONE_REMOTE || "gdrive"}: 최상위`,
      manifest: `${relative(repoRoot, manifestPath)} (${manifest.documents?.length || 0} docs)`,
      lastRun: `${runOutput.results?.length || 0} processed`,
      cleanup: `local mirror only (${deletionCount} logged)`,
    },
    safety: {
      driveDeleteSource: env.DRIVE_DELETE_SOURCE || "false",
      sourceDriveProtected: env.DRIVE_DELETE_SOURCE !== "true",
    },
  };
}

async function coverageSummary() {
  const { values: env } = await readEnvFile();
  const trackerPath = join(repoRoot, env.COVERAGE_TRACKER || "obsidian/Wiki/Common/Drive_Wikify_Coverage_Tracker.md");
  const manifestPath = join(driveRuntime, "manifest.json");
  const runOutputPath = join(driveRuntime, "run_output.json");
  const deletionLogPath = join(driveRuntime, "deletion_log.jsonl");
  const tracker = await readFile(trackerPath, "utf-8").catch(() => "");
  const manifest = await readJsonFile(manifestPath, { documents: [] });
  const runOutput = await readJsonFile(runOutputPath, { results: [] });
  const deletionLog = await readFile(deletionLogPath, "utf-8").catch("");
  const statuses = {
    queued: 0,
    running: 0,
    done: 0,
    hold: 0,
    retry: 0,
    expanded: 0,
  };
  const drives = new Set();
  const rows = [];

  for (const line of tracker.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 8 || cells[0] === "---") continue;
    const drive = cells[0].replaceAll("`", "");
    const folderPath = cells[1].replaceAll("`", "");
    const status = cells[2].replaceAll("`", "");
    if (!Object.prototype.hasOwnProperty.call(statuses, status)) continue;
    statuses[status] += 1;
    drives.add(drive);
    rows.push({ drive, folderPath, status, lastChecked: cells[6] || "", nextAction: cells[7] || "" });
  }

  const totalFolders = rows.length;
  const completeish = statuses.done + statuses.expanded;
  const progressPercent = totalFolders ? Math.round((completeish / totalFolders) * 100) : 0;
  const processed = runOutput.results?.length || 0;
  const localCleaned = deletionLog.split("\n").filter(Boolean).length;

  return {
    label: "전체 Google Drive 수집 상태",
    progressPercent,
    totalFolders,
    drivesTracked: drives.size,
    statuses,
    documentsInManifest: manifest.documents?.length || 0,
    processedDocuments: processed,
    localMirrorCleaned: localCleaned,
    rows: rows.slice(0, 20),
    note: "Coverage is based on tracked queue rows, manifest, run output, and local mirror cleanup logs.",
  };
}

async function settingsPayload() {
  const { values } = await readEnvFile();
  return {
    settings: Object.fromEntries(
      [...editableSettings].map((key) => [key, sensitiveSettings.has(key) ? "" : values[key] || ""]),
    ),
    locked: {
      DRIVE_DELETE_SOURCE: values.DRIVE_DELETE_SOURCE || "false",
    },
    secrets: Object.fromEntries([...sensitiveSettings].map((key) => [key, Boolean(values[key])])),
    editableKeys: [...editableSettings],
  };
}

async function triggerOpenClaw(task) {
  const { values: env } = await readEnvFile();
  const webhookUrl = process.env.OPENCLAW_WEBHOOK_URL || env.OPENCLAW_WEBHOOK_URL || process.env.GLM_API_URL || env.GLM_API_URL;
  const apiKey = process.env.OPENCLAW_API_KEY || env.OPENCLAW_API_KEY || process.env.GLM_API_KEY || env.GLM_API_KEY;
  const usesGlmFallback = !process.env.OPENCLAW_WEBHOOK_URL && !env.OPENCLAW_WEBHOOK_URL;
  const payload = {
    source: "wiki_api",
    task: task || "drive_wikify_cycle",
    cwd: repoRoot,
    provider: usesGlmFallback ? "glm" : "openclaw-webhook",
    model: process.env.GLM_MODEL || env.GLM_MODEL || "glm-5.1",
    safety: {
      driveDeleteSource: false,
      remoteDeleteAllowed: false,
    },
    commands: {
      dryRun: "drive_wikify.cli rclone-copy --dry-run",
      manifest: "drive_wikify.cli build-manifest",
      wikify: "drive_wikify.cli run",
    },
    createdAt: new Date().toISOString(),
  };

  if (!webhookUrl) {
    const entry = {
      runId: `${Date.now()}-openclaw`,
      command: "openclaw-trigger",
      status: "not_configured",
      code: 0,
      stdout: "Neither OPENCLAW_WEBHOOK_URL nor GLM_API_URL is configured.",
      stderr: "",
      createdAt: new Date().toISOString(),
    };
    await appendRunHistory(entry);
    return { ...entry, payload };
  }

  if (usesGlmFallback) {
    try {
      const { payload: glmPayload, endpoint } = await requestGlmChatCompletion(webhookUrl, apiKey, {
        model: payload.model,
        messages: [
          {
            role: "system",
            content: [
              "당신은 OpenClaw 역할을 대신하는 Drive Wikify 자동화 오케스트레이터다.",
              "명령을 실제로 실행하지 말고, 제공된 payload 기준으로 안전한 실행 계획과 검증 게이트를 JSON으로 반환한다.",
              "원본 Google Drive 삭제는 절대 금지다.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(payload),
          },
        ],
        temperature: 0.1,
        max_tokens: 900,
        thinking: glmThinkingOptions(env),
        response_format: { type: "json_object" },
      });
      const entry = {
        runId: `${Date.now()}-openclaw`,
        command: "openclaw-trigger",
        status: "sent",
        code: 200,
        stdout: glmMessageContent(glmPayload).slice(-8000),
        stderr: "",
        endpoint,
        createdAt: new Date().toISOString(),
      };
      await appendRunHistory(entry);
      return { ...entry, payload, raw: glmPayload };
    } catch (error) {
      const entry = {
        runId: `${Date.now()}-openclaw`,
        command: "openclaw-trigger",
        status: "failed",
        code: 500,
        stdout: "",
        stderr: error.message,
        createdAt: new Date().toISOString(),
      };
      await appendRunHistory(entry);
      return { ...entry, payload };
    }
  }

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const entry = {
    runId: `${Date.now()}-openclaw`,
    command: "openclaw-trigger",
    status: response.ok ? "sent" : "failed",
    code: response.status,
    stdout: text.slice(-8000),
    stderr: "",
    createdAt: new Date().toISOString(),
  };
  await appendRunHistory(entry);
  return { ...entry, payload };
}

function runCommand(command, dryRun, meta = {}) {
  const allowed = new Set(["rclone-copy", "build-manifest", "run"]);
  if (!allowed.has(command)) {
    throw new Error(`Unsupported automation command: ${command}`);
  }
  const args = ["-m", "drive_wikify.cli", command];
  if (command === "rclone-copy" && dryRun) args.push("--dry-run");

  const env = {
    ...process.env,
    PYTHONPATH: driveWikifySrc,
  };
  const python = process.env.PYTHON_BIN || "/Users/rtm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
  const runId = `${Date.now()}-${command}`;
  const startedAt = new Date().toISOString();
  const commandLabel = dryRun ? `${command} --dry-run` : command;
  const entry = {
    runId,
    command: commandLabel,
    status: "running",
    code: null,
    stdout: "",
    stderr: "",
    createdAt: startedAt,
    startedAt,
    ...meta,
  };

  return new Promise(async (resolvePromise) => {
    await appendRunHistory(entry);
    let stdout = "";
    let stderr = "";
    let stopped = false;
    const child = spawn(python, args, { cwd: repoRoot, env });
    const timeout = setTimeout(() => {
      stopped = true;
      child.kill("SIGTERM");
      stderr += "\nCommand timed out.";
    }, command === "rclone-copy" && !dryRun ? 1000 * 60 * 60 : 1000 * 60 * 5);
    activeJobs.set(runId, {
      runId,
      command: commandLabel,
      child,
      startedAt,
      stop: () => {
        stopped = true;
        stderr += "\nStopped by user.";
        child.kill("SIGTERM");
      },
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      updateRunHistory(runId, { stdout: stdout.slice(-8000), stderr: stderr.slice(-8000) }).catch(() => {});
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      updateRunHistory(runId, { stdout: stdout.slice(-8000), stderr: stderr.slice(-8000) }).catch(() => {});
    });
    child.on("close", async (code) => {
      clearTimeout(timeout);
      activeJobs.delete(runId);
      const finalEntry = await updateRunHistory(runId, {
        status: stopped ? "stopped" : code === 0 ? "completed" : "failed",
        code,
        stdout: stdout.slice(-8000),
        stderr: stderr.slice(-8000),
        finishedAt: new Date().toISOString(),
      });
      resolvePromise(finalEntry);
    });
  });
}

async function fullCycle(dryRun) {
  const steps = [];
  steps.push(await runCommand("rclone-copy", true));
  if (!dryRun) {
    steps.push(await runCommand("build-manifest", false));
    steps.push(await runCommand("run", false));
  }
  return {
    runId: `${Date.now()}-full-cycle`,
    status: steps.every((step) => step.status === "completed") ? "completed" : "failed",
    steps,
    createdAt: new Date().toISOString(),
  };
}

async function automationSnapshot() {
  const runs = await readJsonFile(runHistoryPath, []);
  const schedules = await readJsonFile(schedulesPath, []);
  return {
    running: [...activeJobs.values()].map((job) => ({
      runId: job.runId,
      command: job.command,
      startedAt: job.startedAt,
    })),
    runs,
    schedules,
  };
}

async function stopAutomation(runId) {
  const targetId = runId || [...activeJobs.keys()][0];
  const job = activeJobs.get(targetId);
  if (!job) {
    return { status: "not_running", runId: targetId || null };
  }
  job.stop();
  await updateRunHistory(job.runId, { status: "stopping", stderr: "Stop requested by user." });
  return { status: "stopping", runId: job.runId };
}

function nextScheduleRun(schedule, from = new Date()) {
  if (schedule.mode === "interval") {
    const minutes = Math.max(1, Number(schedule.intervalMinutes || 60));
    const base = schedule.lastRunAt ? new Date(schedule.lastRunAt) : from;
    const next = new Date(base.getTime() + minutes * 60 * 1000);
    return next <= from ? new Date(from.getTime() + minutes * 60 * 1000).toISOString() : next.toISOString();
  }
  if (schedule.mode === "daily") {
    const [hour, minute] = String(schedule.timeOfDay || "03:00").split(":").map(Number);
    const next = new Date(from);
    next.setHours(Number.isFinite(hour) ? hour : 3, Number.isFinite(minute) ? minute : 0, 0, 0);
    if (next <= from) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  return schedule.runAt || from.toISOString();
}

async function saveSchedules(schedules) {
  await mkdir(apiRuntime, { recursive: true });
  await writeFile(schedulesPath, JSON.stringify(schedules, null, 2), "utf-8");
}

async function createSchedule(body) {
  const allowed = new Set(["rclone-copy", "build-manifest", "run", "full-cycle"]);
  const command = body.command || "rclone-copy";
  if (!allowed.has(command)) throw new Error(`Unsupported schedule command: ${command}`);
  const schedule = {
    id: `${Date.now()}-${command}`,
    name: body.name || `${command} 예약`,
    command,
    dryRun: Boolean(body.dryRun),
    mode: body.mode || "daily",
    runAt: body.runAt || "",
    timeOfDay: body.timeOfDay || "03:00",
    intervalMinutes: Number(body.intervalMinutes || 60),
    enabled: body.enabled !== false,
    createdAt: new Date().toISOString(),
  };
  schedule.nextRunAt = nextScheduleRun(schedule);
  const schedules = await readJsonFile(schedulesPath, []);
  schedules.unshift(schedule);
  await saveSchedules(schedules.slice(0, 50));
  return schedule;
}

async function deleteSchedule(id) {
  const schedules = await readJsonFile(schedulesPath, []);
  const next = schedules.filter((schedule) => schedule.id !== id);
  await saveSchedules(next);
  return { deleted: schedules.length !== next.length, id };
}

async function runScheduledCommand(schedule) {
  const meta = { scheduleId: schedule.id, scheduled: true };
  if (schedule.command === "full-cycle") return fullCycle(Boolean(schedule.dryRun));
  return runCommand(schedule.command, Boolean(schedule.dryRun), meta);
}

async function tickSchedules() {
  const now = new Date();
  const schedules = await readJsonFile(schedulesPath, []);
  let changed = false;
  for (const schedule of schedules) {
    if (!schedule.enabled || !schedule.nextRunAt || new Date(schedule.nextRunAt) > now) continue;
    if (activeJobs.size > 0) {
      schedule.nextRunAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      changed = true;
      continue;
    }
    schedule.lastRunAt = now.toISOString();
    schedule.nextRunAt = schedule.mode === "once" ? "" : nextScheduleRun(schedule, now);
    if (schedule.mode === "once") schedule.enabled = false;
    changed = true;
    runScheduledCommand(schedule).catch((error) => {
      appendRunHistory({
        runId: `${Date.now()}-schedule-error`,
        command: schedule.command,
        status: "failed",
        stderr: error.message,
        createdAt: new Date().toISOString(),
        scheduleId: schedule.id,
      }).catch(() => {});
    });
  }
  if (changed) await saveSchedules(schedules);
}

function localDigest(text, projectHint) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const numberLines = lines.filter((line) => /[0-9][0-9,.\-%억만원천 ]*/.test(line)).slice(0, 8);
  const conflictLines = lines.filter((line) => /(충돌|상이|다름|불일치|변경|확인 필요)/.test(line)).slice(0, 8);
  const evidenceLines = lines.slice(0, 10);
  return {
    provider: "local-rule-digest",
    project_decision: projectHint ? "candidate_existing_project" : "hold_for_review",
    project_hint: projectHint || null,
    sources_draft: "입력 텍스트 또는 파일 경로를 Sources.md 후보로 등록",
    evidence_candidates: evidenceLines,
    number_candidates: numberLines,
    conflict_candidates: conflictLines,
    next_action: "GLM adapter 연결 후 프로젝트 분기/중복 판단을 재검토",
  };
}

function normalizeGlmChatUrl(apiUrl) {
  const trimmed = String(apiUrl || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function codingPlanGlmUrl(apiUrl) {
  const normalized = normalizeGlmChatUrl(apiUrl);
  if (!normalized || normalized.includes("/api/coding/paas/")) return "";
  return normalized.replace("/api/paas/", "/api/coding/paas/");
}

function glmMessageContent(payload) {
  const message = payload.choices?.[0]?.message || {};
  return message.content || message.reasoning_content || "";
}

function glmThinkingOptions(env = {}) {
  const type = process.env.GLM_THINKING_TYPE || env.GLM_THINKING_TYPE || "enabled";
  const budget = Number(process.env.GLM_THINKING_BUDGET_TOKENS || env.GLM_THINKING_BUDGET_TOKENS || 8192);
  const thinking = { type };
  if (Number.isFinite(budget) && budget > 0) thinking.budget_tokens = budget;
  return thinking;
}

async function requestGlmChatCompletion(apiUrl, apiKey, body) {
  const primary = normalizeGlmChatUrl(apiUrl);
  const codingFallback = codingPlanGlmUrl(apiUrl);
  const candidates = [primary, codingFallback].filter(Boolean);
  const timeoutMs = Number(process.env.GLM_TIMEOUT_MS || 45000);
  let lastError = null;
  const bodyVariants = [body];
  if (body?.thinking?.budget_tokens) {
    const { budget_tokens: _budgetTokens, ...thinkingWithoutBudget } = body.thinking;
    bodyVariants.push({ ...body, thinking: thinkingWithoutBudget });
  }

  for (const url of candidates) {
    for (const requestBody of bodyVariants) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ ...requestBody, stream: false }),
        });
      } catch (error) {
        clearTimeout(timeout);
        lastError = new Error(error.name === "AbortError" ? `GLM timeout after ${timeoutMs}ms` : error.message);
        continue;
      }
      clearTimeout(timeout);
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { raw: text };
      }
      if (response.ok) {
        return {
          payload,
          endpoint: url.includes("/api/coding/paas/") ? "coding" : "paas",
          thinking: requestBody.thinking || null,
        };
      }
      const code = payload.error?.code || response.status;
      const message = payload.error?.message || text || response.statusText;
      lastError = new Error(`GLM HTTP ${response.status} (${code}): ${message}`);
      if (response.status === 400 && requestBody !== bodyVariants[bodyVariants.length - 1]) continue;
      if (response.status !== 429 || !codingFallback || url === codingFallback) break;
    }
  }

  throw lastError || new Error("GLM request failed");
}

async function glmDigest(text, projectHint) {
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const model = process.env.GLM_MODEL || env.GLM_MODEL || "glm-4.5";
  if (!apiKey || !apiUrl) {
    return localDigest(text, projectHint);
  }
  try {
    const { payload, endpoint } = await requestGlmChatCompletion(apiUrl, apiKey, {
      model,
      messages: [
        {
          role: "system",
          content: "You produce evidence-preserving wiki ingest digests in compact JSON.",
        },
        {
          role: "user",
          content: JSON.stringify({ projectHint, text }),
        },
      ],
      temperature: 0.1,
      max_tokens: 1200,
      thinking: glmThinkingOptions(env),
      response_format: { type: "json_object" },
    });
    return {
      provider: "glm",
      model,
      endpoint,
      raw: payload,
      digest: glmMessageContent(payload),
    };
  } catch (error) {
    return { ...localDigest(text, projectHint), upstreamStatus: error.message };
  }
}

async function operationalWikiContext(message) {
  const matches = (await searchWiki(message)).slice(0, 6);
  const pages = [];
  for (const item of matches) {
    const page = await pageByPath(item.path).catch(() => null);
    pages.push({
      title: item.title,
      path: item.path,
      frontmatter: item.frontmatter,
      snippet: item.snippet,
      excerpt: page?.markdown?.slice(0, 5000) || item.snippet,
    });
  }
  const automation = await automationSnapshot().catch(() => ({ running: [], runs: [], schedules: [] }));
  const coverage = await coverageSummary().catch(() => null);
  const paperclip = await paperclipStatus().catch(() => null);
  return {
    evidence: pages,
    ops: {
      running: automation.running,
      latestRuns: automation.runs.slice(0, 5).map((run) => ({
        command: run.command,
        status: run.status,
        stderr: run.stderr,
        createdAt: run.createdAt,
      })),
      schedules: automation.schedules.slice(0, 5),
      coverage,
      paperclip: paperclip ? {
        available: paperclip.available,
        status: paperclip.status,
        url: paperclip.url,
        recommendedAgents: paperclip.recommendedAgents,
        templates: (paperclip.templates || []).map((template) => ({
          id: template.id,
          agent: template.agent,
          title: template.title,
          description: template.description,
          safety: template.safety,
        })),
        recentTasks: (paperclip.tasks || []).slice(0, 5).map((task) => ({
          id: task.id,
          agent: task.agent,
          title: task.title,
          status: task.status,
          command: task.command,
          safety: task.safety,
          createdAt: task.createdAt,
        })),
      } : null,
    },
  };
}

function defaultChatProject() {
  return {
    id: "default",
    name: "기본 업무 챗",
    instructions: "",
    memories: [],
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function defaultGlobalChatSettings() {
  return {
    instructions: [
      "위키를 근거 저장소로 사용해 고객 프로젝트의 업무 상태, 리스크, 다음 액션을 중심으로 답한다.",
      "위키/검색 시스템 자체를 설명하지 말고 프로젝트 또는 업무 대상에 바로 답한다.",
      "프로젝트 메모리는 관리되는 보조 기억이고, 대화내역은 결정/검증된 지식이 아닐 수 있는 보조 맥락으로 취급한다.",
      "대화에서 나온 사실은 원문 근거가 확인되거나 사용자가 결정한 경우에만 확정 지식으로 승격한다.",
      "근거가 약하면 확인 필요로 표시하고, 확인할 Markdown path 또는 다음 액션을 제안한다.",
    ].join("\n"),
    autoMemory: true,
    updatedAt: new Date().toISOString(),
  };
}

async function syncGlobalChatSettingsToL1(settings) {
  const now = new Date().toISOString();
  const target = join(l1Root, "GLM_Global_Instructions.md");
  await mkdir(l1Root, { recursive: true });
  await writeFile(target, [
    "---",
    "type: global_chat_instruction",
    "knowledge_role: global_operating_rule",
    `updated: ${now}`,
    "source: wiki_api chat_global_settings.json",
    "---",
    "",
    "# GLM Global Instructions",
    "",
    "## 지식 성격",
    "- 이 문서는 모든 GLM 프로젝트 챗에 적용되는 전역 운영 지침이다.",
    "- 개별 프로젝트 지침과 메모리는 이 전역 지침 위에 추가되는 보조/특수 맥락이다.",
    "",
    "## 전역 지침",
    quoteMarkdown(settings.instructions || ""),
    "",
    "## 자동 메모리",
    `- enabled: ${settings.autoMemory !== false}`,
  ].join("\n"), "utf-8");
  return relative(repoRoot, target);
}

async function getGlobalChatSettings() {
  const existing = await readJsonFile(chatGlobalSettingsPath, null);
  if (existing) {
    await syncGlobalChatSettingsToL1(existing);
    return existing;
  }
  const initial = defaultGlobalChatSettings();
  await saveGlobalChatSettings(initial);
  return initial;
}

async function saveGlobalChatSettings(settings) {
  const next = {
    ...defaultGlobalChatSettings(),
    ...(settings || {}),
    instructions: String(settings?.instructions ?? defaultGlobalChatSettings().instructions).trim(),
    autoMemory: settings?.autoMemory !== false,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(apiRuntime, { recursive: true });
  await writeFile(chatGlobalSettingsPath, JSON.stringify(next, null, 2), "utf-8");
  await syncGlobalChatSettingsToL1(next);
  return next;
}

function isGlobalInstructionText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return [
    "위키 자체가 아니라 고객 프로젝트 업무 상태와 다음 액션으로 답한다.",
    "위키를 근거 저장소로 사용해 실제 프로젝트 상태, 리스크, 다음 액션을 정리한다.",
  ].includes(text);
}

function migrateGlobalInstructionMemories(projects) {
  let changed = false;
  const migrated = (projects || []).map((project) => {
    const memories = (project.memories || []).filter((memory) => {
      const keep = !isGlobalInstructionText(memory.content);
      if (!keep) changed = true;
      return keep;
    });
    const instructions = isGlobalInstructionText(project.instructions) ? "" : project.instructions;
    if (instructions !== project.instructions) changed = true;
    return {
      ...project,
      instructions,
      memories,
    };
  });
  return { projects: migrated, changed };
}

async function listChatProjects() {
  let projects = await readJsonFile(chatProjectsPath, []);
  if (projects.length) {
    const migrated = migrateGlobalInstructionMemories(projects);
    projects = migrated.projects;
    if (migrated.changed) await saveChatProjects(projects);
    await syncChatProjectsToL1(projects);
    return projects;
  }
  const initial = [defaultChatProject()];
  await saveChatProjects(initial);
  return initial;
}

async function saveChatProjects(projects) {
  await mkdir(apiRuntime, { recursive: true });
  await writeFile(chatProjectsPath, JSON.stringify(projects, null, 2), "utf-8");
  await syncChatProjectsToL1(projects);
}

function quoteMarkdown(value) {
  return String(value || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function chatProjectMemoryPath(project) {
  const fileName = `${slugifyName(project.id || project.name || "chat-project")}.md`;
  return join(l1Root, "GLM_Chat_Projects", fileName);
}

function chatProjectMarkdown(project, options = {}) {
  const now = new Date().toISOString();
  const memories = project.memories || [];
  const messages = project.messages || [];
  return [
    "---",
    "type: auxiliary_chat_project_memory",
    `project_id: "${String(project.id || "").replace(/"/g, '\\"')}"`,
    `project_name: "${String(project.name || "").replace(/"/g, '\\"')}"`,
    `status: "${options.deleted ? "deleted_in_chat_runtime" : "active"}"`,
    "knowledge_role: auxiliary_not_decision",
    `created: ${project.createdAt || now}`,
    `updated: ${now}`,
    "source: wiki_api chat_projects.json",
    "---",
    "",
    `# GLM Chat Project - ${project.name || project.id}`,
    "",
    "## 지식 성격",
    "- 이 문서는 프로젝트별 GLM 챗 지침, 관리 메모리, 대화 내용을 위키/L1 memory에 보존하기 위한 보조 지식이다.",
    "- 대화내역은 검증/승인된 결정 사항이 아닐 수 있으므로 `보조 맥락`으로만 사용한다.",
    "- 실제 프로젝트 사실, 수치, 결정은 별도 근거 Markdown, Sources, Evidence Log, Change Log, Conflict Register로 승격되어야 한다.",
    "",
    "## 프로젝트별 특수 지침",
    project.instructions ? quoteMarkdown(project.instructions) : "- 없음",
    "",
    "## 관리 메모리",
    memories.length
      ? memories.map((memory) => [
          `### ${memory.title || "메모리"}`,
          `- id: \`${memory.id}\``,
          `- source: ${memory.source || "manual"}`,
          `- confidence: ${memory.confidence || "user_managed"}`,
          `- updated: ${memory.updatedAt || memory.createdAt || ""}`,
          "",
          quoteMarkdown(memory.content || ""),
        ].join("\n")).join("\n\n")
      : "- 없음",
    "",
    "## 최근 대화내역",
    messages.length
      ? messages.slice(-80).map((message, index) => [
          `### ${index + 1}. ${message.role || "message"} · ${message.createdAt || ""}`,
          "",
          quoteMarkdown(message.content || ""),
        ].join("\n")).join("\n\n")
      : "- 없음",
    "",
    "## 승격 규칙",
    "- 대화 중 나온 사실은 원문 근거가 확인되기 전까지 확정 지식으로 쓰지 않는다.",
    "- 사용자가 결정하거나 근거 문서로 확인된 내용만 프로젝트 위키 본문 또는 Evidence Log로 승격한다.",
    "- 서로 다른 대화에서 충돌하는 내용은 Conflict Register 후보로 남긴다.",
  ].join("\n");
}

async function syncChatProjectToL1(project, options = {}) {
  if (!project?.id) return null;
  const target = chatProjectMemoryPath(project);
  await mkdir(join(l1Root, "GLM_Chat_Projects"), { recursive: true });
  await writeFile(target, chatProjectMarkdown(project, options), "utf-8");
  return relative(repoRoot, target);
}

async function syncChatProjectsToL1(projects) {
  await Promise.all((projects || []).map((project) => syncChatProjectToL1(project)));
}

async function upsertChatProject(body) {
  const projects = await listChatProjects();
  const now = new Date().toISOString();
  const id = body.id || `${Date.now()}-${slugifyName(body.name || "chat-project")}`;
  const existing = projects.find((project) => project.id === id);
  const next = {
    ...(existing || { id, createdAt: now, messages: [], memories: [] }),
    name: body.name || existing?.name || "새 GLM 프로젝트",
    instructions: body.instructions ?? existing?.instructions ?? "",
    updatedAt: now,
  };
  await saveChatProjects(existing ? projects.map((project) => project.id === id ? next : project) : [next, ...projects]);
  return next;
}

async function deleteChatProject(id) {
  const projects = await listChatProjects();
  const deletedProject = projects.find((project) => project.id === id);
  const next = projects.filter((project) => project.id !== id);
  await saveChatProjects(next.length ? next : [defaultChatProject()]);
  if (deletedProject) await syncChatProjectToL1({ ...deletedProject, updatedAt: new Date().toISOString() }, { deleted: true });
  return { deleted: projects.length !== next.length, id };
}

async function upsertChatMemory(projectId, body) {
  const projects = await listChatProjects();
  const now = new Date().toISOString();
  const memory = {
    id: body.id || `${Date.now()}-memory`,
    title: body.title || "메모리",
    content: body.content || "",
    source: body.source || "manual",
    confidence: body.confidence || "user_managed",
    createdAt: body.createdAt || now,
    updatedAt: now,
  };
  const updated = projects.map((project) => project.id === projectId ? {
    ...project,
    memories: [memory, ...(project.memories || []).filter((item) => item.id !== memory.id)],
    updatedAt: now,
  } : project);
  await saveChatProjects(updated);
  return memory;
}

function autoMemoryCandidate(message) {
  const text = String(message || "").trim();
  if (!text || text.length < 6 || text.length > 1200) return null;
  if (isGlobalInstructionText(text)) {
    return {
      scope: "global",
      title: "전역 응답 원칙",
      content: "위키를 근거 저장소로 사용해 고객 프로젝트의 업무 상태와 다음 액션 중심으로 답한다.",
    };
  }
  const explicit = /(기억해|기억하|메모리|앞으로|항상|원칙|지침|선호|규칙)/.test(text);
  const projectFact = /(\d{1,2}월\s*\d{1,2}일|\d{4}-\d{1,2}-\d{1,2}|테스트|완료|진행|결정|변경|확정|보류|고객|일정|납기|리스크|이슈|다음 액션)/.test(text);
  if (!explicit && !projectFact) return null;
  if (/[?？]\s*$/.test(text) && !explicit) return null;
  const titleBase = text
    .replace(/^(기억해|기억하자|메모리에 넣어|앞으로|항상)\s*/g, "")
    .split(/[.!?\n。]/)[0]
    .trim()
    .slice(0, 42);
  return {
    scope: "project",
    title: titleBase ? `자동 기억 - ${titleBase}` : "자동 기억",
    content: text,
  };
}

async function autoRememberFromMessage(projectId, message) {
  const settings = await getGlobalChatSettings();
  if (settings.autoMemory === false) return null;
  const candidate = autoMemoryCandidate(message);
  if (!candidate) return null;
  if (candidate.scope === "global") {
    const instructions = settings.instructions.includes(candidate.content)
      ? settings.instructions
      : `${settings.instructions.trim()}\n${candidate.content}`.trim();
    await saveGlobalChatSettings({ ...settings, instructions });
    return { scope: "global", title: candidate.title };
  }
  const projects = await listChatProjects();
  const project = projects.find((item) => item.id === projectId) || projects[0];
  const duplicate = (project?.memories || []).some((memory) => memory.content === candidate.content);
  if (duplicate || !project) return null;
  const memory = await upsertChatMemory(project.id, {
    title: candidate.title,
    content: candidate.content,
    source: "auto_from_chat",
    confidence: "auxiliary_not_decision",
  });
  return { scope: "project", projectId: project.id, memory };
}

async function deleteChatMemory(projectId, memoryId) {
  const projects = await listChatProjects();
  const updated = projects.map((project) => project.id === projectId ? {
    ...project,
    memories: (project.memories || []).filter((memory) => memory.id !== memoryId),
    updatedAt: new Date().toISOString(),
  } : project);
  await saveChatProjects(updated);
  return { deleted: true, projectId, memoryId };
}

async function appendChatProjectMessage(projectId, message) {
  const projects = await listChatProjects();
  const now = new Date().toISOString();
  const updated = projects.map((project) => project.id === projectId ? {
    ...project,
    messages: [...(project.messages || []), { ...message, createdAt: message.createdAt || now }].slice(-100),
    updatedAt: now,
  } : project);
  await saveChatProjects(updated);
}

async function glmChat(message, projectId = "default") {
  const projects = await listChatProjects();
  const project = projects.find((item) => item.id === projectId) || projects[0] || defaultChatProject();
  const globalSettings = await getGlobalChatSettings();
  const context = await operationalWikiContext(`${project.name} ${message}`);
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const model = process.env.GLM_MODEL || env.GLM_MODEL || "glm-4.5";
  if (!apiKey || !apiUrl) {
    return {
      provider: "fallback",
      message: "GLM_API_URL과 GLM_API_KEY를 운영 설정에 넣으면 위키 기반 업무 운영 챗이 연결됩니다.",
      context,
    };
  }
  try {
    const { payload, endpoint } = await requestGlmChatCompletion(apiUrl, apiKey, {
        model,
        messages: [
          {
            role: "system",
            content: [
              "당신은 위키 검색 결과를 설명하는 챗봇이 아니라, 로컬 Obsidian 위키를 근거 저장소로 쓰는 한국어 업무 운영 매니저다.",
              "목표는 사용자의 실제 프로젝트 업무를 관리하는 것이다: 현재 상태, 막힌 점, 다음 액션, 담당/증거/리스크를 정리한다.",
              `전역 운영 지침: ${globalSettings.instructions || "없음"}`,
              `현재 GLM 챗 프로젝트: ${project.name}`,
              `프로젝트별 특수 지침: ${project.instructions || "없음"}`,
              "충분히 깊게 내부 추론하되, 최종 답변에는 추론 과정을 장황하게 노출하지 말고 검토 결과와 근거만 정리하라.",
              "프로젝트 메모리는 관리되는 보조 기억이고, 최근 대화내역은 결정/검증된 지식이 아닐 수 있는 보조 맥락이다.",
              "대화 내용은 사용자가 명시적으로 결정했거나 별도 근거 Markdown으로 확인된 경우에만 확정 사실처럼 취급하라.",
              "금지: '제공된 위키 검색 결과', '스니펫', '메타데이터를 종합하면', '현재 위키에 색인된' 같은 메타 표현으로 시작하지 마라.",
              "위키나 검색 시스템 자체를 설명하지 말고, 프로젝트/업무 대상에 대해 바로 답하라.",
              "Paperclip 컨텍스트가 있으면 이를 별도 실행 결과처럼 과장하지 말고, 사용 가능한 agent/template/task 힌트로만 활용하라.",
              "근거는 path로 짧게 붙인다. 확실하지 않으면 '확인 필요'로 표시하고, 무엇을 열어봐야 하는지 제안한다.",
              "기본 형식: 1) 현재 업무상태 2) 진행/완료 3) 리스크/충돌 4) 다음 액션 5) 근거.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              task_request: message,
              global_instruction_role: "global_operating_rule",
              project_memory: project.memories || [],
              project_memory_role: "managed_auxiliary_memory",
              recent_project_messages: (project.messages || []).slice(-12),
              recent_project_messages_role: "auxiliary_context_not_decision",
              wiki_evidence_and_ops_context: context,
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 1400,
        thinking: glmThinkingOptions(env),
    });
    return {
      provider: "glm",
      model,
      endpoint,
      message: glmMessageContent(payload),
      context,
      projectId: project.id,
    };
  } catch (error) {
    return {
      provider: "fallback",
      message: `GLM 연결 실패: ${error.message}`,
      context,
    };
  }
}

async function paperclipStatus() {
  const { values: env } = await readEnvFile();
  const url = process.env.PAPERCLIP_URL || env.PAPERCLIP_URL || "http://127.0.0.1:3000";
  const tasks = await readJsonFile(paperclipTasksPath, []);
  const events = await readJsonFile(paperclipEventsPath, []);
  const templates = paperclipTemplates();
  try {
    const response = await fetch(url);
    return {
      available: response.ok,
      url,
      status: response.ok ? "reachable" : `HTTP ${response.status}`,
      recommendedAgents: templates.map((template) => template.agent),
      templates,
      tasks: tasks.slice(0, 20),
      events: events.slice(0, 30),
    };
  } catch (error) {
    return {
      available: false,
      url,
      status: error.message,
      recommendedAgents: templates.map((template) => template.agent),
      templates,
      tasks: tasks.slice(0, 20),
      events: events.slice(0, 30),
    };
  }
}

function skillCatalog() {
  return [
    {
      id: "report-md-writer",
      name: "보고서 작성용 MD 생성",
      type: "local-template",
      status: "applied",
      safety: "local_draft_only",
      description: "위키 근거를 바탕으로 보고서 목차, 핵심 주장, 근거표, 확인 필요 항목을 담은 Markdown 초안을 만든다.",
      bestFor: ["정부과제 보고서", "PoC 결과보고서", "고객 제출 전 초안"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "coding-task-planner",
      name: "코딩 작업 스킬",
      type: "local-template",
      status: "applied",
      safety: "planning_only",
      description: "기능 구현/버그 수정 작업을 목표, 영향 파일, 테스트, 롤백 기준으로 쪼개는 작업 지시 MD를 만든다.",
      bestFor: ["프론트엔드 개선", "자동화 API 추가", "테스트 계획"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "evidence-auditor",
      name: "근거 검증 스킬",
      type: "local-template",
      status: "applied",
      safety: "read_only",
      description: "문장/수치/출처/충돌 후보를 분리해 검수 체크리스트를 만든다.",
      bestFor: ["보고서 제출 전 검수", "위키 충돌 정리", "출처 누락 탐지"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "graphify",
      name: "Graphify 지식그래프",
      type: "installed-skill",
      status: "available",
      safety: "local_artifact",
      description: "문서/코드/이미지를 knowledge graph, clustered communities, HTML/JSON/audit report로 변환한다.",
      bestFor: ["프로젝트 관계도", "근거 클러스터링", "대형 위키 구조 분석"],
      output: "HTML + JSON + audit report",
    },
    {
      id: "documents",
      name: "Documents / DOCX 작성",
      type: "available-plugin-skill",
      status: "available",
      safety: "local_file_write",
      description: "DOCX 생성/편집/렌더 검증 워크플로우에 적합하다.",
      bestFor: ["제출용 Word 보고서", "검토본 렌더링", "페이지 단위 QA"],
      output: ".docx",
    },
    {
      id: "presentations",
      name: "Presentations / PPTX 작성",
      type: "available-plugin-skill",
      status: "available",
      safety: "local_file_write",
      description: "PowerPoint 작성, 수정, 렌더 검증에 적합하다.",
      bestFor: ["고객 발표자료", "PoC 결과 발표", "프로젝트 킥오프"],
      output: ".pptx",
    },
    {
      id: "github-mcp",
      name: "GitHub MCP Server",
      type: "recommended-mcp",
      status: "candidate",
      safety: "requires_token_and_scopes",
      description: "GitHub 공식 MCP 계열. 이슈/PR/코드 검색/저장소 운영에 유용하지만 토큰 권한 관리가 필요하다.",
      bestFor: ["코딩 작업 관리", "PR/Issue 연동", "릴리즈 기록"],
      installHint: "승인 후 GitHub 토큰 scope를 제한해 연결",
    },
    {
      id: "playwright-mcp",
      name: "Microsoft Playwright MCP",
      type: "recommended-mcp",
      status: "candidate",
      safety: "browser_access",
      description: "Microsoft의 Playwright MCP. 로컬 프론트엔드 UI 테스트와 브라우저 자동화에 적합하다.",
      bestFor: ["127.0.0.1 UI 테스트", "회귀 테스트", "스크린 기반 확인"],
      installHint: "승인 후 npx @playwright/mcp 연결",
    },
    {
      id: "filesystem-fetch-mcp",
      name: "Filesystem / Fetch MCP",
      type: "recommended-mcp",
      status: "candidate",
      safety: "strict_allowlist_required",
      description: "MCP reference 계열 파일/웹 fetch 서버. 이 프로젝트에서는 경로 allowlist와 읽기 전용 우선 설정이 필요하다.",
      bestFor: ["로컬 자료 읽기", "웹 근거 fetch", "문서 수집"],
      installHint: "승인 후 repo/runtime 범위 allowlist로 제한",
    },
    {
      id: "sequential-thinking",
      name: "Sequential Thinking MCP",
      type: "popular-community-mcp",
      status: "candidate",
      safety: "low_data_access_but_review_needed",
      description: "복잡한 판단을 단계적으로 쪼개는 커뮤니티 인기 MCP. 데이터 접근은 낮지만 공급망 검토가 필요하다.",
      bestFor: ["프로젝트 분기 판단", "충돌 원인 추론", "큰 보고서 구조화"],
      installHint: "승인 후 패키지 출처와 버전 pin 확인",
    },
  ];
}

function slugifyName(value) {
  return String(value || "skill-output")
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "skill-output";
}

async function createSkillDraft(body) {
  const catalog = skillCatalog();
  const skill = catalog.find((item) => item.id === body.skillId);
  if (!skill) throw new Error(`Unknown skill: ${body.skillId}`);
  if (!["report-md-writer", "coding-task-planner", "evidence-auditor"].includes(skill.id)) {
    throw new Error("This skill requires a separate tool/plugin run and is not auto-executed from the UI.");
  }
  const title = body.title || skill.name;
  const context = body.context || "";
  const now = new Date().toISOString();
  const sections = {
    "report-md-writer": [
      `# ${title}`,
      "",
      "## 목적",
      "- 이 보고서가 답해야 하는 업무 질문:",
      "",
      "## 핵심 결론 초안",
      "- 결론 1:",
      "- 결론 2:",
      "",
      "## 근거 표",
      "| 주장 | 근거 Markdown / 원문 | 수치 | 확인 필요 |",
      "| --- | --- | --- | --- |",
      "|  |  |  |  |",
      "",
      "## 리스크와 충돌",
      "- 충돌 후보:",
      "- 과장 위험:",
      "",
      "## 다음 액션",
      "- 담당자/기한/확인 파일:",
    ],
    "coding-task-planner": [
      `# ${title}`,
      "",
      "## 목표",
      "- 사용자 가치:",
      "",
      "## 변경 범위",
      "- 예상 파일:",
      "- 건드리지 않을 것:",
      "",
      "## 구현 단계",
      "1. 현 구조 확인",
      "2. 최소 변경 구현",
      "3. 문법/스모크 테스트",
      "4. 문서 업데이트",
      "",
      "## 검증",
      "- 명령:",
      "- 기대 결과:",
      "",
      "## 롤백 기준",
      "- 실패 시 되돌릴 단위:",
    ],
    "evidence-auditor": [
      `# ${title}`,
      "",
      "## 검수 대상",
      "- 문서/프로젝트:",
      "",
      "## 수치 검증",
      "| 수치 | 출처 | 같은 의미로 재사용 가능 여부 |",
      "| --- | --- | --- |",
      "|  |  |  |",
      "",
      "## 표현 검증",
      "- 원문 표현 유지 필요:",
      "- 해석/추론으로 분리할 문장:",
      "",
      "## 충돌 후보",
      "- 버전 차이:",
      "- 범위 차이:",
      "",
      "## 판정",
      "- 그대로 사용:",
      "- 수정 후 사용:",
      "- 보류:",
    ],
  };
  const markdown = [
    "---",
    "type: skill_output",
    `skill: ${skill.id}`,
    `created: ${now}`,
    "source: wiki ops skill catalog",
    "---",
    "",
    ...sections[skill.id],
    "",
    "## 입력 컨텍스트",
    context || "- 없음",
    "",
    "## 안전 메모",
    "- 이 파일은 로컬 runtime draft이며, 원본 Google Drive 삭제나 외부 전송을 수행하지 않는다.",
  ].join("\n");
  await mkdir(skillOutputsRoot, { recursive: true });
  const fileName = `${now.replace(/[:.]/g, "-")}_${slugifyName(title)}.md`;
  const path = join(skillOutputsRoot, fileName);
  await writeFile(path, markdown, "utf-8");
  return {
    skill,
    path: relative(repoRoot, path),
    markdown,
  };
}

function paperclipTemplates() {
  return [
    {
      id: "drive-collector",
      agent: "Drive Collector",
      title: "보수적 Drive 수집",
      description: "GLM 챗과 위키가 참조할 수집 컨텍스트를 만든다. rclone copy dry-run 또는 실제 copy를 작은 배치로 실행하며 원본 Drive 삭제는 금지.",
      command: "rclone-copy",
      dryRun: true,
      safety: "remote_delete_forbidden",
    },
    {
      id: "manifest-builder",
      agent: "Manifest Builder",
      title: "로컬 mirror manifest 생성",
      description: "GLM 챗이 수집 범위와 누락 범위를 판단할 수 있도록 로컬 mirror 문서 목록을 만든다.",
      command: "build-manifest",
      dryRun: false,
      safety: "local_read_only",
    },
    {
      id: "wiki-ingest-operator",
      agent: "Wiki Ingest Operator",
      title: "위키화 실행",
      description: "본 위키에 남길 청크 요약, 프로젝트 분기, 위키 문서 반영, 로그 기록을 실행한다.",
      command: "run",
      dryRun: false,
      safety: "wiki_write_local_only",
    },
    {
      id: "openclaw-cycle",
      agent: "OpenClaw Orchestrator",
      title: "OpenClaw 자동화 트리거",
      description: "OpenClaw webhook이 설정된 경우 전체 Drive Wikify 사이클을 위임하고, 없으면 GLM으로 실행 계획을 받는다.",
      command: "openclaw",
      dryRun: false,
      safety: "no_remote_drive_delete",
    },
    {
      id: "validator",
      agent: "Validator",
      title: "커버리지/충돌 검수",
      description: "GLM 챗이 업무 판단에 쓸 수 있도록 coverage tracker, run output, cleanup log를 묶어 현재 상태를 판단한다.",
      command: "validate",
      dryRun: false,
      safety: "read_only",
    },
  ];
}

async function createPaperclipTask(templateId, overrides = {}) {
  const template = paperclipTemplates().find((item) => item.id === templateId);
  if (!template) throw new Error(`Unknown Paperclip template: ${templateId}`);
  const task = {
    id: `${Date.now()}-${template.id}`,
    templateId: template.id,
    agent: template.agent,
    title: overrides.title || template.title,
    description: overrides.description || template.description,
    command: template.command,
    dryRun: overrides.dryRun ?? template.dryRun,
    status: "queued",
    safety: {
      driveDeleteSource: false,
      remoteDeleteAllowed: false,
      mode: template.safety,
    },
    payload: overrides.payload || {},
    createdAt: new Date().toISOString(),
  };
  await prependJsonHistory(paperclipTasksPath, task);
  await prependJsonHistory(paperclipEventsPath, {
    taskId: task.id,
    type: "task_queued",
    message: `${task.agent}: ${task.title}`,
    createdAt: task.createdAt,
  });
  return task;
}

async function updatePaperclipTask(taskId, updates) {
  await mkdir(apiRuntime, { recursive: true });
  const tasks = await readJsonFile(paperclipTasksPath, []);
  const next = tasks.map((task) => (task.id === taskId ? { ...task, ...updates, updatedAt: new Date().toISOString() } : task));
  await writeFile(paperclipTasksPath, JSON.stringify(next, null, 2), "utf-8");
  return next.find((task) => task.id === taskId);
}

async function triggerPaperclipTask(templateId, options = {}) {
  const task = await createPaperclipTask(templateId, options);
  let result;
  if (task.command === "openclaw") {
    result = await triggerOpenClaw("drive_wikify_cycle");
  } else if (task.command === "validate") {
    result = { status: "completed", coverage: await coverageSummary() };
  } else {
    result = await runCommand(task.command, Boolean(task.dryRun));
  }
  const status = result.status === "completed" || result.status === "sent" ? "completed" : "failed";
  const updatedTask = await updatePaperclipTask(task.id, {
    status,
    result,
    finishedAt: new Date().toISOString(),
  });
  await prependJsonHistory(paperclipEventsPath, {
    taskId: task.id,
    type: "task_finished",
    message: `${task.agent}: ${status}`,
    resultStatus: result.status,
    createdAt: new Date().toISOString(),
  });
  return { task: updatedTask, result };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function serveStatic(req, res, pathname) {
  const targetPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = safeJoin(frontendRoot, targetPath);
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error("Not found");
  const type = contentTypes[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === "/api/status" && req.method === "GET") {
      return sendJson(res, 200, await collectStatus());
    }
    if (pathname === "/api/settings" && req.method === "GET") {
      return sendJson(res, 200, await settingsPayload());
    }
    if (pathname === "/api/settings" && req.method === "POST") {
      const body = await readBody(req);
      const settings = await writeEnvValues(body.settings || {});
      return sendJson(res, 200, { settings, locked: { DRIVE_DELETE_SOURCE: "false" } });
    }
    if (pathname === "/api/coverage" && req.method === "GET") {
      return sendJson(res, 200, await coverageSummary());
    }
    if (pathname === "/api/automation/runs" && req.method === "GET") {
      return sendJson(res, 200, { runs: await readJsonFile(runHistoryPath, []) });
    }
    if (pathname === "/api/automation/status" && req.method === "GET") {
      return sendJson(res, 200, await automationSnapshot());
    }
    if (pathname === "/api/automation/stop" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await stopAutomation(body.runId || ""));
    }
    if (pathname === "/api/automation/schedules" && req.method === "GET") {
      return sendJson(res, 200, { schedules: await readJsonFile(schedulesPath, []) });
    }
    if (pathname === "/api/automation/schedules" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { schedule: await createSchedule(body) });
    }
    if (pathname.startsWith("/api/automation/schedules/") && req.method === "DELETE") {
      const id = decodeURIComponent(pathname.replace("/api/automation/schedules/", ""));
      return sendJson(res, 200, await deleteSchedule(id));
    }
    if (pathname === "/api/automation/trigger" && req.method === "POST") {
      const body = await readBody(req);
      const result = body.command === "full-cycle" ? await fullCycle(Boolean(body.dryRun)) : await runCommand(body.command, Boolean(body.dryRun));
      return sendJson(res, result.status === "completed" ? 200 : 500, result);
    }
    if (pathname === "/api/skills/catalog" && req.method === "GET") {
      return sendJson(res, 200, { skills: skillCatalog() });
    }
    if (pathname === "/api/skills/draft" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await createSkillDraft(body));
    }
    if (pathname === "/api/chat/projects" && req.method === "GET") {
      return sendJson(res, 200, { projects: await listChatProjects(), global: await getGlobalChatSettings() });
    }
    if (pathname === "/api/chat/global" && req.method === "GET") {
      return sendJson(res, 200, { global: await getGlobalChatSettings() });
    }
    if (pathname === "/api/chat/global" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { global: await saveGlobalChatSettings(body) });
    }
    if (pathname === "/api/chat/projects" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { project: await upsertChatProject(body) });
    }
    if (pathname.startsWith("/api/chat/projects/") && req.method === "DELETE") {
      const id = decodeURIComponent(pathname.replace("/api/chat/projects/", ""));
      return sendJson(res, 200, await deleteChatProject(id));
    }
    if (pathname.match(/^\/api\/chat\/projects\/[^/]+\/memories$/) && req.method === "POST") {
      const projectId = decodeURIComponent(pathname.split("/")[4]);
      const body = await readBody(req);
      return sendJson(res, 200, { memory: await upsertChatMemory(projectId, body) });
    }
    if (pathname.match(/^\/api\/chat\/projects\/[^/]+\/memories\/[^/]+$/) && req.method === "DELETE") {
      const parts = pathname.split("/");
      return sendJson(res, 200, await deleteChatMemory(decodeURIComponent(parts[4]), decodeURIComponent(parts[6])));
    }
    if (pathname === "/api/openclaw/trigger" && req.method === "POST") {
      const body = await readBody(req);
      const result = await triggerOpenClaw(body.task || "drive_wikify_cycle");
      return sendJson(res, result.status === "failed" ? 500 : 200, result);
    }
    if (pathname === "/api/wiki/search" && req.method === "GET") {
      const query = url.searchParams.get("q") || "";
      return sendJson(res, 200, { results: query ? await searchWiki(query) : [] });
    }
    if (pathname === "/api/wiki/index" && req.method === "GET") {
      return sendJson(res, 200, { pages: await wikiIndex() });
    }
    if (pathname === "/api/wiki/graph" && req.method === "GET") {
      return sendJson(res, 200, await wikiGraph());
    }
    if (pathname === "/api/wiki/search/brief" && req.method === "GET") {
      const query = url.searchParams.get("q") || "";
      return sendJson(res, 200, await searchWikiBrief(query));
    }
    if (pathname === "/api/wiki/search/brief" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await searchWikiBrief(body.query || "", body.paths || []));
    }
    if (pathname === "/api/wiki/page" && req.method === "GET") {
      const path = url.searchParams.get("path") || "";
      return sendJson(res, 200, await pageByPath(path));
    }
    if (pathname === "/api/ingest" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { digest: await glmDigest(body.text || "", body.projectHint || "") });
    }
    if (pathname === "/api/llm/digest" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await glmDigest(body.text || "", body.projectHint || ""));
    }
    if (pathname === "/api/chat/glm" && req.method === "POST") {
      const body = await readBody(req);
      const projectId = body.projectId || "default";
      await appendChatProjectMessage(projectId, { role: "user", content: body.message || "" });
      const remembered = await autoRememberFromMessage(projectId, body.message || "");
      const result = await glmChat(body.message || "", projectId);
      await appendChatProjectMessage(result.projectId || projectId, { role: "assistant", content: result.message || "" });
      result.remembered = remembered;
      return sendJson(res, 200, result);
    }
    if (pathname === "/api/paperclip/status" && req.method === "GET") {
      return sendJson(res, 200, await paperclipStatus());
    }
    if (pathname === "/api/paperclip/templates" && req.method === "GET") {
      return sendJson(res, 200, { templates: paperclipTemplates() });
    }
    if (pathname === "/api/paperclip/tasks" && req.method === "GET") {
      return sendJson(res, 200, {
        tasks: await readJsonFile(paperclipTasksPath, []),
        events: await readJsonFile(paperclipEventsPath, []),
      });
    }
    if (pathname === "/api/paperclip/tasks" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { task: await createPaperclipTask(body.templateId || "validator", body) });
    }
    if (pathname === "/api/paperclip/trigger" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await triggerPaperclipTask(body.templateId || "validator", body));
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    if (String(error.message).includes("ENOENT") || String(error.message).includes("Not found")) {
      return sendText(res, 404, "Not found");
    }
    return sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`Wiki API listening at http://${host}:${port}`);
});

setInterval(() => {
  tickSchedules().catch((error) => {
    console.error(`Schedule tick failed: ${error.message}`);
  });
}, 30 * 1000);

tickSchedules().catch(() => {});
