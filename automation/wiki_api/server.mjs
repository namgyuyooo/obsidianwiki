import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { extname, join, normalize, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("../../", import.meta.url).pathname);
const frontendRoot = join(repoRoot, "automation/wiki_frontend");
const wikiRoot = join(repoRoot, "obsidian/Wiki");
const l1Root = join(repoRoot, "obsidian/L1_memory");
const personalWikiRoot = join(repoRoot, "obsidian/Personal_Wiki");
const personalL1Root = join(repoRoot, "obsidian/Personal_L1_memory");
const driveWikifySrc = join(repoRoot, "automation/drive_wikify/src");
const driveWikifyEnv = join(repoRoot, "automation/drive_wikify/config/.env");
const driveRuntime = join(repoRoot, "automation/drive_wikify/runtime");
const apiRuntime = join(repoRoot, "automation/wiki_api/runtime");
const runHistoryPath = join(apiRuntime, "runs.json");
const driveCollectionStatePath = join(apiRuntime, "drive_collection_state.json");
const paperclipTasksPath = join(apiRuntime, "paperclip_tasks.json");
const paperclipEventsPath = join(apiRuntime, "paperclip_events.json");
const schedulesPath = join(apiRuntime, "schedules.json");
const targetAnalysisPath = join(apiRuntime, "target_analysis.json");
const wikiManagementPath = join(apiRuntime, "wiki_management_commands.json");
const wikiManagementApplyPath = join(apiRuntime, "wiki_management_apply_log.json");
const wikiContextCachePath = join(apiRuntime, "wiki_context_cache.json");
const knowledgePromotionPath = join(apiRuntime, "knowledge_promotions.json");
const knowledgePromotionRoot = join(apiRuntime, "knowledge_promotions");
const skillOutputsRoot = join(apiRuntime, "skill_outputs");
const spotliteTemplateRoot = join(apiRuntime, "../templates");
const chatProjectsPath = join(apiRuntime, "chat_projects.json");
const chatGlobalSettingsPath = join(apiRuntime, "chat_global_settings.json");
const activeJobs = new Map();
const activeChatRequests = new Map();
const activeChatControllers = new Map();
let runHistoryWrite = Promise.resolve();

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
  "RCLONE_COPY_MAX_MINUTES",
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
  "ALLOWED_FILE_TYPES",
  "GLM_API_URL",
  "GLM_API_KEY",
  "GLM_MODEL",
  "GLM_AVAILABLE_MODELS",
  "GLM_THINKING_TYPE",
  "GLM_THINKING_BUDGET_TOKENS",
  "GLM_CHAT_MAX_TOKENS",
  "GLM_CHAT_STREAM",
  "GLM_CONTEXT_MODE",
  "OPENCLAW_WEBHOOK_URL",
  "OPENCLAW_API_KEY",
  "PAPERCLIP_URL",
  "PAPERCLIP_API_KEY",
]);
const sensitiveSettings = new Set(["GLM_API_KEY", "OPENCLAW_API_KEY", "PAPERCLIP_API_KEY"]);

const wikiWorkspaces = {
  rtm: {
    id: "rtm",
    label: "업무용(RTM)",
    description: "RTM 업무 프로젝트와 고객사 위키",
    wikiRoot,
    l1Root,
    wikiPrefix: "obsidian/Wiki",
    l1Prefix: "obsidian/L1_memory",
  },
  personal: {
    id: "personal",
    label: "개인용",
    description: "개인 지식과 비업무 메모를 분리 운영하는 위키",
    wikiRoot: personalWikiRoot,
    l1Root: personalL1Root,
    wikiPrefix: "obsidian/Personal_Wiki",
    l1Prefix: "obsidian/Personal_L1_memory",
  },
};

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

function wikiWorkspace(id = "rtm") {
  return wikiWorkspaces[id] || wikiWorkspaces.rtm;
}

function wikiWorkspaceList() {
  return Object.values(wikiWorkspaces).map((workspace) => ({
    id: workspace.id,
    label: workspace.label,
    description: workspace.description,
    wikiRoot: relative(repoRoot, workspace.wikiRoot),
    l1Root: relative(repoRoot, workspace.l1Root),
    default: workspace.id === "rtm",
  }));
}

async function ensureWikiWorkspace(workspaceId = "rtm") {
  const workspace = wikiWorkspace(workspaceId);
  await mkdir(join(workspace.wikiRoot, "Common"), { recursive: true });
  await mkdir(workspace.l1Root, { recursive: true });
  if (workspace.id === "personal") {
    const indexPath = join(workspace.wikiRoot, "index.md");
    if (!existsSync(indexPath)) {
      const today = new Date().toISOString().slice(0, 10);
      await writeFile(indexPath, [
        "---",
        "type: index",
        `created: ${today}`,
        `updated: ${today}`,
        'source: "wiki workspace scaffold"',
        "---",
        "",
        "# 개인용 위키",
        "",
        "개인 지식, 메모, 비업무 자료를 업무용 RTM 위키와 분리해서 운영하는 공간입니다.",
        "",
        "## 운영 원칙",
        "- 업무 프로젝트와 고객사 자료는 업무용(RTM)에 둡니다.",
        "- 개인 메모는 이 공간에서 별도 관리합니다.",
        "- 민감한 자격증명, 비밀번호, API 키는 저장하지 않습니다.",
        "",
      ].join("\n"), "utf-8");
    }
  }
  return workspace;
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
  return withRunHistoryLock(async () => {
    await mkdir(apiRuntime, { recursive: true });
    const history = await readJsonFile(runHistoryPath, []);
    history.unshift(entry);
    const trimmed = history.slice(0, 100);
    await writeFile(runHistoryPath, JSON.stringify(trimmed, null, 2), "utf-8");
    return trimmed;
  });
}

async function updateRunHistory(runId, updates) {
  return withRunHistoryLock(async () => {
    await mkdir(apiRuntime, { recursive: true });
    const history = await readJsonFile(runHistoryPath, []);
    const next = history.map((entry) => (entry.runId === runId ? { ...entry, ...updates, updatedAt: new Date().toISOString() } : entry));
    const trimmed = next.slice(0, 100);
    await writeFile(runHistoryPath, JSON.stringify(trimmed, null, 2), "utf-8");
    return trimmed.find((entry) => entry.runId === runId);
  });
}

function withRunHistoryLock(callback) {
  runHistoryWrite = runHistoryWrite.then(callback, callback);
  return runHistoryWrite;
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

async function walkFiles(root) {
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
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  }
  await walk(root);
  return files;
}

function resolveRepoPath(path) {
  return resolve(repoRoot, path || "");
}

function allowedManifestSuffixes(env = {}) {
  const configured = String(env.ALLOWED_FILE_TYPES || "")
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
  const values = configured.length ? configured : ["hwp", "hwpx", "pdf", "docx", "pptx"];
  return new Set(values.map((item) => `.${item}`));
}

async function manifestSnapshot(env = {}) {
  const manifestPath = resolveRepoPath(env.MANIFEST_PATH || "automation/drive_wikify/runtime/manifest.json");
  const manifest = await readJsonFile(manifestPath, { documents: [] });
  const docs = manifest.documents || [];
  return {
    manifestPath: relative(repoRoot, manifestPath),
    documents: docs.length,
    filePaths: docs.map((doc) => doc.file_path).filter(Boolean),
    updatedAt: manifest.generated_at || manifest.updated_at || "",
  };
}

async function refreshManifestFromMirror(env = {}) {
  const mirrorRoot = resolveRepoPath(env.RCLONE_MIRROR_ROOT || "automation/drive_wikify/runtime/mirror");
  const manifestPath = resolveRepoPath(env.MANIFEST_PATH || "automation/drive_wikify/runtime/manifest.json");
  const driveName = env.DRIVE_NAME || "gdrive-root";
  const allowed = allowedManifestSuffixes(env);
  const files = await walkFiles(mirrorRoot);
  const documents = [];
  for (const filePath of files.sort()) {
    if (!allowed.has(extname(filePath).toLowerCase())) continue;
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat?.isFile?.()) continue;
    const relativeParent = relative(mirrorRoot, resolve(filePath, ".."));
    const folderPath = !relativeParent || relativeParent === "." ? "/" : `/${relativeParent}`.replace(/\/+/g, "/");
    documents.push({
      drive_name: driveName,
      folder_path: folderPath,
      file_path: filePath,
      title: filePath.split("/").at(-1) || filePath,
      modified_time: String(Math.floor(fileStat.mtimeMs / 1000)),
    });
  }
  await mkdir(resolve(manifestPath, ".."), { recursive: true });
  const payload = {
    generated_at: new Date().toISOString(),
    source: "wiki_api post-rclone manifest refresh",
    mirror_root: relative(repoRoot, mirrorRoot),
    documents,
  };
  await writeFile(manifestPath, JSON.stringify(payload, null, 2), "utf-8");
  return {
    manifestPath: relative(repoRoot, manifestPath),
    mirrorRoot: relative(repoRoot, mirrorRoot),
    documents: documents.length,
  };
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

function contextBudget(mode = "standard") {
  const budgets = {
    economy: { mode: "economy", maxCards: 4, maxKeyLines: 5, maxMemoryItems: 4, recentTurns: 4, maxLineChars: 180 },
    standard: { mode: "standard", maxCards: 7, maxKeyLines: 8, maxMemoryItems: 7, recentTurns: 6, maxLineChars: 240 },
    deep: { mode: "deep", maxCards: 12, maxKeyLines: 14, maxMemoryItems: 10, recentTurns: 8, maxLineChars: 320 },
  };
  return budgets[mode] || budgets.standard;
}

function compactLine(line, maxChars = 240) {
  return String(line || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function extractMeaningfulLines(markdown, query = "", budget = contextBudget()) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter((term) => term.length >= 2);
  const lines = markdown.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("---"));
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

function extractPatternLines(markdown, regex, limit = 6) {
  return [...new Set(markdown.split("\n")
    .map((line) => compactLine(line, 220))
    .filter((line) => regex.test(line))
    .slice(0, limit))];
}

function estimateChars(value) {
  return JSON.stringify(value || {}).length;
}

function dateWithinDays(dateText, days) {
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const limit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return date <= limit;
}

function spotliteProjectFromPath(path) {
  const parts = String(path || "").split("/");
  const section = path.startsWith("obsidian/L1_memory/") || path.startsWith("obsidian/Personal_L1_memory/")
    ? "L1_memory"
    : parts[2] || "Wiki";
  return section
    .replace(/_/g, " ")
    .replace(/\bProject\b/g, "Project")
    .replace(/\bAccount\b/g, "Account")
    .trim();
}

function spotliteLineKind(line, path) {
  const text = `${line} ${path}`.toLowerCase();
  if (/risk|리스크|위험|불확실|막힘|blocked|이슈|문제/.test(text)) return "risk";
  if (/decision|결정|확정|승인|채택/.test(text)) return "decision";
  if (/운영 메모|한줄 요약|진행 맥락|실무 판단|다음 확인/.test(line)) return "memo";
  return "action";
}

function spotliteBucket(line) {
  const text = String(line || "");
  const dates = [...text.matchAll(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/g)].map((match) => match[1]);
  if (/오늘|금일|today|당일|즉시|긴급|asap/i.test(text)) return "today";
  if (dates.some((date) => dateWithinDays(date, 0))) return "today";
  if (/이번\s*주|주간|week|이번주|금주/i.test(text)) return "week";
  if (dates.some((date) => dateWithinDays(date, 7))) return "week";
  return "watch";
}

function spotliteScore(line, path) {
  const text = `${line} ${path}`;
  let score = 0;
  if (/Action_Items|action|todo|해야|필요|다음|확인|제출|미팅|회의|고객|담당/.test(text)) score += 5;
  if (/오늘|금일|긴급|즉시|asap/i.test(text)) score += 5;
  if (/이번\s*주|이번주|금주|week/i.test(text)) score += 3;
  if (/Risk|Risks|리스크|위험|이슈|불확실/.test(text)) score += 4;
  if (/운영 메모|운영 현황판|일시별 추진내용/.test(text)) score += 3;
  return score;
}

function compactSpotliteLine(line) {
  return String(line || "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\|\s*/, "")
    .replace(/\s*\|$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

async function spotliteSummary(scope = "work") {
  const workspace = scope === "personal" ? await ensureWikiWorkspace("personal") : wikiWorkspaces.rtm;
  const roots = [workspace.wikiRoot, workspace.l1Root];
  const files = (await Promise.all(roots.map(walkMarkdown))).flat();
  const candidates = [];
  const projectMap = new Map();
  for (const file of files) {
    const markdown = await readFile(file, "utf-8").catch(() => "");
    const path = relative(repoRoot, file);
    const frontmatter = parseFrontmatter(markdown);
    const title = titleFromMarkdown(path, markdown);
    const project = spotliteProjectFromPath(path);
    const classification = classifyWikiPage(path, frontmatter);
    const lines = markdown.split("\n")
      .map(compactSpotliteLine)
      .filter((line) => line.length >= 8)
      .filter((line) => /(오늘|금일|이번\s*주|이번주|금주|해야|필요|다음|액션|확인|제출|미팅|회의|고객|담당|리스크|위험|이슈|결정|운영 메모|진행 맥락|실무 판단|다음 확인|Action|Risk|Decision|todo|week|today|asap)/i.test(line))
      .slice(0, 16);
    if (!lines.length && !["actions", "risks", "decisions", "hub"].includes(classification.docKind)) continue;
    if (!projectMap.has(project)) {
      projectMap.set(project, {
        project,
        count: 0,
        risks: 0,
        actions: 0,
        latestPath: path,
      });
    }
    for (const line of lines.slice(0, 10)) {
      const kind = spotliteLineKind(line, path);
      const bucket = spotliteBucket(line);
      const score = spotliteScore(line, path);
      const item = {
        title,
        path,
        project,
        line,
        kind,
        bucket,
        score,
        docKind: classification.docKind,
      };
      candidates.push(item);
      const group = projectMap.get(project);
      group.count += 1;
      if (kind === "risk") group.risks += 1;
      if (kind === "action") group.actions += 1;
      group.latestPath = path;
    }
  }
  const ranked = candidates.sort((a, b) => b.score - a.score || a.project.localeCompare(b.project));
  const today = ranked.filter((item) => item.bucket === "today").slice(0, 12);
  const week = ranked.filter((item) => item.bucket === "week").slice(0, 18);
  const risks = ranked.filter((item) => item.kind === "risk").slice(0, 12);
  const memos = ranked.filter((item) => item.kind === "memo" || /운영 메모|진행 맥락|실무 판단|다음 확인/.test(item.line)).slice(0, 12);
  const watch = ranked.filter((item) => item.bucket === "watch" && item.kind !== "risk").slice(0, 18);
  const projects = [...projectMap.values()]
    .sort((a, b) => (b.actions + b.risks * 2 + b.count) - (a.actions + a.risks * 2 + a.count))
    .slice(0, 10);
  return {
    scope,
    workspace: {
      id: workspace.id,
      label: workspace.label,
      wikiRoot: relative(repoRoot, workspace.wikiRoot),
      l1Root: relative(repoRoot, workspace.l1Root),
    },
    generatedAt: new Date().toISOString(),
    summary: {
      totalSignals: candidates.length,
      today: today.length,
      week: week.length,
      risks: risks.length,
      projects: projects.length,
    },
    analysis: [
      today.length ? `오늘 바로 볼 항목 ${today.length}개가 있습니다.` : "오늘로 명시된 항목은 아직 적습니다.",
      week.length ? `이번주 처리 후보 ${week.length}개가 감지됐습니다.` : "이번주로 명시된 항목은 아직 적습니다.",
      risks.length ? `리스크/이슈 후보 ${risks.length}개를 먼저 확인하는 편이 안전합니다.` : "리스크 후보는 많지 않습니다.",
      memos.length ? "운영 메모가 있는 허브를 우선 읽으면 진행 맥락을 빠르게 잡을 수 있습니다." : "허브 운영 메모 보강이 필요합니다.",
    ],
    today,
    week,
    risks,
    memos,
    watch,
    projects,
  };
}

async function spotliteTemplates() {
  const entries = [
    ["hub_memo", "허브 운영 메모 템플릿", "허브가 실제 진행상황을 담도록 쓰는 Markdown 템플릿", "spotlite_hub_memo_template.md"],
    ["work_prompt", "업무 Spotlite 프롬프트", "RTM 업무용 오늘/이번주 분석 프롬프트", "spotlite_work_prompt.md"],
    ["personal_prompt", "개인 Spotlite 프롬프트", "개인용 오늘/이번주 정리 프롬프트", "spotlite_personal_prompt.md"],
  ];
  const templates = [];
  for (const [id, title, description, fileName] of entries) {
    const path = join(spotliteTemplateRoot, fileName);
    templates.push({
      id,
      title,
      description,
      path: relative(repoRoot, path),
      markdown: await readFile(path, "utf-8").catch(() => ""),
    });
  }
  return { templates };
}

async function wikiContextCardForResult(item, query = "", mode = "standard") {
  const budget = contextBudget(mode);
  const fullPath = managedWikiFullPath(item.path);
  const fileStat = await stat(fullPath).catch(() => null);
  const cache = await readJsonFile(wikiContextCachePath, {});
  const cached = cache[item.path];
  let base = cached;
  if (!cached || cached.mtimeMs !== fileStat?.mtimeMs || cached.size !== fileStat?.size) {
    const markdown = await readFile(fullPath, "utf-8");
    const frontmatter = parseFrontmatter(markdown);
    base = {
      path: item.path,
      title: titleFromMarkdown(item.path, markdown),
      frontmatter,
      classification: classifyWikiPage(item.path, frontmatter),
      mtimeMs: fileStat?.mtimeMs || 0,
      size: fileStat?.size || markdown.length,
      snippet: findSnippet(markdown, query || item.title || item.path),
      keyLines: extractMeaningfulLines(markdown, "", contextBudget("deep")),
      numbers: extractPatternLines(markdown, /\d{4}-\d{1,2}-\d{1,2}|\d+\.?\d*\s*(%|억|만|천|원|개|건|회|분|초|시간)/, 10),
      decisions: extractPatternLines(markdown, /결정|확정|승인|채택|선택|완료/, 8),
      actions: extractPatternLines(markdown, /다음|액션|해야|필요|예정|진행할|확인할/, 8),
      conflicts: extractPatternLines(markdown, /충돌|불일치|상이|다르|변경|수정|이전/, 8),
    };
    cache[item.path] = base;
    await mkdir(apiRuntime, { recursive: true });
    await writeFile(wikiContextCachePath, JSON.stringify(cache, null, 2), "utf-8");
  }
  const queryLines = base.keyLines
    .filter((line) => String(query || "").toLowerCase().split(/\s+/).filter(Boolean).some((term) => line.toLowerCase().includes(term)))
    .slice(0, Math.max(2, Math.floor(budget.maxKeyLines / 2)));
  const keyLines = [...new Set([...queryLines, ...(base.keyLines || [])])].slice(0, budget.maxKeyLines);
  const card = {
    title: base.title || item.title,
    path: item.path,
    score: item.score,
    docKind: base.classification?.docKind,
    division: base.classification?.division,
    projectKey: base.classification?.projectKey,
    snippet: item.snippet || base.snippet,
    keyLines,
    numbers: (base.numbers || []).slice(0, Math.ceil(budget.maxKeyLines / 2)),
    decisions: (base.decisions || []).slice(0, 4),
    actions: (base.actions || []).slice(0, 4),
    conflicts: (base.conflicts || []).slice(0, 4),
  };
  return { ...card, estimatedChars: estimateChars(card) };
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
    const classification = classifyWikiPage(path, frontmatter);
    pages.push({
      title: titleFromMarkdown(path, markdown),
      path,
      section,
      frontmatter,
      updatedAt: fileStat?.mtime?.toISOString?.() || "",
      size: fileStat?.size || markdown.length,
      ...classification,
    });
  }
  return pages.sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title));
}

function classifyWikiPage(path, frontmatter = {}) {
  const parts = path.split("/");
  const section = path.startsWith("obsidian/L1_memory/") ? "L1_memory" : parts[2] || "Wiki";
  const fileName = parts.at(-1) || "";
  const baseName = fileName.replace(/\.md$/i, "");
  const lowerPath = path.toLowerCase();
  const lowerBase = baseName.toLowerCase();
  const type = String(frontmatter.type || "").toLowerCase();
  let division = "operations";
  if (section === "L1_memory") division = "memory";
  else if (section === "Common") division = "common";
  else if (section.endsWith("_Project")) division = "project";
  else if (section.endsWith("_Account")) division = "account";
  else if (/(log|change_log|conflict_register|deletion|audit)/i.test(path)) division = "log";

  const kindRules = [
    ["hub", lowerBase === "hub" || type === "hub" || type === "project"],
    ["overview", /overview|summary|profile|project_overview/.test(lowerBase) || type === "overview"],
    ["sources", /sources|source/.test(lowerBase)],
    ["evidence", /evidence|connected|근거/.test(lowerBase) || type === "evidence"],
    ["conflict", /conflict|충돌/.test(lowerBase) || type === "conflict"],
    ["actions", /action|todo|next/.test(lowerBase) || type === "actions"],
    ["decisions", /decision|결정/.test(lowerBase) || type === "decisions"],
    ["risks", /risk|리스크/.test(lowerBase) || type === "risks"],
    ["changelog", /change_log|changelog|변경/.test(lowerBase) || type === "changelog"],
    ["log", /(^|_)log$|log\.md$|audit|deletion/.test(lowerPath) || type === "log"],
    ["memory", section === "L1_memory" || /memory|chat/.test(lowerPath) || type.includes("memory")],
  ];
  const docKind = (kindRules.find(([, matched]) => matched) || ["knowledge"])[0];
  const nature = docKind;
  const isProjectLike = division === "project" || division === "account";
  const projectKey = isProjectLike ? section : division === "memory" ? "L1_memory" : section || "Wiki";
  const projectLabel = projectKey
    .replace(/_/g, " ")
    .replace(/\bProject\b/g, "Project")
    .replace(/\bAccount\b/g, "Account")
    .trim();

  return {
    projectKey,
    projectLabel,
    division,
    nature,
    docKind,
    isProjectHub: isProjectLike && docKind === "hub",
  };
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

async function searchWikiBrief(query, selectedPaths = [], mode = "standard") {
  const budget = contextBudget(mode);
  const allResults = query ? await searchWiki(query) : [];
  const selected = new Set((selectedPaths || []).filter(Boolean));
  const results = selected.size ? allResults.filter((item) => selected.has(item.path)) : allResults;
  const evidence = [];
  for (const item of results.slice(0, budget.maxCards)) {
    const card = await wikiContextCardForResult(item, query, mode).catch(() => ({
      title: item.title,
      path: item.path,
      snippet: item.snippet,
      score: item.score,
    }));
    evidence.push(card);
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
            content: JSON.stringify({
              query,
              evidence,
              token_budget_policy: {
                mode,
                input_strategy: "compressed_wiki_cards_only",
                max_cards: budget.maxCards,
                instruction: "근거 원문을 반복하지 말고 카드의 핵심 문장/수치/리스크만 사용한다.",
              },
            }),
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
        tokenBudget: {
          mode,
          inputStrategy: "compressed_wiki_cards_only",
          evidenceCards: evidence.length,
          estimatedEvidenceChars: evidence.reduce((sum, item) => sum + (item.estimatedChars || estimateChars(item)), 0),
        },
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
        tokenBudget: {
          mode,
          inputStrategy: "compressed_wiki_cards_only",
          evidenceCards: evidence.length,
          estimatedEvidenceChars: evidence.reduce((sum, item) => sum + (item.estimatedChars || estimateChars(item)), 0),
        },
        upstreamStatus: error.message,
      },
    };
  }
}

async function pageByPath(path) {
  const normalized = normalize(path);
  const allowed = [wikiRoot, l1Root, join(repoRoot, "automation/drive_wikify/runtime"), knowledgePromotionRoot];
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

function runCapture(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd: repoRoot, env: process.env });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += "\nCommand timed out.";
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({ code: 127, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

function parseRcloneLsd(stdout) {
  return stdout.split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\S+\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+\S+\s+(.+)$/);
      return match ? { name: match[3].trim(), modifiedAt: `${match[1]}T${match[2]}` } : null;
    })
    .filter(Boolean);
}

function tokenSet(value) {
  return new Set(String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .split(/[^가-힣a-z0-9]+/i)
    .filter((item) => item.length >= 2 && !["project", "account", "wiki", "drive"].includes(item)));
}

function overlapScore(a, b) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  let score = 0;
  for (const token of left) if (right.has(token)) score += 1;
  return score;
}

function isGenericDriveFolder(folder) {
  return /(^20\d{2}년?$|freenotes|personal|메모|백업|backup|chrome에서 저장됨|colab notebooks|sync with icloud|이력서|typing|타이핑|onedrive|원드라이브)/i.test(String(folder || "").trim());
}

function isRecentlyChanged(modifiedAt) {
  if (!modifiedAt) return false;
  return new Date(modifiedAt).getTime() >= new Date("2026-04-01T00:00:00").getTime();
}

function localDriveInstructionPlan(instruction = "") {
  const text = String(instruction || "").trim();
  const stopwords = new Set(["찾아", "자료", "수집", "해서", "위키화", "해", "해줘", "하고", "구글", "드라이브", "drive", "wiki"]);
  const aliasMap = {
    "쏘닉스": ["쏘닉스", "sawnics", "sonics"],
    "아사히카세이": ["아사히카세이", "아사히카세히", "asahi", "kasei"],
    "아사히카세히": ["아사히카세히", "아사히카세이", "asahi", "kasei"],
    "금호": ["금호", "kumho"],
    "픽셀": ["픽셀", "pixel"],
    "제우스": ["제우스", "zeus"],
  };
  const quoted = [...text.matchAll(/[\"“']([^\"“”']{2,})[\"”']/g)].map((match) => match[1].trim());
  const tokens = text
    .replace(/[^\p{L}\p{N}_ -]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopwords.has(token.toLowerCase()));
  const keywords = [...quoted, ...tokens];
  for (const token of [...keywords]) {
    const aliases = aliasMap[token.toLowerCase()] || aliasMap[token];
    if (aliases) keywords.push(...aliases);
  }
  return {
    intent: /위키화|wiki/i.test(text) ? "collect_and_wikify" : "target_collect",
    keywords: [...new Set(keywords)].slice(0, 12),
    requestedAction: text,
    confidence: keywords.length ? 0.62 : 0.25,
    notes: ["로컬 규칙 기반 지시 분석", "원본 Google Drive 삭제는 금지"],
  };
}

async function driveInstructionPlan(instruction = "") {
  const local = localDriveInstructionPlan(instruction);
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const model = process.env.GLM_MODEL || env.GLM_MODEL || "glm-5.1";
  if (!instruction || !apiKey || !apiUrl) return { ...local, provider: "local-rule" };
  try {
    const { payload, endpoint } = await requestGlmChatCompletion(apiUrl, apiKey, {
      model,
      messages: [
        {
          role: "system",
          content: [
            "너는 Google Drive 수집 지시를 안전하게 표적화하는 한국어 분석기다.",
            "원본 Drive 삭제/수정은 절대 제안하지 않는다. rclone copy 대상 후보만 만든다.",
            "출력은 JSON 객체만 반환한다: intent, keywords, aliases, requestedAction, confidence, notes.",
            "예: '쏘닉스 찾아 자료를 수집해서 위키화해' -> keywords에는 쏘닉스, Sawnics를 포함한다.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({ instruction, localFallback: local }),
        },
      ],
      temperature: 0.1,
      max_tokens: 700,
      thinking: glmThinkingOptions(env),
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(glmMessageContent(payload));
    const keywords = [...new Set([...(local.keywords || []), ...(parsed.keywords || []), ...(parsed.aliases || [])].map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 16);
    return {
      ...local,
      ...parsed,
      keywords,
      provider: "glm",
      model,
      endpoint,
    };
  } catch (error) {
    return { ...local, provider: "local-rule", upstreamStatus: error.message };
  }
}

function rankInstructionCandidates(candidates = [], plan = {}) {
  const keywords = (plan.keywords || []).map((keyword) => keyword.toLowerCase()).filter(Boolean);
  return candidates.map((candidate) => {
    const haystack = [
      candidate.folder,
      candidate.remotePath,
      candidate.matchedProjectLabel,
      candidate.matchedProject,
      ...(candidate.reasons || []),
    ].join(" ").toLowerCase();
    const matches = keywords.filter((keyword) => haystack.includes(keyword));
    const instructionBoost = matches.length ? 80 + matches.length * 25 : 0;
    return {
      ...candidate,
      score: candidate.score + instructionBoost,
      priority: instructionBoost ? "high" : candidate.priority,
      instructionMatches: matches,
      reasons: instructionBoost
        ? [`지시문 키워드 매칭: ${matches.join(", ")}`, ...(candidate.reasons || [])]
        : candidate.reasons,
    };
  }).sort((a, b) => b.score - a.score || (b.instructionMatches?.length || 0) - (a.instructionMatches?.length || 0));
}

async function driveTargetAnalysis(options = {}) {
  const { values: env } = await readEnvFile();
  const remote = env.RCLONE_REMOTE || "gdrive";
  const remoteRoot = env.RCLONE_REMOTE_PATH || "";
  const source = `${remote}:${remoteRoot}`.replace(/:$/, ":");
  const pages = await wikiIndex();
  const coverage = await coverageSummary().catch(() => ({ rows: [], statuses: {}, documentsInManifest: 0, processedDocuments: 0 }));
  const manifest = await readJsonFile(join(driveRuntime, "manifest.json"), { documents: [] });
  const runOutput = await readJsonFile(join(driveRuntime, "run_output.json"), { results: [] });
  const requiredKinds = ["hub", "overview", "sources", "evidence", "actions", "risks", "decisions", "conflict", "changelog"];
  const projectGroups = new Map();

  for (const page of pages) {
    if (!["project", "account"].includes(page.division)) continue;
    if (!projectGroups.has(page.projectKey)) {
      projectGroups.set(page.projectKey, {
        projectKey: page.projectKey,
        projectLabel: page.projectLabel,
        division: page.division,
        kinds: new Set(),
        pages: 0,
      });
    }
    const group = projectGroups.get(page.projectKey);
    group.kinds.add(page.docKind);
    group.pages += 1;
  }

  const rclone = await runCapture("rclone", [
    "lsd",
    source,
    "--max-depth",
    "1",
    "--tpslimit",
    String(env.RCLONE_TPSLIMIT || 1),
    "--tpslimit-burst",
    "1",
  ], { timeoutMs: Number(options.timeoutMs || 35000) });
  const driveFolders = rclone.code === 0 ? parseRcloneLsd(rclone.stdout) : [];
  const trackedFolders = new Set((coverage.rows || []).map((row) => row.folderPath).filter(Boolean));
  const manifestFolders = new Set((manifest.documents || []).map((doc) => doc.folder_path).filter(Boolean));
  const processedFiles = new Set((runOutput.results || []).map((result) => result.record?.file_path || result.file_path).filter(Boolean));
  const candidates = [];

  for (const folderInfo of driveFolders) {
    const folder = folderInfo.name;
    const bestProject = [...projectGroups.values()]
      .map((group) => ({ ...group, overlap: Math.max(overlapScore(folder, group.projectKey), overlapScore(folder, group.projectLabel)) }))
      .sort((a, b) => b.overlap - a.overlap)[0];
    const tracked = trackedFolders.has(`/${folder}`) || [...trackedFolders].some((item) => item.includes(folder));
    const manifested = [...manifestFolders].some((item) => item.includes(folder));
    const missingKinds = bestProject && bestProject.overlap > 0
      ? requiredKinds.filter((kind) => !bestProject.kinds.has(kind))
      : [];
    let score = 20;
    const reasons = [];
    if (isRecentlyChanged(folderInfo.modifiedAt)) {
      score += 15;
      reasons.push(`최근 수정 Drive 폴더: ${folderInfo.modifiedAt.slice(0, 10)}`);
    }
    if (!tracked) {
      score += 15;
      reasons.push("coverage tracker에 없는 Drive 폴더");
    }
    if (!manifested) {
      score += 12;
      reasons.push("local manifest에 아직 반영되지 않음");
    }
    if (bestProject?.overlap > 0) {
      score += Math.min(35, bestProject.overlap * 12);
      reasons.push(`위키 프로젝트 후보와 명칭 유사: ${bestProject.projectLabel}`);
      if (missingKinds.length) {
        score += Math.min(20, missingKinds.length * 3);
        reasons.push(`위키 문서 성격 누락: ${missingKinds.slice(0, 5).join(", ")}`);
      }
    } else {
      score += 8;
      reasons.push("신규 프로젝트/계정 후보일 수 있음");
    }
    if (isGenericDriveFolder(folder)) {
      score -= 30;
      reasons.push("일반/연도/백업 성격 폴더라 우선순위 낮춤");
    }
    candidates.push({
      remote,
      remotePath: remoteRoot ? `${remoteRoot}/${folder}` : folder,
      folder,
      modifiedAt: folderInfo.modifiedAt,
      score: Math.max(0, score),
      priority: score >= 80 ? "high" : score >= 55 ? "medium" : "low",
      matchedProject: bestProject?.overlap > 0 ? bestProject.projectKey : "",
      matchedProjectLabel: bestProject?.overlap > 0 ? bestProject.projectLabel : "",
      missingKinds,
      tracked,
      manifested,
      reasons,
      recommendedCommand: `rclone copy ${remote}:${remoteRoot ? `${remoteRoot}/${folder}` : folder} ${relative(repoRoot, join(driveRuntime, "mirror", safePathSegment(folder)))} --check-first --transfers 1 --checkers 1 --tpslimit ${env.RCLONE_TPSLIMIT || 1}`,
    });
  }

  for (const group of projectGroups.values()) {
    const missingKinds = requiredKinds.filter((kind) => !group.kinds.has(kind));
    if (!missingKinds.length) continue;
    const relatedFolder = driveFolders
      .map((folderInfo) => ({
        folder: folderInfo.name,
        modifiedAt: folderInfo.modifiedAt,
        overlap: Math.max(overlapScore(folderInfo.name, group.projectKey), overlapScore(folderInfo.name, group.projectLabel)),
      }))
      .sort((a, b) => b.overlap - a.overlap)[0];
    if (!relatedFolder || relatedFolder.overlap < 1) continue;
    if (candidates.some((candidate) => candidate.remotePath.endsWith(relatedFolder.folder))) continue;
    candidates.push({
      remote,
      remotePath: remoteRoot ? `${remoteRoot}/${relatedFolder.folder}` : relatedFolder.folder,
      folder: relatedFolder.folder,
      score: 70,
      priority: "medium",
      matchedProject: group.projectKey,
      matchedProjectLabel: group.projectLabel,
      missingKinds,
      tracked: trackedFolders.has(`/${relatedFolder.folder}`),
      manifested: [...manifestFolders].some((item) => item.includes(relatedFolder.folder)),
      reasons: [`위키 프로젝트 ${group.projectLabel}에 ${missingKinds.slice(0, 5).join(", ")} 보강 필요`],
      recommendedCommand: `rclone copy ${remote}:${remoteRoot ? `${remoteRoot}/${relatedFolder.folder}` : relatedFolder.folder} ${relative(repoRoot, join(driveRuntime, "mirror", safePathSegment(relatedFolder.folder)))} --check-first --transfers 1 --checkers 1 --tpslimit ${env.RCLONE_TPSLIMIT || 1}`,
    });
  }

  const analysis = {
    createdAt: new Date().toISOString(),
    source,
    safety: {
      driveDeleteSource: false,
      remoteDeleteAllowed: false,
      commandSurface: "rclone lsd + selected rclone copy only",
    },
    summary: {
      driveFolders: driveFolders.length,
      wikiProjects: projectGroups.size,
      manifestDocuments: manifest.documents?.length || 0,
      processedDocuments: processedFiles.size,
      trackedFolders: trackedFolders.size,
      rcloneStatus: rclone.code === 0 ? "ok" : "failed",
    },
    rcloneError: rclone.code === 0 ? "" : rclone.stderr.slice(-2000),
    candidates: candidates.sort((a, b) => b.score - a.score || String(b.modifiedAt).localeCompare(String(a.modifiedAt)) || a.folder.localeCompare(b.folder)).slice(0, 30),
  };
  await prependJsonHistory(targetAnalysisPath, analysis, 50);
  return analysis;
}

async function driveInstructionTargetAnalysis(instruction = "") {
  const plan = await driveInstructionPlan(instruction);
  const base = await driveTargetAnalysis({ timeoutMs: 35000 });
  const ranked = rankInstructionCandidates(base.candidates || [], plan);
  const strong = ranked.filter((candidate) => candidate.instructionMatches?.length).slice(0, 12);
  const candidates = (strong.length ? strong : ranked.slice(0, 12)).map((candidate) => ({
    ...candidate,
    instructionTargeted: Boolean(candidate.instructionMatches?.length),
  }));
  const analysis = {
    ...base,
    createdAt: new Date().toISOString(),
    instruction,
    plan,
    candidates,
    summary: {
      ...base.summary,
      instructionMatches: strong.length,
      targetedCandidates: candidates.length,
    },
  };
  await prependJsonHistory(targetAnalysisPath, analysis, 50);
  return analysis;
}

async function targetRcloneCopy(remotePath, dryRun = true) {
  const { values: env } = await readEnvFile();
  const mirrorRoot = join(repoRoot, env.RCLONE_MIRROR_ROOT || "automation/drive_wikify/runtime/mirror", safePathSegment(remotePath));
  return runCommand("rclone-copy", Boolean(dryRun), {
    extraArgs: ["--remote-path", remotePath, "--mirror-root", mirrorRoot],
    targeted: true,
    targetRemotePath: remotePath,
    targetMirrorRoot: relative(repoRoot, mirrorRoot),
    safety: "local mirror only; source Google Drive delete is not implemented",
  });
}

function extractWikiCommandHints(command) {
  const text = String(command || "");
  const normalizeKeyword = (value) => String(value || "")
    .trim()
    .replace(/(?:의)$/g, "")
    .trim();
  const renamePairs = [...text.matchAll(/([가-힣A-Za-z0-9_ ()-]{2,})\s*[-=]+>\s*([가-힣A-Za-z0-9_ ()-]{2,})/g)]
    .map((match) => {
      const from = match[1].trim().replace(/^(참고로|그리고|또한|또)\s+/, "").split(/\s+/).at(-1);
      const to = match[2].trim().split(/\s+/)[0];
      return { from, to };
    })
    .filter((pair) => pair.from && pair.to);
  const quoted = [...text.matchAll(/[\"“']([^\"“”']{2,})[\"”']/g)].map((match) => match[1].trim());
  const projectMatch = text.match(/([가-힣A-Za-z0-9_ ()-]{2,})(?:의|에 대한)?\s*위키/);
  const keywords = [
    ...renamePairs.flatMap((pair) => [pair.from, pair.to]),
    ...quoted,
    projectMatch?.[1],
  ].filter(Boolean);
  return {
    renamePairs,
    keywords: [...new Set(keywords.map(normalizeKeyword).filter((item) => item.length >= 2))].slice(0, 12),
  };
}

async function wikiManagementCommand(command) {
  const { values: env } = await readEnvFile();
  const hints = extractWikiCommandHints(command);
  const pages = await wikiIndex();
  const candidatePaths = new Set();
  for (const keyword of hints.keywords) {
    const results = await searchWiki(keyword).catch(() => []);
    results.slice(0, 8).forEach((item) => candidatePaths.add(item.path));
    pages
      .filter((page) => `${page.title} ${page.path} ${page.projectLabel}`.toLowerCase().includes(keyword.toLowerCase()))
      .slice(0, 8)
      .forEach((page) => candidatePaths.add(page.path));
  }
  const targetPages = [];
  for (const path of [...candidatePaths].slice(0, 18)) {
    const page = await pageByPath(path).catch(() => null);
    const indexed = pages.find((item) => item.path === path) || {};
    if (!page) continue;
    targetPages.push({
      title: page.title,
      path: page.path,
      division: indexed.division,
      projectKey: indexed.projectKey,
      projectLabel: indexed.projectLabel,
      docKind: indexed.docKind,
      frontmatter: page.frontmatter,
      excerpt: page.markdown.slice(0, 4500),
    });
  }

  const localPlan = {
    summaryMarkdown: [
      `명령: ${command}`,
      targetPages.length ? `후보 문서 ${targetPages.length}개를 찾았습니다.` : "후보 문서를 충분히 찾지 못했습니다. 검색어를 더 구체화하세요.",
      hints.renamePairs.length ? `일괄 치환 후보: ${hints.renamePairs.map((pair) => `${pair.from} -> ${pair.to}`).join(", ")}` : "명시적 치환 후보는 없습니다.",
      "현재 단계는 적용 전 계획 생성이며, 로컬 위키 파일을 아직 수정하지 않습니다.",
    ].map((line) => `- ${line}`).join("\n"),
    operations: [
      ...(hints.renamePairs.length ? [{ type: "term_replace", pairs: hints.renamePairs, applyMode: "preview_only" }] : []),
      { type: "project_customer_promotion", targetProjects: [...new Set(targetPages.map((page) => page.projectKey).filter(Boolean))], applyMode: "preview_only" },
    ],
    targetPages: targetPages.map(({ title, path, division, projectKey, docKind }) => ({ title, path, division, projectKey, docKind })),
    risks: [
      "동명이의어 또는 오타 교정이 실제 고객사명과 충돌할 수 있음",
      "프로젝트/고객사 승격은 hub, Sources, Evidence Log, Change Log 간 링크 정합성 확인 필요",
      "대량 변경은 적용 전 diff 검토가 필요",
    ],
    nextActions: [
      "대상 문서 목록을 검토",
      "명칭 치환 범위와 예외어를 확정",
      "적용 버튼/패치 생성 단계에서 실제 파일 변경 수행",
    ],
  };

  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const model = process.env.GLM_MODEL || env.GLM_MODEL || "glm-5.1";
  let plan = localPlan;
  let provider = "local-rule";
  let endpoint = "";
  let upstreamStatus = "";
  if (apiKey && apiUrl && targetPages.length) {
    try {
      const response = await requestGlmChatCompletion(apiUrl, apiKey, {
        model,
        messages: [
          {
            role: "system",
            content: [
              "당신은 Obsidian 위키 운영 명령을 안전한 적용 전 계획으로 바꾸는 한국어 위키 관리자다.",
              "절대 실제 파일 수정이 완료되었다고 말하지 않는다.",
              "출력은 JSON 객체만 반환한다: summaryMarkdown, operations, targetPages, risks, nextActions.",
              "operations에는 type, rationale, targetPaths, proposedChanges, validationChecks를 넣는다.",
              "프로젝트/고객사 승격, 명칭 일괄수정, 링크 정합성, 출처 보존 관점으로 판단한다.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              command,
              hints,
              candidatePages: targetPages,
              safety: {
                applyMode: "preview_only",
                localWikiOnly: true,
                requireDiffBeforeApply: true,
              },
            }),
          },
        ],
        temperature: 0.1,
        max_tokens: 1800,
        thinking: glmThinkingOptions(env),
        response_format: { type: "json_object" },
      });
      endpoint = response.endpoint;
      const content = glmMessageContent(response.payload);
      plan = JSON.parse(content);
      if (!Array.isArray(plan.targetPages) || !plan.targetPages.length) {
        plan.targetPages = localPlan.targetPages;
      }
      if (!Array.isArray(plan.operations) || !plan.operations.length) {
        plan.operations = localPlan.operations;
      }
      if (!Array.isArray(plan.risks) || !plan.risks.length) {
        plan.risks = localPlan.risks;
      }
      if (!Array.isArray(plan.nextActions) || !plan.nextActions.length) {
        plan.nextActions = localPlan.nextActions;
      }
      provider = "glm";
    } catch (error) {
      upstreamStatus = error.message;
      plan = { ...localPlan, upstreamStatus };
    }
  }

  const entry = {
    id: `${Date.now()}-wiki-management`,
    command,
    status: "planned",
    provider,
    endpoint,
    upstreamStatus,
    hints,
    plan,
    createdAt: new Date().toISOString(),
    safety: {
      previewOnly: true,
      localWikiOnly: true,
      requiresDiffBeforeApply: true,
    },
  };
  await prependJsonHistory(wikiManagementPath, entry, 80);
  return entry;
}

function managedWikiFullPath(path) {
  const fullPath = resolve(repoRoot, normalize(path || ""));
  const allowed = [wikiRoot, l1Root];
  if (!allowed.some((root) => fullPath === root || fullPath.startsWith(`${root}/`))) {
    throw new Error(`Refusing to write outside local wiki roots: ${path}`);
  }
  if (!fullPath.endsWith(".md")) {
    throw new Error(`Only Markdown wiki files can be managed: ${path}`);
  }
  return fullPath;
}

function collectWikiManagementPairs(entry) {
  const fromHints = entry.hints?.renamePairs || [];
  const fromOps = (entry.plan?.operations || [])
    .flatMap((operation) => operation.pairs || operation.proposedChanges?.pairs || [])
    .filter(Boolean);
  const pairs = [...fromHints, ...fromOps]
    .map((pair) => ({ from: String(pair.from || "").trim(), to: String(pair.to || "").trim() }))
    .filter((pair) => pair.from && pair.to && pair.from !== pair.to);
  return [...new Map(pairs.map((pair) => [`${pair.from}\u0000${pair.to}`, pair])).values()];
}

function wikiLinkFromPath(path) {
  return `[[${String(path || "").replace(/^obsidian\//, "").replace(/\.md$/i, "")}]]`;
}

function titleCaseSlug(value) {
  return slugifyName(value)
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "Promoted";
}

function firstNonEmpty(...values) {
  return values.map((value) => String(value || "").trim()).find(Boolean) || "";
}

function operationValue(operation, keys = []) {
  const sources = [operation, operation?.proposedChanges || {}, operation?.parameters || {}];
  for (const source of sources) {
    for (const key of keys) {
      if (source?.[key]) return source[key];
    }
  }
  return "";
}

function promotionNames(entry, operation = {}) {
  const pairs = collectWikiManagementPairs(entry);
  const replacementTo = pairs[0]?.to || "";
  const keyword = (entry.hints?.keywords || []).find((item) => item !== pairs[0]?.from) || "";
  const commandSubject = String(entry.command || "").match(/([가-힣A-Za-z0-9_ ()-]{2,})(?:의|에 대한)?\s*위키/)?.[1] || "";
  const baseName = firstNonEmpty(
    operationValue(operation, ["projectName", "project_name", "customerName", "customer_name", "accountName", "account_name"]),
    replacementTo,
    commandSubject,
    keyword,
  ).replace(/(?:의)$/g, "").trim();
  const projectName = firstNonEmpty(operationValue(operation, ["projectName", "project_name"]), baseName);
  const accountName = firstNonEmpty(operationValue(operation, ["customerName", "customer_name", "accountName", "account_name"]), baseName);
  return {
    baseName: baseName || "Promoted Wiki",
    projectName: projectName || baseName || "Promoted Project",
    accountName: accountName || baseName || "Promoted Account",
    projectKey: `${titleCaseSlug(projectName || baseName)}_Project`,
    accountKey: `${titleCaseSlug(accountName || baseName)}_Account`,
  };
}

async function upsertManagedMarkdown(relativePath, contentBuilder, dryRun = false) {
  const fullPath = managedWikiFullPath(relativePath);
  await mkdir(resolve(fullPath, ".."), { recursive: true });
  const before = await readFile(fullPath, "utf-8").catch(() => "");
  const next = contentBuilder(before);
  if (before === next) return null;
  if (!dryRun) await writeFile(fullPath, next, "utf-8");
  return {
    path: relativePath,
    title: relativePath.split("/").at(-1)?.replace(/\.md$/i, "") || relativePath,
    action: before ? "updated" : "created",
    dryRun,
  };
}

function appendManagedBlock(before, marker, title, lines) {
  if (before.includes(marker)) return before;
  const block = [
    before.trimEnd(),
    before.trim() ? "" : null,
    `## ${title}`,
    marker,
    ...lines,
    "",
  ].filter((line) => line !== null).join("\n");
  return `${block}\n`;
}

function hubOperationalScaffold(title, description) {
  return [
    `# ${title}`,
    "",
    description,
    "",
    "## 운영 메모",
    "- 한줄 요약: 진행상황 확인 필요",
    "- 진행 맥락: 이 허브는 관리 이력이 아니라 실제 프로젝트/고객사 업무 추진상황을 빠르게 파악하기 위한 메모입니다.",
    "- 실무 판단: Sources, Evidence_Log, Action_Items, Risks, Decisions를 확인해 현재 업무 상태로 갱신해야 합니다.",
    "- 다음 확인: 담당자, 고객사, 산출물, 미해결 리스크, 다음 액션을 확인합니다.",
    "",
    "## 운영 현황판",
    "- 현재 상태: 진행상황 확인 필요",
    "- 최근 추진: 최신 실무 메모 입력 전",
    "- 다음 액션: 운영 메모를 기준으로 Action_Items, Risks, Decisions를 갱신",
    "",
    "## 일시별 추진내용",
    "| 일시 | 추진내용 | 실무 의미 | 연결 증적 | 다음 액션 |",
    "| --- | --- | --- | --- | --- |",
    "",
    "## 증적/근거 링크",
    "- 아직 연결된 증적 없음",
    "",
  ];
}

function baseHubMarkdown(type, title, description) {
  const now = new Date().toISOString().slice(0, 10);
  const body = type === "hub"
    ? hubOperationalScaffold(title, description)
    : [
        `# ${title}`,
        "",
        description,
        "",
      ];
  return [
    "---",
    `type: ${type}`,
    `created: ${now}`,
    `updated: ${now}`,
    'source: "wiki management command"',
    "---",
    "",
    ...body,
  ].join("\n");
}

async function applyProjectCustomerPromotion(entry, operation, targetPages, dryRun) {
  const names = promotionNames(entry, operation);
  const now = new Date().toISOString();
  const marker = `<!-- wiki-management:${entry.id}:project_customer_promotion -->`;
  const changed = [];
  const evidenceLinks = targetPages
    .filter((page) => page.path)
    .map((page) => `- ${wikiLinkFromPath(page.path)}: ${page.title || page.path}`)
    .slice(0, 30);
  const evidenceSummary = evidenceLinks.length
    ? evidenceLinks.slice(0, 6).map((line) => line.replace(/^- /, "")).join("<br>")
    : "연결 증적 없음";
  const projectRoot = `obsidian/Wiki/${names.projectKey}`;
  const accountRoot = `obsidian/Wiki/${names.accountKey}`;
  const projectDocs = [
    ["hub.md", "hub", `${names.projectName} Project Hub`, `${names.projectName} 관련 위키를 프로젝트 단위로 승격해 관리하는 허브입니다.`],
    ["Project_Overview.md", "overview", `${names.projectName} Project Overview`, "프로젝트 상태, 범위, 핵심 근거를 관리합니다."],
    ["Sources.md", "sources", `${names.projectName} Sources`, "원천 자료와 연결 근거를 관리합니다."],
    ["Evidence_Log.md", "evidence", `${names.projectName} Evidence Log`, "근거와 관찰 사항을 append-only로 누적합니다."],
    ["Action_Items.md", "actions", `${names.projectName} Action Items`, "다음 액션과 확인 필요 사항을 관리합니다."],
    ["Risks.md", "risks", `${names.projectName} Risks`, "리스크와 불확실성을 관리합니다."],
    ["Decisions.md", "decisions", `${names.projectName} Decisions`, "확정된 결정만 별도 관리합니다."],
    ["Conflict_Register.md", "conflict", `${names.projectName} Conflict Register`, "충돌/불일치 후보를 관리합니다."],
    ["Change_Log.md", "changelog", `${names.projectName} Change Log`, "위키 구조와 주요 내용 변경 이력을 기록합니다."],
  ];
  for (const [fileName, type, title, description] of projectDocs) {
    const result = await upsertManagedMarkdown(`${projectRoot}/${fileName}`, (before) => {
      const base = before || baseHubMarkdown(type, title, description);
      const lines = fileName === "hub.md"
        ? [
            "",
            "### 운영 메모",
            `- 한줄 요약: ${names.projectName} 관련 문서를 프로젝트 운영 단위로 묶었고, 이제 실무 추진상태를 이 허브에서 추적합니다.`,
            "- 진행 맥락: 산재한 근거 문서를 고객사/프로젝트 기준으로 모아 액션, 리스크, 결정사항을 분리 관리할 수 있게 했습니다.",
            "- 실무 판단: 이 내용은 관리 이력이 아니라 실제 고객 프로젝트 운영을 위한 현재상태 메모입니다.",
            "- 다음 확인: 담당자, 고객 대응 상태, 산출물, 리스크, 다음 미팅/제출 액션을 보강합니다.",
            "",
            "### 현재 추진 상태",
            "- 상태: 프로젝트/고객사 승격 완료, 실무 검토 및 후속 액션 분리 필요",
            `- 최근 추진: ${now} 위키 관리 명령으로 관련 문서를 프로젝트 운영 단위로 묶음`,
            "- 운영 관점: 단순 기록이 아니라 고객 프로젝트의 다음 액션, 리스크, 결정사항을 바로 추적하기 위한 허브",
            "",
            "### 일시별 추진내용",
            "| 일시 | 추진내용 | 실무 의미 | 연결 증적 | 다음 액션 |",
            "| --- | --- | --- | --- | --- |",
            `| ${now} | 위키 관리 명령 실행: ${entry.command || "프로젝트/고객사 승격"} | 산재 문서를 프로젝트 운영 단위로 묶고, 고객사/근거/액션/리스크 문서를 분리 관리하도록 전환 | ${evidenceSummary} | Action_Items, Risks, Decisions를 검토해 실제 업무 추진 항목으로 갱신 |`,
            "",
            "### 운영 링크",
            `- 고객사 허브: ${wikiLinkFromPath(`${accountRoot}/hub.md`)}`,
            `- 프로젝트 개요: ${wikiLinkFromPath(`${projectRoot}/Project_Overview.md`)}`,
            `- Sources: ${wikiLinkFromPath(`${projectRoot}/Sources.md`)}`,
            `- Evidence Log: ${wikiLinkFromPath(`${projectRoot}/Evidence_Log.md`)}`,
            `- Action Items: ${wikiLinkFromPath(`${projectRoot}/Action_Items.md`)}`,
            `- Risks: ${wikiLinkFromPath(`${projectRoot}/Risks.md`)}`,
            `- Decisions: ${wikiLinkFromPath(`${projectRoot}/Decisions.md`)}`,
            `- Conflict Register: ${wikiLinkFromPath(`${projectRoot}/Conflict_Register.md`)}`,
            `- Change Log: ${wikiLinkFromPath(`${projectRoot}/Change_Log.md`)}`,
            "",
            "### 승격 대상 근거 문서",
            ...evidenceLinks,
          ]
        : [
            `- 명령: ${entry.command}`,
            `- 실행시각: ${now}`,
            `- 성격: ${type}`,
            `- 실무 의미: ${names.projectName} 허브의 추진내용, 근거, 액션, 리스크, 결정사항을 분리 관리하기 위한 보조 문서`,
            "",
            "### 연결 근거",
            ...evidenceLinks,
          ];
      return appendManagedBlock(base, marker, `Wiki Management Promotion ${now}`, lines);
    }, dryRun);
    if (result) changed.push({ ...result, operation: "project_customer_promotion" });
  }
  const accountDocs = [
    ["hub.md", "hub", `${names.accountName} Account Hub`, `${names.accountName} 고객사/계정 단위 허브입니다.`],
    ["Project_Relationships.md", "overview", `${names.accountName} Project Relationships`, "고객사 하위 프로젝트와 근거 관계를 관리합니다."],
  ];
  for (const [fileName, type, title, description] of accountDocs) {
    const result = await upsertManagedMarkdown(`${accountRoot}/${fileName}`, (before) => {
      const base = before || baseHubMarkdown(type, title, description);
      const lines = fileName === "hub.md"
        ? [
            "",
            "### 운영 메모",
            `- 한줄 요약: ${names.accountName} 고객사 관련 프로젝트와 증적을 고객사 운영 단위로 모아 추적합니다.`,
            "- 진행 맥락: 하위 프로젝트 관계, 고객사 대응 상태, 다음 액션을 한 곳에서 확인하기 위한 허브입니다.",
            "- 실무 판단: 이 내용은 관리 이력이 아니라 고객사 업무 진행상황 파악용 메모입니다.",
            "- 다음 확인: 진행 중인 프로젝트, 고객사별 우선순위, 미해결 이슈와 후속 액션을 보강합니다.",
            "",
            "### 현재 추진 상태",
            "- 상태: 고객사/계정 허브 생성 완료, 하위 프로젝트 관계 검토 필요",
            `- 최근 추진: ${now} 위키 관리 명령으로 고객사 단위 운영 허브를 생성`,
            "- 운영 관점: 고객사 기준으로 프로젝트, 증적, 다음 액션을 묶어 업무 진행상황을 추적",
            "",
            "### 일시별 추진내용",
            "| 일시 | 추진내용 | 실무 의미 | 연결 증적 | 다음 액션 |",
            "| --- | --- | --- | --- | --- |",
            `| ${now} | 고객사 허브 승격: ${entry.command || "고객사 승격"} | 고객사 아래 프로젝트 관계와 증적을 모아 실무 관리 단위로 전환 | ${evidenceSummary} | Project_Relationships와 프로젝트 허브를 검토해 담당/상태/다음 액션 보강 |`,
            "",
            "### 운영 링크",
            `- 승격 프로젝트: ${wikiLinkFromPath(`${projectRoot}/hub.md`)}`,
            `- 프로젝트 관계: ${wikiLinkFromPath(`${accountRoot}/Project_Relationships.md`)}`,
            "",
            "### 연결 근거",
            ...evidenceLinks,
          ]
        : [
            `- 명령: ${entry.command}`,
            `- 실행시각: ${now}`,
            `- 승격 프로젝트: ${wikiLinkFromPath(`${projectRoot}/hub.md`)}`,
            `- 실무 의미: 고객사 관점에서 관련 프로젝트와 증적의 관계를 관리`,
            "",
            "### 연결 근거",
            ...evidenceLinks,
          ];
      return appendManagedBlock(base, marker, `Wiki Management Promotion ${now}`, lines);
    }, dryRun);
    if (result) changed.push({ ...result, operation: "project_customer_promotion" });
  }
  return changed;
}

async function applyWikiManagementCommand(commandId, options = {}) {
  const history = await readJsonFile(wikiManagementPath, []);
  const entry = history.find((item) => item.id === commandId);
  if (!entry) return { error: "management command not found", commandId };
  const pairs = collectWikiManagementPairs(entry);
  const targetPages = entry.plan?.targetPages || [];
  const dryRun = options.dryRun === true;
  const changedFiles = [];
  const skippedOperations = [];

  if (!pairs.length) {
    skippedOperations.push({ type: "term_replace", reason: "명칭 치환 쌍이 없어 자동 실행하지 않음" });
  }

  for (const page of targetPages) {
    let fullPath;
    try {
      fullPath = managedWikiFullPath(page.path);
    } catch (error) {
      skippedOperations.push({ path: page.path, reason: error.message });
      continue;
    }
    const before = await readFile(fullPath, "utf-8").catch(() => "");
    if (!before) continue;
    let after = before;
    const replacements = [];
    for (const pair of pairs) {
      const count = after.split(pair.from).length - 1;
      if (!count) continue;
      after = after.split(pair.from).join(pair.to);
      replacements.push({ ...pair, count });
    }
    if (!replacements.length || after === before) continue;
    if (!dryRun) await writeFile(fullPath, after, "utf-8");
    changedFiles.push({
      path: page.path,
      title: page.title || page.path,
      operation: "term_replace",
      replacements,
      dryRun,
    });
  }

  const structuralOps = (entry.plan?.operations || [])
    .filter((operation) => operation.type && !["term_replace", "rename"].includes(operation.type));
  const shouldPromote = structuralOps.some((operation) => /project|customer|account|promotion|promote|승격/i.test(operation.type || ""))
    || /프로젝트|고객사|계정|승격|분기/.test(entry.command || "");
  if (shouldPromote) {
    const promoteOperation = structuralOps.find((operation) => /project|customer|account|promotion|promote|승격/i.test(operation.type || "")) || { type: "project_customer_promotion" };
    const promotionChanges = await applyProjectCustomerPromotion(entry, promoteOperation, targetPages, dryRun);
    changedFiles.push(...promotionChanges);
  }
  const unsupportedStructuralOps = structuralOps
    .filter((operation) => !/project|customer|account|promotion|promote|승격/i.test(operation.type || ""))
    .map((operation) => ({ type: operation.type, reason: "지원하지 않는 구조 작업 유형이라 자동 실행하지 않음" }));
  skippedOperations.push(...unsupportedStructuralOps);

  const status = dryRun
    ? "previewed"
    : changedFiles.length && skippedOperations.length ? "applied_partially" : changedFiles.length ? "applied" : "no_changes";
  const applyEntry = {
    id: `${Date.now()}-wiki-management-apply`,
    commandId,
    command: entry.command,
    status,
    dryRun,
    changedFiles,
    skippedOperations,
    safety: {
      localWikiOnly: true,
      sourceGoogleDriveDelete: false,
      remoteWrite: false,
    },
    createdAt: new Date().toISOString(),
  };
  await prependJsonHistory(wikiManagementApplyPath, applyEntry, 120);
  if (!dryRun) {
    const updatedHistory = history.map((item) => item.id === commandId ? {
      ...item,
      status,
      appliedAt: applyEntry.createdAt,
      applySummary: {
        changedFileCount: changedFiles.length,
        skippedOperationCount: skippedOperations.length,
      },
    } : item);
    await writeFile(wikiManagementPath, JSON.stringify(updatedHistory, null, 2), "utf-8");
  }
  return applyEntry;
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

async function triggerOpenClaw(task, options = {}) {
  const { values: env } = await readEnvFile();
  const webhookUrl = process.env.OPENCLAW_WEBHOOK_URL || env.OPENCLAW_WEBHOOK_URL || process.env.GLM_API_URL || env.GLM_API_URL;
  const apiKey = process.env.OPENCLAW_API_KEY || env.OPENCLAW_API_KEY || process.env.GLM_API_KEY || env.GLM_API_KEY;
  const usesGlmFallback = !process.env.OPENCLAW_WEBHOOK_URL && !env.OPENCLAW_WEBHOOK_URL;
  const dryRun = options.dryRun !== false;
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
    execution: {
      localFallback: usesGlmFallback,
      dryRun,
      note: "No remote deletion is implemented. Local fallback runs rclone copy only against the local mirror.",
    },
    commands: {
      dryRun: "drive_wikify.cli rclone-copy --dry-run",
      manifest: "drive_wikify.cli build-manifest",
      wikify: "drive_wikify.cli run",
    },
    createdAt: new Date().toISOString(),
  };

  if (!webhookUrl) {
    try {
      const cycle = await fullCycle(dryRun);
      const stepSummary = cycle.steps.map((step) => `${step.command}: ${step.status}`).join("\n");
      const entry = {
        runId: `${Date.now()}-openclaw`,
        command: "openclaw-trigger",
        status: cycle.status,
        code: 200,
        stdout: [
          "OpenClaw/GLM endpoint 미설정: 로컬 Drive Wikify 실행을 수행했습니다.",
          dryRun ? "모드: dry-run 미리보기" : "모드: 실제 로컬 mirror 수집 + 위키화",
          "원본 Google Drive 삭제: 금지",
          stepSummary,
        ].join("\n"),
        stderr: "",
        endpoint: "local-drive-wikify",
        createdAt: new Date().toISOString(),
      };
      await appendRunHistory(entry);
      return { ...entry, payload, localResult: cycle };
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

  if (usesGlmFallback) {
    try {
      const cycle = await fullCycle(dryRun);
      const stepSummary = cycle.steps.map((step) => `${step.command}: ${step.status}`).join("\n");
      const entry = {
        runId: `${Date.now()}-openclaw`,
        command: "openclaw-trigger",
        status: cycle.status,
        code: 200,
        stdout: [
          "OpenClaw webhook 미설정: GLM fallback 대신 로컬 Drive Wikify 실행을 수행했습니다.",
          dryRun ? "모드: dry-run 미리보기" : "모드: 실제 로컬 mirror 수집 + 위키화",
          "원본 Google Drive 삭제: 금지",
          stepSummary,
        ].join("\n"),
        stderr: "",
        endpoint: "local-drive-wikify",
        createdAt: new Date().toISOString(),
      };
      await appendRunHistory(entry);
      return { ...entry, payload, localResult: cycle };
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

function resolvePythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const bundledPython = "/Users/rtm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
  return existsSync(bundledPython) ? bundledPython : "python3";
}

function safePathSegment(value) {
  return String(value || "target")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/[^가-힣\w .@()-]+/g, "_").trim() || "folder")
    .join("/");
}

function rcloneCopyTimeoutMinutes(env = {}, meta = {}) {
  if (meta.timeoutMinutes) return Number(meta.timeoutMinutes);
  if (meta.scheduled && meta.intervalMinutes) {
    return Math.max(5, Math.min(Number(meta.intervalMinutes) - 2, Number(env.RCLONE_SCHEDULED_COPY_MAX_MINUTES || 240)));
  }
  if (meta.fullCycle) return Number(env.RCLONE_FULL_CYCLE_COPY_MAX_MINUTES || env.RCLONE_COPY_MAX_MINUTES || 30);
  if (meta.targeted) return Number(env.RCLONE_TARGET_COPY_MAX_MINUTES || env.RCLONE_COPY_MAX_MINUTES || 30);
  return Number(env.RCLONE_COPY_MAX_MINUTES || 30);
}

async function runCommand(command, dryRun, meta = {}) {
  const allowed = new Set(["rclone-copy", "build-manifest", "run"]);
  if (!allowed.has(command)) {
    throw new Error(`Unsupported automation command: ${command}`);
  }
  const { values: configEnv } = await readEnvFile();
  const { extraArgs = [], ...entryMeta } = meta;
  const args = ["-m", "drive_wikify.cli", command];
  if (command === "rclone-copy" && dryRun) args.push("--dry-run");
  args.push(...extraArgs);

  const env = {
    ...process.env,
    PYTHONPATH: driveWikifySrc,
  };
  const copyTimeoutMinutes = command === "rclone-copy" && !dryRun ? rcloneCopyTimeoutMinutes(configEnv, meta) : null;
  const timeoutMs = command === "rclone-copy" && !dryRun
    ? Math.max(1, Number(copyTimeoutMinutes || 30)) * 60 * 1000
    : 1000 * 60 * 5;
  const manifestBeforePromise = command === "rclone-copy" && !dryRun ? manifestSnapshot(configEnv).catch(() => null) : Promise.resolve(null);
  const python = resolvePythonBin();
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
    executionPolicy: command === "rclone-copy" && !dryRun ? {
      defaultWindowMinutes: 30,
      timeoutMinutes: copyTimeoutMinutes,
      source: entryMeta.scheduled ? "scheduled" : entryMeta.fullCycle ? "full-cycle" : entryMeta.targeted ? "targeted" : "manual",
      resumeStrategy: "rclone copy compares local mirror and skips unchanged files; manifest is refreshed after each copy attempt",
    } : undefined,
    ...entryMeta,
  };

  return new Promise(async (resolvePromise) => {
    const manifestBefore = await manifestBeforePromise;
    if (manifestBefore) entry.manifestBefore = { manifestPath: manifestBefore.manifestPath, documents: manifestBefore.documents, updatedAt: manifestBefore.updatedAt };
    await appendRunHistory(entry);
    let stdout = "";
    let stderr = "";
    let stopped = false;
    let timedOut = false;
    const child = spawn(python, args, { cwd: repoRoot, env });
    const timeout = setTimeout(() => {
      stopped = true;
      timedOut = true;
      child.kill("SIGTERM");
      stderr += `\nReached configured collection window (${Math.round(timeoutMs / 60000)} minutes). Stopped safely; rerun will resume from local mirror.`;
    }, timeoutMs);
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
    child.on("error", async (error) => {
      clearTimeout(timeout);
      activeJobs.delete(runId);
      stderr += `\nFailed to start ${python}: ${error.message}`;
      const finalEntry = await updateRunHistory(runId, {
        status: "failed",
        code: 127,
        stdout: stdout.slice(-8000),
        stderr: stderr.slice(-8000),
        finishedAt: new Date().toISOString(),
      });
      resolvePromise(finalEntry);
    });
    child.on("close", async (code) => {
      clearTimeout(timeout);
      activeJobs.delete(runId);
      let manifestAfter = null;
      if (command === "rclone-copy" && !dryRun) {
        manifestAfter = await refreshManifestFromMirror(configEnv).catch((error) => ({ error: error.message }));
      }
      const newManifestDocs = manifestBefore && manifestAfter && !manifestAfter.error
        ? Math.max(0, manifestAfter.documents - manifestBefore.documents)
        : 0;
      const finalEntry = await updateRunHistory(runId, {
        status: timedOut ? "time_limited" : stopped ? "stopped" : code === 0 ? "completed" : "failed",
        code,
        stdout: stdout.slice(-8000),
        stderr: stderr.slice(-8000),
        manifestAfter,
        collectionSummary: manifestAfter ? {
          manifestBeforeDocuments: manifestBefore?.documents ?? null,
          manifestAfterDocuments: manifestAfter.documents ?? null,
          newManifestDocuments: newManifestDocs,
          resumeNote: "다음 rclone copy 실행은 같은 local mirror와 manifest를 기준으로 이어서 수행합니다.",
        } : undefined,
        finishedAt: new Date().toISOString(),
      });
      if (command === "rclone-copy" && !dryRun) {
        await prependJsonHistory(driveCollectionStatePath, {
          runId,
          status: finalEntry.status,
          command: commandLabel,
          startedAt,
          finishedAt: finalEntry.finishedAt,
          executionPolicy: entry.executionPolicy,
          manifestBefore: entry.manifestBefore,
          manifestAfter,
          collectionSummary: finalEntry.collectionSummary,
        }, 200).catch(() => {});
      }
      resolvePromise(finalEntry);
    });
  });
}

async function fullCycle(dryRun) {
  const steps = [];
  steps.push(await runCommand("rclone-copy", Boolean(dryRun), { fullCycle: true }));
  if (!dryRun) {
    steps.push(await runCommand("build-manifest", false));
    steps.push(await runCommand("run", false));
  }
  return {
    runId: `${Date.now()}-full-cycle`,
    status: steps.every((step) => ["completed", "time_limited"].includes(step.status)) ? "completed" : "failed",
    steps,
    createdAt: new Date().toISOString(),
  };
}

async function automationSnapshot() {
  const runs = await readJsonFile(runHistoryPath, []);
  const schedules = await readJsonFile(schedulesPath, []);
  const normalizedRuns = runs.map((run) => {
    if (run.status === "running" && !activeJobs.has(run.runId)) {
      return {
        ...run,
        status: "stale",
        stderr: run.stderr || "실행 프로세스는 없지만 이전 로그가 running으로 남아 정리 표시했습니다.",
      };
    }
    return run;
  });
  return {
    running: [...activeJobs.values()].map((job) => ({
      runId: job.runId,
      command: job.command,
      startedAt: job.startedAt,
    })),
    runs: normalizedRuns,
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
  const meta = { scheduleId: schedule.id, scheduled: true, intervalMinutes: schedule.intervalMinutes };
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
    language: "ko",
    판정: projectHint ? "기존 프로젝트 후보" : "검토 보류",
    프로젝트_힌트: projectHint || "없음",
    출처_초안: "입력 원문, 파일 경로, Drive mirror path를 Sources.md 후보로 등록",
    핵심_근거_후보: evidenceLines,
    수치_후보: numberLines,
    충돌_후보: conflictLines,
    다음_액션: "GLM 연결 후 프로젝트 분기, 중복 여부, 위키 승격 가능성을 재검토",
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

function isKoreanDigestContent(content) {
  const text = String(content || "");
  if (/Analyze the Request|Analyze the Input|Map to JSON/i.test(text)) return false;
  const trimmed = text.trim();
  const looksStructured = trimmed.startsWith("{") || trimmed.startsWith("```json");
  return looksStructured && /[가-힣]/.test(text) && /(판정|프로젝트_후보|핵심_근거_후보|다음_액션|출처_초안)/.test(text);
}

function glmThinkingOptions(env = {}) {
  const type = process.env.GLM_THINKING_TYPE || env.GLM_THINKING_TYPE || "enabled";
  const budget = Number(process.env.GLM_THINKING_BUDGET_TOKENS || env.GLM_THINKING_BUDGET_TOKENS || 8192);
  const thinking = { type };
  if (Number.isFinite(budget) && budget > 0) thinking.budget_tokens = budget;
  return thinking;
}

function glmChatMaxTokens(env = {}) {
  const value = Number(process.env.GLM_CHAT_MAX_TOKENS || env.GLM_CHAT_MAX_TOKENS || 10000);
  return Number.isFinite(value) && value > 0 ? value : 10000;
}

function glmContextMode(env = {}, requested = "") {
  const mode = requested || process.env.GLM_CONTEXT_MODE || env.GLM_CONTEXT_MODE || "standard";
  return ["economy", "standard", "deep"].includes(mode) ? mode : "standard";
}

async function requestGlmChatCompletion(apiUrl, apiKey, body, options = {}) {
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
      const abortFromParent = () => controller.abort();
      if (options.signal) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener("abort", abortFromParent, { once: true });
      }
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
        if (options.signal) options.signal.removeEventListener("abort", abortFromParent);
        lastError = new Error(error.name === "AbortError" && options.signal?.aborted ? "GLM request stopped by user" : error.name === "AbortError" ? `GLM timeout after ${timeoutMs}ms` : error.message);
        continue;
      }
      clearTimeout(timeout);
      if (options.signal) options.signal.removeEventListener("abort", abortFromParent);
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
          content: [
            "당신은 Obsidian 위키에 새 지식을 주입하기 전 한국어 다이제스트를 만드는 보조자다.",
            "반드시 한국어로만 작성한다.",
            "입력 원문을 근거 보존 관점으로 정리하되, 확정 지식과 보조 대화 맥락을 구분한다.",
            "JSON 객체만 반환한다.",
            "키는 반드시 한국어로 쓴다: 판정, 프로젝트_후보, 출처_초안, 핵심_근거_후보, 수치_후보, 충돌_후보, 위키_반영_초안, 다음_액션, 보류_이유.",
            "프로젝트 확정이 어렵거나 근거가 부족하면 판정은 검토 보류로 둔다.",
          ].join(" "),
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
    const content = glmMessageContent(payload);
    if (!isKoreanDigestContent(content)) {
      return {
        ...localDigest(text, projectHint),
        upstreamStatus: "GLM이 한국어 지식 주입 형식을 벗어나 local Korean digest로 대체",
      };
    }
    return {
      provider: "glm",
      model,
      endpoint,
      raw: payload,
      digest: content,
    };
  } catch (error) {
    return { ...localDigest(text, projectHint), upstreamStatus: error.message };
  }
}

async function operationalWikiContext(message, mode = "standard") {
  const budget = contextBudget(mode);
  const matches = (await searchWiki(message)).slice(0, budget.maxCards);
  const pages = [];
  for (const item of matches) {
    const card = await wikiContextCardForResult(item, message, mode).catch(() => ({
      title: item.title,
      path: item.path,
      snippet: item.snippet,
      score: item.score,
    }));
    pages.push(card);
  }
  const automation = await automationSnapshot().catch(() => ({ running: [], runs: [], schedules: [] }));
  const coverage = await coverageSummary().catch(() => null);
  const paperclip = await paperclipStatus().catch(() => null);
  return {
    tokenBudget: {
      mode,
      inputStrategy: "compressed_wiki_cards_plus_ops_snapshot",
      maxCards: budget.maxCards,
      recentTurns: budget.recentTurns,
      maxMemoryItems: budget.maxMemoryItems,
      estimatedEvidenceChars: pages.reduce((sum, page) => sum + (page.estimatedChars || estimateChars(page)), 0),
    },
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
    const withMessageIds = migrated.projects.map((project) => ({
      ...project,
      messages: (project.messages || []).map((message, index) => ({
        id: message.id || `${project.id || "project"}-${message.createdAt || "legacy"}-${index}`,
        ...message,
      })),
    }));
    const idChanged = JSON.stringify(withMessageIds) !== JSON.stringify(migrated.projects);
    projects = withMessageIds;
    if (migrated.changed || idChanged) await saveChatProjects(projects);
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
  const projectFact = /(\d{1,2}월\s*\d{1,2}일|\d{4}-\d{1,2}-\d{1,2}|완료|진행|결정|변경|확정|보류|고객|일정|납기|리스크|이슈|다음 액션)/.test(text);
  if (!explicit && !projectFact) return null;
  if (/[?？]\s*$/.test(text) && !explicit) return null;
  if (!explicit && /(답해|말해|알려줘|요약해|정리해|작성해|만들어줘|테스트)/.test(text)) return null;
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
  const nextMessage = {
    id: message.id || `${Date.now()}-${message.role || "message"}-${Math.random().toString(36).slice(2, 8)}`,
    ...message,
    createdAt: message.createdAt || now,
  };
  const updated = projects.map((project) => project.id === projectId ? {
    ...project,
    messages: [...(project.messages || []), nextMessage].slice(-100),
    updatedAt: now,
  } : project);
  await saveChatProjects(updated);
  return nextMessage;
}

async function deleteChatProjectMessage(projectId, messageId) {
  const projects = await listChatProjects();
  let deleted = false;
  const updated = projects.map((project) => {
    if (project.id !== projectId) return project;
    const messages = (project.messages || []).filter((message) => {
      const keep = message.id !== messageId;
      if (!keep) deleted = true;
      return keep;
    });
    return { ...project, messages, updatedAt: new Date().toISOString() };
  });
  await saveChatProjects(updated);
  return { deleted, projectId, messageId };
}

function compactProjectMemories(memories = [], mode = "standard") {
  const budget = contextBudget(mode);
  return memories
    .map((memory) => ({
      id: memory.id,
      title: memory.title,
      source: memory.source || "manual",
      confidence: memory.confidence || "user_managed",
      updatedAt: memory.updatedAt || memory.createdAt || "",
      content: compactLine(memory.content || "", budget.maxLineChars * 2),
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, budget.maxMemoryItems);
}

function compactRecentMessages(messages = [], mode = "standard") {
  const budget = contextBudget(mode);
  return messages.slice(-budget.recentTurns).map((message) => ({
    role: message.role,
    createdAt: message.createdAt,
    content: compactLine(message.content || "", budget.maxLineChars * 2),
  }));
}

function conversationSummary(messages = [], mode = "standard") {
  const budget = contextBudget(mode);
  const older = messages.slice(0, Math.max(0, messages.length - budget.recentTurns));
  if (!older.length) return "";
  const lines = older
    .map((message) => compactLine(message.content || "", 140))
    .filter((line) => /결정|완료|진행|리스크|이슈|다음|액션|기억|메모리|확정|변경|고객|일정|납기/.test(line))
    .slice(-8);
  return lines.length
    ? `이전 대화 압축 요약(확정 지식 아님): ${lines.join(" / ")}`
    : `이전 대화 ${older.length}건은 보조 맥락으로만 존재하며, 확정 지식은 별도 근거 문서 확인 필요.`;
}

async function glmChat(message, projectId = "default", options = {}) {
  const projects = await listChatProjects();
  const project = projects.find((item) => item.id === projectId) || projects[0] || defaultChatProject();
  const globalSettings = await getGlobalChatSettings();
  const { values: env } = await readEnvFile();
  const mode = glmContextMode(env, options.contextMode);
  const context = await operationalWikiContext(`${project.name} ${message}`, mode);
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
              project_memory: compactProjectMemories(project.memories || [], mode),
              project_memory_role: "managed_auxiliary_memory",
              conversation_summary: conversationSummary(project.messages || [], mode),
              recent_project_messages: compactRecentMessages(project.messages || [], mode),
              recent_project_messages_role: "auxiliary_context_not_decision",
              wiki_evidence_and_ops_context: context,
              token_budget_policy: context.tokenBudget,
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: glmChatMaxTokens(env),
        thinking: glmThinkingOptions(env),
    }, { signal: options.signal });
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

function glmChatMessages(project, globalSettings, message, context, mode = "standard") {
  return [
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
        project_memory: compactProjectMemories(project.memories || [], mode),
        project_memory_role: "managed_auxiliary_memory",
        conversation_summary: conversationSummary(project.messages || [], mode),
        recent_project_messages: compactRecentMessages(project.messages || [], mode),
        recent_project_messages_role: "auxiliary_context_not_decision",
        wiki_evidence_and_ops_context: context,
        token_budget_policy: context.tokenBudget,
      }),
    },
  ];
}

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function extractStreamDelta(payload) {
  const delta = payload.choices?.[0]?.delta || payload.choices?.[0]?.message || {};
  const thinking = delta.reasoning_content || delta.reasoning || delta.thinking || delta.thoughts || "";
  const content = delta.content || "";
  return { thinking, content };
}

async function streamGlmChat(message, projectId, res, options = {}) {
  const projects = await listChatProjects();
  const project = projects.find((item) => item.id === projectId) || projects[0] || defaultChatProject();
  const globalSettings = await getGlobalChatSettings();
  const { values: env } = await readEnvFile();
  const mode = glmContextMode(env, options.contextMode);
  const context = await operationalWikiContext(`${project.name} ${message}`, mode);
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const model = process.env.GLM_MODEL || env.GLM_MODEL || "glm-4.5";
  if (!apiKey || !apiUrl) {
    const fallback = "GLM_API_URL과 GLM_API_KEY를 운영 설정에 넣으면 위키 기반 업무 운영 챗이 연결됩니다.";
    sseWrite(res, "delta", { content: fallback });
    return { provider: "fallback", model, message: fallback, context, projectId: project.id };
  }

  const body = {
    model,
    messages: glmChatMessages(project, globalSettings, message, context, mode),
    temperature: 0.2,
    max_tokens: glmChatMaxTokens(env),
    thinking: glmThinkingOptions(env),
    stream: true,
  };
  const primary = normalizeGlmChatUrl(apiUrl);
  const codingFallback = codingPlanGlmUrl(apiUrl);
  const candidates = [primary, codingFallback].filter(Boolean);
  const timeoutMs = Number(process.env.GLM_TIMEOUT_MS || env.GLM_TIMEOUT_MS || 120000);
  let lastError = null;
  let fullMessage = "";
  let fullThinking = "";

  for (const url of candidates) {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", abortFromParent, { once: true });
    }
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      sseWrite(res, "status", { phase: "connecting", endpoint: url.includes("/api/coding/paas/") ? "coding" : "paas", maxTokens: body.max_tokens, thinking: body.thinking, tokenBudget: context.tokenBudget });
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text();
        lastError = new Error(`GLM HTTP ${response.status}: ${text || response.statusText}`);
        if (response.status !== 429 || !codingFallback || url === codingFallback) break;
        continue;
      }
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          const data = line.replace(/^data:\s*/, "").trim();
          if (!data || data === "[DONE]") continue;
          let payload;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }
          const { thinking, content } = extractStreamDelta(payload);
          if (thinking) {
            fullThinking += thinking;
            sseWrite(res, "thinking", { content: thinking });
          }
          if (content) {
            fullMessage += content;
            sseWrite(res, "delta", { content });
          }
        }
      }
      clearTimeout(timeout);
      if (options.signal) options.signal.removeEventListener("abort", abortFromParent);
      return { provider: "glm", model, endpoint: url.includes("/api/coding/paas/") ? "coding" : "paas", message: fullMessage, thinking: fullThinking, context, projectId: project.id };
    } catch (error) {
      lastError = new Error(error.name === "AbortError" && options.signal?.aborted ? "GLM request stopped by user" : error.name === "AbortError" ? `GLM stream timeout after ${timeoutMs}ms` : error.message);
    } finally {
      clearTimeout(timeout);
      if (options.signal) options.signal.removeEventListener("abort", abortFromParent);
    }
  }
  throw lastError || new Error("GLM stream failed");
}

function chatBusyPayload(projectId) {
  const active = activeChatRequests.get(projectId);
  if (!active) return null;
  return {
    status: "busy",
    error: "GLM 추론이 아직 진행 중입니다. 현재 응답이 끝난 뒤 다음 메시지를 보내세요.",
    projectId,
    active,
  };
}

async function stopChatRequest(projectId) {
  const targetId = projectId || [...activeChatRequests.keys()][0];
  const active = activeChatRequests.get(targetId);
  const controller = activeChatControllers.get(targetId);
  if (!active || !controller) return { status: "not_running", projectId: targetId || null };
  active.status = "stopping";
  active.phase = "user_stop_requested";
  controller.abort();
  return { status: "stopping", projectId: targetId };
}

function extractPromotionCandidates(content) {
  const text = String(content || "");
  const sentenceish = text.split(/\n|(?<=[.!?。])/).map((item) => item.trim()).filter((item) => item.length >= 8);
  const pick = (regex, limit) => [...new Set(sentenceish.filter((line) => regex.test(line)))].slice(0, limit);
  return {
    facts: pick(/완료|진행|계획|검증|확인|테스트|고객|납기|일정|상태/, 10),
    numbers: [...new Set(text.match(/(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}월\s*\d{1,2}일|\d+\.?\d*\s*(?:%|억|만|천|원|개|건|회|분|초|시간))/g) || [])].slice(0, 10),
    decisions: pick(/결정|확정|채택|선택|하기로|승인/, 8),
    actions: pick(/다음|추후|해야|필요|예정|액션|진행할|확인할/, 8),
    conflicts: pick(/충돌|불일치|상이|다르|변경|수정|과거|이전/, 8),
  };
}

function promotionMarkdown(entry) {
  const candidates = entry.candidates || {};
  const list = (items) => items?.length ? items.map((item) => `- ${item}`).join("\n") : "- 없음";
  return [
    "---",
    "type: promoted_chat_knowledge_candidate",
    `promotion_id: ${entry.id}`,
    `status: ${entry.status}`,
    `project_hint: "${String(entry.projectHint || "").replace(/"/g, '\\"')}"`,
    `source: ${entry.source}`,
    `created: ${entry.createdAt}`,
    "knowledge_role: promotion_candidate_not_final_evidence",
    "---",
    "",
    `# 지식 승격 후보 - ${entry.projectHint || "미지정 프로젝트"}`,
    "",
    "## 승격 상태",
    "- 이 문서는 채팅/지식 주입 내용을 위키로 승격하기 전 검토용 후보이다.",
    "- 확정 지식으로 쓰려면 원문 근거, Sources, Evidence Log, Change Log 반영 여부를 별도로 확인한다.",
    "",
    "## 원문",
    quoteMarkdown(entry.content || ""),
    "",
    "## 핵심 사실 후보",
    list(candidates.facts),
    "",
    "## 수치 후보",
    list(candidates.numbers),
    "",
    "## 결정 후보",
    list(candidates.decisions),
    "",
    "## 다음 액션 후보",
    list(candidates.actions),
    "",
    "## 충돌 후보",
    list(candidates.conflicts),
  ].join("\n");
}

async function promoteKnowledge(body) {
  const now = new Date().toISOString();
  const content = String(body.content || body.text || "").trim();
  if (!content) throw new Error("content is required");
  const id = `knowledge-promotion-${Date.now()}`;
  const entry = {
    id,
    status: "promoted_candidate_created",
    source: body.source || "manual_ingest",
    projectHint: body.projectHint || "",
    tool: body.tool || "evidence",
    content,
    candidates: extractPromotionCandidates(content),
    createdAt: now,
  };
  const markdown = promotionMarkdown(entry);
  await mkdir(knowledgePromotionRoot, { recursive: true });
  const fileName = `${id}.md`;
  const outputPath = join(knowledgePromotionRoot, fileName);
  await writeFile(outputPath, markdown, "utf-8");
  entry.path = relative(repoRoot, outputPath);
  entry.markdown = markdown;
  await prependJsonHistory(knowledgePromotionPath, entry, 120);
  return {
    status: entry.status,
    promotion: entry,
    path: entry.path,
    markdown,
    nextActions: [
      "생성된 승격 후보 Markdown을 검토",
      "확정 가능한 항목만 프로젝트 Evidence Log 또는 Sources에 반영",
      "충돌 후보가 있으면 Conflict Register로 승격",
    ],
  };
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
    if (pathname === "/api/spotlite" && req.method === "GET") {
      const scope = url.searchParams.get("scope") || "work";
      return sendJson(res, 200, await spotliteSummary(scope));
    }
    if (pathname === "/api/spotlite/templates" && req.method === "GET") {
      return sendJson(res, 200, await spotliteTemplates());
    }
    if (pathname === "/api/drive/targets" && req.method === "GET") {
      return sendJson(res, 200, { analyses: await readJsonFile(targetAnalysisPath, []) });
    }
    if (pathname === "/api/drive/targets" && req.method === "POST") {
      return sendJson(res, 200, await driveTargetAnalysis());
    }
    if (pathname === "/api/drive/instruction-targets" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.instruction) return sendJson(res, 400, { error: "instruction is required" });
      return sendJson(res, 200, await driveInstructionTargetAnalysis(body.instruction));
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
    if (pathname === "/api/automation/target-rclone-copy" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.remotePath) return sendJson(res, 400, { error: "remotePath is required" });
      const result = await targetRcloneCopy(body.remotePath, body.dryRun !== false);
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
    if (pathname === "/api/chat/status" && req.method === "GET") {
      return sendJson(res, 200, { active: [...activeChatRequests.values()] });
    }
    if (pathname === "/api/chat/stop" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await stopChatRequest(body.projectId || ""));
    }
    if (pathname === "/api/chat/projects" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { project: await upsertChatProject(body) });
    }
    if (pathname.match(/^\/api\/chat\/projects\/[^/]+$/) && req.method === "DELETE") {
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
    if (pathname.match(/^\/api\/chat\/projects\/[^/]+\/messages\/[^/]+$/) && req.method === "DELETE") {
      const parts = pathname.split("/");
      return sendJson(res, 200, await deleteChatProjectMessage(decodeURIComponent(parts[4]), decodeURIComponent(parts[6])));
    }
    if (pathname === "/api/openclaw/trigger" && req.method === "POST") {
      const body = await readBody(req);
      const result = await triggerOpenClaw(body.task || "drive_wikify_cycle", {
        dryRun: body.dryRun !== false,
      });
      return sendJson(res, result.status === "failed" ? 500 : 200, result);
    }
    if (pathname === "/api/wiki/search" && req.method === "GET") {
      const query = url.searchParams.get("q") || "";
      return sendJson(res, 200, { results: query ? await searchWiki(query) : [] });
    }
    if (pathname === "/api/wiki/index" && req.method === "GET") {
      return sendJson(res, 200, { pages: await wikiIndex() });
    }
    if (pathname === "/api/wiki/manage" && req.method === "GET") {
      return sendJson(res, 200, { commands: await readJsonFile(wikiManagementPath, []) });
    }
    if (pathname === "/api/wiki/manage" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.command) return sendJson(res, 400, { error: "command is required" });
      return sendJson(res, 200, await wikiManagementCommand(body.command));
    }
    if (pathname === "/api/wiki/manage/apply" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.commandId) return sendJson(res, 400, { error: "commandId is required" });
      const result = await applyWikiManagementCommand(body.commandId, { dryRun: body.dryRun === true });
      return sendJson(res, result.error ? 404 : 200, result);
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
      return sendJson(res, 200, await searchWikiBrief(body.query || "", body.paths || [], body.mode || "standard"));
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
    if (pathname === "/api/knowledge/promotions" && req.method === "GET") {
      return sendJson(res, 200, { promotions: await readJsonFile(knowledgePromotionPath, []) });
    }
    if (pathname === "/api/knowledge/promote" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await promoteKnowledge(body));
    }
    if (pathname === "/api/chat/glm/stream" && req.method === "POST") {
      const body = await readBody(req);
      const projectId = body.projectId || "default";
      const busy = chatBusyPayload(projectId);
      if (busy) return sendJson(res, 409, busy);
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const controller = new AbortController();
      const active = {
        projectId,
        status: "thinking",
        phase: "glm_streaming",
        startedAt: new Date().toISOString(),
      };
      activeChatRequests.set(projectId, active);
      activeChatControllers.set(projectId, controller);
      try {
        const userMessage = await appendChatProjectMessage(projectId, { role: "user", content: body.message || "" });
        sseWrite(res, "user_saved", { message: userMessage });
        const remembered = await autoRememberFromMessage(projectId, body.message || "");
        if (remembered) sseWrite(res, "memory", { remembered });
        const result = await streamGlmChat(body.message || "", projectId, res, { signal: controller.signal, contextMode: body.contextMode || body.mode });
        if (controller.signal.aborted) {
          sseWrite(res, "done", { status: "stopped", message: "GLM 추론이 사용자 요청으로 중지되었습니다.", messages: { user: userMessage } });
          return res.end();
        }
        const assistantMessage = await appendChatProjectMessage(result.projectId || projectId, {
          role: "assistant",
          content: result.message || "",
          thinking: result.thinking || "",
        });
        sseWrite(res, "done", {
          status: "completed",
          provider: result.provider,
          model: result.model,
          endpoint: result.endpoint,
          remembered,
          messages: { user: userMessage, assistant: assistantMessage },
        });
        return res.end();
      } catch (error) {
        sseWrite(res, "error", { error: error.message });
        return res.end();
      } finally {
        activeChatRequests.delete(projectId);
        activeChatControllers.delete(projectId);
      }
    }
    if (pathname === "/api/chat/glm" && req.method === "POST") {
      const body = await readBody(req);
      const projectId = body.projectId || "default";
      const busy = chatBusyPayload(projectId);
      if (busy) return sendJson(res, 409, busy);
      const controller = new AbortController();
      const active = {
        projectId,
        status: "thinking",
        phase: "glm_reasoning",
        startedAt: new Date().toISOString(),
      };
      activeChatRequests.set(projectId, active);
      activeChatControllers.set(projectId, controller);
      try {
        const userMessage = await appendChatProjectMessage(projectId, { role: "user", content: body.message || "" });
        const remembered = await autoRememberFromMessage(projectId, body.message || "");
        const result = await glmChat(body.message || "", projectId, { signal: controller.signal, contextMode: body.contextMode || body.mode });
        if (controller.signal.aborted) {
          result.status = "stopped";
          result.message = "GLM 추론이 사용자 요청으로 중지되었습니다.";
          result.messages = { user: userMessage };
          return sendJson(res, 200, result);
        }
        const assistantMessage = await appendChatProjectMessage(result.projectId || projectId, { role: "assistant", content: result.message || "" });
        result.remembered = remembered;
        result.messages = { user: userMessage, assistant: assistantMessage };
        result.status = result.provider === "fallback" && /^GLM 연결 실패/.test(result.message || "") ? "failed" : "completed";
        return sendJson(res, 200, result);
      } finally {
        activeChatRequests.delete(projectId);
        activeChatControllers.delete(projectId);
      }
    }
    if (pathname === "/api/chat/evidence" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await promoteKnowledge({
        content: body.content || "",
        projectHint: body.projectHint || "",
        source: "chat_promotion",
        tool: "evidence",
      }));
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
