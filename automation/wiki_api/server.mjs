import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile, mkdir, unlink, rm } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = resolve(new URL("../../", import.meta.url).pathname);
const repoRoot = resolve(process.env.WIKI_OPS_REPO_ROOT || defaultRepoRoot);
const frontendRoot = join(repoRoot, "automation/wiki_frontend");
const wikiRoot = join(repoRoot, "obsidian/Wiki");
const l1Root = join(repoRoot, "obsidian/L1_memory");
const personalRepoRoot = resolvePathEnv("PERSONAL_WIKI_REPO_ROOT", "../obsidianwiki-personal");
const personalWikiRoot = resolve(personalRepoRoot, "obsidian/Wiki");
const personalL1Root = resolve(personalRepoRoot, "obsidian/L1_memory");
const driveWikifySrc = join(repoRoot, "automation/drive_wikify/src");
const driveWikifyEnv = resolvePathEnv("DRIVE_WIKIFY_ENV", process.env.WIKI_OPS_ENV_FILE || "automation/drive_wikify/config/.env");
const driveRuntime = resolveExistingPathEnv("DRIVE_WIKIFY_RUNTIME", "automation/drive_wikify/runtime");
const localDriveRuntime = resolve(repoRoot, "automation/drive_wikify/runtime");
const wikiSparseIndexPath = resolveRuntimeArtifactPath(driveRuntime, localDriveRuntime, "wiki_sparse_index.json");
const wikiGraphSnapshotPath = resolveRuntimeArtifactPath(driveRuntime, localDriveRuntime, "wiki_graph_snapshot.json");
const apiRuntime = resolveExistingPathEnv("WIKI_API_RUNTIME", "automation/wiki_api/runtime");
const runHistoryPath = join(apiRuntime, "runs.json");
const pipelineStatePath = join(apiRuntime, "pipeline_state.json");
const pipelineRunsPath = join(apiRuntime, "pipeline_runs.json");
const driveCollectionStatePath = join(apiRuntime, "drive_collection_state.json");
const paperclipTasksPath = join(apiRuntime, "paperclip_tasks.json");
const paperclipEventsPath = join(apiRuntime, "paperclip_events.json");
const schedulesPath = join(apiRuntime, "schedules.json");
const mirrorRetentionPath = join(apiRuntime, "mirror_retention.json");
const targetAnalysisPath = join(apiRuntime, "target_analysis.json");
const wikiManagementPath = join(apiRuntime, "wiki_management_commands.json");
const wikiManagementApplyPath = join(apiRuntime, "wiki_management_apply_log.json");
const wikiContextCachePath = join(apiRuntime, "wiki_context_cache.json");
const knowledgePromotionPath = join(apiRuntime, "knowledge_promotions.json");
const knowledgePromotionRoot = join(apiRuntime, "knowledge_promotions");
const skillOutputsRoot = join(apiRuntime, "skill_outputs");
const paperclipRunsRoot = join(apiRuntime, "paperclip_runs");
const chatUploadsRoot = join(apiRuntime, "chat_uploads");
const chatUploadMirrorRoot = join(driveRuntime, "mirror", "assistant_ui_uploads");
const wikiStatusesPath = join(apiRuntime, "wiki_statuses.json");
const wikiStatusAuditPath = join(apiRuntime, "wiki_status_audit.jsonl");
const chatRetractionsPath = join(apiRuntime, "chat_message_retractions.jsonl");
const spotliteGlmPath = join(apiRuntime, "spotlite_glm_digest.json");
const spotliteTemplateRoot = join(apiRuntime, "../templates");
const chatProjectsPath = join(apiRuntime, "chat_projects.json");
const chatGlobalSettingsPath = join(apiRuntime, "chat_global_settings.json");
const documentUsageStatusPath = join(apiRuntime, "document_usage_statuses.json");
const documentUsageAuditPath = join(apiRuntime, "document_usage_audit.jsonl");
const decisionQueuePath = join(apiRuntime, "decision_queue.json");
const decisionQueueAuditPath = join(apiRuntime, "decision_queue_audit.jsonl");
const wikiDeletionAuditPath = join(apiRuntime, "wiki_deletion_audit.jsonl");
const projectRegistryPath = join(apiRuntime, "project_registry.json");
const llmUsagePath = join(apiRuntime, "llm_usage.json");
const hostUserPathPrefix = "/Users/rtm";
const hostUserMountRoot = process.env.WIKI_HOST_USER_MOUNT_ROOT || "/host/Users/rtm";
const activeJobs = new Map();
const activeChatRequests = new Map();
const activeChatControllers = new Map();
let runHistoryWrite = Promise.resolve();
const configuredAutoSkillRoots = String(process.env.WIKI_AUTO_SKILL_ALLOWED_ROOTS || "")
  .split(":")
  .map((item) => item.trim())
  .filter(Boolean)
  .map((item) => resolve(item));
const autoSkillAllowedRoots = [
  repoRoot,
  personalRepoRoot,
  driveRuntime,
  chatUploadsRoot,
  // Local Google Drive/Dropbox-style sync folders are read-only evidence sources for Paperclip.
  "/Users/rtm/Library/CloudStorage",
  "/Users/rtm/Documents",
  "/Users/rtm/Desktop",
  "/Users/rtm/Downloads",
  join(hostUserMountRoot, "Documents"),
  join(hostUserMountRoot, "Desktop"),
  join(hostUserMountRoot, "Downloads"),
  join(hostUserMountRoot, "Library/CloudStorage"),
  ...configuredAutoSkillRoots,
].map((item) => resolve(item));

const host = process.env.WIKI_API_HOST || "127.0.0.1";
const port = Number(process.env.WIKI_API_PORT || 8787);
const configuredWorkspaceIds = [...new Set(
  String(process.env.WIKI_ALLOWED_WORKSPACES || "rtm,personal")
    .split(",")
    .map((item) => normalizeWorkspaceId(item))
    .filter(Boolean),
)];
if (!configuredWorkspaceIds.length) configuredWorkspaceIds.push("rtm");
const configuredDefaultWorkspaceId = normalizeWorkspaceId(process.env.WIKI_DEFAULT_WORKSPACE || configuredWorkspaceIds[0] || "rtm");
const wikiIntegrationStrategies = new Set([
  "link_only",
  "promote_to_new_project",
  "promote_to_common",
  "promote_to_shared",
  "keep_separate_project",
  "account_rollup",
  "hold_for_review",
  "decision_merge",
  "evidence_index_merge",
  "status_rollup",
  "do_not_merge",
]);
const wikiIntegrationKeywordCatalog = {
  project_hub: [/hub|프로젝트|허브/i],
  customer_account: [/account|고객|계정|umbrella/i],
  proposal: [/poc|제안|견적|review|사업계획|proposal|voucher/i],
  delivery: [/납품|검수|완료|하자|세금계산서|보증|delivery/i],
  operations: [/운영|유지보수|후속|확산|고객\s*후속|follow/i],
  research: [/r&d|연구|정출연|기술교류|roadmap|calibration|oes|sp-oes/i],
  slack_ingest: [/slack|channel|thread|공개\s*slack/i],
  drive_file_ingest: [/drive|manifest|rclone|file ingest|filesystem/i],
  evidence_raw: [/raw[_ -]?evidence|evidence|원문|원본|추출|파일명|버전/i],
  decision_conflict: [/decision|conflict|충돌|불일치|상이|상충|정합성/i],
  ceo_pm: [/ceo|pm|사업 영향|의사결정|실행 계획/i],
};
const editableSettings = new Set([
  "RCLONE_REMOTE",
  "RCLONE_REMOTE_PATH",
  "RCLONE_MIRROR_ROOT",
  "RCLONE_BWLIMIT",
  "RCLONE_TPSLIMIT",
  "RCLONE_CHECKERS",
  "RCLONE_TRANSFERS",
  "RCLONE_COPY_MAX_MINUTES",
  "RCLONE_EXCLUDE_PATTERNS",
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
  "GLM_LIGHT_MODEL",
  "GLM_LIGHT_MAX_TOKENS",
  "GLM_DECISION_MODEL",
  "GLM_DECISION_MAX_TOKENS",
  "GLM_DECISION_FINAL_MODEL",
  "GLM_DECISION_FINAL_MAX_TOKENS",
  "GLM_CONFLICT_MODEL",
  "GLM_CONFLICT_MAX_TOKENS",
  "GLM_FILE_ANALYSIS_MODEL",
  "GLM_VLM_MODEL",
  "GLM_PAPERCLIP_MODEL",
  "GLM_PAPERCLIP_PLAN_MODE",
  "GLM_PAPERCLIP_CHUNK_CHARS",
  "GLM_SLACK_FILTER_MODEL",
  "GLM_SLACK_FILTER_MAX_TOKENS",
  "GLM_AVAILABLE_MODELS",
  "GLM_THINKING_TYPE",
  "GLM_THINKING_BUDGET_TOKENS",
  "GLM_CHAT_MAX_TOKENS",
  "GLM_CHAT_STREAM",
  "GLM_CONTEXT_MODE",
  "GLM_TIMEOUT_MS",
  "GLM_PAPERCLIP_TIMEOUT_MS",
  "OPENCLAW_WEBHOOK_URL",
  "OPENCLAW_API_KEY",
  "PAPERCLIP_URL",
  "PAPERCLIP_API_KEY",
  "PAPERCLIP_EXTRACTION_TIMEOUT_MS",
  "SLACK_BOT_TOKEN",
  "SLACK_USER_TOKEN",
  "SLACK_WORKSPACE_NAME",
  "SLACK_CHANNEL_TYPES",
  "SLACK_CHANNELS",
  "SLACK_EXPORT_ROOT",
  "SLACK_STATE_PATH",
  "SLACK_HISTORY_LIMIT",
  "SLACK_OLDEST_DAYS",
  "SLACK_INCLUDE_THREADS",
  "SLACK_INCLUDE_FILES",
  "SLACK_API_MIN_INTERVAL_SECONDS",
  "SLACK_HISTORY_PAGE_PAUSE_SECONDS",
  "SLACK_THREAD_PAUSE_SECONDS",
  "SLACK_CHANNEL_PAUSE_SECONDS",
  "SLACK_RATE_LIMIT_COOLDOWN_SECONDS",
  "SLACK_COLLECT_MAX_MINUTES",
  "SLACK_FILTER_WITH_GLM",
  "SLACK_FILTER_EXPORT_ROOT",
  "SLACK_PROJECT_CHANNEL_PREFIXES",
  "SLACK_COMPANY_CHANNEL_PREFIXES",
  "SLACK_MIXED_CHANNEL_PREFIXES",
  "SLACK_PROJECT_WIKI_ROOT",
  "SLACK_COMPANY_WIKI_ROOT",
  "FILESYSTEM_BROWSE_MAX_DEPTH",
  "FILESYSTEM_BROWSE_MAX_FILES",
  "FILESYSTEM_BROWSE_MAX_ENTRIES",
]);
const sensitiveSettings = new Set(["GLM_API_KEY", "OPENCLAW_API_KEY", "PAPERCLIP_API_KEY", "SLACK_BOT_TOKEN", "SLACK_USER_TOKEN"]);
const protectedWikiDeletionFiles = new Set([
  "index.md",
  "hub.md",
  "Project_Overview.md",
  "Sources.md",
  "Evidence_Log.md",
  "Action_Items.md",
  "Risks.md",
  "Decisions.md",
  "Conflict_Register.md",
  "Change_Log.md",
  "Status.md",
  "Business_Flow.md",
  "CEO_Brief.md",
  "PM_Action_Plan.md",
  "Customer_Followup.md",
  "Raw_Evidence_Index.md",
  "KPI.md",
  "Next_Meeting_Prep.md",
  "Project_Relationships.md",
  "Reference_Register.md",
  "Expansion_Structure.md",
  "Document_Usage_Log.md",
]);

function resolvePathEnv(name, fallback) {
  const value = process.env[name] || fallback;
  return isAbsolute(value) ? resolve(value) : resolve(repoRoot, value);
}

function resolveExistingPathEnv(name, fallback) {
  const fallbackResolved = isAbsolute(fallback) ? resolve(fallback) : resolve(repoRoot, fallback);
  const configured = process.env[name];
  const candidates = [
    configured ? (isAbsolute(configured) ? resolve(configured) : resolve(repoRoot, configured)) : "",
    fallbackResolved,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] || fallbackResolved;
}

function resolveRuntimeArtifactPath(runtimeRoot, fallbackRuntimeRoot, fileName) {
  const candidates = [
    join(runtimeRoot, fileName),
    join(fallbackRuntimeRoot, fileName),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

function resolveConfigPath(value, fallback) {
  const target = value || fallback;
  return isAbsolute(target) ? resolve(target) : resolve(repoRoot, target);
}

function normalizeWorkspaceId(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "work") return "rtm";
  return normalized;
}

function relativeToRepo(path) {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

const wikiWorkspaces = {
  rtm: {
    id: "rtm",
    label: "업무용(RTM)",
    description: "RTM 업무 프로젝트와 고객사 위키",
    repoRoot,
    wikiRoot,
    l1Root,
    wikiPrefix: relativeToRepo(wikiRoot),
    l1Prefix: relativeToRepo(l1Root),
    publicBaseUrl: process.env.WORK_WIKI_PUBLIC_BASE_URL || "",
    visibility: process.env.WORK_WIKI_VISIBILITY || "private",
    authMode: process.env.WORK_WIKI_AUTH_MODE || "required",
  },
  personal: {
    id: "personal",
    label: "개인용",
    description: "개인 지식과 비업무 메모를 분리 운영하는 위키",
    repoRoot: personalRepoRoot,
    wikiRoot: personalWikiRoot,
    l1Root: personalL1Root,
    wikiPrefix: relativeToRepo(personalWikiRoot),
    l1Prefix: relativeToRepo(personalL1Root),
    publicBaseUrl: process.env.PERSONAL_WIKI_PUBLIC_BASE_URL || "",
    visibility: process.env.PERSONAL_WIKI_VISIBILITY || "public",
    authMode: process.env.PERSONAL_WIKI_AUTH_MODE || "public",
  },
};
for (const workspaceId of Object.keys(wikiWorkspaces)) {
  if (!configuredWorkspaceIds.includes(workspaceId)) delete wikiWorkspaces[workspaceId];
}
const defaultWorkspaceId = wikiWorkspaces[configuredDefaultWorkspaceId]
  ? configuredDefaultWorkspaceId
  : Object.keys(wikiWorkspaces)[0];

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

async function runPythonJson(args, timeoutMs = 60_000) {
  const python = resolvePythonBin();
  const env = {
    ...process.env,
    PYTHONPATH: driveWikifySrc,
  };
  return new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(python, args, { cwd: repoRoot, env });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      rejectPromise(new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        rejectPromise(new Error(stderr.trim() || stdout.trim() || `${python} exited with code ${code}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch (error) {
        rejectPromise(new Error(`Failed to parse JSON output: ${stderr || stdout || error.message}`));
      }
    });
  });
}

function safeJoin(root, target) {
  const resolved = resolve(root, target || "");
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error("Path escapes allowed root");
  }
  return resolved;
}

function wikiWorkspace(id = "rtm") {
  const workspaceId = normalizeWorkspaceId(id || defaultWorkspaceId) || defaultWorkspaceId;
  const workspace = wikiWorkspaces[workspaceId];
  if (!workspace) throw new Error(`Unsupported workspace: ${id}`);
  return workspace;
}

function wikiWorkspaceList() {
  return Object.values(wikiWorkspaces).map((workspace) => ({
    id: workspace.id,
    label: workspace.label,
    description: workspace.description,
    repoRoot: relativeToRepo(workspace.repoRoot),
    wikiRoot: workspace.wikiPrefix,
    l1Root: workspace.l1Prefix,
    publicBaseUrl: workspace.publicBaseUrl,
    visibility: workspace.visibility,
    authMode: workspace.authMode,
    default: workspace.id === defaultWorkspaceId,
  }));
}

async function ensureWikiWorkspace(workspaceId = "rtm") {
  const workspace = wikiWorkspace(workspaceId);
  await mkdir(join(workspace.repoRoot, "obsidian/raw"), { recursive: true });
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

async function writeJsonFile(path, payload) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
}

async function appendJsonl(path, payload) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const line = `${JSON.stringify(payload)}\n`;
  const current = await readFile(path, "utf-8").catch(() => "");
  await writeFile(path, `${current}${line}`, "utf-8");
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

async function slackStatus() {
  const { values: env } = await readEnvFile();
  const exportRoot = resolveConfigPath(env.SLACK_EXPORT_ROOT, "obsidian/raw/exports/slack");
  const statePath = resolveConfigPath(env.SLACK_STATE_PATH, "automation/wiki_api/runtime/slack_collection_state.json");
  const state = await readJsonFile(statePath, { channels: {} });
  const channels = Object.values(state.channels || {}).sort((a, b) => String(b.last_collected_at || "").localeCompare(String(a.last_collected_at || "")));
  const lastCollectedAt = channels
    .map((channel) => channel.last_collected_at)
    .filter(Boolean)
    .sort()
    .at(-1) || state.last_run_at || "";
  const routingSummary = channels.reduce((summary, channel) => {
    const profile = channel.routing?.channel_profile || {};
    const bucket = profile.channel_bucket || "unknown";
    summary.channelBuckets[bucket] = (summary.channelBuckets[bucket] || 0) + 1;
    const counts = channel.routing?.bucket_counts || {};
    summary.messageBuckets.project += Number(counts.project || 0);
    summary.messageBuckets.company_news += Number(counts.company_news || 0);
    summary.messageBuckets.casual += Number(counts.casual || 0);
    const provider = channel.filter_provider || "missing";
    summary.filterProviders[provider] = (summary.filterProviders[provider] || 0) + 1;
    if (channel.filter_error) {
      summary.filterErrors[channel.filter_error] = (summary.filterErrors[channel.filter_error] || 0) + 1;
    }
    summary.promotedDocuments += Array.isArray(channel.promoted_paths) ? channel.promoted_paths.length : 0;
    return summary;
  }, {
    channelBuckets: { project: 0, company_news: 0, mixed: 0, unknown: 0 },
    messageBuckets: { project: 0, company_news: 0, casual: 0 },
    filterProviders: {},
    filterErrors: {},
    promotedDocuments: 0,
  });
  return {
    configured: Boolean((env.SLACK_BOT_TOKEN || env.SLACK_USER_TOKEN || "").trim()),
    authMode: env.SLACK_BOT_TOKEN ? "bot_token" : env.SLACK_USER_TOKEN ? "user_token" : "missing",
    workspace: env.SLACK_WORKSPACE_NAME || "",
    channelSelectors: (env.SLACK_CHANNELS || "").split(",").map((item) => item.trim()).filter(Boolean),
    channelTypes: (env.SLACK_CHANNEL_TYPES || "public_channel,private_channel").split(",").map((item) => item.trim()).filter(Boolean),
    exportRoot: relative(repoRoot, exportRoot),
    statePath: relative(repoRoot, statePath),
    historyLimit: Number(env.SLACK_HISTORY_LIMIT || 5000),
    oldestDays: Number(env.SLACK_OLDEST_DAYS || 30),
    includeThreads: env.SLACK_INCLUDE_THREADS !== "false",
    includeFiles: env.SLACK_INCLUDE_FILES !== "false",
    apiMinIntervalSeconds: Number(env.SLACK_API_MIN_INTERVAL_SECONDS || 1.2),
    historyPagePauseSeconds: Number(env.SLACK_HISTORY_PAGE_PAUSE_SECONDS || 1.0),
    threadPauseSeconds: Number(env.SLACK_THREAD_PAUSE_SECONDS || 1.0),
    channelPauseSeconds: Number(env.SLACK_CHANNEL_PAUSE_SECONDS || 2.5),
    rateLimitCooldownSeconds: Number(env.SLACK_RATE_LIMIT_COOLDOWN_SECONDS || 20),
    filterWithGlm: env.SLACK_FILTER_WITH_GLM !== "false",
    filterExportRoot: relative(repoRoot, resolveConfigPath(env.SLACK_FILTER_EXPORT_ROOT, "obsidian/raw/exports/slack_filtered")),
    projectChannelPrefixes: (env.SLACK_PROJECT_CHANNEL_PREFIXES || "pjt_,pjt-,hubble-pjt-").split(",").map((item) => item.trim()).filter(Boolean),
    companyChannelPrefixes: (env.SLACK_COMPANY_CHANNEL_PREFIXES || "sales_,rtm,0_rtm,1_rtm,team_,ai,vision_,apollo,hubble-general").split(",").map((item) => item.trim()).filter(Boolean),
    mixedChannelPrefixes: (env.SLACK_MIXED_CHANNEL_PREFIXES || "tf_").split(",").map((item) => item.trim()).filter(Boolean),
    projectWikiRoot: relative(repoRoot, resolveConfigPath(env.SLACK_PROJECT_WIKI_ROOT, "obsidian/Wiki/Common/Slack_Project_Intake")),
    companyWikiRoot: relative(repoRoot, resolveConfigPath(env.SLACK_COMPANY_WIKI_ROOT, "obsidian/Wiki/Common/Slack_Company_News")),
    collectedChannels: channels.length,
    lastCollectedAt,
    routingSummary,
    recentChannels: channels.slice(0, 20),
  };
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

async function pipelineStatePayload() {
  const state = await readJsonFile(pipelineStatePath, {});
  return {
    updatedAt: state.updatedAt || "",
    state,
  };
}

async function writePipelineState(nextState = {}) {
  await mkdir(apiRuntime, { recursive: true });
  const previous = await readJsonFile(pipelineStatePath, {});
  const state = {
    ...previous,
    ...nextState,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(pipelineStatePath, JSON.stringify(state, null, 2), "utf-8");
  return { updatedAt: state.updatedAt, state };
}

async function pipelineRunHistory() {
  return readJsonFile(pipelineRunsPath, []);
}

async function writePipelineRuns(runs = []) {
  await mkdir(apiRuntime, { recursive: true });
  const trimmed = runs.slice(0, 100);
  await writeFile(pipelineRunsPath, JSON.stringify(trimmed, null, 2), "utf-8");
  return trimmed;
}

async function appendPipelineRun(entry = {}) {
  const runs = await pipelineRunHistory();
  runs.unshift(entry);
  await writePipelineRuns(runs);
  return entry;
}

async function updatePipelineRun(runId, updates = {}) {
  const runs = await pipelineRunHistory();
  const now = new Date().toISOString();
  const next = runs.map((run) => (run.runId === runId ? { ...run, ...updates, updatedAt: now } : run));
  await writePipelineRuns(next);
  return next.find((run) => run.runId === runId) || null;
}

function collectionPlanFromBody(body = {}) {
  const plan = body.collectionPlan || body.plan || body || {};
  return {
    objective: String(plan.objective || "").trim(),
    sources: {
      slack: Boolean(plan.sources?.slack),
      drive: Boolean(plan.sources?.drive),
      filesystem: Boolean(plan.sources?.filesystem),
    },
    scope: plan.scope || {},
    execution: plan.execution || {},
    rules: plan.rules || {},
    existingMode: plan.existingMode === "overwrite" ? "overwrite" : "skip-existing",
    skillRoutes: Array.isArray(plan.skillRoutes) ? plan.skillRoutes : [],
  };
}

function sourceEnabled(plan = {}, key = "") {
  if (Array.isArray(plan.sources)) return plan.sources.includes(key);
  return Boolean(plan.sources?.[key]);
}

function planStep(id, label, status = "planned", detail = "", meta = {}) {
  return { id, label, status, detail, updatedAt: new Date().toISOString(), ...meta };
}

function extractorForExtension(ext = "") {
  const key = String(ext || "").toLowerCase();
  return {
    ".hwp": "rhwp_dump_text",
    ".hwpx": "hwpx_zip_xml",
    ".pdf": "pypdf",
    ".pptx": "pptx_zip_xml",
    ".docx": "python_docx",
    ".xlsx": "xlsx_zip_xml",
    ".xls": "xls_string_fallback",
    ".csv": "csv_reader",
    ".html": "html_report_parser",
    ".htm": "html_report_parser",
    ".md": "plain_text",
    ".txt": "plain_text",
    ".json": "plain_text",
  }[key] || "unknown";
}

function skillForExtension(ext = "") {
  const key = String(ext || "").toLowerCase();
  if ([".hwp", ".hwpx"].includes(key)) return "hwp-evidence-reader";
  if (key === ".pdf") return "pdf-document-reader";
  if (key === ".pptx") return "pptx-slide-reader";
  if (key === ".docx") return "docx-document-reader";
  if ([".xlsx", ".xls", ".csv"].includes(key)) return "spreadsheet-evidence-reader";
  if ([".html", ".htm"].includes(key)) return "html-report-reader";
  if ([".md", ".txt", ".json"].includes(key)) return "plain-text-intake";
  return "manual-review";
}

function pipelineAllowedSuffixes() {
  return new Set([".hwp", ".hwpx", ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv", ".html", ".htm", ".md", ".txt", ".json"]);
}

function isExcludedPipelinePath(path = "") {
  const normalizedPath = String(path || "").replace(/\\/g, "/");
  const parts = normalizedPath.split("/").filter(Boolean);
  const blockedParts = new Set([
    ".git",
    "node_modules",
    ".obsidian",
    "__pycache__",
    ".cache",
    ".pytest_cache",
    ".mypy_cache",
    "dist",
    "build",
    ".next",
    ".vite",
  ]);
  if (parts.some((part) => blockedParts.has(part))) return true;
  if (/(^|\/)(\.DS_Store|Thumbs\.db)$/i.test(normalizedPath)) return true;
  if (/[~#]$|\.tmp$|\.temp$|\.cache$/i.test(normalizedPath)) return true;
  return [
    "/automation/wiki_frontend/assistant-ui/assets/",
    "/automation/wiki_frontend/assistant_ui_app/node_modules/",
    "/automation/wiki_api/runtime/",
    "/automation/drive_wikify/runtime/wiki_sparse_index.json",
    "/automation/drive_wikify/runtime/wiki_graph_snapshot.json",
  ].some((needle) => normalizedPath.includes(needle));
}

function fileStatusFromPath(path = "", source = "filesystem", status = "candidate", meta = {}) {
  const normalizedPath = String(path || "");
  const ext = extname(normalizedPath).toLowerCase();
  return {
    path: displayPath(resolveReadablePath(normalizedPath)),
    source,
    ext: ext || "",
    extractor: extractorForExtension(ext),
    skill: skillForExtension(ext),
    status,
    wikiTarget: meta.wikiTarget || "",
    action: meta.action || (status === "candidate" ? "test_then_run" : ""),
    warnings: meta.warnings || [],
  };
}

function filterPipelineCandidateFiles(files = []) {
  const allowed = pipelineAllowedSuffixes();
  return files
    .filter((file) => !isExcludedPipelinePath(file))
    .filter((file) => allowed.has(extname(file).toLowerCase()));
}

async function pipelineFileStatusesFromRunOutput(env = {}) {
  const runOutputPath = resolveRepoPath(env.RUN_OUTPUT_PATH || "automation/drive_wikify/runtime/run_output.json");
  const runOutput = await readJsonFile(runOutputPath, { results: [] });
  return (runOutput.results || []).map((result) => {
    const record = result.record || {};
    const filePath = record.file_path || result.file_path || "";
    if (!filePath) return null;
    const ext = extname(String(filePath)).toLowerCase();
    const warnings = [
      ...(Array.isArray(result.warnings) ? result.warnings : []),
      ...(Array.isArray(result.validation?.issues) ? result.validation.issues : []),
      ...(result.skill_warning ? [result.skill_warning] : []),
    ].filter(Boolean).map(String);
    return {
      path: displayPath(resolveRepoPath(filePath)),
      source: result.source || record.drive_name || "manifest",
      ext,
      extractor: result.extractor || extractorForExtension(ext),
      skill: result.skill || skillForExtension(ext),
      status: result.status || "processed",
      wikiTarget: result.wikiTarget || result.project_path || result.decision?.project_name || "",
      action: result.action || result.decision?.action || "",
      warnings,
    };
  }).filter(Boolean);
}

async function pipelinePlanPreview(plan = {}) {
  const { values: env } = await readEnvFile();
  const steps = [
    planStep("scope", "범위 확인", "ready", "목표, 증거원, 범위를 확인했습니다."),
    planStep("connect", "임시 작업공간/경로 연결", "planned", "Drive는 mirror copy, 파일 브라우징은 원본 경로 우선 사용"),
    planStep("manifest", "manifest", "planned", "확장자와 제외 룰 기준으로 읽기 목록 생성"),
    planStep("skill_analysis", "스킬 분석", "planned", "PDF/PPTX/HWP/HWPX/Office 스킬 라우팅"),
    planStep("wiki_reflect", "위키 반영", "planned", "Sources/Evidence/Change/Conflict 후보 반영"),
    planStep("refresh", "검색/그래프 갱신", plan.execution?.refreshAfterCollect === false ? "skipped" : "planned", "검색/그래프 갱신"),
    planStep("review", "검수", "planned", "파일별 결과와 경고 확인"),
  ];
  const fileStatuses = [];
  const errors = [];
  const summary = {
    sources: Object.entries(plan.sources || {}).filter(([, enabled]) => enabled).map(([key]) => key),
    candidateFiles: 0,
    skippedByRule: 0,
    slackChannels: 0,
    driveTargets: 0,
    existingMode: plan.existingMode || "skip-existing",
  };

  if (sourceEnabled(plan, "slack")) {
    const slack = plan.scope?.slack || {};
    const channels = Array.isArray(slack.channels) ? slack.channels : [];
    summary.slackChannels = channels.length;
    steps.push(planStep(
      "slack_scope",
      "Slack 기간/채널",
      channels.length ? "ready" : "hold",
      `${slack.sinceDate || "-"} ~ ${slack.untilDate || "-"} KST · ${channels.length}개 채널 · 최신순`,
    ));
    for (const channel of channels) {
      fileStatuses.push({
        path: `slack://${channel}`,
        source: "slack",
        ext: ".json",
        extractor: "slack_history_api",
        skill: "slack-wiki-evidence-ingest",
        status: "candidate",
        wikiTarget: "Slack_Project_Intake / Slack_Company_News",
        action: "period_collect_latest_first",
        warnings: [],
      });
    }
    if (!channels.length) errors.push("Slack source selected but no channels are selected.");
  }

  if (sourceEnabled(plan, "drive")) {
    const drive = plan.scope?.drive || {};
    const remotePath = drive.remotePath || drive.candidate?.remotePath || "";
    summary.driveTargets = remotePath ? 1 : 0;
    steps.push(planStep(
      "drive_scope",
      "Drive 표적",
      remotePath ? "ready" : "hold",
      remotePath || "목표 기반 Drive 표적 후보가 필요합니다.",
    ));
    if (remotePath) {
      const mirrorRoot = join(repoRoot, env.RCLONE_MIRROR_ROOT || "automation/drive_wikify/runtime/mirror", safePathSegment(remotePath));
      fileStatuses.push({
        path: `drive://${remotePath}`,
        source: "drive",
        ext: "",
        extractor: "rclone_copy",
        skill: "manifest-builder",
        status: existsSync(mirrorRoot) && plan.existingMode !== "overwrite" ? "precollected" : "candidate",
        wikiTarget: displayPath(mirrorRoot),
        action: plan.existingMode === "overwrite" ? "overwrite_local_mirror" : "skip_existing_local_mirror",
        warnings: existsSync(mirrorRoot) && plan.existingMode !== "overwrite" ? ["기수집 mirror가 있어 기본값으로 제외됩니다."] : [],
      });
    } else {
      errors.push("Drive source selected but no remotePath is selected.");
    }
  }

  if (sourceEnabled(plan, "filesystem")) {
    const filesystem = plan.scope?.filesystem || {};
    const rawPath = String(filesystem.path || "").trim();
    if (!rawPath) {
      errors.push("Filesystem source selected but no path is selected.");
      steps.push(planStep("filesystem_scope", "파일 브라우징 경로", "hold", "시작 경로가 필요합니다."));
    } else {
      const targetPath = resolveReadablePath(rawPath);
      const browse = await inspectFilesystemTargets(targetPath, {
        includeDirectories: true,
        maxDepth: Number(filesystem.maxDepth || env.FILESYSTEM_BROWSE_MAX_DEPTH || 8),
        maxFiles: Number(filesystem.maxFiles || env.FILESYSTEM_BROWSE_MAX_FILES || 5000),
        maxEntriesPerDirectory: Number(filesystem.maxEntriesPerDirectory || env.FILESYSTEM_BROWSE_MAX_ENTRIES || 300),
        maxTreeEntries: 180,
      });
      const allowedFiles = filterPipelineCandidateFiles((browse.files || []).map((file) => resolveReadablePath(file)));
      summary.candidateFiles += allowedFiles.length;
      summary.skippedByRule += Math.max(0, (browse.files || []).length - allowedFiles.length);
      steps.push(planStep(
        "filesystem_scope",
        "파일 브라우징 경로",
        allowedFiles.length ? "ready" : "hold",
        `${displayPath(targetPath)} · 후보 ${allowedFiles.length}개 · 제외 ${summary.skippedByRule}개`,
      ));
      fileStatuses.push(...allowedFiles.slice(0, Number(filesystem.maxFiles || env.FILESYSTEM_BROWSE_MAX_FILES || 5000)).map((file) => (
        fileStatusFromPath(file, "filesystem", "candidate")
      )));
    }
  }

  const preview = {
    runId: `preview-${Date.now()}`,
    command: "pipeline-plan",
    status: errors.length ? "hold" : "previewed",
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStep: errors.length ? "범위 보완 필요" : "테스트 실행 가능",
    steps,
    fileStatuses,
    summary,
    errors,
  };
  return preview;
}

function stepFromCommandResult(id, label, result = {}) {
  const detail = result.stdout || result.stderr || result.progress?.summary || result.error || "";
  return planStep(id, label, result.status || "unknown", String(detail).split("\n").filter(Boolean).slice(-3).join(" / "), {
    command: result.command,
    runId: result.runId,
  });
}

function slackFileStatusesFromRunResult(result = {}) {
  const text = String(result.stdout || "");
  const rows = [];
  for (const line of text.split("\n")) {
    const match = line.match(/-\s+#(.+?)\s+\(([^)]+)\):\s+(\d+)\s+messages(?:\s+·\s+order=([^\s·]+))?(?:\s+·\s+pages=([^\s·]+))?(?:\s+·\s+exhausted=([^\s·]+))?(?:\s+·\s+files=(\d+)\s+downloaded\/(\d+)\s+analyzed)?(?:\s+·\s+promoted=(\d+)\s+docs\/(\d+)\s+projects)?(?:\s+·\s+newest=([^\s·]+))?(?:\s+·\s+oldest=([^\s·]+))?\s+->\s+(.+)$/);
    if (!match) continue;
    rows.push({
      path: match[13].trim(),
      source: "slack",
      ext: ".json",
      extractor: Number(match[8] || 0) > 0 ? "slack_history_api + attachment_extractors" : "slack_history_api",
      skill: "slack-wiki-evidence-ingest",
      status: result.status || "completed",
      wikiTarget: Number(match[10] || 0) > 0 ? `Slack project pages (${match[10]} projects)` : "Slack_Project_Intake / Slack_Company_News",
      action: Number(match[7] || 0) > 0 ? "newest_first_period_collect_with_files" : "newest_first_period_collect",
      warnings: [],
      channel: match[1].trim(),
      channelId: match[2].trim(),
      messages: Number(match[3] || 0),
      order: match[4] || "newest_first",
      pages: Number(match[5] || 0),
      exhausted: match[6] === "True" || match[6] === "true",
      downloadedFiles: Number(match[7] || 0),
      analyzedFiles: Number(match[8] || 0),
      promotedDocuments: Number(match[9] || 0),
      promotedProjects: Number(match[10] || 0),
      newestTs: match[11] || "",
      oldestTs: match[12] || "",
    });
  }
  return rows;
}

async function createPipelineRun(planInput = {}, mode = "test") {
  const plan = collectionPlanFromBody(planInput);
  const preview = await pipelinePlanPreview(plan);
  const now = new Date().toISOString();
  const runId = `${Date.now()}-pipeline-${mode}`;
  const run = {
    ...preview,
    runId,
    command: mode === "test" ? "pipeline-test" : "pipeline-run",
    status: "running",
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    currentStep: mode === "test" ? "범위 확인" : "실제 수집 시작",
    collectionPlan: plan,
  };
  await appendPipelineRun(run);

  if (mode === "test") {
    const testSteps = [...preview.steps];
    const testErrors = [...preview.errors];
    let testSlackStatuses = [];
    if (!testErrors.length && sourceEnabled(plan, "slack")) {
      const slack = plan.scope?.slack || {};
      const extraArgs = [];
      for (const channel of slack.channels || []) extraArgs.push("--channel", String(channel));
      if (slack.sinceDate) extraArgs.push("--since-date", String(slack.sinceDate));
      if (slack.untilDate) extraArgs.push("--until-date", String(slack.untilDate));
      if (slack.oldestDays) extraArgs.push("--oldest-days", String(slack.oldestDays));
      if (slack.limitPerChannel) extraArgs.push("--limit-per-channel", String(slack.limitPerChannel));
      if (slack.includeThreads === false) extraArgs.push("--no-threads");
      if (slack.includeFiles === false) extraArgs.push("--no-files");
      await updatePipelineRun(runId, { currentStep: "Slack 테스트", steps: testSteps, status: "running" });
      const result = await runCommand("slack-collect", true, {
        source: "pipeline_test",
        extraArgs,
        pipelineRunId: runId,
        slackScopeKey: slackScopeKeyFromBody(slack),
        slackScope: slack,
      });
      testSteps.push(stepFromCommandResult("slack_dry_run", "Slack 테스트", result));
      testSlackStatuses = slackFileStatusesFromRunResult(result);
      if (!["completed", "previewed"].includes(result.status)) {
        testErrors.push(result.stderr || result.error || "Slack dry-run failed.");
      }
    }
    if (!testErrors.length && sourceEnabled(plan, "drive")) {
      const drive = plan.scope?.drive || {};
      const remotePath = drive.remotePath || drive.candidate?.remotePath || "";
      await updatePipelineRun(runId, { currentStep: "Drive 표적 테스트", steps: testSteps, status: "running" });
      const result = await targetRcloneCopy(remotePath, true, { existingMode: plan.existingMode });
      testSteps.push(stepFromCommandResult("drive_dry_run", "Drive 표적 테스트", result));
      if (!["completed", "previewed", "skipped"].includes(result.status)) {
        testErrors.push(result.stderr || result.error || "Drive dry-run failed.");
      }
    }
    const completed = {
      ...run,
      status: testErrors.length ? "hold" : "completed",
      currentStep: testErrors.length ? "범위 보완 필요" : "테스트 완료",
      steps: testSteps.map((step) => ({ ...step, status: step.status === "planned" ? "ready" : step.status })),
      fileStatuses: testSlackStatuses.length ? testSlackStatuses : run.fileStatuses,
      summary: {
        ...run.summary,
        slackMessages: testSlackStatuses.reduce((sum, item) => sum + Number(item.messages || 0), 0),
        totalFiles: testSlackStatuses.length || run.fileStatuses.length,
        processedFiles: 0,
      },
      errors: testErrors,
      finishedAt: new Date().toISOString(),
    };
    await updatePipelineRun(runId, completed);
    await appendRunHistory({
      runId,
      command: "pipeline-test",
      status: completed.status,
      code: testErrors.length ? 1 : 0,
      stdout: `Pipeline test: ${completed.summary.candidateFiles || 0} files, ${completed.summary.slackChannels || 0} Slack channels, ${completed.summary.driveTargets || 0} Drive targets`,
      stderr: testErrors.join("\n"),
      createdAt: now,
      startedAt: now,
      finishedAt: completed.finishedAt,
      progress: {
        summary: completed.currentStep,
        recentLines: testErrors.length ? testErrors : ["테스트 성공. 같은 범위의 실제 수집을 시작할 수 있습니다."],
        updatedAt: completed.finishedAt,
      },
    }).catch(() => null);
    return completed;
  }

  if (preview.errors.length) {
    const blocked = {
      ...run,
      status: "blocked",
      currentStep: "범위 보완 필요",
      errors: preview.errors,
      finishedAt: new Date().toISOString(),
    };
    await updatePipelineRun(runId, blocked);
    return blocked;
  }

  const steps = [...preview.steps];
  const errors = [];
  let slackStatuses = [];
  const pushStep = async (step) => {
    steps.push(step);
    await updatePipelineRun(runId, {
      steps,
      currentStep: step.label,
      status: ["failed", "blocked"].includes(step.status) ? "failed" : "running",
      errors,
    });
  };

  try {
    if (sourceEnabled(plan, "slack")) {
      const slack = plan.scope?.slack || {};
      const extraArgs = [];
      for (const channel of slack.channels || []) extraArgs.push("--channel", String(channel));
      if (slack.sinceDate) extraArgs.push("--since-date", String(slack.sinceDate));
      if (slack.untilDate) extraArgs.push("--until-date", String(slack.untilDate));
      if (slack.oldestDays) extraArgs.push("--oldest-days", String(slack.oldestDays));
      if (slack.limitPerChannel) extraArgs.push("--limit-per-channel", String(slack.limitPerChannel));
      if (slack.includeThreads === false) extraArgs.push("--no-threads");
      if (slack.includeFiles === false) extraArgs.push("--no-files");
      const result = await runCommand("slack-collect", false, {
        source: "pipeline_run",
        extraArgs,
        pipelineRunId: runId,
        slackScopeKey: slackScopeKeyFromBody(slack),
        slackScope: slack,
      });
      await pushStep(stepFromCommandResult("slack_collect", "Slack 최신순 기간 수집", result));
      slackStatuses = slackFileStatusesFromRunResult(result);
      if (!["completed", "skipped"].includes(result.status)) errors.push(result.stderr || result.error || "Slack collection failed.");
    }

    if (sourceEnabled(plan, "drive")) {
      const drive = plan.scope?.drive || {};
      const remotePath = drive.remotePath || drive.candidate?.remotePath || "";
      const copy = await targetRcloneCopy(remotePath, false, { existingMode: plan.existingMode });
      await pushStep(stepFromCommandResult("drive_copy", "Drive 임시 작업공간 연결", copy));
      if (!["completed", "skipped"].includes(copy.status)) errors.push(copy.stderr || copy.error || "Drive copy failed.");
      if (!errors.length && copy.status !== "skipped") {
        const manifest = await runCommand("build-manifest", false, { source: "pipeline_run", pipelineRunId: runId });
        await pushStep(stepFromCommandResult("drive_manifest", "manifest", manifest));
        if (manifest.status !== "completed") errors.push(manifest.stderr || "manifest failed.");
        const ingest = await runCommand("run", false, { source: "pipeline_run", pipelineRunId: runId });
        await pushStep(stepFromCommandResult("drive_ingest", "스킬 분석 + 위키 반영", ingest));
        if (ingest.status !== "completed") errors.push(ingest.stderr || "wiki ingest failed.");
      }
    }

    if (sourceEnabled(plan, "filesystem")) {
      const filesystem = plan.scope?.filesystem || {};
      const result = await collectFilesystemPath({
        path: filesystem.path,
        dryRun: false,
        continueAfter: plan.execution?.continueAfterCollect !== false,
        refreshAfter: false,
        maxDepth: filesystem.maxDepth,
        maxFiles: filesystem.maxFiles,
        maxEntriesPerDirectory: filesystem.maxEntriesPerDirectory,
      });
      await pushStep(stepFromCommandResult("filesystem_ingest", "파일 경로 manifest + 스킬 분석", result));
      if (!["completed", "skipped"].includes(result.status)) errors.push(result.stderr || result.error || "Filesystem collection failed.");
    }

    if (plan.execution?.refreshAfterCollect !== false) {
      const refresh = await runCommand("refresh-global", false, { source: "pipeline_run", pipelineRunId: runId });
      await pushStep(stepFromCommandResult("refresh_global", "검색/그래프 갱신", refresh));
      if (refresh.status !== "completed") errors.push(refresh.stderr || "refresh-global failed.");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const { values: env } = await readEnvFile();
  const outputStatuses = await pipelineFileStatusesFromRunOutput(env).catch(() => []);
  const shouldUseManifestOutput = sourceEnabled(plan, "drive") || sourceEnabled(plan, "filesystem");
  const finalFileStatuses = shouldUseManifestOutput && outputStatuses.length
    ? outputStatuses
    : slackStatuses.length
      ? slackStatuses
      : preview.fileStatuses;
  const finished = {
    status: errors.length ? "failed" : "completed",
    currentStep: errors.length ? "오류 확인 필요" : "검수",
    steps,
    fileStatuses: finalFileStatuses,
    summary: {
      ...preview.summary,
      candidateFiles: shouldUseManifestOutput ? (preview.summary.candidateFiles || finalFileStatuses.length) : preview.summary.candidateFiles,
      slackMessages: slackStatuses.reduce((sum, item) => sum + Number(item.messages || 0), 0),
      processedFiles: shouldUseManifestOutput ? finalFileStatuses.filter((item) => !["candidate", "precollected"].includes(item.status)).length : 0,
      totalFiles: finalFileStatuses.length,
    },
    errors,
    finishedAt: new Date().toISOString(),
  };
  return updatePipelineRun(runId, finished);
}

function slackScopeKeyFromBody(body = {}) {
  return JSON.stringify({
    channels: [...(body.channels || []).map((channel) => String(channel))].sort(),
    sinceDate: body.sinceDate || "",
    untilDate: body.untilDate || "",
    limitPerChannel: Number(body.limitPerChannel || 0) || 0,
  });
}

function runningCommand(prefix) {
  return [...activeJobs.values()].find((job) => String(job.command || "").startsWith(prefix));
}

async function collectFilesystemPath(body = {}) {
  if (activeJobs.size) {
    return {
      status: "blocked",
      error: "다른 수집 작업이 이미 실행 중입니다.",
      running: [...activeJobs.values()].map((job) => ({
        runId: job.runId,
        command: job.command,
        status: job.status || "running",
        startedAt: job.startedAt,
        progress: job.progress || {},
      })),
    };
  }
  const rawPath = String(body.path || "").trim();
  if (!rawPath) return { status: "failed", error: "path is required" };
  const targetPath = resolveReadablePath(rawPath);
  if (!localPathAllowedForAutoSkill(targetPath)) {
    return { status: "blocked", error: "허용된 로컬 repo/mirror/upload 범위 밖의 경로입니다.", path: displayPath(targetPath) };
  }
  const targetStat = await stat(targetPath).catch(() => null);
  if (!targetStat?.isDirectory?.()) {
    return { status: "failed", error: "파일 브라우징 수집 대상은 폴더여야 합니다.", path: displayPath(targetPath) };
  }
  const { values: env } = await readEnvFile();
  const browse = await inspectFilesystemTargets(targetPath, {
    includeDirectories: true,
    maxDepth: Number(body.maxDepth || env.FILESYSTEM_BROWSE_MAX_DEPTH || 8),
    maxFiles: Number(body.maxFiles || env.FILESYSTEM_BROWSE_MAX_FILES || 5000),
    maxEntriesPerDirectory: Number(body.maxEntriesPerDirectory || env.FILESYSTEM_BROWSE_MAX_ENTRIES || 300),
    maxTreeEntries: 400,
  });
  if (body.dryRun !== false) {
    const runId = `${Date.now()}-filesystem-collect`;
    const entry = {
      runId,
      command: "filesystem-collect --dry-run",
      status: "completed",
      code: 0,
      stdout: `Filesystem collection preview: ${displayPath(targetPath)} (${browse.files.length} files, ${browse.directories.length} directories). Next actual run: read manifest -> file skill analysis -> wiki intake -> temporary retention.`,
      stderr: "",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      source: "filesystem_collect_api",
      filesystemPath: displayPath(targetPath),
      progress: {
        summary: `${browse.files.length} files · ${browse.directories.length} directories`,
        currentFile: displayPath(targetPath),
        updatedAt: new Date().toISOString(),
      },
      browse,
    };
    await appendRunHistory(entry);
    return entry;
  }
  const steps = [];
  steps.push(await runCommand("build-manifest", false, {
    source: "filesystem_collect_api",
    filesystemPath: displayPath(targetPath),
    extraArgs: ["--root", targetPath, "--drive-name", body.driveName || "filesystem-browser"],
  }));
  if (body.continueAfter !== false) steps.push(await runCommand("run", false, { source: "filesystem_collect_api" }));
  if (body.refreshAfter !== false) steps.push(await runCommand("refresh-global", false, { source: "filesystem_collect_api" }));
  return {
    runId: `${Date.now()}-filesystem-collect`,
    command: "filesystem-collect",
    status: steps.every((step) => step.status === "completed") ? "completed" : "failed",
    steps,
    browse,
    stdout: `Filesystem collection pipeline completed: copy/path ready -> read manifest -> file skill analysis/wiki intake -> temporary retention (${displayPath(targetPath)})`,
    createdAt: new Date().toISOString(),
  };
}

async function recordLlmUsage(entry = {}) {
  const now = new Date().toISOString();
  const payload = {
    id: `llm-usage-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: now,
    provider: entry.provider || "glm",
    feature: entry.feature || "glm_chat_completion",
    reason: entry.reason || "semantic reasoning or generation",
    model: entry.model || "",
    endpoint: entry.endpoint || "",
    status: entry.status || "completed",
    durationMs: Number(entry.durationMs || 0),
    tokens: entry.tokens || {},
    fallback: entry.fallback || "",
    error: entry.error || "",
  };
  await prependJsonHistory(llmUsagePath, payload, 300);
  return payload;
}

function llmPolicyCatalog(env = {}, usage = []) {
  const current = (key, fallback = "") => process.env[key] || env[key] || fallback;
  const countFeature = (patterns = []) => usage.filter((item) => patterns.some((pattern) => pattern.test(item.feature || ""))).length;
  return [
    {
      id: "decision_triage",
      title: "Decision Deck 경량 판정",
      surface: "위키 정합성 대기",
      purpose: "위키 원본 간 데이터 불일치, 충돌, Conflict_Register 반영 여부를 빠르게 1차 판정한다.",
      modelClass: "hybrid",
      recommendedModel: "1차 glm-4.5-air, 최종 반영 glm-5.1",
      maxTokens: Number(current("GLM_DECISION_MAX_TOKENS", 900)),
      thinking: "triage disabled, final enabled",
      envKeys: ["GLM_DECISION_MODEL", "GLM_DECISION_MAX_TOKENS", "GLM_DECISION_FINAL_MODEL", "GLM_DECISION_FINAL_MAX_TOKENS"],
      currentModel: `${current("GLM_DECISION_MODEL", "glm-4.5-air")} -> ${current("GLM_DECISION_FINAL_MODEL", current("GLM_MODEL", "glm-5.1"))}`,
      prompt: [
        "당신은 Decision Deck 안에서만 동작하는 위키 데이터 정합성 판정 보조자다.",
        "범위는 위키 원본 간 데이터 불일치와 반영 경로 판단이다. 불필요한 Conflict_Register 남발은 피한다.",
        "thinking 또는 추론 과정은 출력하지 않는다.",
        "명시적 상충값/상충주장이 없으면 Conflict_Register보다 Action_Items, Decisions, Risks, Status, hub 중 어디를 고치면 좋은지 먼저 제안한다.",
        "출력은 1) 판정 approve|hold|investigate 2) 충돌 또는 문제 요약 3) 권장 처리 4) 권장 위키 수정 문서 5) 확인할 근거 path 순서로 한다.",
      ].join("\n"),
      usageCount: countFeature([/decision_triage/]),
      applySettings: { GLM_DECISION_MODEL: "glm-4.5-air", GLM_DECISION_MAX_TOKENS: "900", GLM_DECISION_FINAL_MODEL: "glm-5.1", GLM_DECISION_FINAL_MAX_TOKENS: "1400" },
    },
    {
      id: "decision_final_approval",
      title: "Decision Deck 최종 승인 검증",
      surface: "위키 정합성 대기 승인/반영",
      purpose: "사용자가 승인/반영을 누른 직후, 위키 파일에 append하기 전 최상위 모델로 데이터 정합성 위험을 최종 점검한다.",
      modelClass: "top",
      recommendedModel: "glm-5.1",
      maxTokens: Number(current("GLM_DECISION_FINAL_MAX_TOKENS", 1400)),
      thinking: "enabled",
      envKeys: ["GLM_DECISION_FINAL_MODEL", "GLM_DECISION_FINAL_MAX_TOKENS", "GLM_MODEL"],
      currentModel: current("GLM_DECISION_FINAL_MODEL", current("GLM_MODEL", "glm-5.1")),
      prompt: [
        "당신은 위키 반영 직전 최종 승인 검증자다.",
        "Decision Deck 항목은 위키 데이터 정합성/반영 경로 관리 대상이다.",
        "사용자 승인 의도와 GLM 1차 판정 메모를 비교하되, 근거 path, projectKey, targetFile이 불명확하면 approve하지 않는다.",
        "명시적 충돌이 약한데 더 적절한 문서(Action_Items, Decisions, Risks, Status, hub)가 보이면 그쪽 append를 권고한다.",
        "JSON만 반환한다: decision, reason, blockingIssues, safeAppendNote.",
      ].join("\n"),
      usageCount: countFeature([/decision_final_approval/]),
      applySettings: { GLM_DECISION_FINAL_MODEL: "glm-5.1", GLM_DECISION_FINAL_MAX_TOKENS: "1400" },
    },
    {
      id: "conflict_merge",
      title: "충돌 문서 병합안",
      surface: "Decision Deck diff/compare",
      purpose: "출처 문서와 대상 문서를 동시에 비교해 보존/수정/확인 필요 병합 초안을 제시한다.",
      modelClass: "general",
      recommendedModel: "glm-4.5",
      maxTokens: Number(current("GLM_CONFLICT_MAX_TOKENS", 2800)),
      thinking: "enabled",
      envKeys: ["GLM_CONFLICT_MODEL", "GLM_CONFLICT_MAX_TOKENS"],
      currentModel: current("GLM_CONFLICT_MODEL", current("GLM_MODEL", "glm-4.5")),
      prompt: [
        "당신은 Obsidian 위키 충돌 병합 보조자다.",
        "출처 문서와 대상 문서를 비교해 사용자가 판단할 수 있는 병합안을 한국어 JSON으로 제시한다.",
        "사실 확정이 어려운 항목은 단정하지 말고 [확인 필요]로 둔다.",
        "출력 키는 summary, conflictingPoints, mergeStrategy, caution, mergedMarkdown만 사용한다.",
      ].join("\n"),
      usageCount: countFeature([/conflict_merge_suggestion/]),
      applySettings: { GLM_CONFLICT_MODEL: "glm-4.5", GLM_CONFLICT_MAX_TOKENS: "2800" },
    },
    {
      id: "search_brief",
      title: "선택 근거 검색 요약",
      surface: "위키 검색",
      purpose: "사용자가 선택한 Markdown 근거 카드만 짧게 요약하고 충돌 후보를 표시한다.",
      modelClass: "light",
      recommendedModel: "glm-4.5-air",
      maxTokens: Number(current("GLM_LIGHT_MAX_TOKENS", 1000)),
      thinking: "disabled",
      envKeys: ["GLM_LIGHT_MODEL", "GLM_LIGHT_MAX_TOKENS"],
      currentModel: current("GLM_LIGHT_MODEL", "glm-4.5-air"),
      prompt: "선택된 근거 Markdown path만 사용해 summaryMarkdown, keyFindings, relatedProjects, conflictCandidates, nextActions JSON을 짧게 작성한다.",
      usageCount: countFeature([/wiki_search_light_brief/]),
      applySettings: { GLM_LIGHT_MODEL: "glm-4.5-air", GLM_LIGHT_MAX_TOKENS: "1000" },
    },
    {
      id: "spotlite_digest",
      title: "Spotlite/Mission 요약",
      surface: "Mission Control",
      purpose: "진행 프로젝트의 실제 고객 업무 상태와 오늘/이번주 액션만 요약한다.",
      modelClass: "light",
      recommendedModel: "glm-4.5-air",
      maxTokens: 1200,
      thinking: "disabled",
      envKeys: ["GLM_LIGHT_MODEL", "GLM_LIGHT_MAX_TOKENS"],
      currentModel: current("GLM_LIGHT_MODEL", "glm-4.5-air"),
      prompt: "위키관리/구조 정비 이야기는 제외하고 진행 중 프로젝트의 실제 업무 상태, 우선순위, 리스크, 부족한 입력만 JSON으로 정리한다.",
      usageCount: countFeature([/spotlite_light_digest/]),
      applySettings: { GLM_LIGHT_MODEL: "glm-4.5-air", GLM_LIGHT_MAX_TOKENS: "1000" },
    },
    {
      id: "drive_instruction",
      title: "Drive 수집 지시 해석",
      surface: "수집 파이프라인",
      purpose: "한 문장 수집 지시를 안전한 키워드/별칭/후보 경로 분석으로 바꾼다.",
      modelClass: "light",
      recommendedModel: "glm-4.5-air",
      maxTokens: 600,
      thinking: "disabled",
      envKeys: ["GLM_LIGHT_MODEL", "GLM_LIGHT_MAX_TOKENS"],
      currentModel: current("GLM_LIGHT_MODEL", "glm-4.5-air"),
      prompt: "Google Drive 원본 삭제/수정은 금지하고 rclone copy 후보만 만들며 intent, keywords, aliases, requestedAction, confidence, notes JSON을 반환한다.",
      usageCount: countFeature([/drive_instruction_light_plan/]),
      applySettings: { GLM_LIGHT_MODEL: "glm-4.5-air", GLM_LIGHT_MAX_TOKENS: "1000" },
    },
    {
      id: "ingest_digest",
      title: "지식 주입 다이제스트",
      surface: "지식 주입/승격",
      purpose: "원문을 위키 반영 후보, 근거 후보, 수치 후보, 충돌 후보로 구조화한다.",
      modelClass: "hybrid",
      recommendedModel: "glm-4.5-air <= 8k chars, glm-4.5 for long evidence",
      maxTokens: 1200,
      thinking: "short disabled, long enabled",
      envKeys: ["GLM_LIGHT_MODEL", "GLM_MODEL", "GLM_LIGHT_MAX_TOKENS"],
      currentModel: `${current("GLM_LIGHT_MODEL", "glm-4.5-air")} / ${current("GLM_MODEL", "glm-5.1")}`,
      prompt: "확정 지식과 보조 대화 맥락을 구분하고 판정, 프로젝트_후보, 출처_초안, 핵심_근거_후보, 수치_후보, 충돌_후보, 위키_반영_초안, 다음_액션을 한국어 JSON으로 쓴다.",
      usageCount: countFeature([/ingest_light_digest/, /ingest_digest/]),
      applySettings: { GLM_LIGHT_MODEL: "glm-4.5-air", GLM_LIGHT_MAX_TOKENS: "1000", GLM_MODEL: current("GLM_MODEL", "glm-5.1") },
    },
    {
      id: "chat_ops",
      title: "일반 위키 업무 챗",
      surface: "GLM 챗",
      purpose: "검색/그래프/Paperclip/coverage 맥락을 묶어 위키 기반 질의응답, 조사, 비교, 초안 작성을 수행한다.",
      modelClass: "general",
      recommendedModel: "glm-5.1 or glm-4.5",
      maxTokens: Number(current("GLM_CHAT_MAX_TOKENS", 10000)),
      thinking: current("GLM_THINKING_TYPE", "enabled"),
      envKeys: ["GLM_MODEL", "GLM_CHAT_MAX_TOKENS", "GLM_THINKING_TYPE", "GLM_THINKING_BUDGET_TOKENS"],
      currentModel: current("GLM_MODEL", "glm-5.1"),
      prompt: "위키 검색 결과 설명이 아니라 로컬 Obsidian 위키를 근거 저장소로 쓰는 한국어 업무 파트너로 답한다. 근거 path와 확인 필요를 명시하고, 현황 정리는 사용자가 원할 때만 쓴다.",
      usageCount: countFeature([/^chat_stream$/, /^glm_chat_completion$/]),
      applySettings: { GLM_MODEL: current("GLM_MODEL", "glm-5.1"), GLM_CHAT_MAX_TOKENS: "10000", GLM_THINKING_TYPE: "enabled" },
    },
    {
      id: "wiki_management",
      title: "위키 관리 명령 계획",
      surface: "위키 관리",
      purpose: "명칭 정리, 프로젝트 승격, 링크 정합성, 운영형 위키 컨버팅 같은 위키 운영 명령을 적용 전 계획으로 바꾼다.",
      modelClass: "general",
      recommendedModel: "glm-4.5",
      maxTokens: 1800,
      thinking: "enabled",
      envKeys: ["GLM_MODEL", "GLM_THINKING_TYPE"],
      currentModel: current("GLM_MODEL", "glm-5.1"),
      prompt: "실제 파일 수정이 완료되었다고 말하지 말고 summaryMarkdown, operations, targetPages, risks, nextActions JSON으로 안전한 preview plan만 생성한다. 파일 원문은 요약 대체 금지이며 Raw_Evidence_Index/Evidence_Log 보존 레이어와 Status/CEO/PM 운영 레이어를 분리한다.",
      usageCount: countFeature([/wiki_management/]),
      applySettings: { GLM_MODEL: current("GLM_MODEL", "glm-5.1"), GLM_THINKING_TYPE: "enabled" },
    },
    {
      id: "file_analysis",
      title: "채팅 파일/문서 분석",
      surface: "GLM 챗 파일 업로드",
      purpose: "hwp/hwpx/pdf/docx/pptx/html/xlsx/csv 추출문을 근거 보존 Markdown으로 분석한다.",
      modelClass: "general",
      recommendedModel: "glm-4.5",
      maxTokens: 6000,
      thinking: "enabled",
      envKeys: ["GLM_FILE_ANALYSIS_MODEL", "GLM_VLM_MODEL"],
      currentModel: current("GLM_FILE_ANALYSIS_MODEL", current("GLM_MODEL", "glm-5.1")),
      prompt: "문서 추출 품질 한계를 밝히고 핵심 내용, 수치, 조직/참석자, 결정/요청, 리스크, 확인 필요 항목을 한국어 Markdown으로 보존한다.",
      usageCount: countFeature([/attachment/, /file/]),
      applySettings: { GLM_FILE_ANALYSIS_MODEL: "glm-4.5", GLM_VLM_MODEL: "glm-4.5v" },
    },
    {
      id: "paperclip_skill",
      title: "Paperclip 스킬 실행",
      surface: "Paperclip Studio",
      purpose: "전문 스킬 템플릿으로 문서 해석, RFP 전략, 통계 분석 결과물을 생성한다.",
      modelClass: "general",
      recommendedModel: "glm-4.5",
      maxTokens: Number(current("GLM_CHAT_MAX_TOKENS", 10000)),
      thinking: "enabled",
      envKeys: ["GLM_PAPERCLIP_MODEL", "GLM_CHAT_MAX_TOKENS", "GLM_PAPERCLIP_PLAN_MODE", "GLM_PAPERCLIP_CHUNK_CHARS", "GLM_PAPERCLIP_TIMEOUT_MS", "PAPERCLIP_EXTRACTION_TIMEOUT_MS"],
      currentModel: current("GLM_PAPERCLIP_MODEL", current("GLM_MODEL", "glm-5.1")),
      prompt: "템플릿별 전문 역할을 적용하되 사실/해석/전략/가정/추가 요청을 분리하고 증거 위치가 없으면 근거 위치 미확인으로 표시한다.",
      usageCount: countFeature([/paperclip/]),
      applySettings: { GLM_PAPERCLIP_MODEL: "glm-4.5" },
    },
    {
      id: "slack_filter",
      title: "Slack 수집 필터",
      surface: "Slack evidence ingest",
      purpose: "Slack 메시지를 project/company_news/casual로 빠르게 분류하고 수집할 메시지만 남긴다.",
      modelClass: "light",
      recommendedModel: "glm-4.5-air",
      maxTokens: Number(current("GLM_SLACK_FILTER_MAX_TOKENS", 1200)),
      thinking: "disabled",
      envKeys: ["GLM_SLACK_FILTER_MODEL", "GLM_SLACK_FILTER_MAX_TOKENS", "SLACK_FILTER_WITH_GLM"],
      currentModel: current("GLM_SLACK_FILTER_MODEL", current("GLM_LIGHT_MODEL", "glm-4.5-air")),
      prompt: "채널 대화 중 실제 업무 메시지만 keep하고 project/company_news/casual bucket, reason을 JSON으로 반환한다. 잡담/시스템 메시지는 제외한다.",
      usageCount: countFeature([/slack/]),
      applySettings: { GLM_SLACK_FILTER_MODEL: "glm-4.5-air", GLM_SLACK_FILTER_MAX_TOKENS: "1200", SLACK_FILTER_WITH_GLM: "true" },
    },
  ];
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
  if (!path) return repoRoot;
  return isAbsolute(path) ? resolve(path) : resolve(repoRoot, path);
}

function hostMountedPath(path) {
  const fullPath = resolve(path || "");
  if (fullPath === hostUserPathPrefix) return resolve(hostUserMountRoot);
  if (fullPath.startsWith(`${hostUserPathPrefix}/`)) {
    return resolve(hostUserMountRoot, relative(hostUserPathPrefix, fullPath));
  }
  return fullPath;
}

function resolveReadablePath(path) {
  const fullPath = resolveRepoPath(path);
  if (existsSync(fullPath)) return fullPath;
  const mountedPath = hostMountedPath(fullPath);
  if (mountedPath !== fullPath && existsSync(mountedPath)) return mountedPath;
  return fullPath;
}

function displayPath(path) {
  const mountedPath = resolve(path || "");
  if (mountedPath === resolve(hostUserMountRoot) || mountedPath.startsWith(`${resolve(hostUserMountRoot)}/`)) {
    return join(hostUserPathPrefix, relative(resolve(hostUserMountRoot), mountedPath)).replace(/\\/g, "/");
  }
  const relativePath = relative(repoRoot, path);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return path;
  return relativePath;
}

function allowedManifestSuffixes(env = {}) {
  const configured = String(env.ALLOWED_FILE_TYPES || "")
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
  const values = configured.length ? configured : ["hwp", "hwpx", "pdf", "docx", "pptx", "html", "htm"];
  return new Set(values.map((item) => `.${item}`));
}

async function manifestSnapshot(env = {}) {
  const manifestPath = resolveRepoPath(env.MANIFEST_PATH || "automation/drive_wikify/runtime/manifest.json");
  const manifest = await readJsonFile(manifestPath, { documents: [] });
  const docs = manifest.documents || [];
  return {
    manifestPath: displayPath(manifestPath),
    documents: docs.length,
    filePaths: docs.map((doc) => doc.file_path).filter(Boolean),
    updatedAt: manifest.generated_at || manifest.updated_at || "",
  };
}

async function collectionStatusSnapshot(env = {}) {
  const manifestPath = resolveRepoPath(env.MANIFEST_PATH || "automation/drive_wikify/runtime/manifest.json");
  const runOutputPath = resolveRepoPath(env.RUN_OUTPUT_PATH || "automation/drive_wikify/runtime/run_output.json");
  const manifest = await readJsonFile(manifestPath, { documents: [] });
  const runOutput = await readJsonFile(runOutputPath, { results: [] });
  const manifestFolders = new Set();
  const manifestFiles = new Set();
  const processedFolders = new Set();
  const processedFiles = new Set();
  for (const doc of manifest.documents || []) {
    const folderPath = String(doc.folder_path || "").replace(/^\/+|\/+$/g, "");
    const filePath = String(doc.file_path || "");
    if (folderPath) manifestFolders.add(folderPath);
    if (filePath) {
      const normalizedFile = filePath.replace(/\\/g, "/");
      const marker = "/runtime/mirror/";
      const idx = normalizedFile.indexOf(marker);
      if (idx > -1) {
        const relativeFile = normalizedFile.slice(idx + marker.length).replace(/^\/+/, "");
        const relativeFolder = relativeFile.split("/").slice(0, -1).join("/");
        manifestFiles.add(relativeFile);
        if (relativeFolder) manifestFolders.add(relativeFolder);
      }
    }
  }
  for (const result of runOutput.results || []) {
    const record = result.record || {};
    const filePath = String(record.file_path || result.file_path || "").replace(/\\/g, "/");
    if (filePath) {
      const marker = "/runtime/mirror/";
      const idx = filePath.indexOf(marker);
      if (idx > -1) {
        const relativeFile = filePath.slice(idx + marker.length).replace(/^\/+/, "");
        const relativeFolder = relativeFile.split("/").slice(0, -1).join("/");
        processedFiles.add(relativeFile);
        if (relativeFolder) processedFolders.add(relativeFolder);
      }
    }
    const folderPath = String(record.folder_path || result.folder_path || "").replace(/^\/+|\/+$/g, "");
    if (folderPath) processedFolders.add(folderPath);
  }
  return {
    manifestPath: displayPath(manifestPath),
    runOutputPath: displayPath(runOutputPath),
    manifestFolders: [...manifestFolders].sort(),
    manifestFiles: [...manifestFiles].sort(),
    processedFolders: [...processedFolders].sort(),
    processedFiles: [...processedFiles].sort(),
    documents: (manifest.documents || []).length,
    processed: (runOutput.results || []).length,
    updatedAt: runOutput.generated_at || runOutput.updated_at || manifest.generated_at || manifest.updated_at || "",
  };
}

function mirrorRoots(env = {}) {
  return {
    all: resolveRepoPath(env.RCLONE_MIRROR_ROOT || "automation/drive_wikify/runtime/mirror"),
    uploads: chatUploadMirrorRoot,
  };
}

function defaultMirrorRetention() {
  return {
    enabled: false,
    days: 7,
    scope: "uploads",
    cleanupMode: "age",
    maxBytes: 0,
    timeOfDay: "03:30",
    updatedAt: "",
  };
}

async function readMirrorRetention() {
  const stored = await readJsonFile(mirrorRetentionPath, defaultMirrorRetention());
  return {
    ...defaultMirrorRetention(),
    ...stored,
  };
}

async function collectMirrorTreeStats(rootPath, olderThanDays = 0) {
  const summary = {
    path: displayPath(rootPath),
    exists: false,
    fileCount: 0,
    directoryCount: 0,
    totalBytes: 0,
    oldestAt: "",
    newestAt: "",
    olderThanDays,
    staleFileCount: 0,
    staleBytes: 0,
  };
  const cutoffMs = olderThanDays > 0 ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000 : 0;
  const rootStat = await stat(rootPath).catch(() => null);
  if (!rootStat?.isDirectory?.()) return summary;
  summary.exists = true;

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        summary.directoryCount += 1;
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileStat = await stat(fullPath).catch(() => null);
      if (!fileStat?.isFile?.()) continue;
      summary.fileCount += 1;
      summary.totalBytes += Number(fileStat.size || 0);
      const modifiedAt = fileStat.mtime instanceof Date ? fileStat.mtime.toISOString() : "";
      if (modifiedAt && (!summary.oldestAt || modifiedAt < summary.oldestAt)) summary.oldestAt = modifiedAt;
      if (modifiedAt && (!summary.newestAt || modifiedAt > summary.newestAt)) summary.newestAt = modifiedAt;
      if (cutoffMs && fileStat.mtimeMs < cutoffMs) {
        summary.staleFileCount += 1;
        summary.staleBytes += Number(fileStat.size || 0);
      }
    }
  }

  await walk(rootPath);
  return summary;
}

async function mirrorStatusSnapshot(env = {}) {
  const roots = mirrorRoots(env);
  const retention = await readMirrorRetention();
  const schedules = await readJsonFile(schedulesPath, []);
  const retentionSchedule = schedules.find((schedule) => schedule.command === "mirror-cleanup" && schedule.retentionManaged);
  const [allRoot, uploadsRoot] = await Promise.all([
    collectMirrorTreeStats(roots.all, Number(retention.days || 7)),
    collectMirrorTreeStats(roots.uploads, Number(retention.days || 7)),
  ]);
  return {
    roots: {
      all: allRoot,
      uploads: uploadsRoot,
    },
    retention: {
      ...retention,
      scheduleId: retentionSchedule?.id || "",
      nextRunAt: retentionSchedule?.nextRunAt || "",
      scheduleEnabled: Boolean(retentionSchedule?.enabled),
    },
  };
}

async function cleanupMirrorData({
  env = {},
  scope = "uploads",
  olderThanDays = 0,
  dryRun = true,
  deleteAll = false,
  cleanupMode = "age",
  thresholdBytes = 0,
} = {}) {
  const roots = mirrorRoots(env);
  const rootPath = roots[scope] || roots.uploads;
  const rootStat = await stat(rootPath).catch(() => null);
  const cutoffMs = !deleteAll && olderThanDays > 0 ? Date.now() - olderThanDays * 24 * 60 * 60 * 1000 : 0;
  const currentStats = await collectMirrorTreeStats(rootPath, olderThanDays);
  const mirrorStatus = await collectionStatusSnapshot(env).catch(() => ({ processedFiles: [] }));
  const processedFiles = new Set((mirrorStatus.processedFiles || []).map((item) => String(item || "").replace(/\\/g, "/")));
  const files = [];
  const directories = [];
  if (!rootStat?.isDirectory?.()) {
    return {
      scope,
      rootPath: displayPath(rootPath),
      dryRun,
      deleteAll,
      olderThanDays,
      cleanupMode,
      thresholdBytes,
      currentBytes: 0,
      exists: false,
      matchedFiles: 0,
      deletedFiles: 0,
      deletedDirectories: 0,
      freedBytes: 0,
      samplePaths: [],
    };
  }
  if (!deleteAll && thresholdBytes > 0 && Number(currentStats.totalBytes || 0) < thresholdBytes) {
    return {
      scope,
      rootPath: displayPath(rootPath),
      dryRun,
      deleteAll,
      olderThanDays,
      cleanupMode,
      thresholdBytes,
      currentBytes: Number(currentStats.totalBytes || 0),
      exists: true,
      skipped: true,
      skipReason: "threshold_not_reached",
      matchedFiles: 0,
      deletedFiles: 0,
      deletedDirectories: 0,
      freedBytes: 0,
      samplePaths: [],
      executedAt: new Date().toISOString(),
    };
  }

  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        directories.push(fullPath);
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileStat = await stat(fullPath).catch(() => null);
      if (!fileStat?.isFile?.()) continue;
      const relativeToAllRoot = relative(roots.all, fullPath).replace(/\\/g, "/").replace(/^\/+/, "");
      const processedEligible = processedFiles.has(relativeToAllRoot);
      const ageEligible = cutoffMs ? fileStat.mtimeMs < cutoffMs : false;
      const modeEligible = deleteAll
        ? true
        : cleanupMode === "processed"
          ? processedEligible
          : cleanupMode === "processed_or_age"
            ? (processedEligible || ageEligible)
            : ageEligible;
      if (!modeEligible) continue;
      files.push({
        path: fullPath,
        size: Number(fileStat.size || 0),
        modifiedAt: fileStat.mtime instanceof Date ? fileStat.mtime.toISOString() : "",
        processedEligible,
        relativeToAllRoot,
      });
    }
  }

  await walk(rootPath);
  let deletedFiles = 0;
  let deletedDirectories = 0;
  let freedBytes = 0;

  if (!dryRun) {
    for (const file of files) {
      await unlink(file.path).catch(() => {});
      deletedFiles += 1;
      freedBytes += file.size;
    }
    for (const directory of directories.sort((a, b) => b.length - a.length)) {
      const remaining = await readdir(directory).catch(() => null);
      if (Array.isArray(remaining) && remaining.length === 0) {
        await rm(directory, { recursive: false, force: true }).catch(() => {});
        deletedDirectories += 1;
      }
    }
  }

  return {
    scope,
    rootPath: displayPath(rootPath),
    dryRun,
    deleteAll,
    olderThanDays,
    cleanupMode,
    thresholdBytes,
    currentBytes: Number(currentStats.totalBytes || 0),
    exists: true,
    matchedFiles: files.length,
    deletedFiles: dryRun ? 0 : deletedFiles,
    deletedDirectories: dryRun ? 0 : deletedDirectories,
    freedBytes: dryRun ? files.reduce((sum, file) => sum + file.size, 0) : freedBytes,
    samplePaths: files.slice(0, 12).map((file) => ({
      path: displayPath(file.path),
      size: file.size,
      modifiedAt: file.modifiedAt,
    })),
    executedAt: new Date().toISOString(),
  };
}

async function saveMirrorRetentionPolicy(body = {}, env = {}) {
  const current = await readMirrorRetention();
  const next = {
    ...current,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : current.enabled,
    days: Math.max(1, Number(body.days || current.days || 7)),
    scope: body.scope === "all" ? "all" : "uploads",
    cleanupMode: body.cleanupMode === "processed" || body.cleanupMode === "processed_or_age" ? body.cleanupMode : "age",
    maxBytes: Math.max(0, Number(body.maxBytes || current.maxBytes || 0)),
    timeOfDay: String(body.timeOfDay || current.timeOfDay || "03:30"),
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(mirrorRetentionPath, next);

  const schedules = await readJsonFile(schedulesPath, []);
  const retained = schedules.filter((schedule) => !(schedule.command === "mirror-cleanup" && schedule.retentionManaged));
  if (next.enabled) {
    retained.unshift({
      id: `mirror-retention-${Date.now()}`,
      name: `미러 ${next.days}일 자동정리`,
      command: "mirror-cleanup",
      dryRun: false,
      mode: "daily",
      runAt: "",
      timeOfDay: next.timeOfDay,
      intervalMinutes: 0,
      enabled: true,
      createdAt: new Date().toISOString(),
      retentionManaged: true,
      retentionDays: next.days,
      scope: next.scope,
      cleanupMode: next.cleanupMode,
      retentionMaxBytes: next.maxBytes,
    });
  }
  for (const schedule of retained) {
    if (!schedule.nextRunAt && schedule.enabled !== false) schedule.nextRunAt = nextScheduleRun(schedule);
  }
  await saveSchedules(retained.slice(0, 50));
  return mirrorStatusSnapshot(env);
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
    mirror_root: displayPath(mirrorRoot),
    documents,
  };
  await writeFile(manifestPath, JSON.stringify(payload, null, 2), "utf-8");
  return {
    manifestPath: displayPath(manifestPath),
    mirrorRoot: displayPath(mirrorRoot),
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

const canonicalProjectDocNames = ["hub.md", "Project_Overview.md", "Sources.md", "Evidence_Log.md", "Status.md", "Business_Flow.md", "CEO_Brief.md", "PM_Action_Plan.md", "Customer_Followup.md", "Action_Items.md", "Risks.md", "Decisions.md", "Conflict_Register.md", "Change_Log.md", "Raw_Evidence_Index.md"];

function isProjectScopedDivision(division = "") {
  return ["project", "account"].includes(division);
}

function projectKeyRule(path, frontmatter = {}) {
  const classification = classifyWikiPage(path, frontmatter);
  const expectedProjectKey = isProjectScopedDivision(classification.division) ? classification.projectKey : "";
  const declaredProjectKey = String(frontmatter.projectKey || "").trim();
  const issues = [];
  if (expectedProjectKey) {
    if (!declaredProjectKey) {
      issues.push({
        code: "missing_project_key",
        severity: "error",
        message: `frontmatter.projectKey가 필요합니다. expected=${expectedProjectKey}`,
      });
    } else if (declaredProjectKey !== expectedProjectKey) {
      issues.push({
        code: "project_key_mismatch",
        severity: "error",
        message: `frontmatter.projectKey=${declaredProjectKey} 이고 폴더 기준 expected=${expectedProjectKey} 입니다.`,
      });
    }
  }
  return {
    classification,
    expectedProjectKey,
    declaredProjectKey,
    required: Boolean(expectedProjectKey),
    ok: issues.length === 0,
    issues,
  };
}

function upsertFrontmatterLine(block, key, value) {
  const lines = block.split("\n");
  const index = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line.trim()));
  const nextLine = `${key}: ${value}`;
  if (index >= 0) {
    lines[index] = nextLine;
    return lines.join("\n");
  }
  const typeIndex = lines.findIndex((line) => /^type\s*:/.test(line.trim()));
  if (typeIndex >= 0) {
    lines.splice(typeIndex + 1, 0, nextLine);
    return lines.join("\n");
  }
  lines.push(nextLine);
  return lines.join("\n");
}

function enforceProjectKeyFrontmatter(path, markdown = "") {
  const text = String(markdown || "");
  const parsed = parseFrontmatter(text);
  const rule = projectKeyRule(path, parsed);
  if (!rule.required) {
    return { markdown: text, changed: false, rule };
  }
  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      const block = text.slice(3, end).replace(/^\n/, "");
      const body = text.slice(end + 4).replace(/^\n/, "");
      const nextBlock = upsertFrontmatterLine(block, "projectKey", rule.expectedProjectKey);
      const nextMarkdown = `---\n${nextBlock}\n---\n${body}`;
      return { markdown: nextMarkdown, changed: nextMarkdown !== text, rule };
    }
  }
  const nextMarkdown = `---\nprojectKey: ${rule.expectedProjectKey}\n---\n\n${text}`;
  return { markdown: nextMarkdown, changed: true, rule };
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

async function todayKstDate() {
  const script = [
    "from datetime import datetime",
    "from zoneinfo import ZoneInfo",
    "print(datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d'))",
  ].join("\n");
  const result = await runCapture(resolvePythonBin(), ["-c", script], { timeoutMs: 3000 }).catch(() => null);
  const value = result?.stdout?.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function datePartKst(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

function spotliteProjectFromPath(path) {
  const parts = String(path || "").split("/");
  const section = classifyWikiSection(path) || parts[2] || "Wiki";
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

function isSpotliteBusinessLine(line, path = "") {
  const text = `${line} ${path}`.toLowerCase();
  if (!String(line || "").trim()) return false;
  if (/^#+\s|^---$|^\|?\s*-+\s*\|/.test(String(line || "").trim())) return false;
  if (/명령:|위키\s*(관리|구조|승격|전수\s*조사|반영|갱신|정리|수정)|wiki\s*(manage|management|promotion|ingest|wikify)/i.test(text)) return false;
  if (/hub\s*(갱신|최신|update)|허브\s*(갱신|보강|최신|확인)/i.test(text)) return false;
  if (/sources|evidence[_\s-]*log|change[_\s-]*log|conflict[_\s-]*register|action[_\s-]*items|risks|decisions/.test(text) && /검토|갱신|확인|연결|링크|누락|보강|정합성|전수/i.test(text)) return false;
  if (/명칭|일괄\s*수정|치환|rename|아사히카세이\s*[-=]*>\s*아사히카세히/i.test(text)) return false;
  if (/사용자\s*상태\s*지정\s*필요|현재\s*허브는\s*실제\s*업무|원문\s*근거를\s*우선\s*확인|담당자,\s*고객\s*대응,\s*산출물/i.test(text)) return false;
  if (/연결된\s*근거\s*문서|액션\/리스크\/결정|최신\s*진행상황|상태로\s*갱신|실행\s*항목을\s*보강/i.test(text)) return false;
  if (/^(type|성격)\s*:\s*|리스크와\s*불확실성을\s*관리|출처\s*목록|근거와\s*관찰\s*사항/i.test(String(line || "").trim())) return false;
  if (/\[\[wiki\/|고객사\s*허브|action\s*items\s*:|risks\s*:|진행상황\s*확인\s*필요|일시\s*\|\s*추진내용|확정된\s*결정만|관리\s*이력이\s*아니라/i.test(text)) return false;
  return true;
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
  const todayDate = await todayKstDate();
  const pages = await wikiIndex(workspace.id);
  const ongoingProjectPages = pages.filter((page) => page.workflowStatus === "ongoing" && page.division === "project");
  const focusProjectKeys = new Set(ongoingProjectPages.map((page) => page.projectKey).filter(Boolean));
  const focusProjectLabels = [...new Set(ongoingProjectPages.map((page) => page.projectLabel).filter(Boolean))];
  const files = ongoingProjectPages
    .map((page) => managedWikiFullPath(page.path))
    .filter((file) => file.startsWith(workspace.wikiRoot));
  const candidates = [];
  const todayUpdates = [];
  const projectMap = new Map();
  for (const file of files) {
    const fileStat = await stat(file).catch(() => null);
    const markdown = await readFile(file, "utf-8").catch(() => "");
    const path = relative(repoRoot, file);
    const frontmatter = parseFrontmatter(markdown);
    const title = titleFromMarkdown(path, markdown);
    const project = spotliteProjectFromPath(path);
    const classification = classifyWikiPage(path, frontmatter);
    if (!focusProjectKeys.has(classification.projectKey)) continue;
    const updatedDate = datePartKst(fileStat?.mtime || frontmatter.updated || frontmatter.date);
    if (updatedDate === todayDate) {
      todayUpdates.push({
        title,
        path,
        project,
        line: `오늘 위키화/수정됨: ${title}`,
        kind: "today-update",
        bucket: "today",
        score: 9,
        docKind: classification.docKind,
        updatedAt: fileStat?.mtime?.toISOString?.() || "",
      });
    }
    const lines = markdown.split("\n")
      .map(compactSpotliteLine)
      .filter((line) => line.length >= 8)
      .filter((line) => isSpotliteBusinessLine(line, path))
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
  const today = [...todayUpdates, ...ranked.filter((item) => item.bucket === "today")].slice(0, 16);
  const week = ranked.filter((item) => item.bucket === "week").slice(0, 18);
  const risks = ranked.filter((item) => item.kind === "risk").slice(0, 12);
  const memos = ranked.filter((item) => item.kind === "memo" || /운영 메모|진행 맥락|실무 판단|다음 확인/.test(item.line)).slice(0, 12);
  const watch = ranked.filter((item) => item.bucket === "watch" && item.kind !== "risk").slice(0, 18);
  const projects = [...projectMap.values()]
    .sort((a, b) => (b.actions + b.risks * 2 + b.count) - (a.actions + a.risks * 2 + a.count))
    .slice(0, 10);
  const commandCenter = await projectCommandCenter(workspace.id).catch(() => ({ projects: [], summary: {} }));
  const integrationScan = await wikiIntegrationCandidateScan(workspace.id, { limit: 12 }).catch(() => ({ candidates: [], summary: { candidates: 0 } }));
  const operations = (commandCenter.projects || [])
    .filter((project) => project.workflowStatus === "ongoing" || (project.opsActions || []).length || (project.missingOperationalDocs || []).length)
    .map((project) => ({
      project: project.projectLabel || project.projectKey,
      projectKey: project.projectKey,
      coverage: project.operationalCoverage || 0,
      decisionQueueCount: project.decisionQueueCount || 0,
      missingDocs: project.missingOperationalDocs || [],
      actions: (project.opsActions || []).slice(0, 4),
      latestStatusMemo: (project.statusMemos || [])[0] || "",
      rawEvidence: (project.rawEvidence || [])[0] || "",
      hubPath: project.hubPath || "",
    }))
    .sort((a, b) => (b.decisionQueueCount - a.decisionQueueCount) || (a.coverage - b.coverage))
    .slice(0, 12);
  const integrations = (integrationScan.candidates || []).slice(0, 8).map((candidate) => ({
    title: candidate.groupKey,
    path: candidate.changeTargets?.[0] || candidate.relatedWikis?.[0]?.hubPath || "",
    project: candidate.relatedWikis?.map((item) => item.projectLabel || item.projectKey).join(", "),
    kind: candidate.recommendedStrategy,
    line: candidate.preview?.summary || candidate.reason?.join(", ") || "통합 후보",
    score: Math.round((candidate.similarityScore || 0) * 100),
  }));
  const cachedGlm = await readJsonFile(spotliteGlmPath, null).catch(() => null);
  const digest = cachedGlm?.scope === scope && cachedGlm?.digestVersion === 2 ? cachedGlm.digest : null;
  return {
    scope,
    workspace: {
      id: workspace.id,
      label: workspace.label,
      repoRoot: relativeToRepo(workspace.repoRoot),
      wikiRoot: workspace.wikiPrefix,
      l1Root: workspace.l1Prefix,
      publicBaseUrl: workspace.publicBaseUrl,
      visibility: workspace.visibility,
      authMode: workspace.authMode,
    },
    focus: {
      mode: "ongoing-projects-only",
      excluded: "Common, 운영/자동화, 로그/감사, 완료/보류/보관 프로젝트",
      projectKeys: [...focusProjectKeys],
      projectLabels: focusProjectLabels,
    },
    generatedAt: new Date().toISOString(),
    summary: {
      totalSignals: candidates.length,
      today: today.length,
      todayUpdates: todayUpdates.length,
      week: week.length,
      risks: risks.length,
      projects: projects.length,
      ongoingProjects: focusProjectKeys.size,
      operationalReady: commandCenter.summary?.operationalReady || 0,
      operationalGaps: commandCenter.summary?.operationalGaps || 0,
      integrationCandidates: integrationScan.summary?.candidates || 0,
    },
    analysis: [
      focusProjectKeys.size ? `진행 중 프로젝트 ${focusProjectKeys.size}개만 기준으로 봅니다.` : "진행 중으로 지정된 프로젝트가 없습니다.",
      todayUpdates.length ? `Python KST 오늘(${todayDate}) 기준 오늘 위키화/수정된 진행 프로젝트 문서 ${todayUpdates.length}건을 우선 표시합니다.` : `Python KST 오늘(${todayDate}) 기준 새로 위키화/수정된 진행 프로젝트 문서는 없습니다.`,
      week.length ? `이번주 처리 후보 ${week.length}개가 감지됐습니다.` : "진행 중 프로젝트 안에서 이번주 항목은 아직 적습니다.",
      risks.length ? `리스크/이슈 후보 ${risks.length}개를 먼저 확인하는 편이 안전합니다.` : "리스크 후보는 많지 않습니다.",
      integrations.length ? `성격별 통합 후보 ${integrations.length}건을 승인 게이트로 검토 중입니다.` : "통합 후보는 아직 많지 않습니다.",
      memos.length ? "프로젝트 운영 메모에서 실무 맥락 후보를 찾았습니다." : "현재 문서에는 실무 액션으로 확정할 만한 메모가 부족합니다.",
    ],
    today,
    week,
    risks,
    memos,
    watch,
    operations,
    integrations,
    projects,
    digest,
  };
}

async function refreshSpotliteGlm(scope = "work") {
  const summary = await spotliteSummary(scope);
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const lightOptions = glmLightTaskOptions(env, { maxTokens: 1200, cap: 1500 });
  const model = lightOptions.model;
  const localDigest = {
    provider: "local",
    markdown: [
      "# Spotlite GLM 정리 대기",
      "",
      `- 진행 중 프로젝트: ${summary.summary.ongoingProjects || 0}개`,
      `- 오늘 항목: ${summary.summary.today || 0}개`,
      `- 이번주 항목: ${summary.summary.week || 0}개`,
      `- 리스크: ${summary.summary.risks || 0}개`,
    ].join("\n"),
  };
  if (!apiKey || !apiUrl || !summary.summary.ongoingProjects) {
    const result = { scope, digestVersion: 2, generatedAt: new Date().toISOString(), digest: localDigest, summary };
    await writeJsonFile(spotliteGlmPath, result);
    return result;
  }
  const compressed = {
    focus: summary.focus,
    projects: summary.projects,
    today: summary.today.slice(0, 8),
    week: summary.week.slice(0, 10),
    risks: summary.risks.slice(0, 8),
    memos: summary.memos.slice(0, 8),
    operations: summary.operations.slice(0, 8),
  };
  try {
    const { payload, endpoint } = await requestGlmChatCompletion(apiUrl, apiKey, {
      model,
      messages: [
        {
          role: "system",
          content: [
            "당신은 RTM PMO의 Spotlite 분석가다.",
            "Common/위키관리/운영 자동화 이야기는 제외하고, 진행 중 프로젝트의 실제 고객 업무 상태와 다음 액션만 정리한다.",
            "금지: Hub 갱신, 위키 갱신, 위키 구조 승격, 명칭 정정, Sources/Evidence_Log/Action_Items/Risks/Decisions 검토를 업무 액션으로 쓰지 않는다.",
            "입력 근거가 위키관리뿐이면 '실무 정보 부족'이라고 쓰고 담당자/고객/산출물/현장일정/기술 리스크 확인 질문만 제안한다.",
            "출력은 JSON 객체만 반환한다: markdown, todayPriorities, weeklyPriorities, risks, missingInputs.",
            "markdown은 한국어 Markdown으로 짧지만 실무적으로 작성한다.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify(compressed) },
      ],
      temperature: lightOptions.temperature,
      max_tokens: lightOptions.maxTokens,
      thinking: lightOptions.thinking,
      response_format: { type: "json_object" },
    }, {
      feature: "spotlite_light_digest",
      reason: "short structured PMO summary from compressed wiki signals",
    });
    let parsed;
    try {
      parsed = JSON.parse(glmMessageContent(payload));
    } catch {
      parsed = { markdown: glmMessageContent(payload), todayPriorities: [], weeklyPriorities: [], risks: [], missingInputs: [] };
    }
    const result = {
      scope,
      digestVersion: 2,
      generatedAt: new Date().toISOString(),
      digest: { provider: "glm", model, endpoint, ...parsed },
      summary,
    };
    await writeJsonFile(spotliteGlmPath, result);
    return result;
  } catch (error) {
    const result = {
      scope,
      digestVersion: 2,
      generatedAt: new Date().toISOString(),
      digest: { ...localDigest, upstreamStatus: error.message },
      summary,
    };
    await writeJsonFile(spotliteGlmPath, result);
    return result;
  }
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

function wikiRootsForWorkspace(workspaceId = "rtm") {
  const workspace = wikiWorkspace(workspaceId);
  return [workspace.wikiRoot, workspace.l1Root];
}

function classifyWikiSection(path = "") {
  const normalized = String(path || "").replace(/\\/g, "/");
  for (const workspace of Object.values(wikiWorkspaces)) {
    if (normalized === workspace.l1Prefix || normalized.startsWith(`${workspace.l1Prefix}/`)) {
      return "L1_memory";
    }
    if (normalized === workspace.wikiPrefix || normalized.startsWith(`${workspace.wikiPrefix}/`)) {
      const suffix = normalized.slice(workspace.wikiPrefix.length).replace(/^\/+/, "");
      return suffix.split("/")[0] || "Wiki";
    }
  }
  return "";
}

const sparseSearchStopwords = new Set([
  "assistant",
  "chat",
  "glm",
  "obsidian",
  "wiki",
  "md",
  "기본",
  "새",
  "업무",
  "업무용",
  "개인",
  "프로젝트",
  "챗",
  "현재",
  "관련",
  "문서",
  "간단히",
  "설명",
  "설명해줘",
  "정리",
  "정리해줘",
  "알려줘",
  "말해줘",
  "보여줘",
  "무엇",
  "무엇을",
  "뭐",
  "이것",
  "저것",
  "그것",
  "하려는지",
]);

function sparseTerms(text = "") {
  return [...new Set(
    String(text || "")
      .toLowerCase()
      .match(/[0-9a-z가-힣_]{2,}/giu) || [],
  )]
    .map((term) => term.replace(/(에서|으로|에게|한테|까지|부터|처럼|보다|만큼|은|는|이|가|을|를|의|에|와|과|로|도|만)$/u, ""))
    .filter((term) => term.length >= 2 && !sparseSearchStopwords.has(term));
}

function isGenericChatProjectName(name = "") {
  const normalized = String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return [
    "",
    "기본 업무 챗",
    "새 업무 챗",
    "새 개인 챗",
    "기본 개인 챗",
    "default",
    "glm 프로젝트",
    "새 glm 프로젝트",
  ].includes(normalized);
}

function isGlmChatProjectMemoryPath(path = "") {
  return /\/l1_memory\/glm_chat_projects\/.+\.md$/i.test(String(path || "").replace(/\\/g, "/"));
}

function docKindPriorityBoost(docKind = "", path = "") {
  const normalizedPath = String(path || "").toLowerCase();
  if (docKind === "evidence" || /evidence_log/.test(normalizedPath)) return 18;
  if (docKind === "conflict" || /conflict_register/.test(normalizedPath)) return 16;
  if (docKind === "hub") return 14;
  if (docKind === "memory" || /\/l1_memory\//i.test(path)) return 14;
  if (docKind === "overview") return 9;
  if (docKind === "decisions") return 8;
  if (docKind === "risks") return 8;
  if (docKind === "changelog") return 6;
  return 0;
}

function localPathAllowedForAutoSkill(path) {
  const fullPath = resolveReadablePath(path || "");
  return autoSkillAllowedRoots.some((root) => fullPath === root || fullPath.startsWith(`${root}/`));
}

async function filesystemRootOptions() {
  const roots = [
    { key: "wiki-repo", label: "Wiki repo", path: repoRoot },
    { key: "documents", label: "Documents", path: "/Users/rtm/Documents" },
    { key: "desktop", label: "Desktop", path: "/Users/rtm/Desktop" },
    { key: "downloads", label: "Downloads", path: "/Users/rtm/Downloads" },
    { key: "drive-mirror", label: "Drive mirror", path: join(driveRuntime, "mirror") },
    { key: "drive-runtime", label: "Drive runtime", path: driveRuntime },
    { key: "chat-uploads", label: "Chat uploads", path: chatUploadsRoot },
    { key: "assistant-uploads", label: "Assistant UI uploads", path: chatUploadMirrorRoot },
    { key: "cloud-storage", label: "CloudStorage", path: "/Users/rtm/Library/CloudStorage" },
    ...configuredAutoSkillRoots.map((path, index) => ({ key: `extra-${index + 1}`, label: `Extra root ${index + 1}`, path })),
  ];
  const unique = [];
  const seen = new Set();
  for (const root of roots) {
    const resolvedPath = resolveReadablePath(root.path);
    if (seen.has(resolvedPath) || !localPathAllowedForAutoSkill(resolvedPath)) continue;
    seen.add(resolvedPath);
    const info = await stat(resolvedPath).catch(() => null);
    unique.push({
      ...root,
      path: displayPath(resolvedPath),
      exists: Boolean(info?.isDirectory?.()),
    });
  }
  return unique;
}

async function sparseWikiSearch(query, workspaceId = "rtm", limit = 12) {
  if (workspaceId === "personal") {
    return (await searchWiki(query, workspaceId)).slice(0, limit).map((item) => ({
      ...item,
      retrieval_source: "fallback_substring",
      matched_terms: sparseTerms(query).filter((term) => `${item.title} ${item.path} ${item.snippet}`.toLowerCase().includes(term)),
    }));
  }
  const payload = await readJsonFile(wikiSparseIndexPath, null);
  if (!payload?.documents || !payload?.terms) {
    return (await searchWiki(query, workspaceId)).slice(0, limit).map((item) => ({
      ...item,
      retrieval_source: "fallback_substring",
      matched_terms: sparseTerms(query).filter((term) => `${item.title} ${item.path} ${item.snippet}`.toLowerCase().includes(term)),
    }));
  }
  const documents = new Map((payload.documents || []).map((item) => [item.path, item]));
  const scores = new Map();
  const matchedTerms = new Map();
  for (const term of sparseTerms(query)) {
    for (const posting of payload.terms?.[term] || []) {
      const path = posting.path;
      const current = scores.get(path) || 0;
      scores.set(path, current + Number(posting.score || 0));
      matchedTerms.set(path, [...new Set([...(matchedTerms.get(path) || []), term])]);
    }
  }
  const ranked = [...scores.entries()]
    .map(([path, score]) => {
      const doc = documents.get(path) || {};
      return {
        title: doc.title || titleFromMarkdown(path, ""),
        path,
        frontmatter: { type: doc.type || "", updated: doc.updated || "" },
        snippet: `${doc.headings?.slice(0, 3).join(" / ") || doc.title || path}`,
        score,
        matched_terms: matchedTerms.get(path) || [],
        retrieval_source: "sparse_bm25",
      };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return ranked.slice(0, limit);
}

async function expandGraphNeighbors(seedPaths = [], workspaceId = "rtm", policy = {}) {
  const payload = await readJsonFile(wikiGraphSnapshotPath, null);
  if (!payload?.nodes || !payload?.edges) return [];
  const workspace = wikiWorkspace(workspaceId);
  const allowedRoots = [`${workspace.wikiPrefix}/`, `${workspace.l1Prefix}/`];
  const allowedPath = (path) => allowedRoots.some((prefix) => String(path || "").startsWith(prefix));
  const byId = new Map((payload.nodes || []).map((node) => [node.id, node]));
  const adjacency = new Map();
  for (const edge of payload.edges || []) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push(edge.target);
    adjacency.get(edge.target).push(edge.source);
  }
  const limit1 = Number(policy.firstHopLimit || 18);
  const limit2 = Number(policy.secondHopLimit || 24);
  const expansions = [];
  const seen = new Set(seedPaths);
  const firstHop = [];
  for (const seed of seedPaths.slice(0, Number(policy.seedLimit || 6))) {
    for (const neighbor of adjacency.get(seed) || []) {
      if (seen.has(neighbor) || !allowedPath(neighbor)) continue;
      seen.add(neighbor);
      firstHop.push({ path: neighbor, graph_hops: 1, via: seed, retrieval_source: "graph_1hop", node: byId.get(neighbor) });
    }
  }
  const rankedFirstHop = firstHop
    .sort((a, b) => ((b.node?.degree || 0) + docKindPriorityBoost(classifyWikiPage(b.path, { type: b.node?.type || "" }).docKind, b.path))
      - ((a.node?.degree || 0) + docKindPriorityBoost(classifyWikiPage(a.path, { type: a.node?.type || "" }).docKind, a.path)))
    .slice(0, limit1);
  expansions.push(...rankedFirstHop);

  const secondHop = [];
  for (const item of rankedFirstHop) {
    for (const neighbor of adjacency.get(item.path) || []) {
      if (seen.has(neighbor) || !allowedPath(neighbor)) continue;
      const classification = classifyWikiPage(neighbor, { type: byId.get(neighbor)?.type || "" });
      const eligibleSecondHop = classification.division === "common"
        || classification.docKind === "memory"
        || classification.docKind === "evidence"
        || classification.docKind === "conflict"
        || classification.docKind === "hub";
      if (!eligibleSecondHop) continue;
      seen.add(neighbor);
      secondHop.push({ path: neighbor, graph_hops: 2, via: item.path, retrieval_source: "graph_2hop", node: byId.get(neighbor) });
    }
  }
  expansions.push(...secondHop
    .sort((a, b) => ((b.node?.degree || 0) + docKindPriorityBoost(classifyWikiPage(b.path, { type: b.node?.type || "" }).docKind, b.path))
      - ((a.node?.degree || 0) + docKindPriorityBoost(classifyWikiPage(a.path, { type: a.node?.type || "" }).docKind, a.path)))
    .slice(0, limit2));
  return expansions;
}

function rerankEvidenceCandidates(candidates = [], biasPolicy = {}) {
  const mode = biasPolicy.mode || "evidence_l1_first";
  const contextProjectKeys = new Set((biasPolicy.contextProjectKeys || []).filter(Boolean));
  const linkedProjectPath = String(biasPolicy.linkedProjectPath || "");
  const queryText = String(biasPolicy.queryText || "");
  const projectCounts = new Map();
  for (const candidate of candidates) {
    const classification = candidate.classification || classifyWikiPage(candidate.path, candidate.frontmatter || {});
    projectCounts.set(classification.projectKey, (projectCounts.get(classification.projectKey) || 0) + 1);
  }
  return candidates
    .map((candidate) => {
      const classification = candidate.classification || classifyWikiPage(candidate.path, candidate.frontmatter || {});
      const kindBoost = docKindPriorityBoost(classification.docKind, candidate.path);
      const l1Boost = classification.docKind === "memory" || classification.division === "memory"
        ? (isGlmChatProjectMemoryPath(candidate.path) ? 0 : 4)
        : 0;
      const graphBoost = candidate.graph_hops === 1 ? 2 : candidate.graph_hops === 2 ? 1 : 0;
      const contextProjectBoost = contextProjectKeys.has(classification.projectKey)
        ? (classification.division === "project" || classification.division === "account" ? 10 : 4)
        : 0;
      const linkedPathBoost = linkedProjectPath && candidate.path === linkedProjectPath ? 6 : 0;
      const lexicalBoost = overlapScore(`${candidate.title || ""} ${candidate.path || ""}`, queryText) * 2;
      const projectInjectionPenalty = candidate.retrieval_source === "project_detect"
        ? 5
        : candidate.retrieval_source === "explicit_project_mention"
          ? 3
          : candidate.retrieval_source === "linked_project_scope"
            ? 2
            : candidate.retrieval_source === "project_context"
              ? 4
              : 0;
      const weakMemoryPenalty = classification.docKind === "memory"
        && !contextProjectKeys.has(classification.projectKey)
        && overlapScore(`${candidate.title || ""} ${candidate.path || ""}`, queryText) === 0
        ? 12
        : 0;
      const denseProjectPenalty = (projectCounts.get(classification.projectKey) || 0) > 8 && classification.division === "common" ? 1.5 : 0;
      const finalScore = Number(candidate.score || 0)
        + kindBoost
        + l1Boost
        + graphBoost
        + contextProjectBoost
        + linkedPathBoost
        + lexicalBoost
        - projectInjectionPenalty
        - weakMemoryPenalty
        - denseProjectPenalty;
      const priorityReason = mode === "evidence_l1_first"
        ? `${classification.docKind || "knowledge"} boost ${kindBoost + l1Boost + contextProjectBoost + linkedPathBoost + lexicalBoost - projectInjectionPenalty - weakMemoryPenalty}`
        : `${classification.docKind || "knowledge"} score`;
      return {
        ...candidate,
        classification,
        finalScore,
        priority_reason: priorityReason,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore || a.path.localeCompare(b.path));
}

async function searchWiki(query, workspaceId = "rtm") {
  const roots = wikiRootsForWorkspace(workspaceId);
  const files = (await Promise.all(roots.map(walkMarkdown))).flat();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = [];
  const statusStore = await wikiStatusStore();
  for (const file of files) {
    const markdown = await readFile(file, "utf-8");
    const haystack = `${relative(repoRoot, file)}\n${markdown}`.toLowerCase();
    const score = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
    if (!score) continue;
    const path = relativeToRepo(file);
    const frontmatter = parseFrontmatter(markdown);
    const section = classifyWikiSection(path) || path.split("/")[2] || "Wiki";
    const projectKeyState = projectKeyRule(path, frontmatter);
    const classified = applyWikiStatus({
      title: titleFromMarkdown(path, markdown),
      path,
      section,
      frontmatter,
      updatedAt: "",
      size: markdown.length,
      ...projectKeyState.classification,
    }, statusStore);
    if (shouldHideWikiPage(classified)) continue;
    results.push({
      title: classified.title,
      path,
      frontmatter,
      snippet: findSnippet(markdown, query),
      score,
    });
  }
  return results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).slice(0, 40);
}

async function wikiIndex(workspaceId = "rtm") {
  const roots = wikiRootsForWorkspace(workspaceId);
  const files = (await Promise.all(roots.map(walkMarkdown))).flat();
  const pages = [];
  const statusStore = await wikiStatusStore();
  for (const file of files) {
    const markdown = await readFile(file, "utf-8");
    const fileStat = await stat(file).catch(() => null);
    const path = relativeToRepo(file);
    const frontmatter = parseFrontmatter(markdown);
    const section = classifyWikiSection(path) || path.split("/")[2] || "Wiki";
    const projectKeyState = projectKeyRule(path, frontmatter);
    const classification = projectKeyState.classification;
    const page = applyWikiStatus({
      title: titleFromMarkdown(path, markdown),
      path,
      section,
      frontmatter,
      projectKeyDeclared: projectKeyState.declaredProjectKey,
      projectKeyExpected: projectKeyState.expectedProjectKey,
      projectKeyRequired: projectKeyState.required,
      projectKeyIntegrity: projectKeyState.ok ? "ok" : "error",
      projectKeyIssues: projectKeyState.issues,
      updatedAt: fileStat?.mtime?.toISOString?.() || "",
      size: fileStat?.size || markdown.length,
      ...classification,
    }, statusStore);
    if (shouldHideWikiPage(page)) continue;
    pages.push(page);
  }
  return pages.sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title));
}

function classifyWikiPage(path, frontmatter = {}) {
  const parts = path.split("/");
  const section = classifyWikiSection(path) || parts[2] || "Wiki";
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

const wikiStatusCatalog = {
  completed: { label: "완료", color: "green", highlight: "완료 처리된 운영 단위" },
  ongoing: { label: "진행 중", color: "blue", highlight: "현재 추진 중인 운영 단위" },
  hold: { label: "보류", color: "amber", highlight: "추가 판단 또는 외부 입력 대기" },
  planned: { label: "계획", color: "gray", highlight: "아직 실행 전 계획 단계" },
  archived: { label: "보관", color: "slate", highlight: "운영 종료 후 참조 보관" },
  hidden: { label: "숨김", color: "slate", highlight: "위키 목록과 트리에서 기본 숨김 처리" },
  unknown: { label: "미지정", color: "muted", highlight: "사용자 상태 지정 필요" },
};

function normalizeWikiStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  const aliases = {
    done: "completed",
    complete: "completed",
    completed: "completed",
    완료: "completed",
    ongoing: "ongoing",
    active: "ongoing",
    진행: "ongoing",
    "진행 중": "ongoing",
    온고잉: "ongoing",
    hold: "hold",
    paused: "hold",
    보류: "hold",
    planned: "planned",
    plan: "planned",
    계획: "planned",
    archived: "archived",
    archive: "archived",
    보관: "archived",
    hidden: "hidden",
    hide: "hidden",
    숨김: "hidden",
    deleted: "hidden",
    delete: "hidden",
    삭제: "hidden",
    discarded: "hidden",
    discard: "hidden",
    폐기: "hidden",
  };
  return aliases[text] || (wikiStatusCatalog[text] ? text : "unknown");
}

function shouldHideWikiPage(page) {
  const hiddenFlag = page.frontmatter?.hidden === true
    || String(page.frontmatter?.hidden || "").trim().toLowerCase() === "true"
    || page.frontmatter?.deleted === true
    || String(page.frontmatter?.deleted || "").trim().toLowerCase() === "true";
  if (hiddenFlag) return true;
  return ["hidden"].includes(String(page.workflowStatus || "").trim().toLowerCase());
}

function defaultWikiStatusForPage(page) {
  const haystack = `${page.title || ""} ${page.path || ""} ${page.projectLabel || ""} ${page.projectKey || ""}`.toLowerCase();
  if (/trust[\s_-]*my[\s_-]*tech|산업현장\s*문제\s*해결형/.test(haystack) || (haystack.includes("산업현장") && /(문제|에이전트|agent|해결)/.test(haystack))) {
    return { status: "completed", tags: ["완료", "사용자규칙"], source: "default_rule" };
  }
  if (/아사히카세히|아사히카세이|asahi\s*kasei|roll[\s_-]*to[\s_-]*roll|롤투롤/.test(haystack)) {
    return { status: "ongoing", tags: ["온고잉", "사용자규칙"], source: "default_rule" };
  }
  return { status: "unknown", tags: [], source: "default" };
}

function isWikiStatusManaged(page) {
  const type = String(page.frontmatter?.type || "").toLowerCase();
  const path = String(page.path || "");
  if (type === "global_chat_instruction" || type === "auxiliary_chat_project_memory") return false;
  if (/obsidian\/(?:personal_)?l1_memory\/glm_(?:global_instructions|chat_projects)\b/i.test(path)) return false;
  return true;
}

async function wikiStatusStore() {
  const store = await readJsonFile(wikiStatusesPath, null);
  if (store?.projects && store?.pages) return store;
  const initial = {
    version: 1,
    projects: {
      Trust_my_tech_Project: { status: "completed", tags: ["완료"], note: "사용자 지정: Trust my tech 완료 처리", updatedAt: new Date().toISOString() },
      "산업현장_문제_해결형_Project": { status: "completed", tags: ["완료"], note: "사용자 지정: 산업현장 문제 해결형 완료 처리", updatedAt: new Date().toISOString() },
      "아사히카세히_Project": { status: "ongoing", tags: ["온고잉"], note: "사용자 지정: 아사히카세히 롤투롤 프로젝트 진행 중", updatedAt: new Date().toISOString() },
    },
    pages: {},
  };
  await writeJsonFile(wikiStatusesPath, initial);
  return initial;
}

function applyWikiStatus(page, store) {
  if (!isWikiStatusManaged(page)) {
    return {
      ...page,
      statusManaged: false,
      workflowStatus: "not_applicable",
      workflowStatusLabel: "상태관리 제외",
      workflowStatusColor: "muted",
      workflowStatusHighlight: "",
      workflowStatusSource: "not_applicable",
      workflowTags: [],
      workflowNote: "GLM 대화/지침 보조문서는 업무 진행 상태 관리 대상이 아닙니다.",
    };
  }
  const fallback = defaultWikiStatusForPage(page);
  const projectOverride = store.projects?.[page.projectKey] || null;
  const pageOverride = store.pages?.[page.path] || null;
  const picked = pageOverride || projectOverride || fallback;
  const status = normalizeWikiStatus(picked.status);
  const meta = wikiStatusCatalog[status] || wikiStatusCatalog.unknown;
  const tags = [...new Set([...(fallback.tags || []), ...(projectOverride?.tags || []), ...(pageOverride?.tags || [])].filter(Boolean))];
  return {
    ...page,
    workflowStatus: status,
    workflowStatusLabel: meta.label,
    workflowStatusColor: meta.color,
    workflowStatusHighlight: picked.highlight || meta.highlight,
    workflowStatusSource: pageOverride ? "page_user" : projectOverride ? "project_user" : fallback.source,
    workflowTags: tags,
    workflowNote: picked.note || "",
    statusManaged: true,
  };
}

function wikiStatusEntryFromBody(body = {}) {
  const status = normalizeWikiStatus(body.status);
  const tags = String(body.tags || "")
    .split(/[,，;；\n]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
  return {
    status,
    tags,
    note: String(body.note || "").trim(),
    highlight: String(body.highlight || "").trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: "user_action",
  };
}

async function updateWikiStatus(body = {}) {
  if (Array.isArray(body.items) && body.items.length) {
    const store = await wikiStatusStore();
    const now = new Date().toISOString();
    const saved = [];
    for (const item of body.items) {
      const scope = item.scope === "page" ? "page" : "project";
      const key = scope === "page" ? String(item.path || item.key || "").trim() : String(item.projectKey || item.key || "").trim();
      if (!key) continue;
      const entry = { ...wikiStatusEntryFromBody(item), updatedAt: now };
      if (scope === "page") store.pages[key] = entry;
      else store.projects[key] = entry;
      saved.push({ scope, key, entry });
    }
    await writeJsonFile(wikiStatusesPath, store);
    await appendJsonl(wikiStatusAuditPath, { timestamp: now, scope: "bulk", count: saved.length, items: saved });
    return { status: "saved", mode: "bulk", count: saved.length, items: saved, catalog: wikiStatusCatalog };
  }
  const scope = body.scope === "page" ? "page" : "project";
  const key = scope === "page" ? String(body.path || body.key || "").trim() : String(body.projectKey || body.key || "").trim();
  if (!key) throw new Error(scope === "page" ? "path is required" : "projectKey is required");
  const now = new Date().toISOString();
  const store = await wikiStatusStore();
  const entry = { ...wikiStatusEntryFromBody(body), updatedAt: now };
  if (scope === "page") store.pages[key] = entry;
  else store.projects[key] = entry;
  await writeJsonFile(wikiStatusesPath, store);
  await appendJsonl(wikiStatusAuditPath, { timestamp: now, scope, key, entry });
  return { status: "saved", scope, key, entry, catalog: wikiStatusCatalog };
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

function wikiMergeTokenSet(value = "") {
  return new Set(String(value || "")
    .toLowerCase()
    .replace(/[_/.-]+/g, " ")
    .split(/[^가-힣a-z0-9]+/i)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .filter((item) => !["wiki", "project", "account", "status", "sources", "evidence", "log", "hub", "md", "rtm"].includes(item)));
}

function tokenOverlapRatio(left = new Set(), right = new Set()) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = new Set([...left, ...right]).size || 1;
  return intersection / union;
}

function changeEventMemo({ timestamp = new Date().toISOString(), source = "wiki_ops", change = "", action = "", status = "기록됨" } = {}) {
  const when = timestamp.replace("T", " ").slice(0, 16);
  return `${when} ${source} 기준으로 ${change || "상태 변화 후보"}가 ${status}되었고 ${action || "후속 검토 대기"}가 수행/대기됨`;
}

function wikiLinkFromManagedPath(path = "") {
  return String(path || "")
    .replace(/^obsidian\//, "")
    .replace(/\.md$/i, "")
    .replace(/\\/g, "/");
}

function defaultMarkdownTitle(fileName = "") {
  return fileName.replace(/_/g, " ").replace(/\.md$/i, "");
}

function defaultTypeForMarkdownFile(fileName = "") {
  const normalized = fileName.replace(/\.md$/i, "").toLowerCase();
  const aliases = {
    change_log: "log",
    ceo_brief: "ceo_brief",
    pm_action_plan: "pm_action_plan",
    raw_evidence_index: "raw_evidence_index",
    business_flow: "business_flow",
    customer_followup: "customer_followup",
  };
  return aliases[normalized] || normalized;
}

async function appendMarkdownSection(path, title, lines = [], options = {}) {
  if (!path) return "";
  const now = options.timestamp || new Date().toISOString();
  const source = options.source || "wiki integration";
  const fileName = basename(path);
  await mkdir(dirname(path), { recursive: true });
  const current = await readFile(path, "utf-8").catch(() => "");
  const heading = current.trim() ? "" : [
    "---",
    `type: ${defaultTypeForMarkdownFile(fileName)}`,
    `created: ${now.slice(0, 10)}`,
    `updated: ${now.slice(0, 10)}`,
    `source: "${source}"`,
    "---",
    "",
    `# ${defaultMarkdownTitle(fileName)}`,
    "",
  ].join("\n");
  const content = [
    heading,
    `${current.trim() ? "\n" : ""}## ${title}`,
    ...lines.filter(Boolean),
    "",
  ].join("\n");
  await writeFile(path, `${current}${content}`, "utf-8");
  return relative(repoRoot, path);
}

function normalizeAuditRelativePath(path = "") {
  if (!path) return "";
  const normalized = String(path || "").replace(/\\/g, "/");
  return isAbsolute(normalized) ? relative(repoRoot, normalized).replace(/\\/g, "/") : normalized.replace(/^\/+/, "");
}

async function captureAuditBefore(paths = []) {
  const entries = await Promise.all(
    [...new Set(paths.map(normalizeAuditRelativePath).filter(Boolean))].map(async (path) => {
      const before = await readFile(resolve(repoRoot, path), "utf-8").catch(() => "");
      return [path, before];
    }),
  );
  return Object.fromEntries(entries);
}

function auditPreviewText(markdown = "", maxChars = 180) {
  const lines = String(markdown || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const sample = lines.slice(-4).join(" ");
  return sample.length > maxChars ? `${sample.slice(0, maxChars)}...` : sample;
}

async function buildAuditDiffs(paths = [], beforeMap = {}) {
  const diffs = [];
  for (const path of [...new Set(paths.map(normalizeAuditRelativePath).filter(Boolean))]) {
    const before = String(beforeMap[path] || "");
    const after = await readFile(resolve(repoRoot, path), "utf-8").catch(() => "");
    const changeType = !before && after
      ? "created"
      : before && !after
        ? "deleted"
        : before !== after
          ? "updated"
          : "unchanged";
    diffs.push({
      path,
      changeType,
      beforeChars: before.length,
      afterChars: after.length,
      beforePreview: auditPreviewText(before),
      afterPreview: auditPreviewText(after),
    });
  }
  return diffs.filter((item) => item.changeType !== "unchanged");
}

function predictedDecisionAuditPaths(item = {}, target = {}, workspaceId = "rtm", body = {}) {
  const paths = new Set();
  if (isDeletionDecisionItem(item) && item.path) paths.add(normalizeAuditRelativePath(item.path));
  if (target?.targetPath && target.targetFile !== "DELETE") paths.add(normalizeAuditRelativePath(target.targetPath));
  if (isWikiIntegrationDecisionItem(item)) {
    const candidate = item.original || {};
    const predicted = integrationChangeTargets(candidate, workspaceId, {
      strategyOverride: body.overrideStrategy,
      overrideProjectKey: body.overrideProjectKey,
      overrideProjectLabel: body.overrideProjectLabel || body.overrideProjectName,
      overrideProjectName: body.overrideProjectName || body.overrideProjectLabel,
    });
    for (const path of predicted) paths.add(normalizeAuditRelativePath(path));
  } else if (target?.projectKey) {
    const projectDir = projectDirForKey(target.projectKey, workspaceId);
    paths.add(normalizeAuditRelativePath(join(projectDir, "Status.md")));
    paths.add(normalizeAuditRelativePath(join(projectDir, "Change_Log.md")));
  }
  return [...paths].filter(Boolean);
}

function normalizeIntegrationName(value = "") {
  return String(value || "")
    .replace(/^Slack[_ -]*/i, "")
    .replace(/_(Project|Account)$/i, "")
    .replace(/\b(Project|Account)\b/gi, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/[_/.-]+/g, " ")
    .replace(/[()[\],]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const integrationNameStopwords = new Set([
  "slack",
  "project",
  "account",
  "wiki",
  "rtm",
  "common",
  "hub",
  "status",
  "evidence",
  "sources",
  "log",
  "change",
  "conflict",
  "decision",
  "customer",
  "followup",
  "business",
  "flow",
  "ceo",
  "brief",
  "pm",
  "action",
  "plan",
  "raw",
  "index",
  "sheet",
  "scan",
  "search",
  "title",
  "mission",
  "our",
  "demo",
  "file",
  "document",
  "docs",
  "data",
  "po",
  "poc",
  "ai",
  "aivoucher",
  "rnd",
  "research",
  "development",
  "voucher",
  "drive",
  "evidence",
  "원문",
  "문서",
  "프로젝트",
  "계정",
  "과제",
  "운영",
  "후속",
  "내부공유용",
]);

function isMeaningfulIntegrationToken(token = "") {
  const value = String(token || "").trim().toLowerCase();
  if (!value) return false;
  if (integrationNameStopwords.has(value)) return false;
  if (/^20\d{2}$/.test(value)) return false;
  if (/^\d+$/.test(value)) return false;
  if (/^[a-z]+\d+$/i.test(value) && value.length <= 6) return false;
  if (/^[a-z0-9]+$/.test(value) && value.length < 3) return false;
  return true;
}

function integrationNameTokenSet(value = "") {
  const normalized = normalizeIntegrationName(value);
  const tokens = String(normalized || "")
    .split(/\s+/)
    .map((item) => item.trim().toLowerCase())
    .filter(isMeaningfulIntegrationToken);
  return new Set([
    ...[...wikiMergeTokenSet(normalized)].filter(isMeaningfulIntegrationToken),
    ...tokens,
  ]);
}

function overlapList(left = [], right = []) {
  const set = new Set(right);
  return [...new Set(left.filter((item) => set.has(item)))];
}

function inferredIntegrationKinds(text = "", record = {}) {
  const kinds = new Set();
  if (record.division === "account") kinds.add("customer_account");
  if (record.hubPath) kinds.add("project_hub");
  if (record.isSlack) kinds.add("slack_ingest");
  if (record.hasRawEvidence) kinds.add("evidence_raw");
  if (record.hasDecisionSignals || record.hasConflict) kinds.add("decision_conflict");
  if (record.hasCeoPm) kinds.add("ceo_pm");
  const haystack = `${record.projectKey || ""} ${record.projectLabel || ""} ${text}`.toLowerCase();
  for (const [kind, patterns] of Object.entries(wikiIntegrationKeywordCatalog)) {
    if (patterns.some((pattern) => pattern.test(haystack))) kinds.add(kind);
  }
  return [...kinds];
}

function integrationDocPath(record = {}, fileName = "", workspaceId = "rtm") {
  if (!record?.projectKey) return "";
  if (record.division === "common" || record.division === "shared") {
    return record.hubPath || record.pagePaths?.find((path) => path.endsWith(`/${fileName}`)) || record.pagePaths?.[0] || "";
  }
  return relative(repoRoot, join(projectDirForKey(record.projectKey, workspaceId), fileName));
}

function integrationStrategyLabel(strategy = "") {
  return {
    link_only: "상호 링크 추가 검토",
    promote_to_new_project: "새 canonical project 승격",
    promote_to_common: "Common 운영 지식 승격",
    promote_to_shared: "Shared 재사용 자산 승격",
    keep_separate_project: "별도 project 유지",
    account_rollup: "Account rollup 검토",
    hold_for_review: "추가 검토 보류",
    decision_merge: "Decision Queue 검토",
    evidence_index_merge: "Raw evidence 인덱스 연동 검토",
    status_rollup: "상태 집계 검토",
    do_not_merge: "병합 금지 판단 검토",
  }[strategy] || "통합 검토";
}

function canonicalCommonHubPath(workspaceId = "rtm") {
  const workspace = wikiWorkspace(workspaceId);
  return relative(repoRoot, join(workspace.wikiRoot, "Common", "hub.md"));
}

function canonicalSharedHubPath(workspaceId = "rtm") {
  const workspace = wikiWorkspace(workspaceId);
  return relative(repoRoot, join(workspace.wikiRoot, "Shared", "hub.md"));
}

function promotedProjectDocPaths(projectKey, workspaceId = "rtm") {
  const workspace = wikiWorkspace(workspaceId);
  const projectDir = projectDirForKey(projectKey, workspaceId);
  return {
    projectDir,
    hubPath: relative(repoRoot, join(projectDir, "hub.md")),
    statusPath: relative(repoRoot, join(projectDir, "Status.md")),
    referencePath: relative(repoRoot, join(projectDir, "Reference_Register.md")),
    overviewPath: relative(repoRoot, join(projectDir, "Project_Overview.md")),
    changeLogPath: relative(repoRoot, join(projectDir, "Change_Log.md")),
    l1Path: relative(repoRoot, join(workspace.l1Root, `${projectKey}.md`)),
  };
}

function planPromotedProject(candidate = {}, resolved = {}, workspaceId = "rtm") {
  const rawName = firstNonEmpty(
    resolved.overrideProjectLabel,
    resolved.overrideProjectName,
    candidate.groupKey,
    resolved.projectLabel,
    "Promoted Project",
  );
  const projectName = String(rawName || "Promoted Project")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const relatedKeys = new Set((candidate.relatedWikis || []).map((item) => item.projectKey).filter(Boolean));
  const explicitKey = firstNonEmpty(resolved.overrideProjectKey, `${titleCaseSlug(projectName)}_Project`);
  const baseKey = String(explicitKey || "Promoted_Project")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^_+|_+$/g, "");
  let projectKey = baseKey.endsWith("_Project") ? baseKey : `${baseKey}_Project`;
  let suffix = 2;
  while (relatedKeys.has(projectKey) || existsSync(projectDirForKey(projectKey, workspaceId))) {
    const stem = projectKey.replace(/_Project$/i, "");
    projectKey = `${stem}_${suffix}_Project`;
    suffix += 1;
  }
  return {
    projectKey,
    projectName,
    ...promotedProjectDocPaths(projectKey, workspaceId),
  };
}

function integrationChangeTargets(candidate = {}, workspaceId = "rtm", options = {}) {
  const related = Array.isArray(candidate.relatedWikis) ? candidate.relatedWikis : [];
  const strategy = options.strategyOverride || candidate.recommendedStrategy || "link_only";
  const account = related.find((item) => item.division === "account") || null;
  const common = related.find((item) => item.division === "common") || null;
  const shared = related.find((item) => item.division === "shared") || null;
  const paths = new Set();
  if (strategy === "promote_to_new_project") {
    const promoted = planPromotedProject(candidate, options, workspaceId);
    paths.add(promoted.hubPath);
    paths.add(promoted.statusPath);
    paths.add(promoted.referencePath);
    paths.add(promoted.overviewPath);
    paths.add(promoted.changeLogPath);
    paths.add(promoted.l1Path);
    if (account) paths.add(integrationDocPath(account, "hub.md", workspaceId));
  } else if (strategy === "promote_to_common") {
    paths.add(common ? integrationDocPath(common, "hub.md", workspaceId) : canonicalCommonHubPath(workspaceId));
    for (const item of related.filter((entry) => entry.division !== "common")) {
      paths.add(integrationDocPath(item, "Change_Log.md", workspaceId));
    }
  } else if (strategy === "promote_to_shared") {
    paths.add(shared ? integrationDocPath(shared, "hub.md", workspaceId) : canonicalSharedHubPath(workspaceId));
    for (const item of related.filter((entry) => entry.division !== "shared")) {
      paths.add(integrationDocPath(item, "Change_Log.md", workspaceId));
    }
  } else if (strategy === "account_rollup" && account) {
    paths.add(integrationDocPath(account, "hub.md", workspaceId));
    for (const item of related.filter((entry) => entry.projectKey !== account.projectKey && entry.division === "project")) {
      paths.add(integrationDocPath(item, "Status.md", workspaceId));
      paths.add(integrationDocPath(item, "Change_Log.md", workspaceId));
    }
  } else if (strategy === "hold_for_review") {
    for (const item of related.filter((entry) => entry.division !== "common" && entry.division !== "shared")) {
      paths.add(integrationDocPath(item, "Action_Items.md", workspaceId));
      paths.add(integrationDocPath(item, "Change_Log.md", workspaceId));
    }
  } else if (strategy === "keep_separate_project") {
    for (const item of related.filter((entry) => entry.division !== "common")) {
      paths.add(integrationDocPath(item, "Change_Log.md", workspaceId));
      paths.add(integrationDocPath(item, "Status.md", workspaceId));
    }
  } else if (strategy === "decision_merge") {
    for (const item of related) {
      paths.add(integrationDocPath(item, "Conflict_Register.md", workspaceId));
      paths.add(integrationDocPath(item, "Change_Log.md", workspaceId));
    }
  } else if (strategy === "evidence_index_merge") {
    const target = account || related[0];
    if (target) {
      paths.add(integrationDocPath(target, "Raw_Evidence_Index.md", workspaceId));
      paths.add(integrationDocPath(target, "Change_Log.md", workspaceId));
    }
  } else if (strategy === "status_rollup") {
    const target = account || related[0];
    if (target) paths.add(integrationDocPath(target, "hub.md", workspaceId));
    for (const item of related.filter((entry) => entry.division !== "common")) {
      paths.add(integrationDocPath(item, "Status.md", workspaceId));
      paths.add(integrationDocPath(item, "Change_Log.md", workspaceId));
    }
  } else if (strategy === "do_not_merge") {
    for (const item of related) paths.add(integrationDocPath(item, "Change_Log.md", workspaceId));
  } else {
    for (const item of related) {
      paths.add(integrationDocPath(item, "hub.md", workspaceId));
      paths.add(integrationDocPath(item, "Change_Log.md", workspaceId));
    }
  }
  return [...paths].filter(Boolean);
}

function integrationPreview(candidate = {}) {
  const strategy = candidate.recommendedStrategy || "link_only";
  const groupKey = candidate.groupKey || "integration";
  const actionLabel = integrationStrategyLabel(strategy);
  const memo = changeEventMemo({
    source: "wiki_integration_scan",
    change: `${groupKey} 통합 후보`,
    action: actionLabel,
    status: "기록",
  });
  const steps = {
    link_only: ["각 허브 운영 링크에 상호 링크 추가", "Change_Log에 연결 근거 기록"],
    promote_to_new_project: ["새 canonical project space 생성", "hub/Status/Reference_Register/Project_Overview/Change_Log/L1_memory 초기화", "기존 intake 위키와 account hub에 promotion provenance 링크 append"],
    promote_to_common: ["Common hub 또는 기존 common page에 운영 지식 승격", "기존 intake 위키에는 provenance/Change_Log만 남김"],
    promote_to_shared: ["Shared hub 또는 기존 shared asset에 재사용 자산 승격", "원 프로젝트에는 promotion provenance link만 남김"],
    keep_separate_project: ["각 project를 그대로 유지", "Change_Log/Status에 별도 유지 판단과 재검토 조건 기록"],
    account_rollup: ["Account hub에 상태/다음 접점 rollup 추가", "하위 프로젝트 Status/Change_Log에 rollup 반영 메모 append"],
    hold_for_review: ["즉시 병합하지 않고 재판정 조건을 Action_Items에 기록", "Change_Log/audit에 hold 이유를 남김"],
    decision_merge: ["Conflict_Register에 검토 메모와 링크 추가", "실제 병합 없이 승인 게이트만 유지"],
    evidence_index_merge: ["상위 Raw_Evidence_Index에 원문 위치 링크만 추가", "원문 파일과 기존 문서는 그대로 유지"],
    status_rollup: ["상위 hub에 상태 집계 메모 추가", "관련 프로젝트 Status/Change_Log에 집계 흔적 append"],
    do_not_merge: ["병합 금지 판단만 Change_Log/audit에 기록", "원문/허브 구조는 변경하지 않음"],
  }[strategy] || ["관련 허브를 링크로 연결", "승인 이력만 남김"];
  return {
    summary: `${groupKey} 관련 위키 ${candidate.relatedWikis?.length || 0}개를 ${strategy} 전략으로 검토`,
    changeMemo: memo,
    steps,
  };
}

function isWikiIntegrationDecisionItem(item = {}) {
  return item.kind === "wiki_integration" || item.sourceType === "wiki_integration_scan";
}

async function appendOperationalChangeEventFromDecision(resolved = {}, target = {}, options = {}) {
  const action = options.action || resolved.resolvedAction || "";
  if (!["approve", "edit_approve"].includes(action)) return [];
  const projectKey = resolved.projectKey || target.projectKey || "";
  if (!projectKey) return [];
  const workspaceId = resolved.workspace || options.workspace || "rtm";
  if (projectKey === "Common" || projectKey === "L1_memory") return [];
  const now = options.timestamp || new Date().toISOString();
  const projectDir = projectDirForKey(projectKey, workspaceId);
  const source = resolved.sourceType || "decision_queue";
  const original = resolved.original || {};
  const originalPlan = original.mergePlan || {};
  const memo = originalPlan.changeMemo || changeEventMemo({
    timestamp: now,
    source,
    change: resolved.title || resolved.kind || "Decision Queue 승인",
    action: resolved.note || "운영 문서 반영",
  });
  const files = [
    {
      fileName: "Status.md",
      title: "상태 변화 메모",
      lines: [
        `- ${memo}`,
        `  - Decision: ${resolved.title || resolved.id}`,
        `  - 처리: ${action}`,
        resolved.path ? `  - 근거: ${resolved.path}` : "",
        original.primary?.path ? `  - Primary: ${original.primary.path}` : "",
        original.secondary?.path ? `  - Secondary: ${original.secondary.path}` : "",
        resolved.note ? `  - 메모: ${resolved.note}` : "",
      ],
    },
    {
      fileName: "Change_Log.md",
      title: "Decision Queue 운영 변화",
      lines: [
        `- 일시: ${now}`,
        `- 변화 메모: ${memo}`,
        `- 원천: ${source}`,
        `- Decision ID: ${resolved.id || ""}`,
        `- 처리: ${action}`,
        resolved.path ? `- 근거 경로: ${resolved.path}` : "",
        original.primary?.path ? `- Primary: ${original.primary.path}` : "",
        original.secondary?.path ? `- Secondary: ${original.secondary.path}` : "",
      ],
    },
  ];
  const changed = [];
  for (const file of files) {
    const path = join(projectDir, file.fileName);
    await mkdir(dirname(path), { recursive: true });
    const current = await readFile(path, "utf-8").catch(() => "");
    const heading = current.trim() ? "" : `---\ntype: ${file.fileName.replace(/\.md$/, "").toLowerCase()}\ncreated: ${now.slice(0, 10)}\nupdated: ${now.slice(0, 10)}\nsource: "decision queue operational event"\n---\n\n# ${file.fileName.replace(/_/g, " ").replace(/\.md$/, "")}\n\n`;
    const block = [
      heading,
      `\n## ${file.title} - ${now}`,
      ...file.lines.filter(Boolean),
      "",
    ].join("\n");
    await writeFile(path, `${current}${block}`, "utf-8");
    changed.push(relative(repoRoot, path));
  }
  return changed;
}

async function wikiMergeCandidateScan(workspaceId = "rtm", options = {}) {
  const limit = Math.min(Number(options.limit || 24), 80);
  const pages = (await wikiIndex(workspaceId))
    .filter(isWikiMergeEligiblePage)
    .slice(0, 520);
  const graph = await wikiGraph().catch(() => ({ nodes: [], edges: [] }));
  const adjacency = new Map();
  for (const edge of graph.edges || []) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  }
  const records = [];
  for (const page of pages) {
    const markdown = await readFile(resolve(repoRoot, page.path), "utf-8").catch(() => "");
    const keyLines = extractMeaningfulLines(markdown, page.projectLabel || page.title, contextBudget("economy")).slice(0, 8);
    const keywordText = [
      page.title,
      page.path,
      page.projectKey,
      page.projectLabel,
      page.docKind,
      page.division,
      ...(page.workflowTags || []),
      page.workflowNote || "",
      keyLines.join(" "),
      extractPatternLines(markdown, /\d{4}-\d{1,2}-\d{1,2}|\d+\.?\d*\s*(%|억|만|천|원|개|건|회|분|초|시간)|고객|미팅|제안|계약|PoC|리스크|결정|충돌|불일치/i, 8).join(" "),
    ].join(" ");
    records.push({
      page,
      keyLines,
      tokens: wikiMergeTokenSet(keywordText),
      hasConflictSignal: /충돌|불일치|상이|상충|미확정|버전 차이|값 차이|수치 차이|일정 차이/i.test(markdown),
    });
  }

  const candidates = [];
  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      const left = records[i];
      const right = records[j];
      if (left.page.path === right.page.path) continue;
      const tokenScore = tokenOverlapRatio(left.tokens, right.tokens);
      const graphLinked = adjacency.get(left.page.path)?.has(right.page.path) || adjacency.get(right.page.path)?.has(left.page.path);
      const sameProject = left.page.projectKey && left.page.projectKey === right.page.projectKey;
      const sameKind = left.page.docKind && left.page.docKind === right.page.docKind;
      const titleScore = tokenOverlapRatio(wikiMergeTokenSet(left.page.title), wikiMergeTokenSet(right.page.title));
      const score = tokenScore * 70 + titleScore * 18 + (graphLinked ? 18 : 0) + (sameProject ? 10 : 0) + (sameKind ? 6 : 0);
      if (score < 22) continue;
      const conflictRisk = left.hasConflictSignal || right.hasConflictSignal || left.page.docKind === "conflict" || right.page.docKind === "conflict";
      const primary = (left.page.docKind === "hub" || left.page.size >= right.page.size) ? left : right;
      const secondary = primary === left ? right : left;
      const id = `merge-${Buffer.from(`${left.page.path}|${right.page.path}`).toString("base64url").slice(0, 32)}`;
      candidates.push({
        id,
        score: Math.round(score),
        similarity: Number(tokenScore.toFixed(3)),
        graphLinked: Boolean(graphLinked),
        conflictRisk,
        strategy: conflictRisk ? "conflict_register_then_manual_merge" : sameProject ? "append_secondary_into_primary" : "link_or_promote_under_project_hub",
        reason: [
          tokenScore >= 0.18 ? "태그/키워드 유사도 높음" : "",
          titleScore >= 0.2 ? "제목 토큰 유사" : "",
          graphLinked ? "그래프맵 직접 연결" : "",
          sameProject ? "동일 프로젝트 범위" : "",
          sameKind ? "동일 문서 유형" : "",
          conflictRisk ? "충돌/불일치 신호 포함" : "",
        ].filter(Boolean),
        primary: {
          title: primary.page.title,
          path: primary.page.path,
          projectKey: primary.page.projectKey,
          projectLabel: primary.page.projectLabel,
          docKind: primary.page.docKind,
          keyLines: primary.keyLines.slice(0, 4),
        },
        secondary: {
          title: secondary.page.title,
          path: secondary.page.path,
          projectKey: secondary.page.projectKey,
          projectLabel: secondary.page.projectLabel,
          docKind: secondary.page.docKind,
          keyLines: secondary.keyLines.slice(0, 4),
        },
        mergePlan: {
          targetPath: conflictRisk ? decisionTargetPathFromContext({ path: primary.page.path, projectKey: primary.page.projectKey }, workspaceId).targetPath ? relative(repoRoot, decisionTargetPathFromContext({ path: primary.page.path, projectKey: primary.page.projectKey }, workspaceId).targetPath) : primary.page.path : primary.page.path,
          steps: conflictRisk
            ? ["원문/수치/일정 차이를 Conflict_Register에 먼저 보존", "GLM 병합안 생성", "사용자 승인 후 Status/Decisions/Hub에 반영"]
            : ["Secondary 문서의 원문 위치를 Raw_Evidence_Index에 연결", "중복되는 요약은 primary 문서에 링크로 정리", "상태 변화 메모를 Status/Change_Log에 append"],
          changeMemo: changeEventMemo({
            source: "similarity+graph merge scan",
            change: `${primary.page.title} / ${secondary.page.title} 병합 후보`,
            action: conflictRisk ? "Conflict_Register 검토" : "프로젝트 허브 연결",
          }),
        },
      });
    }
  }

  const deduped = [...new Map(candidates
    .sort((a, b) => b.score - a.score || Number(b.conflictRisk) - Number(a.conflictRisk))
    .map((item) => [item.id, item])).values()]
    .slice(0, limit);
  return {
    generatedAt: new Date().toISOString(),
    workspace: workspaceId,
    strategy: "tags_keywords_graph_similarity",
    summary: {
      scannedPages: records.length,
      candidates: deduped.length,
      conflictRisk: deduped.filter((item) => item.conflictRisk).length,
    },
    candidates: deduped,
  };
}

async function enqueueMergeCandidate(candidate = {}, workspaceId = "rtm") {
  if (!candidate?.id) throw new Error("candidate is required");
  const projectKey = candidate.primary?.projectKey || candidate.secondary?.projectKey || "";
  const projectLabel = candidate.primary?.projectLabel || candidate.secondary?.projectLabel || projectKey;
  const item = await enqueueDecisionQueueItem({
    id: `similarity-${candidate.id}`,
    workspace: workspaceId,
    sourceType: "similarity_graph_merge_scan",
    kind: candidate.conflictRisk ? "conflict_merge" : "similarity_merge",
    title: `병합 전략 검토: ${candidate.primary?.title || "primary"} ↔ ${candidate.secondary?.title || "secondary"}`,
    projectKey,
    projectLabel,
    path: candidate.primary?.path || candidate.secondary?.path || "",
    content: [
      `전략: ${candidate.strategy || ""}`,
      `점수: ${candidate.score || 0}`,
      `Primary: ${candidate.primary?.path || ""}`,
      `Secondary: ${candidate.secondary?.path || ""}`,
      `사유: ${(candidate.reason || []).join(", ")}`,
      `변화 메모: ${candidate.mergePlan?.changeMemo || ""}`,
      "",
      "사용자 액션 후보:",
      "- 보류: 아직 병합하지 않음",
      "- 추가 조사: 원문/수치/일정 확인",
      "- 승인 반영: Conflict_Register 또는 대상 문서에 append",
    ].join("\n"),
    original: candidate,
  });
  return item;
}

function isWikiIntegrationEligiblePage(page = {}) {
  if (!page || !page.statusManaged) return false;
  if (!["project", "account", "common", "shared"].includes(page.division || "")) return false;
  if (["hidden", "archived", "completed"].includes(String(page.workflowStatus || "").toLowerCase())) return false;
  if (["common", "shared"].includes(page.division || "")) {
    return ["hub", "knowledge", "overview", "evidence", "raw_evidence", "decisions", "risks"].includes(page.docKind || "");
  }
  return true;
}

const canonicalOperationalDocKinds = new Set([
  "hub",
  "overview",
  "sources",
  "evidence",
  "status",
  "business_flow",
  "ceo_brief",
  "pm_action",
  "customer_followup",
  "raw_evidence",
  "conflict",
  "actions",
  "decisions",
  "risks",
  "changelog",
]);

function isWikiMergeEligiblePage(page = {}) {
  if (!isWikiIntegrationEligiblePage(page)) return false;
  return canonicalOperationalDocKinds.has(page.docKind || "");
}

function isDecisionQueueEligibleItem(item = {}) {
  const sourceType = String(item.sourceType || "");
  const projectKey = String(item.projectKey || "");
  const path = String(item.path || "");
  if (!["similarity_graph_merge_scan", "wiki_integration_scan"].includes(sourceType)) return true;
  if (projectKey === "L1_memory") return false;
  if (/obsidian\/L1_memory\//i.test(path)) return false;
  return true;
}

function integrationRecordKey(page = {}) {
  if (!page || !page.path) return String(page.projectKey || "");
  if (["common", "shared"].includes(page.division || "")) {
    return `${page.division}:${page.path.replace(/\.md$/i, "")}`;
  }
  return String(page.projectKey || "");
}

function integrationRecordLabel(page = {}) {
  if (!page) return "";
  if (["common", "shared"].includes(page.division || "")) {
    return String(page.title || documentTitle(page)).replace(/\.md$/i, "").trim();
  }
  return String(page.projectLabel || page.projectKey || "");
}

async function wikiIntegrationSpaceRecords(workspaceId = "rtm") {
  const workspace = await ensureWikiWorkspace(workspaceId);
  const pages = await wikiIndex(workspaceId);
  const records = new Map();
  const relevantPages = pages.filter(isWikiIntegrationEligiblePage);
  for (const page of relevantPages) {
    const key = integrationRecordKey(page);
    if (!records.has(key)) {
      records.set(key, {
        projectKey: key,
        canonicalProjectKey: page.projectKey,
        projectLabel: integrationRecordLabel(page),
        division: page.division,
        hubPath: "",
        pagePaths: [],
        workflowStatus: page.workflowStatus || "",
        workflowStatusLabel: page.workflowStatusLabel || "",
        workflowTags: new Set(page.workflowTags || []),
      });
    }
    const record = records.get(key);
    record.pagePaths.push(page.path);
    if ((page.docKind === "hub" || ["common", "shared"].includes(page.division || "")) && !record.hubPath) record.hubPath = page.path;
    for (const tag of page.workflowTags || []) record.workflowTags.add(tag);
  }

  const result = [];
  for (const record of records.values()) {
    const bundle = ["project", "account"].includes(record.division)
      ? await projectMarkdownBundle(record.canonicalProjectKey || record.projectKey, workspaceId).catch(() => ({}))
      : {};
    const pageBodies = ["common", "shared"].includes(record.division)
      ? await Promise.all(record.pagePaths.slice(0, 8).map((path) => readFile(resolve(repoRoot, path), "utf-8").catch(() => "")))
      : [];
    const combined = ["project", "account"].includes(record.division)
      ? [
          bundle["hub.md"] || "",
          bundle["Project_Overview.md"] || "",
          bundle["Evidence_Log.md"] || "",
          bundle["Sources.md"] || "",
          bundle["Status.md"] || "",
          bundle["Business_Flow.md"] || "",
          bundle["CEO_Brief.md"] || "",
          bundle["PM_Action_Plan.md"] || "",
          bundle["Customer_Followup.md"] || "",
          bundle["Raw_Evidence_Index.md"] || "",
          bundle["Conflict_Register.md"] || "",
          bundle["Decisions.md"] || "",
          bundle["Change_Log.md"] || "",
        ].join("\n")
      : pageBodies.join("\n");
    const keyLines = extractMeaningfulLines(combined, record.projectLabel, contextBudget("economy")).slice(0, 10);
    const statusMemos = extractPatternLines(
      ["project", "account"].includes(record.division) ? (bundle["Status.md"] || "") : combined,
      /상태\s*변화|현재\s*단계|다음\s*액션|수행\/대기|운영 보강/i,
      8,
    );
    const keywordHits = extractPatternLines(
      combined,
      /PoC|제안|계약|납품|검수|운영|유지보수|R&D|정출연|Slack|Drive|Evidence|원문|Conflict|Decision|후속|Account|확산|로드맵|Calibration|OES|SP-OES/i,
      18,
    ).slice(0, 12);
    const hasConflict = /충돌|불일치|상이|상충|값 차이|수치 차이|일정 차이|확인 필요/i.test(combined);
    const hasRawEvidence = Boolean(String(bundle["Raw_Evidence_Index.md"] || "").trim());
    const hasDecisionSignals = Boolean(String(bundle["Decisions.md"] || bundle["Conflict_Register.md"] || "").trim());
    const hasCeoPm = Boolean(String(bundle["CEO_Brief.md"] || bundle["PM_Action_Plan.md"] || "").trim());
    const signalText = [
      record.projectKey,
      record.projectLabel,
      ...record.workflowTags,
      keyLines.join(" "),
      keywordHits.join(" "),
    ].join(" ");
    const isSlack = /^Slack_/i.test(record.projectKey);
    const normalizedName = normalizeIntegrationName(record.projectLabel || record.projectKey);
    const nameTokens = integrationNameTokenSet(record.projectKey).size
      ? integrationNameTokenSet(record.projectKey)
      : integrationNameTokenSet(record.projectLabel);
    const tokens = new Set([...nameTokens, ...wikiMergeTokenSet(signalText)]);
    const kindSignals = inferredIntegrationKinds(signalText, {
      ...record,
      isSlack,
      hasRawEvidence,
      hasDecisionSignals,
      hasConflict,
      hasCeoPm,
    });
    result.push({
      ...record,
      workflowTags: [...record.workflowTags],
      normalizedName,
      nameTokens,
      tokens,
      keyLines,
      keywordHits,
      kindSignals,
      isSlack,
      hasConflict,
      hasRawEvidence,
      hasDecisionSignals,
      hasCeoPm,
      hasStatus: statusMemos.length > 0,
      latestStatusMemo: statusMemos[0] || "",
      summaryLine: keyLines[0] || statusMemos[0] || `${record.projectLabel} 연결 후보`,
      rawPath: ["project", "account"].includes(record.division) ? integrationDocPath({ ...record, projectKey: record.canonicalProjectKey || record.projectKey }, "Raw_Evidence_Index.md", workspaceId) : record.pagePaths[0],
      statusPath: ["project", "account"].includes(record.division) ? integrationDocPath({ ...record, projectKey: record.canonicalProjectKey || record.projectKey }, "Status.md", workspaceId) : record.pagePaths[0],
    });
  }
  return result;
}

function pairwiseIntegrationSimilarity(left = {}, right = {}) {
  const anchorOverlap = overlapList([...(left.nameTokens || [])], [...(right.nameTokens || [])]);
  const nameScore = tokenOverlapRatio(left.nameTokens, right.nameTokens);
  const tokenScore = tokenOverlapRatio(left.tokens, right.tokens);
  const exactName = Boolean(left.normalizedName && right.normalizedName
    && anchorOverlap.length > 0
    && (left.normalizedName === right.normalizedName
      || left.normalizedName.includes(right.normalizedName)
      || right.normalizedName.includes(left.normalizedName)));
  const accountProjectMatch = (
    (left.division === "account" && right.division === "project")
    || (left.division === "project" && right.division === "account")
  ) && (anchorOverlap.length > 0 || exactName);
  const slackBridge = (left.isSlack || right.isSlack) && (anchorOverlap.length > 0 || exactName);
  const sharedKinds = overlapList(left.kindSignals || [], right.kindSignals || []);
  const assetBridge = (
    ["common", "shared"].includes(left.division) || ["common", "shared"].includes(right.division)
  ) && (anchorOverlap.length > 0 || sharedKinds.length >= 2 || tokenScore >= 0.14);
  const score = nameScore * 52
    + tokenScore * 24
    + sharedKinds.length * 4
    + anchorOverlap.length * 18
    + (exactName ? 18 : 0)
    + (accountProjectMatch ? 14 : 0)
    + (assetBridge ? 12 : 0)
    + (slackBridge ? 8 : 0);
  const eligible = Boolean(
    exactName
    || accountProjectMatch
    || assetBridge
    || slackBridge
    || (anchorOverlap.length > 0 && (nameScore >= 0.14 || tokenScore >= 0.08 || sharedKinds.length >= 2))
  );
  return {
    eligible,
    exactName,
    accountProjectMatch,
    assetBridge,
    slackBridge,
    anchorOverlap,
    nameScore,
    tokenScore,
    sharedKinds,
    score: Math.round(score),
  };
}

function recommendedIntegrationStrategy(related = [], similarityScore = 0, conflictRisk = false) {
  const accountCount = related.filter((item) => item.division === "account").length;
  const projectCount = related.filter((item) => item.division === "project" && !item.isSlack).length;
  const slackCount = related.filter((item) => item.isSlack).length;
  const commonCount = related.filter((item) => item.division === "common").length;
  const sharedCount = related.filter((item) => item.division === "shared").length;
  const hasRaw = related.filter((item) => item.hasRawEvidence).length >= 2;
  const hasStatus = related.filter((item) => item.hasStatus).length >= 2;
  const hasDecisionSignals = related.some((item) => item.hasDecisionSignals);
  if (sharedCount && projectCount) return "promote_to_shared";
  if (commonCount && projectCount && !sharedCount) return "promote_to_common";
  if (sharedCount && !projectCount && !accountCount) return "promote_to_shared";
  if (commonCount && !accountCount && !projectCount && !slackCount) return "promote_to_common";
  if (conflictRisk && similarityScore < 0.16) return "do_not_merge";
  if (similarityScore < 0.09 && slackCount) return "hold_for_review";
  if (accountCount && projectCount >= 2) return "account_rollup";
  if (conflictRisk && hasDecisionSignals) return "decision_merge";
  if (hasRaw && (slackCount || related.some((item) => item.division === "common"))) return "evidence_index_merge";
  if (hasStatus && !slackCount) return "status_rollup";
  return "link_only";
}

function buildIntegrationCandidate(related = [], pairSignals = [], workspaceId = "rtm") {
  const sorted = [...related].sort((a, b) => a.projectKey.localeCompare(b.projectKey));
  const account = sorted.find((item) => item.division === "account") || null;
  const labelSource = account?.projectLabel || sorted[0]?.projectLabel || sorted[0]?.projectKey || "Integration";
  const groupKey = normalizeIntegrationName(labelSource).replace(/\s+/g, "_") || "Integration";
  const similarityScore = pairSignals.length
    ? Number((pairSignals.reduce((sum, item) => sum + item.tokenScore, 0) / pairSignals.length).toFixed(3))
    : 0;
  const conflictRisk = sorted.some((item) => item.hasConflict) || pairSignals.some((item) => item.sharedKinds.includes("decision_conflict"));
  const recommendedStrategy = recommendedIntegrationStrategy(sorted, similarityScore, conflictRisk);
  const reason = [
    account ? "Account와 연결 가능한 프로젝트 묶음" : "",
    sorted.some((item) => item.division === "common") ? "공통 운영 지식 후보 포함" : "",
    sorted.some((item) => item.division === "shared") ? "재사용 자산 후보 포함" : "",
    sorted.some((item) => item.isSlack) ? "Slack 수집형 위키 포함" : "",
    pairSignals.some((item) => item.exactName) ? "고객/주제 이름 정규화가 직접 일치" : "",
    pairSignals.some((item) => item.accountProjectMatch) ? "Account-Project 연결 신호가 확인됨" : "",
    pairSignals.some((item) => item.sharedKinds.length >= 2) ? "문서 성격 신호가 2개 이상 겹침" : "",
    similarityScore < 0.09 ? "유사도 신호가 약해 보류/재검토 가능성 있음" : "",
    conflictRisk ? "충돌/정합성 리스크가 있어 승인 게이트 필요" : "",
  ].filter(Boolean);
  const evidence = {
    keywords: [...new Set(sorted.flatMap((item) => item.keywordHits || []))].slice(0, 10),
    sourcePaths: [...new Set(sorted.flatMap((item) => item.pagePaths || []))].slice(0, 12),
    statusMemos: [...new Set(sorted.map((item) => item.latestStatusMemo).filter(Boolean))].slice(0, 6),
    keyLines: [...new Set(sorted.flatMap((item) => item.keyLines || []))].slice(0, 10),
  };
  const candidate = {
    id: `integration-${Buffer.from(sorted.map((item) => item.projectKey).join("|")).toString("base64url").slice(0, 36)}`,
    workspace: workspaceId,
    groupKey,
    relatedWikis: sorted.map((item) => ({
      projectKey: item.projectKey,
      projectLabel: item.projectLabel,
      division: item.division,
      hubPath: item.hubPath || integrationDocPath(item, "hub.md", workspaceId),
      pagePaths: item.pagePaths.slice(0, 8),
      summary: item.summaryLine,
      latestStatusMemo: item.latestStatusMemo,
      isSlack: item.isSlack,
      kinds: item.kindSignals,
    })),
    workspaceKinds: [...new Set(sorted.flatMap((item) => item.kindSignals || []))],
    evidence,
    similarityScore,
    conflictRisk,
    recommendedStrategy,
    changeTargets: [],
    reason,
    preview: null,
    generatedAt: new Date().toISOString(),
  };
  candidate.changeTargets = integrationChangeTargets(candidate, workspaceId);
  candidate.preview = integrationPreview(candidate);
  return candidate;
}

async function wikiIntegrationCandidateScan(workspaceId = "rtm", options = {}) {
  const limit = Math.min(Number(options.limit || 20), 80);
  const records = await wikiIntegrationSpaceRecords(workspaceId);
  const baseRecords = records.filter((record) => ["project", "account"].includes(record.division));
  const assetRecords = records.filter((record) => ["common", "shared"].includes(record.division));
  const parent = new Map(baseRecords.map((record) => [record.projectKey, record.projectKey]));
  const find = (key) => {
    let current = parent.get(key) || key;
    while (parent.get(current) && parent.get(current) !== current) current = parent.get(current);
    return current;
  };
  const unite = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parent.set(rightRoot, leftRoot);
  };
  const pairMap = new Map();
  for (const record of baseRecords) parent.set(record.projectKey, record.projectKey);
  for (let i = 0; i < baseRecords.length; i += 1) {
    for (let j = i + 1; j < baseRecords.length; j += 1) {
      const left = baseRecords[i];
      const right = baseRecords[j];
      const similarity = pairwiseIntegrationSimilarity(left, right);
      if (!similarity.eligible) continue;
      unite(left.projectKey, right.projectKey);
      pairMap.set([left.projectKey, right.projectKey].sort().join("::"), similarity);
    }
  }
  const groups = new Map();
  for (const record of baseRecords) {
    const root = find(record.projectKey);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(record);
  }
  const candidates = [];
  for (const related of groups.values()) {
    if (related.length < 2) continue;
    const pairs = [];
    for (let i = 0; i < related.length; i += 1) {
      for (let j = i + 1; j < related.length; j += 1) {
        const key = [related[i].projectKey, related[j].projectKey].sort().join("::");
        if (pairMap.has(key)) pairs.push(pairMap.get(key));
      }
    }
    candidates.push(buildIntegrationCandidate(related, pairs, workspaceId));
  }
  for (const asset of assetRecords) {
    const relatedPairs = baseRecords
      .map((record) => ({ record, similarity: pairwiseIntegrationSimilarity(asset, record) }))
      .filter(({ similarity }) => similarity.eligible && (
        similarity.exactName
        || similarity.anchorOverlap.length > 0
        || (similarity.tokenScore >= 0.22 && similarity.sharedKinds.length >= 2)
      ))
      .sort((left, right) => right.similarity.score - left.similarity.score)
      .slice(0, 3);
    if (!relatedPairs.length) continue;
    candidates.push(buildIntegrationCandidate(
      [asset, ...relatedPairs.map((item) => item.record)],
      relatedPairs.map((item) => item.similarity),
      workspaceId,
    ));
  }
  const deduped = [...new Map(candidates
    .sort((a, b) => Number(b.conflictRisk) - Number(a.conflictRisk)
      || b.relatedWikis.length - a.relatedWikis.length
      || b.similarityScore - a.similarityScore
      || a.groupKey.localeCompare(b.groupKey))
    .map((candidate) => [candidate.id, candidate])).values()]
    .slice(0, limit);
  return {
    generatedAt: new Date().toISOString(),
    workspace: workspaceId,
    strategy: "workspace_kind_grouping",
    summary: {
      scannedSpaces: records.length,
      candidates: deduped.length,
      conflictRisk: deduped.filter((item) => item.conflictRisk).length,
      accountRollups: deduped.filter((item) => item.recommendedStrategy === "account_rollup").length,
    },
    candidates: deduped,
  };
}

async function enqueueWikiIntegrationCandidate(candidate = {}, workspaceId = "rtm") {
  if (!candidate?.id) throw new Error("candidate is required");
  const relatedLabels = (candidate.relatedWikis || [])
    .map((item) => item.projectLabel || item.projectKey)
    .filter(Boolean);
  const projectKey = candidate.relatedWikis?.find((item) => item.division === "account")?.projectKey
    || candidate.relatedWikis?.[0]?.projectKey
    || "";
  const projectLabel = candidate.relatedWikis?.find((item) => item.division === "account")?.projectLabel
    || candidate.relatedWikis?.[0]?.projectLabel
    || projectKey;
  return enqueueDecisionQueueItem({
    id: `wiki-integration-${candidate.id}`,
    workspace: workspaceId,
    sourceType: "wiki_integration_scan",
    kind: "wiki_integration",
    title: `위키 통합 전략 검토: ${candidate.groupKey || "integration"}`,
    projectKey,
    projectLabel,
    path: candidate.changeTargets?.[0] || candidate.relatedWikis?.[0]?.hubPath || "",
    content: [
      `추천 전략: ${candidate.recommendedStrategy || "link_only"}`,
      `관련 위키: ${relatedLabels.join(", ")}`,
      `성격 추론: ${(candidate.workspaceKinds || []).join(", ")}`,
      `유사도: ${candidate.similarityScore ?? 0}`,
      `충돌 가능성: ${candidate.conflictRisk ? "high" : "low"}`,
      `변경 대상: ${(candidate.changeTargets || []).join(", ")}`,
      `근거 키워드: ${(candidate.evidence?.keywords || []).join(", ")}`,
      `변화 메모: ${candidate.preview?.changeMemo || ""}`,
      "",
      "사용자 액션 후보:",
      "- 보류: 아직 통합하지 않음",
      "- 추가 조사: 원문/수치/일정/범위 확인",
      "- 승인 반영: 추천 전략에 맞는 링크/rollup/status/change_log만 append",
      "- 새 project 승격: 관련 위키를 새 canonical project로 생성하고 provenance 링크를 남김",
    ].join("\n"),
    original: candidate,
  });
}

function composeMarkdownDocument(type, title, source, bodyLines = [], createdAt = new Date().toISOString()) {
  return [
    "---",
    `type: ${type}`,
    `created: ${createdAt.slice(0, 10)}`,
    `updated: ${createdAt.slice(0, 10)}`,
    `source: "${source}"`,
    "---",
    "",
    ...bodyLines,
    "",
  ].join("\n");
}

function promotedProjectHubBody(projectName, projectKey, relatedLinks = [], accountLink = "", now = "", memo = "") {
  const evidenceLinks = relatedLinks.length
    ? relatedLinks
    : ["- 아직 연결된 intake 위키 없음"];
  return [
    `# ${projectName} Hub`,
    "",
    "## 운영 메모",
    `- 한줄 요약: ${projectName}를 새 canonical project로 승격했고, 분산 intake 위키를 이 허브 아래에서 통합 검토합니다.`,
    "- 진행 맥락: Slack/Drive/filesystem/지식주입 기반으로 흩어진 근거를 기존 위키에 억지로 합치지 않고 독립 실행 단위로 분리했습니다.",
    "- 실무 판단: 이 허브를 기준으로 상태, 근거, 결정, 리스크, 다음 액션을 갱신해야 합니다.",
    "- 다음 확인: 담당자, 산출물 경계, 일정, 고객 접점, 대표 근거 문서를 확인합니다.",
    "",
    "## 실행 현황판",
    "- 현재 상태: 신규 canonical project 승격 완료",
    "- 현재 단계: intake 통합 검토 후 초기 구조 생성",
    `- 마지막 의미 있는 갱신: ${now.slice(0, 10)} project promotion`,
    "- 현재 오너/대상: 확인 필요",
    "- 다음 액션: Status, Reference_Register, Project_Overview를 실제 근거로 보강",
    "",
    "## 현재 막힘 / 충돌",
    "- 확인 필요: 기존 intake 위키 중 어떤 것이 대표 근거인지 최종 확인 필요",
    "- 충돌 수치/주장: 아직 정리 전",
    "- 대기 중인 외부 입력: 고객/내부 범위 확인 필요",
    "",
    "## 다음 액션",
    "- [ ] 대표 근거 문서와 원문 경로 확정",
    "- [ ] 상태/오너/다음 게이트 갱신",
    "- [ ] Decisions에 canonical 판단 근거 보강",
    "",
    "## 최근 업데이트",
    "| 일시 | 추진내용 | 실무 의미 | 연결 증적 | 다음 액션 |",
    "| --- | --- | --- | --- | --- |",
    `| ${now.slice(0, 16).replace("T", " ")} | 새 canonical project 승격 | 분산 intake를 별도 운영 단위로 정리 | ${(evidenceLinks[0] || "-").replace(/^- /, "")} | 운영 문서 실내용 보강 |`,
    "",
    "## 운영 링크",
    `- [[Wiki/${projectKey}/Status]]`,
    `- [[Wiki/${projectKey}/Reference_Register]]`,
    `- [[Wiki/${projectKey}/Project_Overview]]`,
    `- [[Wiki/${projectKey}/Action_Items]]`,
    `- [[Wiki/${projectKey}/Risks]]`,
    `- [[Wiki/${projectKey}/Decisions]]`,
    `- [[Wiki/${projectKey}/Conflict_Register]]`,
    `- [[Wiki/${projectKey}/Change_Log]]`,
    accountLink ? `- 상위 Account: ${accountLink}` : "",
    "",
    "## 증적/근거 링크",
    ...evidenceLinks,
    memo ? `- 승격 메모: ${memo}` : "",
  ].filter(Boolean);
}

function promotedProjectSimpleBody(title, sections = []) {
  return [
    `# ${title}`,
    "",
    ...sections,
  ];
}

function promotedProjectDocumentContent(fileName, context = {}) {
  const { projectName, projectKey, relatedLinks = [], accountLink = "", now = "", memo = "", relatedPaths = [] } = context;
  if (fileName === "hub.md") return promotedProjectHubBody(projectName, projectKey, relatedLinks, accountLink, now, memo);
  if (["Status.md", "Business_Flow.md", "CEO_Brief.md", "PM_Action_Plan.md", "Customer_Followup.md", "Raw_Evidence_Index.md"].includes(fileName)) {
    const title = fileName.replace(/\.md$/, "").replace(/_/g, " ");
    return businessOpsDocScaffold(fileName, title, projectName, relatedLinks);
  }
  if (fileName === "Reference_Register.md") {
    return promotedProjectSimpleBody("Reference Register", [
      "## 운영 원칙",
      "- 이 문서는 새 canonical project 승격 시점의 대표 참조와 provenance를 기록합니다.",
      "",
      "## 핵심 참조",
      ...relatedPaths.map((path, index) => `### Reference ${String(index + 1).padStart(2, "0")}\n- 제목: 승격 전 관련 위키 ${index + 1}\n- 참조 유형: Local Wiki\n- URL:\n- fallback 파일명: ${basename(path)}\n- fallback 경로: ${path}\n- 재수집 식별자:\n- 설명 위치: [[Wiki/${projectKey}/Project_Overview]]\n- 관련 위키 문서: ${wikiLinkFromPath(path)}\n- 읽기 상태: 승격 시점 연결\n- 비고: canonical project promotion source`).flatMap((block) => String(block).split("\n")),
    ]);
  }
  if (fileName === "Project_Overview.md") {
    return promotedProjectSimpleBody("Project Overview", [
      "## 프로젝트 정의",
      `- 프로젝트명: ${projectName}`,
      "- 분류: 신규 canonical project 승격",
      "- 배경: 기존 space 편입보다 독립 운영 단위로 보는 편이 실무적으로 안전함",
      "",
      "## 연결된 intake 위키",
      ...relatedLinks,
      "",
      "## 초기 판단",
      `- ${memo || "분산 intake 위키를 별도 project로 정리"}`,
    ]);
  }
  if (fileName === "Sources.md") {
    return promotedProjectSimpleBody("Sources", [
      "## 운영 원칙",
      "- 원문 보존은 Reference_Register, Evidence_Log, Raw_Evidence_Index와 함께 유지합니다.",
      "",
      "## 승격 시점 source",
      ...relatedPaths.map((path) => `- 위키 경로: ${path}`),
    ]);
  }
  if (fileName === "Evidence_Log.md") {
    return promotedProjectSimpleBody("Evidence Log", [
      `## ${now.slice(0, 10)} / canonical project promotion`,
      "- Source: wiki integration decision",
      "- Topic: project promotion",
      "- Type: 결정",
      "- Original:",
      `  > ${memo || "기존 intake 묶음을 새 canonical project로 승격"}`,
      "- Interpretation:",
      "  - 기존 space로 억지 병합하지 않고 독립 운영 단위로 본다.",
      "- Linked Pages:",
      `  - [[Wiki/${projectKey}/Decisions]]`,
      `  - [[Wiki/${projectKey}/Change_Log]]`,
    ]);
  }
  if (fileName === "Action_Items.md") {
    return promotedProjectSimpleBody("Action Items", [
      "## Open",
      "- [ ] 대표 근거 문서 확정",
      "- [ ] 오너/단계/다음 게이트 반영",
      "- [ ] 고객/계약 경계 재확인",
      "",
      "## Waiting",
      "- [ ] 외부 확인 필요",
      "",
      "## Done",
      "- [x] canonical project 승격 스캐폴드 생성",
    ]);
  }
  if (fileName === "Risks.md") {
    return promotedProjectSimpleBody("Risks", [
      "## Open Risks",
      "- 리스크:",
      "  - 기존 intake 위키와의 경계가 다시 흐려질 수 있음",
      "- 영향:",
      "  - 대표 공간 혼선과 중복 업데이트 발생 가능",
      "- 대응:",
      "  - Decisions/Reference_Register/Status 기준으로 canonical space를 고정",
    ]);
  }
  if (fileName === "Decisions.md") {
    return promotedProjectSimpleBody("Decisions", [
      "## Canonical Space",
      `- 대표 공간: [[Wiki/${projectKey}/hub]]`,
      "- 현재 분류: project",
      "- 판정 유형: promote_to_new_project",
      `- 마지막 검토일: ${now.slice(0, 10)}`,
      "- 사용자 확정: 승인",
      "- LLM 권고: 검토 후보",
      "- 검토 이유: 기존 intake space 편입보다 별도 운영 단위가 더 안전함",
      "",
      "## Confirmed Decisions",
      `### ${now.slice(0, 10)} | 신규 canonical project 승격`,
      "- 결정:",
      `  - ${projectName}를 새 canonical project로 생성`,
      "- 연결 근거:",
      ...relatedLinks.map((line) => `  ${line}`),
      "- 후속 영향:",
      `  - [[Wiki/${projectKey}/Status]], [[Wiki/${projectKey}/Reference_Register]], [[Wiki/${projectKey}/Project_Overview]], [[Wiki/${projectKey}/Change_Log]] 갱신`,
    ]);
  }
  if (fileName === "Conflict_Register.md") {
    return promotedProjectSimpleBody("Conflict Register", [
      "## Open Conflicts",
      "- 현재 등록된 명시적 충돌 없음",
      "",
      "## 처리 원칙",
      "- 명시적 상충값만 등록",
      "- 범위/구조/승격 메모는 Decisions 또는 Change_Log로 이동",
    ]);
  }
  if (fileName === "Change_Log.md") {
    return promotedProjectSimpleBody("Change Log", [
      `## ${now.slice(0, 10)}`,
      `- ${memo || "새 canonical project 승격"}`,
      ...relatedPaths.map((path) => `- source link: ${path}`),
    ]);
  }
  return promotedProjectSimpleBody(fileName.replace(/\.md$/, "").replace(/_/g, " "), ["- 확인 필요"]);
}

function promotedProjectL1Markdown(projectKey, projectName, relatedLinks = [], now = "", memo = "") {
  const shortLinks = relatedLinks.slice(0, 3).map((line) => line.replace(/^- /, ""));
  return [
    `# ${projectKey}`,
    "",
    `- 한줄 요약: 신규 canonical project로 승격된 ${projectName}이며 초기 운영 구조만 생성된 상태다.`,
    "- 프로젝트 유형: project / intake 통합 검토 후 승격",
    "- 현재 상태: hub, Status, Reference_Register, Project_Overview, Change_Log, L1 초안 생성 완료",
    "- 이번 주 실무 포인트:",
    "  - 대표 근거 문서 확정",
    "  - 오너/단계/다음 게이트 갱신",
    "  - 기존 intake space와의 역할 분리",
    "- 핵심 결정사항:",
    `  - ${memo || "기존 space 편입 대신 새 canonical project로 승격"}`,
    "- 핵심 수치 / 파일:",
    "  - 아직 확정 수치 없음",
    "- 핵심 참조 링크:",
    ...shortLinks.map((line) => `  - ${line}`),
    "- 미해결 이슈:",
    "  - 범위/계약/산출물 경계 추가 확인 필요",
    "- 다음 액션 / 미팅 전 확인:",
    "  - Status와 Project_Overview를 실제 근거로 보강",
    "- 주의사항 (Gotchas):",
    "  - provisional intake view와 canonical project를 다시 혼동하지 않기",
    "- 드릴다운:",
    `  - [[Wiki/${projectKey}/hub]]`,
    `  - [[Wiki/${projectKey}/Status]]`,
    `  - [[Wiki/${projectKey}/Decisions]]`,
  ].join("\n");
}

async function createPromotedProjectScaffold(candidate = {}, resolved = {}, workspaceId = "rtm", options = {}) {
  const workspace = await ensureWikiWorkspace(workspaceId);
  const now = options.timestamp || new Date().toISOString();
  const planned = planPromotedProject(candidate, resolved, workspaceId);
  const related = Array.isArray(candidate.relatedWikis) ? candidate.relatedWikis : [];
  const account = related.find((item) => item.division === "account") || null;
  const relatedEntries = related.map((item) => {
    const hubPath = item.hubPath || integrationDocPath(item, "hub.md", workspaceId);
    return {
      ...item,
      hubPath,
      hubLink: wikiLinkFromPath(hubPath),
      changeLogPath: integrationDocPath(item, "Change_Log.md", workspaceId),
      statusPath: integrationDocPath(item, "Status.md", workspaceId),
    };
  });
  const relatedLinks = relatedEntries.map((item) => `- ${item.hubLink}: ${item.summary || item.latestStatusMemo || item.projectLabel || item.projectKey}`);
  const relatedPaths = relatedEntries.map((item) => item.hubPath).filter(Boolean);
  const accountLink = account ? wikiLinkFromPath(account.hubPath || integrationDocPath(account, "hub.md", workspaceId)) : "";
  const memo = options.memo || changeEventMemo({
    timestamp: now,
    source: "wiki_integration_scan",
    change: `${candidate.groupKey || planned.projectName} 통합 후보`,
    action: integrationStrategyLabel("promote_to_new_project"),
  });
  const docs = [
    ["hub.md", "project"],
    ["Status.md", "status"],
    ["Reference_Register.md", "reference"],
    ["Project_Overview.md", "overview"],
    ["Sources.md", "sources"],
    ["Evidence_Log.md", "evidence"],
    ["Raw_Evidence_Index.md", "raw_evidence_index"],
    ["Business_Flow.md", "business_flow"],
    ["CEO_Brief.md", "ceo_brief"],
    ["PM_Action_Plan.md", "pm_action_plan"],
    ["Customer_Followup.md", "customer_followup"],
    ["Action_Items.md", "actions"],
    ["Risks.md", "risks"],
    ["Decisions.md", "decisions"],
    ["Conflict_Register.md", "conflict"],
    ["Change_Log.md", "log"],
  ];
  const changed = [];
  await mkdir(planned.projectDir, { recursive: true });
  for (const [fileName, type] of docs) {
    const fullPath = join(planned.projectDir, fileName);
    if (!existsSync(fullPath)) {
      const bodyLines = promotedProjectDocumentContent(fileName, {
        projectName: planned.projectName,
        projectKey: planned.projectKey,
        relatedLinks,
        accountLink,
        now,
        memo,
        relatedPaths,
      });
      await writeFile(fullPath, composeMarkdownDocument(type, fileName.replace(/\.md$/, "").replace(/_/g, " "), "wiki integration approval", bodyLines, now), "utf-8");
      changed.push(relative(repoRoot, fullPath));
    }
  }
  const l1FullPath = join(workspace.l1Root, `${planned.projectKey}.md`);
  if (!existsSync(l1FullPath)) {
    await writeFile(l1FullPath, promotedProjectL1Markdown(planned.projectKey, planned.projectName, relatedLinks, now, memo), "utf-8");
    changed.push(relative(repoRoot, l1FullPath));
  }
  if (account) {
    changed.push(await appendMarkdownSection(resolve(repoRoot, account.hubPath || integrationDocPath(account, "hub.md", workspaceId)), `승격 프로젝트 - ${now.slice(0, 10)}`, [
      `- ${wikiLinkFromPath(planned.hubPath)}: ${planned.projectName}`,
      `- 변화 메모: ${memo}`,
      `- 관련 intake: ${relatedEntries.filter((item) => item.projectKey !== account.projectKey).map((item) => item.hubLink).join(", ")}`,
    ], { timestamp: now, source: "wiki integration approval" }));
  }
  for (const item of relatedEntries.filter((entry) => entry.division !== "account")) {
    if (item.changeLogPath) {
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${now.slice(0, 10)} canonical project promotion`, [
        `- ${memo}`,
        `- promoted project: ${wikiLinkFromPath(planned.hubPath)}`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  }
  return {
    appliedPaths: changed.filter(Boolean),
    note: `${planned.projectKey} 새 canonical project를 생성하고 관련 provenance 링크를 반영했습니다.`,
    promotedProjectKey: planned.projectKey,
    promotedProjectLabel: planned.projectName,
    reflectionDocs: [
      planned.hubPath,
      planned.statusPath,
      planned.referencePath,
      planned.overviewPath,
      planned.changeLogPath,
      planned.l1Path,
    ],
  };
}

async function applyWikiIntegrationDecision(resolved = {}, workspaceId = "rtm", options = {}) {
  const candidate = resolved.original || {};
  const strategy = resolved.overrideStrategy || candidate.recommendedStrategy || "link_only";
  if (!wikiIntegrationStrategies.has(strategy)) throw new Error(`Unsupported wiki integration strategy: ${strategy}`);
  const now = options.timestamp || new Date().toISOString();
  const related = Array.isArray(candidate.relatedWikis) ? candidate.relatedWikis : [];
  if (!related.length) return { appliedPaths: [], note: "관련 위키가 없어 승인 반영을 생략했습니다." };
  const changed = [];
  const dateLabel = now.slice(0, 10);
  const integrationMemo = resolved.overrideStrategy
    ? changeEventMemo({
      timestamp: now,
      source: "wiki_integration_scan",
      change: `${candidate.groupKey || "integration"} 통합 후보`,
      action: `${integrationStrategyLabel(strategy)}${resolved.overrideReason ? ` / ${resolved.overrideReason}` : ""}`,
    })
    : candidate.preview?.changeMemo || changeEventMemo({
    timestamp: now,
    source: "wiki_integration_scan",
    change: `${candidate.groupKey || "integration"} 통합 후보`,
    action: integrationStrategyLabel(strategy),
  });
  const relatedLinks = related.map((item) => ({
    ...item,
    hubLink: wikiLinkFromManagedPath(item.hubPath || integrationDocPath(item, "hub.md", workspaceId)),
    statusPath: integrationDocPath(item, "Status.md", workspaceId),
    changeLogPath: integrationDocPath(item, "Change_Log.md", workspaceId),
    conflictPath: integrationDocPath(item, "Conflict_Register.md", workspaceId),
    rawEvidencePath: integrationDocPath(item, "Raw_Evidence_Index.md", workspaceId),
  }));
  const account = relatedLinks.find((item) => item.division === "account") || null;
  const common = relatedLinks.find((item) => item.division === "common") || null;
  const shared = relatedLinks.find((item) => item.division === "shared") || null;
  const projectRows = relatedLinks
    .filter((item) => item.division === "project")
    .map((item) => `- ${item.projectLabel || item.projectKey}: ${item.latestStatusMemo || item.summary || "상태/후속 확인 필요"} (${item.hubLink ? `[[${item.hubLink}]]` : item.projectKey})`);

  if (strategy === "link_only") {
    for (const item of relatedLinks) {
      const peerLinks = relatedLinks
        .filter((peer) => peer.projectKey !== item.projectKey)
        .map((peer) => `- [[${peer.hubLink}]]: ${peer.summary || peer.latestStatusMemo || peer.projectLabel}`);
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.hubPath || integrationDocPath(item, "hub.md", workspaceId)), `위키 통합 링크 - ${dateLabel}`, [
        `- 승인 전략: ${strategy}`,
        `- 그룹: ${candidate.groupKey}`,
        `- 변화 메모: ${integrationMemo}`,
        ...peerLinks,
      ], { timestamp: now, source: "wiki integration approval" }));
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${dateLabel} 위키 통합 링크`, [
        `- ${integrationMemo}`,
        `- 관련 위키: ${relatedLinks.map((peer) => peer.projectLabel || peer.projectKey).join(", ")}`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  } else if (strategy === "promote_to_new_project") {
    const promotion = await createPromotedProjectScaffold(candidate, resolved, workspaceId, { timestamp: now, memo: integrationMemo });
    changed.push(...(promotion.appliedPaths || []));
    return {
      appliedPaths: changed.filter(Boolean),
      note: promotion.note,
      promotedProjectKey: promotion.promotedProjectKey,
      promotedProjectLabel: promotion.promotedProjectLabel,
      reflectionDocs: promotion.reflectionDocs || [],
    };
  } else if (strategy === "promote_to_common") {
    const commonTargetPath = resolve(repoRoot, common?.hubPath || canonicalCommonHubPath(workspaceId));
    changed.push(await appendMarkdownSection(commonTargetPath, `통합 승격 - ${dateLabel}`, [
      `- 승인 전략: ${strategy}`,
      `- 그룹: ${candidate.groupKey}`,
      `- 변화 메모: ${integrationMemo}`,
      `- 관련 intake: ${relatedLinks.map((item) => `[[${item.hubLink}]]`).join(", ")}`,
      "- 판단: 특정 프로젝트보다 공통 운영 지식으로 승격",
    ], { timestamp: now, source: "wiki integration approval" }));
    for (const item of relatedLinks.filter((entry) => entry.division !== "common")) {
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${dateLabel} common promotion`, [
        `- ${integrationMemo}`,
        `- promoted to common: [[${wikiLinkFromManagedPath(relative(repoRoot, commonTargetPath))}]]`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  } else if (strategy === "promote_to_shared") {
    const sharedTargetPath = resolve(repoRoot, shared?.hubPath || canonicalSharedHubPath(workspaceId));
    changed.push(await appendMarkdownSection(sharedTargetPath, `자산 승격 - ${dateLabel}`, [
      `- 승인 전략: ${strategy}`,
      `- 그룹: ${candidate.groupKey}`,
      `- 변화 메모: ${integrationMemo}`,
      `- 관련 intake: ${relatedLinks.map((item) => `[[${item.hubLink}]]`).join(", ")}`,
      "- 판단: 여러 프로젝트에서 재사용할 자산으로 승격",
    ], { timestamp: now, source: "wiki integration approval" }));
    for (const item of relatedLinks.filter((entry) => entry.division !== "shared")) {
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${dateLabel} shared promotion`, [
        `- ${integrationMemo}`,
        `- promoted to shared: [[${wikiLinkFromManagedPath(relative(repoRoot, sharedTargetPath))}]]`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  } else if (strategy === "keep_separate_project") {
    for (const item of relatedLinks.filter((entry) => entry.division !== "common")) {
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.statusPath), `별도 유지 판단 - ${dateLabel}`, [
        `- 상태 메모: ${integrationMemo}`,
        "- 판단: 현재는 별도 project를 유지",
        `- 재검토 사유: ${resolved.overrideReason || (candidate.reason || []).join(", ") || "범위/계약/산출물 경계 유지"}`,
      ], { timestamp: now, source: "wiki integration approval" }));
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${dateLabel} separate project hold`, [
        `- ${integrationMemo}`,
        `- separate rationale: ${resolved.overrideReason || (candidate.reason || []).join(", ") || "범위 분리 유지"}`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  } else if (strategy === "account_rollup") {
    if (!account) return applyWikiIntegrationDecision({ ...resolved, original: { ...candidate, recommendedStrategy: "link_only" } }, workspaceId, options);
    changed.push(await appendMarkdownSection(resolve(repoRoot, account.hubPath || integrationDocPath(account, "hub.md", workspaceId)), `Account Rollup - ${dateLabel}`, [
      `- 승인 전략: ${strategy}`,
      `- 그룹: ${candidate.groupKey}`,
      `- 변화 메모: ${integrationMemo}`,
      ...projectRows,
    ], { timestamp: now, source: "wiki integration approval" }));
    changed.push(await appendMarkdownSection(resolve(repoRoot, account.changeLogPath), `Change - ${dateLabel} account rollup`, [
      `- ${integrationMemo}`,
      `- 연결 프로젝트: ${relatedLinks.filter((item) => item.division === "project").map((item) => item.projectLabel || item.projectKey).join(", ")}`,
    ], { timestamp: now, source: "wiki integration approval" }));
    for (const item of relatedLinks.filter((entry) => entry.division === "project")) {
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.statusPath), `위키 통합 Rollup - ${dateLabel}`, [
        `- 상태 메모: ${integrationMemo}`,
        `- 상위 Account: [[${account.hubLink}]]`,
        `- 현재 연결 판단: Account 레벨에서 상태/다음 접점을 함께 관리`,
      ], { timestamp: now, source: "wiki integration approval" }));
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${dateLabel} account rollup`, [
        `- ${integrationMemo}`,
        `- 상위 연결: [[${account.hubLink}]]`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  } else if (strategy === "hold_for_review") {
    for (const item of relatedLinks.filter((entry) => entry.division !== "common" && entry.division !== "shared")) {
      changed.push(await appendMarkdownSection(resolve(repoRoot, integrationDocPath(item, "Action_Items.md", workspaceId)), `통합 재검토 - ${dateLabel}`, [
        `- 상태 메모: ${integrationMemo}`,
        `- 보류 이유: ${resolved.overrideReason || (candidate.reason || []).join(", ") || "근거/식별자 보강 필요"}`,
        "- 다음 조건: 추가 source 확보 후 canonical space를 재판정",
      ], { timestamp: now, source: "wiki integration approval" }));
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${dateLabel} hold for review`, [
        `- ${integrationMemo}`,
        `- hold rationale: ${resolved.overrideReason || (candidate.reason || []).join(", ") || "추가 근거 필요"}`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  } else if (strategy === "decision_merge") {
    for (const item of relatedLinks) {
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.conflictPath), `위키 통합 검토 - ${dateLabel}`, [
        `- 변화 메모: ${integrationMemo}`,
        `- 추천 전략: ${strategy}`,
        `- 관련 위키: ${relatedLinks.map((peer) => `[[${peer.hubLink}]]`).join(", ")}`,
        `- 충돌 가능성: ${candidate.conflictRisk ? "high" : "low"}`,
        `- 후속: 실제 병합 대신 Conflict/Register와 Decision Queue에서 검토 유지`,
      ], { timestamp: now, source: "wiki integration approval" }));
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${dateLabel} decision merge candidate`, [
        `- ${integrationMemo}`,
        `- 실제 병합은 수행하지 않고 Conflict/Register 검토 메모만 추가`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  } else if (strategy === "evidence_index_merge") {
    const target = account || relatedLinks[0];
    changed.push(await appendMarkdownSection(resolve(repoRoot, target.rawEvidencePath), `위키 통합 원문 링크 - ${dateLabel}`, [
      `- 변화 메모: ${integrationMemo}`,
      `- 관련 위키: ${relatedLinks.map((item) => `[[${item.hubLink}]]`).join(", ")}`,
      ...relatedLinks.map((item) => `- 원문/근거 유지: [[${wikiLinkFromManagedPath(item.rawEvidencePath || item.hubPath)}]]`),
    ], { timestamp: now, source: "wiki integration approval" }));
    changed.push(await appendMarkdownSection(resolve(repoRoot, target.changeLogPath), `Change - ${dateLabel} raw evidence rollup`, [
      `- ${integrationMemo}`,
      `- 원문 삭제 없이 Raw_Evidence_Index 링크만 통합`,
    ], { timestamp: now, source: "wiki integration approval" }));
  } else if (strategy === "status_rollup") {
    const target = account || relatedLinks[0];
    changed.push(await appendMarkdownSection(resolve(repoRoot, target.hubPath || integrationDocPath(target, "hub.md", workspaceId)), `상태 Rollup - ${dateLabel}`, [
      `- 변화 메모: ${integrationMemo}`,
      ...projectRows,
    ], { timestamp: now, source: "wiki integration approval" }));
    for (const item of relatedLinks.filter((entry) => entry.division !== "common")) {
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.statusPath), `위키 통합 상태 집계 - ${dateLabel}`, [
        `- 상태 메모: ${integrationMemo}`,
        `- 집계 허브: [[${target.hubLink}]]`,
      ], { timestamp: now, source: "wiki integration approval" }));
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${dateLabel} status rollup`, [
        `- ${integrationMemo}`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  } else if (strategy === "do_not_merge") {
    for (const item of relatedLinks) {
      changed.push(await appendMarkdownSection(resolve(repoRoot, item.changeLogPath), `Change - ${dateLabel} 병합 금지 판단`, [
        `- ${integrationMemo}`,
        `- 판단: do_not_merge`,
        `- 사유: ${(candidate.reason || []).join(", ") || "범위/원문 충돌 가능성"}`,
      ], { timestamp: now, source: "wiki integration approval" }));
    }
  }
  return {
    appliedPaths: changed.filter(Boolean),
    note: `${strategy} 전략에 따라 ${changed.filter(Boolean).length}개 문서를 append했습니다.`,
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

async function searchWikiBrief(query, selectedPaths = [], mode = "standard", workspaceId = "rtm") {
  const budget = contextBudget(mode);
  const allResults = query ? await searchWiki(query, workspaceId) : [];
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
  const lightOptions = glmLightTaskOptions(env, { maxTokens: 900, cap: 1200 });
  const model = lightOptions.model;

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
        temperature: lightOptions.temperature,
        max_tokens: lightOptions.maxTokens,
        thinking: lightOptions.thinking,
        response_format: { type: "json_object" },
    }, {
      feature: "wiki_search_light_brief",
      reason: "short structured brief from compressed wiki cards",
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
  const allowed = [
    ...Object.values(wikiWorkspaces).flatMap((workspace) => [workspace.wikiRoot, workspace.l1Root]),
    join(repoRoot, "automation/drive_wikify/runtime"),
    knowledgePromotionRoot,
    skillOutputsRoot,
  ];
  for (const root of allowed) {
    const fullPath = resolve(repoRoot, normalized);
    if (fullPath === root || fullPath.startsWith(`${root}/`)) {
      const markdown = await readFile(fullPath, "utf-8");
      return {
        path: relativeToRepo(fullPath),
        title: titleFromMarkdown(path, markdown),
        frontmatter: parseFrontmatter(markdown),
        markdown,
      };
    }
  }
  throw new Error("Page path is outside readable wiki roots");
}

function writableWikiPath(path) {
  const normalized = normalize(path || "");
  if (!normalized.endsWith(".md")) throw new Error("Only Markdown wiki pages can be edited");
  const fullPath = resolve(repoRoot, normalized);
  const allowed = [...Object.values(wikiWorkspaces).flatMap((workspace) => [workspace.wikiRoot, workspace.l1Root]), knowledgePromotionRoot];
  if (!allowed.some((root) => fullPath === root || fullPath.startsWith(`${root}/`))) {
    throw new Error("Page path is outside writable wiki roots");
  }
  return fullPath;
}

async function writeWikiPage(body = {}) {
  const fullPath = writableWikiPath(body.path);
  const inputMarkdown = String(body.markdown ?? "");
  if (!inputMarkdown.trim()) throw new Error("markdown is required");
  const relPath = relative(repoRoot, fullPath);
  const enforced = enforceProjectKeyFrontmatter(relPath, inputMarkdown);
  await writeFile(fullPath, enforced.markdown, "utf-8");
  return {
    status: "saved",
    path: relative(repoRoot, fullPath),
    updatedAt: new Date().toISOString(),
    title: titleFromMarkdown(relative(repoRoot, fullPath), enforced.markdown),
    projectKeyRule: enforced.rule,
    projectKeyAutofixed: enforced.changed,
  };
}

function wikiDeletionRootsForWorkspace(workspaceId = "rtm") {
  const workspace = wikiWorkspace(workspaceId);
  return [workspace.wikiRoot];
}

function isProtectedWikiDeletionPage(page = {}) {
  const fileName = String(page.path || "").split("/").pop() || "";
  if (protectedWikiDeletionFiles.has(fileName)) return true;
  if (page.isProjectHub) return true;
  if (page.docKind === "hub") return true;
  return false;
}

function isHubWikiDeletionPage(page = {}) {
  const fileName = String(page.path || "").split("/").pop() || "";
  return fileName === "hub.md" || page.isProjectHub || page.docKind === "hub";
}

function deletionSignalRegex() {
  return /(draft|tmp|temp|test|copy|old|backup|sample|unused|legacy|archive|실험|테스트|임시|복사본|백업|구버전)/i;
}

function daysSince(isoText = "") {
  const time = Date.parse(String(isoText || ""));
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

async function wikiLinkDegreeMap(workspaceId = "rtm") {
  const pages = await wikiIndex(workspaceId);
  const byTitle = new Map(pages.map((page) => [normalizeLinkKey(page.title), page]));
  const byBasename = new Map(pages.map((page) => [normalizeLinkKey((page.path || "").split("/").pop()?.replace(/\.md$/i, "") || ""), page]));
  const degree = new Map(pages.map((page) => [page.path, 0]));
  for (const page of pages) {
    const markdown = await readFile(resolve(repoRoot, page.path), "utf-8").catch(() => "");
    for (const link of extractWikiLinks(markdown)) {
      const key = normalizeLinkKey(link);
      const target = byTitle.get(key) || byBasename.get(key);
      if (!target || target.path === page.path) continue;
      degree.set(page.path, (degree.get(page.path) || 0) + 1);
      degree.set(target.path, (degree.get(target.path) || 0) + 1);
    }
  }
  return degree;
}

function wikiDeletionAssessment(page = {}, degreeMap = new Map()) {
  const reasons = [];
  const path = String(page.path || "");
  const pathParts = path.split("/");
  const fileName = pathParts.at(-1) || "";
  const ageDays = daysSince(page.updatedAt);
  const linkDegree = degreeMap.get(path) || 0;
  let score = 0;

  if (page.statusManaged === false) {
    return {
      deletable: false,
      protected: true,
      score,
      reasons: ["상태 관리 제외 문서는 삭제 추천 대상에서 제외합니다."],
      ageDays,
      linkDegree,
    };
  }
  if (!Object.values(wikiWorkspaces).some((workspace) => path === workspace.wikiPrefix || path.startsWith(`${workspace.wikiPrefix}/`))) {
    return {
      deletable: false,
      protected: true,
      score,
      reasons: ["위키 루트 밖 문서는 이 삭제 흐름에서 제외합니다."],
      ageDays,
      linkDegree,
    };
  }
  if (isProtectedWikiDeletionPage(page)) {
    return {
      deletable: false,
      protected: true,
      score,
      reasons: ["핵심 허브/운영 문서는 보호 대상으로 직접 삭제를 막습니다."],
      ageDays,
      linkDegree,
    };
  }

  if (linkDegree === 0) {
    score += 35;
    reasons.push("그래프 연결이 없어 고아 페이지로 보입니다.");
  } else if (linkDegree === 1) {
    score += 10;
    reasons.push("그래프 연결이 매우 적어 참조 가치가 낮을 수 있습니다.");
  }

  if (page.workflowStatus === "archived") {
    score += 18;
    reasons.push("현재 상태가 보관으로 표시되어 있습니다.");
  } else if (page.workflowStatus === "hold") {
    score += 8;
    reasons.push("보류 상태 문서라 정리 후보일 수 있습니다.");
  }

  if (page.docKind === "log") {
    score += 18;
    reasons.push("로그성 문서라 운영 종료 후 정리 후보가 되기 쉽습니다.");
  } else if (page.docKind === "knowledge") {
    score += 12;
    reasons.push("보조 지식 문서라 핵심 근거 문서보다 삭제 부담이 낮습니다.");
  } else if (page.docKind === "overview") {
    score += 4;
  }

  if (deletionSignalRegex().test(`${page.title || ""} ${fileName} ${path}`)) {
    score += 20;
    reasons.push("파일명/제목에 테스트·임시·백업 계열 신호가 있습니다.");
  }

  if (ageDays !== null && ageDays >= 180) {
    score += 20;
    reasons.push(`최근 ${ageDays}일 동안 갱신 흔적이 없습니다.`);
  } else if (ageDays !== null && ageDays >= 90) {
    score += 10;
    reasons.push(`최근 ${ageDays}일 동안 갱신이 없어 stale 후보입니다.`);
  } else if (ageDays !== null && ageDays >= 30) {
    score += 4;
  }

  if (page.division === "common" && page.docKind === "knowledge") {
    score += 8;
    reasons.push("Common 보조 문서라 프로젝트 핵심 문서보다 삭제 후보성이 높습니다.");
  }

  return {
    deletable: score >= 45,
    protected: false,
    score,
    reasons,
    ageDays,
    linkDegree,
  };
}

async function wikiDeletionCandidates(workspaceId = "rtm", limit = 24) {
  const pages = await wikiIndex(workspaceId);
  const degreeMap = await wikiLinkDegreeMap(workspaceId);
  const candidates = pages
    .map((page) => {
      const assessment = wikiDeletionAssessment(page, degreeMap);
      return {
        title: page.title,
        path: page.path,
        projectKey: page.projectKey,
        projectLabel: page.projectLabel,
        division: page.division,
        docKind: page.docKind,
        workflowStatus: page.workflowStatus,
        workflowStatusLabel: page.workflowStatusLabel,
        updatedAt: page.updatedAt,
        size: page.size,
        ...assessment,
      };
    })
    .filter((item) => item.deletable)
    .sort((a, b) => b.score - a.score || String(a.path).localeCompare(String(b.path), "ko"))
    .slice(0, limit);
  return {
    generatedAt: new Date().toISOString(),
    workspace: workspaceId,
    candidates,
    summary: {
      total: candidates.length,
      high: candidates.filter((item) => item.score >= 70).length,
      orphan: candidates.filter((item) => item.linkDegree === 0).length,
    },
  };
}

function deletableWikiPath(path, workspaceId = "rtm") {
  const normalized = normalize(path || "");
  if (!normalized.endsWith(".md")) throw new Error("Only Markdown wiki pages can be deleted");
  const fullPath = resolve(repoRoot, normalized);
  const allowed = wikiDeletionRootsForWorkspace(workspaceId);
  if (!allowed.some((root) => fullPath === root || fullPath.startsWith(`${root}/`))) {
    throw new Error("Page path is outside deletable wiki roots");
  }
  return fullPath;
}

async function deleteWikiPage(body = {}) {
  const workspaceId = body.workspace || "rtm";
  const force = body.force === true;
  const fullPath = deletableWikiPath(body.path, workspaceId);
  const relPath = relative(repoRoot, fullPath);
  const markdown = await readFile(fullPath, "utf-8").catch(() => "");
  if (!markdown.trim()) throw new Error("삭제 대상 문서를 읽을 수 없습니다.");
  const frontmatter = parseFrontmatter(markdown);
  const classification = classifyWikiPage(relPath, frontmatter);
  const statusStore = await wikiStatusStore();
  const page = applyWikiStatus({
    title: titleFromMarkdown(relPath, markdown),
    path: relPath,
    updatedAt: (await stat(fullPath).catch(() => null))?.mtime?.toISOString?.() || "",
    size: markdown.length,
    frontmatter,
    ...classification,
  }, statusStore);
  const assessment = wikiDeletionAssessment(page, new Map([[relPath, 0]]));
  if (assessment.protected && !(force && isHubWikiDeletionPage(page))) {
    throw new Error(assessment.reasons[0] || "보호 문서는 삭제할 수 없습니다.");
  }
  await unlink(fullPath);
  if (statusStore.pages?.[relPath]) {
    delete statusStore.pages[relPath];
    await writeJsonFile(wikiStatusesPath, statusStore);
  }
  const payload = {
    timestamp: new Date().toISOString(),
    workspace: workspaceId,
    path: relPath,
    title: page.title,
    projectKey: page.projectKey,
    projectLabel: page.projectLabel,
    docKind: page.docKind,
    workflowStatus: page.workflowStatus,
    reason: String(body.reason || "").trim(),
    source: body.source || "manual",
    decisionId: body.decisionId || "",
    force,
  };
  await appendJsonl(wikiDeletionAuditPath, payload);
  return {
    status: "deleted",
    ...payload,
  };
}

async function deleteWikiProjectPackage(body = {}) {
  const workspaceId = body.workspace || "rtm";
  const requestedProjectKey = String(body.projectKey || "").trim();
  const pathHint = String(body.path || "").trim();
  if (!requestedProjectKey && !pathHint) throw new Error("projectKey is required");
  const workspace = wikiWorkspace(workspaceId);
  const hintedProjectDir = projectDirFromWikiPath(pathHint, workspaceId);
  const projectDir = hintedProjectDir || projectDirForKey(requestedProjectKey, workspaceId);
  const projectKey = basename(projectDir);
  const projectRelPath = relative(repoRoot, projectDir);
  const l1Path = join(workspace.l1Root, `${projectKey}.md`);
  const removedPaths = [];
  const reason = String(body.reason || "").trim();

  if (existsSync(projectDir)) {
    const projectFiles = await walkMarkdown(projectDir).catch(() => []);
    removedPaths.push(...projectFiles.map((file) => relative(repoRoot, file)));
    await rm(projectDir, { recursive: true, force: true });
  }
  if (existsSync(l1Path)) {
    removedPaths.push(relative(repoRoot, l1Path));
    await rm(l1Path, { force: true });
  }
  if (!removedPaths.length) {
    throw new Error(`삭제할 프로젝트 패키지를 찾지 못했습니다: ${projectKey}`);
  }

  const statusStore = await wikiStatusStore();
  for (const path of removedPaths) {
    if (statusStore.pages?.[path]) delete statusStore.pages[path];
  }
  if (statusStore.projects?.[projectKey]) delete statusStore.projects[projectKey];
  if (requestedProjectKey && requestedProjectKey !== projectKey && statusStore.projects?.[requestedProjectKey]) {
    delete statusStore.projects[requestedProjectKey];
  }
  await writeJsonFile(wikiStatusesPath, statusStore);

  const payload = {
    timestamp: new Date().toISOString(),
    workspace: workspaceId,
    projectKey,
    projectPath: projectRelPath,
    l1Path: existsSync(l1Path) ? relative(repoRoot, l1Path) : join(relative(repoRoot, workspace.l1Root), `${projectKey}.md`),
    removedPaths,
    removedCount: removedPaths.length,
    reason,
    source: body.source || "manual_project_delete",
  };
  await appendJsonl(wikiDeletionAuditPath, payload);
  return {
    status: "deleted_project_package",
    ...payload,
  };
}

async function enqueueWikiDeletionCandidates(body = {}) {
  const workspaceId = body.workspace || "rtm";
  const requestedPaths = new Set((Array.isArray(body.paths) ? body.paths : []).map((value) => String(value).trim()).filter(Boolean));
  const snapshot = await wikiDeletionCandidates(workspaceId, Number(body.limit || 24));
  const selected = snapshot.candidates.filter((candidate) => !requestedPaths.size || requestedPaths.has(candidate.path));
  const items = [];
  for (const candidate of selected) {
    const item = await enqueueDecisionQueueItem({
      id: `deletion-${workspaceId}-${candidate.path}`,
      workspace: workspaceId,
      sourceType: "wiki_deletion_recommendation",
      kind: "deletion_candidate",
      title: `삭제 후보: ${candidate.title}`,
      projectKey: candidate.projectKey || "",
      projectLabel: candidate.projectLabel || "",
      content: [
        `score: ${candidate.score}`,
        `path: ${candidate.path}`,
        `status: ${candidate.workflowStatusLabel || candidate.workflowStatus || "-"}`,
        `degree: ${candidate.linkDegree}`,
        ...candidate.reasons.map((reason) => `reason: ${reason}`),
      ].join("\n"),
      path: candidate.path,
      createdAt: snapshot.generatedAt,
      original: candidate,
    });
    items.push(item);
  }
  return {
    status: "queued",
    workspace: workspaceId,
    count: items.length,
    items,
  };
}

async function collectStatus() {
  const manifestPath = join(driveRuntime, "manifest.json");
  const runOutputPath = join(driveRuntime, "run_output.json");
  const deletionLogPath = join(driveRuntime, "deletion_log.jsonl");
  const { values: env } = await readEnvFile();
  const manifest = await readJsonFile(manifestPath, { documents: [] });
  const runOutput = await readJsonFile(runOutputPath, { results: [] });
  const deletionLog = await readFile(deletionLogPath, "utf-8").catch(() => "");
  const deletionCount = deletionLog.split("\n").filter(Boolean).length;

  return {
    status: {
      targetDrive: env.RCLONE_REMOTE_PATH || `${env.RCLONE_REMOTE || "gdrive"}: 최상위`,
      manifest: `${displayPath(manifestPath)} (${manifest.documents?.length || 0} docs)`,
      lastRun: `${runOutput.results?.length || 0} processed`,
      cleanup: `local mirror only (${deletionCount} logged)`,
    },
    safety: {
      driveDeleteSource: env.DRIVE_DELETE_SOURCE || "false",
      sourceDriveProtected: env.DRIVE_DELETE_SOURCE !== "true",
    },
  };
}

async function projectKeyGovernance(workspaceId = "rtm") {
  const pages = await wikiIndex(workspaceId);
  const projectPages = pages.filter((page) => isProjectScopedDivision(page.division));
  const groups = new Map();

  for (const page of projectPages) {
    const key = page.projectKeyExpected || page.projectKey || page.section;
    if (!groups.has(key)) {
      groups.set(key, {
        projectKey: key,
        projectLabel: page.projectLabel || key,
        division: page.division,
        hubPath: "",
        pageCount: 0,
        pages: [],
        missingProjectKey: 0,
        mismatchedProjectKey: 0,
        issues: [],
      });
    }
    const group = groups.get(key);
    group.pageCount += 1;
    if (page.isProjectHub) group.hubPath = page.path;
    group.pages.push({
      path: page.path,
      title: page.title,
      docKind: page.docKind,
      declaredProjectKey: page.projectKeyDeclared || "",
      expectedProjectKey: page.projectKeyExpected || "",
      integrity: page.projectKeyIntegrity || "ok",
      issues: page.projectKeyIssues || [],
    });
    for (const issue of page.projectKeyIssues || []) {
      if (issue.code === "missing_project_key") group.missingProjectKey += 1;
      if (issue.code === "project_key_mismatch") group.mismatchedProjectKey += 1;
      group.issues.push({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        path: page.path,
      });
    }
  }

  const projects = [...groups.values()].map((group) => {
    const presentNames = new Set(group.pages.map((page) => page.path.split("/").at(-1)));
    const missingDocs = canonicalProjectDocNames.filter((name) => !presentNames.has(name));
    if (!group.hubPath) {
      group.issues.push({
        code: "missing_hub",
        severity: "error",
        message: "hub.md 가 없습니다.",
        path: "",
      });
    }
    for (const name of missingDocs) {
      group.issues.push({
        code: "missing_canonical_doc",
        severity: name === "hub.md" ? "error" : "warning",
        message: `${name} 가 없습니다.`,
        path: group.hubPath || "",
      });
    }
    return {
      ...group,
      canonicalCoverage: canonicalProjectDocNames.length - missingDocs.length,
      canonicalExpected: canonicalProjectDocNames.length,
      missingDocs,
      issues: group.issues.sort((a, b) => a.severity.localeCompare(b.severity) || a.code.localeCompare(b.code)),
    };
  }).sort((a, b) => b.issues.length - a.issues.length || a.projectKey.localeCompare(b.projectKey));

  const snapshot = {
    generatedAt: new Date().toISOString(),
    workspace: workspaceId,
    summary: {
      projects: projects.length,
      projectPages: projectPages.length,
      projectsWithIssues: projects.filter((project) => project.issues.length).length,
      missingProjectKeyPages: projectPages.filter((page) => (page.projectKeyIssues || []).some((issue) => issue.code === "missing_project_key")).length,
      mismatchedProjectKeyPages: projectPages.filter((page) => (page.projectKeyIssues || []).some((issue) => issue.code === "project_key_mismatch")).length,
      missingCanonicalDocs: projects.reduce((sum, project) => sum + project.missingDocs.length, 0),
    },
    projects,
  };
  await writeJsonFile(projectRegistryPath, snapshot);
  return {
    ...snapshot,
    registryPath: relative(repoRoot, projectRegistryPath),
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
  const deletionLog = await readFile(deletionLogPath, "utf-8").catch(() => "");
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

const documentWorkflowCatalog = {
  unreviewed: "미검토",
  extracted: "추출완료",
  in_use: "활용중",
  report_reflected: "보고서반영",
  decision_evidence: "결정근거",
  hold: "보류",
  discarded: "폐기",
};

function normalizeDocumentStatus(value) {
  const text = String(value || "").trim().toLowerCase();
  const aliases = {
    unreviewed: "unreviewed",
    미검토: "unreviewed",
    extracted: "extracted",
    추출완료: "extracted",
    in_use: "in_use",
    활용중: "in_use",
    report_reflected: "report_reflected",
    보고서반영: "report_reflected",
    decision_evidence: "decision_evidence",
    결정근거: "decision_evidence",
    hold: "hold",
    보류: "hold",
    discarded: "discarded",
    폐기: "discarded",
  };
  return aliases[text] || (documentWorkflowCatalog[text] ? text : "unreviewed");
}

function documentKey(record = {}) {
  return String(record.file_path || record.path || record.title || record.id || "").trim();
}

function projectDirForKey(projectKey, workspaceId = "rtm") {
  const workspace = wikiWorkspace(workspaceId);
  const safeProjectKey = String(projectKey || "").replace(/[\\/:*?"<>|]/g, "_").trim();
  if (!safeProjectKey) throw new Error("projectKey is required");
  return safeJoin(workspace.wikiRoot, safeProjectKey);
}

function projectDirFromWikiPath(pathHint, workspaceId = "rtm") {
  const workspace = wikiWorkspace(workspaceId);
  const normalized = String(pathHint || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return null;
  const absolute = safeJoin(repoRoot, normalized);
  const candidateDir = extname(absolute).toLowerCase() === ".md" ? dirname(absolute) : absolute;
  const relativeToWikiRoot = relative(workspace.wikiRoot, candidateDir);
  if (!relativeToWikiRoot || relativeToWikiRoot.startsWith("..") || isAbsolute(relativeToWikiRoot)) return null;
  return candidateDir;
}

function documentTitle(record = {}) {
  return String(record.title || record.name || record.file_path || record.path || "문서").split("/").at(-1);
}

async function projectMarkdownBundle(projectKey, workspaceId = "rtm") {
  const projectDir = projectDirForKey(projectKey, workspaceId);
  const names = ["hub.md", "Project_Overview.md", "Sources.md", "Evidence_Log.md", "Status.md", "Business_Flow.md", "CEO_Brief.md", "PM_Action_Plan.md", "Customer_Followup.md", "Action_Items.md", "Risks.md", "Decisions.md", "Conflict_Register.md", "Change_Log.md", "Raw_Evidence_Index.md", "Document_Usage_Log.md"];
  const bundle = {};
  for (const name of names) {
    bundle[name] = await readFile(join(projectDir, name), "utf-8").catch(() => "");
  }
  return bundle;
}

function usageStatusForDocument(record, store = {}) {
  const key = documentKey(record);
  const entry = store.documents?.[key] || {};
  const status = normalizeDocumentStatus(entry.status);
  return {
    status,
    statusLabel: documentWorkflowCatalog[status] || documentWorkflowCatalog.unreviewed,
    note: entry.note || "",
    importance: entry.importance || "",
    updatedAt: entry.updatedAt || "",
  };
}

function inferDocumentConnections(record, bundle = {}) {
  const name = documentTitle(record);
  const path = String(record.file_path || "");
  const needle = [name, path].filter(Boolean);
  const has = (markdown) => needle.some((item) => item && String(markdown || "").includes(item));
  return {
    inSources: has(bundle["Sources.md"]),
    inEvidence: has(bundle["Evidence_Log.md"]),
    inActions: has(bundle["Action_Items.md"]),
    inDecisions: has(bundle["Decisions.md"]),
    inRisks: has(bundle["Risks.md"]),
    inUsage: has(bundle["Document_Usage_Log.md"]),
  };
}

async function coreDocuments(workspaceId = "rtm") {
  const { values: env } = await readEnvFile();
  const manifestPath = resolveRepoPath(env.MANIFEST_PATH || "automation/drive_wikify/runtime/manifest.json");
  const manifest = await readJsonFile(manifestPath, { documents: [] });
  const statusStore = await readJsonFile(documentUsageStatusPath, { version: 1, documents: {} });
  const pages = await wikiIndex(workspaceId);
  const projects = [...new Map(pages
    .filter((page) => page.division === "project" || page.division === "account")
    .map((page) => [page.projectKey, page])).values()];
  const bundleCache = new Map();
  const candidates = [];

  for (const record of manifest.documents || []) {
    const title = documentTitle(record);
    const haystack = `${title} ${record.folder_path || ""} ${record.file_path || ""}`.toLowerCase();
    const matchedProjects = projects
      .map((project) => ({
        projectKey: project.projectKey,
        projectLabel: project.projectLabel,
        score: Math.max(overlapScore(haystack, project.projectKey), overlapScore(haystack, project.projectLabel)),
        workflowStatus: project.workflowStatus,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    const project = matchedProjects[0] || { projectKey: "Common", projectLabel: "Common", score: 0, workflowStatus: "unknown" };
    if (!bundleCache.has(project.projectKey)) {
      bundleCache.set(project.projectKey, await projectMarkdownBundle(project.projectKey, workspaceId).catch(() => ({})));
    }
    const connections = inferDocumentConnections(record, bundleCache.get(project.projectKey));
    const status = usageStatusForDocument(record, statusStore);
    let score = 20;
    if (/\b(final|최종|보고|제안|계약|회의|minutes|결과|plan|계획|발표|분석|검증|poc|사업|요청|rfi|rfp)\b/i.test(haystack)) score += 20;
    if (/\.(hwp|hwpx|rhwp|pdf|docx|pptx|xlsx|html?)$/i.test(title)) score += 12;
    if (project.score) score += Math.min(25, project.score * 8);
    if (connections.inEvidence) score += 12;
    if (connections.inActions || connections.inDecisions || connections.inRisks) score += 18;
    if (!connections.inUsage) score += 10;
    if (status.status === "decision_evidence") score += 12;
    if (status.status === "discarded") score -= 50;
    candidates.push({
      key: documentKey(record),
      title,
      driveName: record.drive_name || env.DRIVE_NAME || "gdrive",
      folderPath: record.folder_path || "",
      filePath: record.file_path || "",
      modifiedTime: record.modified_time || "",
      projectKey: project.projectKey,
      projectLabel: project.projectLabel,
      projectMatchScore: project.score,
      score: Math.max(0, score),
      priority: score >= 75 ? "high" : score >= 50 ? "medium" : "low",
      connections,
      ...status,
    });
  }

  return {
    catalog: documentWorkflowCatalog,
    manifestPath: displayPath(manifestPath),
    documents: candidates.sort((a, b) => b.score - a.score || String(b.modifiedTime).localeCompare(String(a.modifiedTime))).slice(0, 200),
    summary: {
      manifestDocuments: manifest.documents?.length || 0,
      coreCandidates: candidates.length,
      highPriority: candidates.filter((item) => item.priority === "high").length,
      used: candidates.filter((item) => item.connections.inUsage || item.status !== "unreviewed").length,
      decisionEvidence: candidates.filter((item) => item.status === "decision_evidence" || item.connections.inDecisions).length,
    },
  };
}

async function updateDocumentStatus(body = {}) {
  const store = await readJsonFile(documentUsageStatusPath, { version: 1, documents: {} });
  const items = Array.isArray(body.items) ? body.items : [body];
  const now = new Date().toISOString();
  const saved = [];
  for (const item of items) {
    const key = String(item.key || item.filePath || item.path || "").trim();
    if (!key) continue;
    const entry = {
      ...(store.documents[key] || {}),
      status: normalizeDocumentStatus(item.status),
      note: String(item.note || store.documents[key]?.note || "").trim(),
      importance: String(item.importance || store.documents[key]?.importance || "").trim(),
      updatedAt: now,
      updatedBy: "user_action",
    };
    store.documents[key] = entry;
    saved.push({ key, entry });
  }
  await writeJsonFile(documentUsageStatusPath, store);
  await appendJsonl(documentUsageAuditPath, { timestamp: now, type: "status", items: saved });
  return { status: "saved", count: saved.length, items: saved, catalog: documentWorkflowCatalog };
}

async function appendDocumentUsage(body = {}) {
  const projectKey = String(body.projectKey || "").trim();
  const workspaceId = body.workspace || "rtm";
  const projectDir = projectDirForKey(projectKey, workspaceId);
  await mkdir(projectDir, { recursive: true });
  const usagePath = join(projectDir, "Document_Usage_Log.md");
  const exists = existsSync(usagePath);
  const now = new Date().toISOString();
  const docTitle = String(body.title || body.documentTitle || "핵심문서").trim();
  const block = [
    exists ? "" : "---\ntype: document_usage\ncreated: " + now.slice(0, 10) + "\nupdated: " + now.slice(0, 10) + '\nsource: "wiki ops document usage"\n---\n\n# Document Usage Log\n',
    `\n## Usage - ${now}`,
    `- 문서명: ${docTitle}`,
    `- Drive 경로: ${body.filePath || body.drivePath || ""}`,
    `- 상태: ${documentWorkflowCatalog[normalizeDocumentStatus(body.status)] || body.status || "활용중"}`,
    `- 활용 목적: ${body.purpose || "업무 판단/보고/액션 근거로 활용"}`,
    `- 사용된 산출물: ${body.output || "미지정"}`,
    `- 연결 결정/액션/리스크: ${body.linkedWork || "미지정"}`,
    `- 메모: ${body.note || ""}`,
  ].join("\n");
  const current = await readFile(usagePath, "utf-8").catch(() => "");
  await writeFile(usagePath, `${current}${block}\n`, "utf-8");
  await updateDocumentStatus({ key: body.key || body.filePath || docTitle, status: body.status || "in_use", note: body.note || "" });
  await appendJsonl(documentUsageAuditPath, { timestamp: now, type: "usage", projectKey, title: docTitle, path: relative(repoRoot, usagePath) });
  return { status: "saved", path: relative(repoRoot, usagePath), updatedAt: now };
}

async function projectCommandCenter(workspaceId = "rtm") {
  const pages = await wikiIndex(workspaceId);
  const core = await coreDocuments(workspaceId).catch(() => ({ documents: [], summary: {} }));
  const queue = await decisionQueue(workspaceId).catch(() => ({ items: [] }));
  const integrationScan = await wikiIntegrationCandidateScan(workspaceId, { limit: 32 }).catch(() => ({ candidates: [], summary: { candidates: 0 } }));
  const integrationByProject = new Map();
  for (const candidate of integrationScan.candidates || []) {
    for (const related of candidate.relatedWikis || []) {
      if (!integrationByProject.has(related.projectKey)) integrationByProject.set(related.projectKey, []);
      integrationByProject.get(related.projectKey).push(candidate);
    }
  }
  const operationalDocNames = [
    "Status.md",
    "Business_Flow.md",
    "CEO_Brief.md",
    "PM_Action_Plan.md",
    "Customer_Followup.md",
    "Raw_Evidence_Index.md",
  ];
  const groups = new Map();
  for (const page of pages.filter((item) => item.division === "project" || item.division === "account")) {
    if (!groups.has(page.projectKey)) {
      groups.set(page.projectKey, {
        projectKey: page.projectKey,
        projectLabel: page.projectLabel,
        division: page.division,
        workflowStatus: page.workflowStatus,
        workflowStatusLabel: page.workflowStatusLabel,
        workflowTags: page.workflowTags || [],
        pages: [],
        lastActivityAt: "",
      });
    }
    const group = groups.get(page.projectKey);
    group.pages.push(page);
    if (!group.lastActivityAt || String(page.updatedAt || "") > group.lastActivityAt) group.lastActivityAt = page.updatedAt || "";
    if (page.docKind === "hub") group.hubPath = page.path;
  }
  const projects = [];
  for (const group of groups.values()) {
    const bundle = await projectMarkdownBundle(group.projectKey, workspaceId).catch(() => ({}));
    const operationalDocs = operationalDocNames.map((file) => {
      const text = String(bundle[file] || "");
      const page = group.pages.find((item) => (item.path || "").endsWith(`/${file}`));
      return {
        file,
        label: file.replace(".md", ""),
        path: page?.path || `obsidian/Wiki/${group.projectKey}/${file}`,
        present: text.trim().length > 0,
        hasContent: text.replace(/^---[\s\S]*?---/, "").trim().split("\n").filter((line) => line.trim() && !/^#/.test(line.trim())).length > 1,
        updatedAt: page?.updatedAt || "",
        docKind: page?.docKind || classifyWikiPage(`obsidian/Wiki/${group.projectKey}/${file}`, {}).docKind,
      };
    });
    const missingOperationalDocs = operationalDocs.filter((doc) => !doc.present || !doc.hasContent).map((doc) => doc.file);
    const operationalCoverage = operationalDocs.length
      ? Math.round(((operationalDocs.length - missingOperationalDocs.length) / operationalDocs.length) * 100)
      : 0;
    const pick = (file, regex, limit = 4) => extractPatternLines(bundle[file] || "", regex, limit * 3)
      .filter((line) => isSpotliteBusinessLine(line, `${group.projectKey}/${file}`))
      .slice(0, limit);
    const memoLines = extractMeaningfulLines(bundle["hub.md"] || bundle["Project_Overview.md"] || "", group.projectLabel, contextBudget("economy"))
      .filter((line) => isSpotliteBusinessLine(line, `${group.projectKey}/hub.md`))
      .filter((line) => !/hub|허브|위키|문서|보강|갱신|확인\s*필요/i.test(line))
      .slice(0, 4);
    const coreDocs = (core.documents || []).filter((doc) => doc.projectKey === group.projectKey).slice(0, 6);
    const decisionsWaiting = (queue.items || []).filter((item) => item.projectKey === group.projectKey && item.status === "pending");
    const integrationCandidates = integrationByProject.get(group.projectKey) || [];
    const statusMemos = extractPatternLines(bundle["Status.md"] || "", /상태\s*변화|현재\s*단계|다음\s*액션|수행\/대기|Decision Queue|검토\s*대기/i, 16)
      .slice(0, 5);
    const businessFlow = extractPatternLines(bundle["Business_Flow.md"] || "", /단계|흐름|게이트|현재|다음|고객|공정|일정|담당|상업|검토/i, 16)
      .slice(0, 5);
    const ceoBrief = extractPatternLines(bundle["CEO_Brief.md"] || "", /판단|의사결정|사업|리스크|고객|매출|비용|확인|보류|승인/i, 16)
      .slice(0, 5);
    const pmActions = extractPatternLines(bundle["PM_Action_Plan.md"] || "", /액션|owner|담당|기한|선행조건|상태|검토|결정/i, 16)
      .slice(0, 5);
    const customerFollowups = extractPatternLines(bundle["Customer_Followup.md"] || "", /고객|접점|연락|요청|관심사|다음|커뮤니케이션|준비물/i, 16)
      .slice(0, 5);
    const rawEvidence = extractPatternLines(bundle["Raw_Evidence_Index.md"] || "", /full extracted text|원문|추출|표|수치|버전|pending review|보존/i, 16)
      .slice(0, 5);
    const opsActions = [
      missingOperationalDocs.length ? `운영 문서 누락/빈 문서: ${missingOperationalDocs.join(", ")}` : "",
      !rawEvidence.length ? "Raw_Evidence_Index 원문 보존 상태 확인 필요" : "",
      decisionsWaiting.length ? `Decision Queue ${decisionsWaiting.length}건 승인/보류 필요` : "",
      integrationCandidates.length ? `위키 통합 후보 ${integrationCandidates.length}건` : "",
      ...(pmActions.length ? pmActions : ["PM_Action_Plan 액션 보강 필요"]),
    ].filter(Boolean).slice(0, 6);
    const linkedWikis = [...new Set(integrationCandidates
      .flatMap((candidate) => candidate.relatedWikis || [])
      .filter((item) => item.projectKey !== group.projectKey)
      .map((item) => item.projectLabel || item.projectKey))].slice(0, 8);
    const integrationSignals = integrationCandidates
      .map((candidate) => `${candidate.groupKey}: ${candidate.recommendedStrategy}`)
      .slice(0, 6);
    const accountRollupCandidates = integrationCandidates
      .filter((candidate) => candidate.recommendedStrategy === "account_rollup")
      .map((candidate) => candidate.groupKey)
      .slice(0, 4);
    projects.push({
      ...group,
      oneLine: memoLines[0] || `${group.projectLabel} 운영 메모 보강 필요`,
      recentMemos: memoLines,
      nextActions: pick("Action_Items.md", /다음|액션|해야|필요|확인|제출|미팅|고객|담당|예정/i, 6),
      risks: pick("Risks.md", /리스크|위험|이슈|불확실|막힘|blocked/i, 5),
      decisions: pick("Decisions.md", /결정|확정|승인|채택|선택|완료/i, 5),
      conflicts: pick("Conflict_Register.md", /충돌|불일치|상이|확인 필요|미확정/i, 5),
      coreDocuments: coreDocs,
      operationalDocs,
      missingOperationalDocs,
      operationalCoverage,
      statusMemos,
      businessFlow,
      ceoBrief,
      pmActions,
      customerFollowups,
      rawEvidence,
      opsActions,
      linkedWikis,
      integrationSignals,
      accountRollupCandidates,
      decisionQueueCount: decisionsWaiting.length,
      score: (group.workflowStatus === "ongoing" ? 60 : 0) + (decisionsWaiting.length * 12) + (coreDocs.filter((doc) => doc.priority === "high").length * 8) + Math.round(operationalCoverage / 12) + (integrationCandidates.length * 4) + (group.lastActivityAt ? 5 : 0),
    });
  }
  const operationalReady = projects.filter((item) => (item.operationalCoverage || 0) >= 80).length;
  const operationalGaps = projects.reduce((sum, item) => sum + (item.missingOperationalDocs || []).length, 0);
  return {
    generatedAt: new Date().toISOString(),
    workspace: workspaceId,
    summary: {
      projects: projects.length,
      ongoing: projects.filter((item) => item.workflowStatus === "ongoing").length,
      decisionQueue: (queue.items || []).filter((item) => item.status === "pending").length,
      highPriorityDocuments: (core.documents || []).filter((item) => item.priority === "high").length,
      operationalReady,
      operationalGaps,
      integrationCandidates: integrationScan.summary?.candidates || 0,
    },
    projects: projects.sort((a, b) => b.score - a.score || String(b.lastActivityAt).localeCompare(String(a.lastActivityAt))).slice(0, 80),
  };
}

async function projectBrief(projectKey, workspaceId = "rtm") {
  const center = await projectCommandCenter(workspaceId);
  const project = center.projects.find((item) => item.projectKey === projectKey);
  if (!project) throw new Error("Project not found");
  return {
    generatedAt: new Date().toISOString(),
    mode: "local-brief",
    project,
    brief: [
      `현재상태: ${project.workflowStatusLabel || project.workflowStatus}`,
      `한줄상황: ${project.oneLine}`,
      `다음 액션: ${(project.nextActions || []).slice(0, 3).join(" / ") || "보강 필요"}`,
      `리스크: ${(project.risks || []).slice(0, 2).join(" / ") || "명시 리스크 없음"}`,
      `결정 필요: ${project.decisionQueueCount}건`,
    ],
  };
}

async function appendProjectAction(projectKey, body = {}) {
  const workspaceId = body.workspace || "rtm";
  const projectDir = projectDirForKey(projectKey, workspaceId);
  if (!existsSync(projectDir)) throw new Error("project folder not found");
  const now = new Date().toISOString();
  const targetPath = join(projectDir, "Action_Items.md");
  const current = await readFile(targetPath, "utf-8").catch(() => "");
  const heading = current.trim() ? "" : `---\ntype: actions\ncreated: ${now.slice(0, 10)}\nupdated: ${now.slice(0, 10)}\nsource: "project command center"\n---\n\n# Action Items\n`;
  const block = [
    heading,
    `\n## Action - ${now}`,
    `- 담당: ${body.owner || "미지정"}`,
    `- 기한: ${body.due || "미지정"}`,
    `- 상태: ${body.status || "planned"}`,
    `- 액션: ${body.action || body.content || "내용 미지정"}`,
    body.evidencePath ? `- 근거: ${body.evidencePath}` : "",
  ].filter(Boolean).join("\n");
  await writeFile(targetPath, `${current}${block}\n`, "utf-8");
  return { status: "saved", path: relative(repoRoot, targetPath), updatedAt: now };
}

async function appendProjectDecision(projectKey, body = {}) {
  return resolveDecisionQueueItem(body.id || `manual-decision-${Date.now()}`, {
    ...body,
    action: body.action || "approve",
    projectKey,
    workspace: body.workspace || "rtm",
    title: body.title || "수동 결정",
    content: body.content || body.decision || "",
  });
}

function decisionKindFromItem(item = {}) {
  const text = `${item.kind || ""} ${item.title || ""} ${item.content || ""}`.toLowerCase();
  if (/conflict|충돌|불일치|상이|미확정|버전 차이|값 차이|서술 차이/.test(text)) return "conflict";
  return "decision";
}

function decisionTargetFile(kind) {
  if (kind === "conflict") return "Conflict_Register.md";
  return "Decisions.md";
}

function isDeletionDecisionItem(item = {}) {
  return /deletion_candidate/i.test(String(item.kind || "")) || /wiki_deletion/i.test(String(item.sourceType || ""));
}

function projectContextFromDecision(item = {}, workspaceId = "rtm") {
  const fallback = {
    projectKey: String(item.projectKey || "").trim(),
    projectLabel: String(item.projectLabel || "").trim(),
    sourcePath: String(item.path || "").trim(),
  };
  if (fallback.projectKey) return fallback;
  if (!fallback.sourcePath) return fallback;
  const classification = classifyWikiPage(fallback.sourcePath, {});
  if (!["project", "account"].includes(classification.division)) return fallback;
  return {
    projectKey: classification.projectKey,
    projectLabel: classification.projectLabel,
    sourcePath: fallback.sourcePath,
  };
}

function decisionTargetPathFromContext(item = {}, workspaceId = "rtm") {
  if (isDeletionDecisionItem(item)) {
    return {
      targetPath: String(item.path || "").trim() ? resolve(repoRoot, String(item.path || "").trim()) : "",
      targetFile: "DELETE",
      projectKey: String(item.projectKey || "").trim(),
      projectLabel: String(item.projectLabel || "").trim(),
      mode: "delete_source_path",
    };
  }
  const workspace = wikiWorkspace(workspaceId);
  const targetFile = decisionTargetFile(decisionKindFromItem(item));
  const sourcePath = String(item.path || "").trim();
  if (sourcePath) {
    const classification = classifyWikiPage(sourcePath, {});
    if (["project", "account"].includes(classification.division)) {
      const sourceAbs = writableWikiPath(sourcePath);
      const sourceDir = dirname(sourceAbs);
      if (sourceDir === workspace.wikiRoot || sourceDir.startsWith(`${workspace.wikiRoot}/`)) {
        return {
          targetPath: join(sourceDir, targetFile),
          targetFile,
          projectKey: classification.projectKey,
          projectLabel: classification.projectLabel,
          mode: "source_path",
        };
      }
    }
  }
  const projectKey = String(item.projectKey || "").trim();
  if (!projectKey) {
    return {
      targetPath: "",
      targetFile,
      projectKey: "",
      projectLabel: String(item.projectLabel || "").trim(),
      mode: "missing_project",
    };
  }
  return {
    targetPath: join(projectDirForKey(projectKey, workspaceId), targetFile),
    targetFile,
    projectKey,
    projectLabel: String(item.projectLabel || "").trim(),
    mode: "project_key",
  };
}

function isDataConflictPage(page = {}) {
  if (!page || !page.statusManaged) return false;
  if (!["project", "account"].includes(page.division)) return false;
  if (page.docKind !== "conflict" && !/\/Conflict_Register\.md$/i.test(page.path || "")) return false;
  if (["completed", "archived", "not_applicable"].includes(page.workflowStatus)) return false;
  return true;
}

function isConflictSignalSourcePage(page = {}) {
  if (!page || !page.statusManaged) return false;
  if (!["project", "account"].includes(page.division)) return false;
  if (["completed", "archived", "not_applicable"].includes(page.workflowStatus)) return false;
  if (page.docKind === "conflict" || /\/Conflict_Register\.md$/i.test(page.path || "")) return false;
  return ["overview", "status", "risks", "evidence", "hub", "actions"].includes(page.docKind)
    || /\/(Project_Overview|Status|Risks|Evidence_Log|hub|Action_Items)\.md$/i.test(page.path || "");
}

function isOperationalWikiLine(line = "") {
  const text = String(line || "").toLowerCase();
  return [
    /위키화/,
    /문서화/,
    /마크다운/,
    /허브/,
    /내비/,
    /네비/,
    /그래프/,
    /graph/,
    /navigation/,
    /refresh/,
    /태그/,
    /링크/,
    /인덱스/,
    /index/,
    /frontmatter/,
    /paperclip/,
    /glm/,
    /slack/,
    /drive/,
    /수집/,
    /manifest/,
    /자동화/,
    /운영 설정/,
    /검색/,
  ].some((pattern) => pattern.test(text));
}

function isConflictRegisterRoutingLine(line = "") {
  const text = String(line || "");
  return /Conflict_Register|Action_Items|Decisions|Risks|Status|Project_Overview|hub|Reference_Register/i.test(text)
    && /반영|승격|연결|우선 확인|관련 참조|실행이 필요하면|리스크가 커지면|확정되면/.test(text);
}

function hasStrongDataConflictSignal(line = "") {
  const text = String(line || "");
  return /충돌|불일치|상이|상충|서로\s*다름|다르게\s*기재|값\s*차이|버전\s*차이|서술\s*차이|정합성\s*(불일치|문제|충돌)|근거\s*불일치|수치\s*불일치|단위\s*불일치|일정\s*불일치|출처\s*(상충|불일치)|최신값\s*(불명|미확정)|미확정\s*(값|수치|일정|버전|출처|기준)/i.test(text);
}

function isPracticalWorkLine(line = "") {
  const text = String(line || "");
  return /마감일|중간\s*리뷰|제출|서류|신청\s*주체|역할\s*분담|담당|기한|미팅|회의|방문|고객|후속|준비\s*가능|추가\s*확보|무엇인지|언제인지|어떻게|가능한지|해야\s*할|필요한\s*것|요청사항|질문|액션|리스크|위험|일정\s*(확인|정리|공유)/i.test(text);
}

function isActionableWikiSuggestionLine(line = "") {
  const text = String(line || "");
  if (!text.trim()) return false;
  const hasUpdateVerb = /검토해|검토하면|검토\s*필요|수정해|수정하면|수정\s*필요|갱신해|갱신하면|갱신\s*필요|보강해|보강하면|보강\s*필요|업데이트해|업데이트하면|업데이트\s*필요|추가해|추가하면|정리해|정리하면|반영해|반영하면|권고|제안/.test(text);
  const targetsWikiDocs = /위키|허브|hub|status|reference[_\s-]*register|sources|evidence[_\s-]*log|action[_\s-]*items|risks|decisions|conflict[_\s-]*register|change[_\s-]*log/i.test(text);
  return hasUpdateVerb && targetsWikiDocs;
}

function isDataConflictLine(line = "") {
  const text = compactLine(String(line || "").trim(), 220);
  if (!text) return false;
  if (isOperationalWikiLine(text)) return false;
  if (isConflictRegisterRoutingLine(text)) return false;
  if (text.length < 12) return false;
  if (/^[#>\-\*\d.\s]*(충돌 내용|확인 사항|질문|메모|비고|관리합니다|정리합니다|추가합니다)\s*:?\s*$/i.test(text)) return false;
  if (/관리합니다|등록합니다|정리용|후보를 관리|현재 등록된 .*없음|없습니다\.?$/.test(text)) return false;
  if (/^[#>\-\*\d.\s]*[가-힣A-Za-z0-9 _-]+\s*:\s*$/.test(text)) return false;
  if (!hasStrongDataConflictSignal(text)) return false;
  if (isActionableWikiSuggestionLine(text) && !/불일치|상이|상충|값\s*차이|버전\s*차이|서술\s*차이|다르게\s*기재|서로\s*다름|근거\s*불일치|수치\s*불일치|단위\s*불일치|일정\s*불일치|출처\s*(상충|불일치)|정합성\s*(불일치|문제|충돌)/.test(text)) return false;
  if (isPracticalWorkLine(text) && !/불일치|상이|상충|값\s*차이|버전\s*차이|서술\s*차이|정합성\s*(불일치|문제|충돌)|다르게\s*기재|서로\s*다름|출처\s*(상충|불일치)/.test(text)) return false;
  return true;
}

function buildConflictRegisterApprovalBlock({ heading = "", item = {}, now = "", finalVerification = null } = {}) {
  const conflictLines = String(item.content || "")
    .split("\n")
    .map((line) => compactLine(line.replace(/^[\s>*-]+/, "").trim(), 220))
    .filter(Boolean)
    .filter((line) => !isConflictRegisterRoutingLine(line))
    .filter((line) => isDataConflictLine(line) || hasStrongDataConflictSignal(line))
    .slice(0, 6);
  if (!conflictLines.length) return "";
  const judgment = compactLine(String(item.note || finalVerification?.reason || item.title || "확인 필요"), 220);
  return [
    heading,
    `\n## Open Conflict - ${String(now || "").slice(0, 16).replace("T", " ")}`,
    `- 원천: ${item.sourceType || "decision_queue"}`,
    `- 항목: ${item.title || "미지정"}`,
    "- 충돌 내용:",
    ...conflictLines.map((line) => `  - ${line}`),
    "- 현재 판단:",
    `  - ${judgment || "확인 필요"}`,
    item.path ? "- 관련 근거 경로:" : "",
    item.path ? `  - ${item.path}` : "",
  ].filter(Boolean).join("\n");
}

function isBusinessPromotionCandidate(promotion = {}, pages = []) {
  const projectHint = String(promotion.projectHint || "").trim();
  if (!projectHint) return false;
  const matched = pages.find((page) => page.projectKey === projectHint || page.projectLabel === projectHint);
  if (!matched) return false;
  return isDataConflictPage(matched);
}

async function decisionQueue(workspaceId = "rtm") {
  const store = await readJsonFile(decisionQueuePath, { version: 1, items: {} });
  const promotions = await readJsonFile(knowledgePromotionPath, []);
  const pages = await wikiIndex(workspaceId).catch(() => []);
  const businessPages = pages.filter(isDataConflictPage);
  const signalSourcePages = pages.filter(isConflictSignalSourcePage);
  const items = [];
  for (const promotion of promotions.slice(0, 80)) {
    if (!isBusinessPromotionCandidate(promotion, businessPages)) continue;
    const candidateLines = [
      ...(promotion.candidates?.conflicts || []),
      ...(promotion.candidates?.decisions || []),
    ].filter(isDataConflictLine);
    if (!candidateLines.length) continue;
    const id = promotion.id || `promotion-${promotion.createdAt}`;
    const state = store.items?.[id] || {};
    if (state.status && state.status !== "pending") {
      items.push({ id, ...state, sourceType: "knowledge_promotion", original: promotion });
      continue;
    }
    items.push({
      id,
      status: state.status || "pending",
      sourceType: "knowledge_promotion",
      kind: "conflict",
      title: `데이터 확인 후보: ${promotion.projectHint || promotion.tool || "미지정"}`,
      projectKey: promotion.projectHint || "",
      content: candidateLines.slice(0, 6).join("\n") || promotion.content || "",
      path: promotion.path || "",
      createdAt: promotion.createdAt || "",
      original: promotion,
    });
  }
  for (const page of signalSourcePages.slice(0, 160)) {
    const markdown = await readFile(resolve(repoRoot, page.path), "utf-8").catch(() => "");
    const lines = extractPatternLines(markdown, /미확정\s*(값|수치|일정|버전|출처|기준)|충돌|불일치|상이|상충|값 차이|버전 차이|출처 상충|정합성|근거 불일치|수치 불일치|단위 불일치|일정 불일치|최신값/i, 8)
      .filter(isDataConflictLine)
      .slice(0, 5);
    if (!lines.length) continue;
    for (const [index, line] of lines.entries()) {
      const id = `wiki-${page.path}-${index}`;
      const state = store.items?.[id] || {};
      if (state.status && state.status !== "pending") {
        items.push({ id, ...state, sourceType: "wiki_signal", path: page.path });
        continue;
      }
      items.push({
        id,
        status: state.status || "pending",
        sourceType: "wiki_signal",
        kind: page.docKind,
        title: page.title,
        projectKey: page.projectKey,
        projectLabel: page.projectLabel,
        content: line,
        path: page.path,
        createdAt: page.updatedAt || "",
      });
    }
  }
  for (const [id, storedItem] of Object.entries(store.items || {})) {
    if (!storedItem || items.some((item) => item.id === id)) continue;
    if (storedItem.workspace && storedItem.workspace !== workspaceId) continue;
    if (!isDecisionQueueEligibleItem(storedItem)) continue;
    items.push({ id, ...storedItem });
  }
  const deduped = [...new Map(items.map((item) => [item.id, item])).values()];
  return {
    generatedAt: new Date().toISOString(),
    workspace: workspaceId,
    items: deduped.sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 200),
    summary: {
      pending: deduped.filter((item) => item.status === "pending").length,
      resolved: deduped.filter((item) => item.status && item.status !== "pending").length,
    },
  };
}

async function resolveDecisionQueueItem(id, body = {}) {
  if (!id) throw new Error("decision id is required");
  let action = String(body.action || "hold").trim();
  const allowed = new Set(["approve", "edit_approve", "hold", "reject", "investigate"]);
  if (!allowed.has(action)) throw new Error("Unsupported decision action");
  const workspaceId = body.workspace || "rtm";
  const queue = await decisionQueue(workspaceId);
  const item = queue.items.find((entry) => entry.id === id) || { id, title: body.title || id, content: body.content || "", projectKey: body.projectKey || "" };
  const now = new Date().toISOString();
  const store = await readJsonFile(decisionQueuePath, { version: 1, items: {} });
  const context = projectContextFromDecision({ ...item, ...body }, workspaceId);
  let target = decisionTargetPathFromContext({ ...item, ...body, projectKey: body.projectKey || item.projectKey || context.projectKey || "" }, workspaceId);
  if ((body.overrideStrategy === "promote_to_new_project" || body.overrideStrategy === "keep_separate_project") && isWikiIntegrationDecisionItem(item)) {
    const candidate = item.original || {};
    if (body.overrideStrategy === "promote_to_new_project") {
      const planned = planPromotedProject(candidate, {
        overrideProjectKey: body.overrideProjectKey,
        overrideProjectLabel: body.overrideProjectLabel || body.overrideProjectName,
        overrideProjectName: body.overrideProjectName || body.overrideProjectLabel,
      }, workspaceId);
      target = {
        ...target,
        projectKey: planned.projectKey,
        projectLabel: planned.projectName,
        targetFile: "hub.md",
        targetPath: resolve(repoRoot, planned.hubPath),
        mode: "project_promotion",
      };
    }
  }
  const auditBeforeMap = await captureAuditBefore(predictedDecisionAuditPaths(item, target, workspaceId, body));
  const finalVerification = (action === "approve" || action === "edit_approve")
    ? await verifyDecisionFinalApproval({ ...item, ...body, projectKey: body.projectKey || item.projectKey || context.projectKey || "" }, body, target, workspaceId)
    : null;
  if (finalVerification && finalVerification.decision !== "approve") {
    action = finalVerification.decision === "hold" ? "hold" : "investigate";
  }
  const status = action === "approve" || action === "edit_approve" ? "approved" : action === "reject" ? "rejected" : action === "investigate" ? "needs_investigation" : "hold";
  const resolved = {
    ...item,
    workspace: workspaceId,
    status,
    resolvedAction: action,
    resolvedAt: now,
    note: body.note || "",
    content: body.content || item.content || "",
    projectKey: body.projectKey || item.projectKey || context.projectKey || "",
    projectLabel: body.projectLabel || item.projectLabel || context.projectLabel || "",
    finalVerification,
    overrideStrategy: String(body.overrideStrategy || "").trim(),
    overrideReason: String(body.overrideReason || "").trim(),
    overrideProjectKey: String(body.overrideProjectKey || "").trim(),
    overrideProjectLabel: String(body.overrideProjectLabel || body.overrideProjectName || "").trim(),
  };
  store.items[id] = resolved;
  await writeJsonFile(decisionQueuePath, store);

  let appliedPath = "";
  const targetFile = target.targetFile;
  let note = "";
  let operationalChangePaths = [];
  let reflectionDocs = [];
  if ((action === "approve" || action === "edit_approve") && isDeletionDecisionItem(resolved)) {
    const deleted = await deleteWikiPage({
      path: resolved.path,
      workspace: workspaceId,
      reason: resolved.note || body.note || "Decision Deck 승인 삭제",
      source: "decision_queue",
      decisionId: id,
    });
    appliedPath = deleted.path;
    note = `삭제 후보 문서를 제거하고 deletion audit에 기록했습니다.`;
  }
  if (target.projectKey && !resolved.projectKey) {
    resolved.projectKey = target.projectKey;
    resolved.projectLabel = resolved.projectLabel || target.projectLabel;
    store.items[id] = resolved;
    await writeJsonFile(decisionQueuePath, store);
  }
  if ((action === "approve" || action === "edit_approve") && isWikiIntegrationDecisionItem(resolved)) {
    const integrationResult = await applyWikiIntegrationDecision(resolved, workspaceId, { timestamp: now }).catch((error) => {
      note = [note, `위키 통합 승인 반영 실패: ${error.message}`].filter(Boolean).join(" ");
      return { appliedPaths: [], note: "" };
    });
    appliedPath = integrationResult.appliedPaths?.[0] || "";
    operationalChangePaths = integrationResult.appliedPaths || [];
    reflectionDocs = integrationResult.reflectionDocs || [];
    note = [note, integrationResult.note].filter(Boolean).join(" ");
  } else if ((action === "approve" || action === "edit_approve") && target.targetPath && !isDeletionDecisionItem(resolved)) {
    const targetDir = dirname(target.targetPath);
    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }
    const targetPath = target.targetPath;
    await mkdir(resolve(targetPath, ".."), { recursive: true });
    const current = await readFile(targetPath, "utf-8").catch(() => "");
    const heading = current.trim() ? "" : `---\ntype: ${targetFile.replace(/\.md$/, "").toLowerCase()}\ncreated: ${now.slice(0, 10)}\nupdated: ${now.slice(0, 10)}\nsource: "decision queue"\n---\n\n# ${targetFile.replace(/_/g, " ").replace(/\.md$/, "")}\n`;
    const block = targetFile === "Conflict_Register.md"
      ? buildConflictRegisterApprovalBlock({ heading, item: resolved, now, finalVerification })
      : [
          heading,
          `\n## Decision Queue Approval - ${now}`,
          `- 원천: ${resolved.sourceType || "decision_queue"}`,
          `- 제목: ${resolved.title || id}`,
          `- 처리: ${action}`,
          finalVerification ? `- 최종 검증: ${finalVerification.provider || "local"} / ${finalVerification.model || "rule"} / ${finalVerification.decision}` : "",
          finalVerification?.reason ? `- 최종 검증 사유: ${finalVerification.reason}` : "",
          `- 내용: ${String(resolved.content || "").replace(/\n/g, "\n  ")}`,
          resolved.path ? `- 근거 경로: ${resolved.path}` : "",
          resolved.note ? `- 메모: ${resolved.note}` : "",
          finalVerification?.safeAppendNote ? `- 최종 검증 메모: ${finalVerification.safeAppendNote}` : "",
        ].filter(Boolean).join("\n");
    if (block) {
      await writeFile(targetPath, `${current}${block}\n`, "utf-8");
      appliedPath = relative(repoRoot, targetPath);
      note = targetFile === "Conflict_Register.md"
        ? "Conflict_Register에 승인 내용을 충돌 요약 블록으로 append했습니다."
        : `${targetFile}에 승인 내용을 append했습니다.`;
    } else {
      note = "Conflict_Register 승인 내용이 명시적 충돌이 아니라 append를 건너뛰었습니다.";
    }
  }
  if ((action === "approve" || action === "edit_approve") && !target.targetPath && !isDeletionDecisionItem(resolved) && !isWikiIntegrationDecisionItem(resolved)) {
    note = resolved.path
      ? `반영 경로를 계산하지 못했습니다. 근거 경로 ${resolved.path} 가 프로젝트/계정 위키 문서인지 확인하세요.`
      : "반영 경로를 계산하지 못했습니다. projectKey 또는 근거 path가 필요합니다.";
  }
  if (!isWikiIntegrationDecisionItem(resolved)) {
    operationalChangePaths = await appendOperationalChangeEventFromDecision(resolved, target, {
      action,
      workspace: workspaceId,
      timestamp: now,
    }).catch((error) => {
      note = [note, `운영 상태 메모 append 실패: ${error.message}`].filter(Boolean).join(" ");
      return [];
    });
  }
  resolved.note = note || resolved.note || "";
  resolved.appliedPath = appliedPath || "";
  resolved.operationalChangePaths = operationalChangePaths;
  resolved.reflectionDocs = reflectionDocs;
  resolved.targetFile = targetFile;
  resolved.auditDiffs = await buildAuditDiffs([
    appliedPath,
    ...(operationalChangePaths || []),
    ...(reflectionDocs || []),
    ...predictedDecisionAuditPaths(resolved, target, workspaceId, body),
  ], auditBeforeMap);
  store.items[id] = resolved;
  await writeJsonFile(decisionQueuePath, store);
  await appendJsonl(decisionQueueAuditPath, {
    timestamp: now,
    id,
    action,
    item: resolved,
    appliedPath,
    operationalChangePaths,
    targetFile,
    finalVerification,
    note,
  });
  return { status: "resolved", action, item: resolved, appliedPath, operationalChangePaths, targetFile, finalVerification, note };
}

async function enqueueDecisionQueueItem(item = {}) {
  const id = item.id || `decision-${Date.now()}`;
  const store = await readJsonFile(decisionQueuePath, { version: 1, items: {} });
  if (!isDecisionQueueEligibleItem(item)) {
    return {
      id,
      status: "not_applicable",
      workspace: item.workspace || "rtm",
      sourceType: item.sourceType || "manual",
      kind: item.kind || "decision",
      title: item.title || "결정 필요 항목",
      projectKey: item.projectKey || "",
      projectLabel: item.projectLabel || "",
      content: item.content || "",
      path: item.path || "",
      createdAt: item.createdAt || new Date().toISOString(),
      original: item.original || null,
      note: "Common/L1/운영 지침 문서는 Decision Queue 병합 대상에서 제외됨",
    };
  }
  if (store.items?.[id]?.status && store.items[id].status !== "pending") {
    return store.items[id];
  }
  const now = new Date().toISOString();
  const nextItem = {
    id,
    status: "pending",
    workspace: item.workspace || "rtm",
    sourceType: item.sourceType || "manual",
    kind: item.kind || "decision",
    title: item.title || "결정 필요 항목",
    projectKey: item.projectKey || "",
    projectLabel: item.projectLabel || "",
    content: item.content || "",
    path: item.path || "",
    createdAt: item.createdAt || now,
    original: item.original || null,
  };
  store.items = store.items || {};
  store.items[id] = nextItem;
  await writeJsonFile(decisionQueuePath, store);
  await appendJsonl(decisionQueueAuditPath, { timestamp: now, id, action: "enqueue", item: nextItem });
  return nextItem;
}

function runCapture(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd: repoRoot, env: { ...process.env, ...(options.env || {}) } });
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

async function browseRemoteDrive(remotePath = "") {
  const { values: env } = await readEnvFile();
  const remote = env.RCLONE_REMOTE || "gdrive";
  const remoteRoot = String(env.RCLONE_REMOTE_PATH || "").replace(/^\/+|\/+$/g, "");
  const requested = String(remotePath || "").replace(/^\/+|\/+$/g, "");
  if (requested && isExcludedDrivePath(requested, env)) {
    return {
      remote,
      root: remoteRoot,
      currentPath: requested,
      blocked: true,
      items: [],
      error: `Excluded Drive path: ${requested}`,
    };
  }
  const fullPath = [remoteRoot, requested].filter(Boolean).join("/");
  const source = `${remote}:${fullPath}`.replace(/:$/, ":");
  const result = await runCapture("rclone", [
    "lsjson",
    source,
    "--max-depth",
    "1",
    "--no-mimetype",
    "--metadata",
    "--tpslimit",
    String(env.RCLONE_TPSLIMIT || 1),
    "--tpslimit-burst",
    "1",
  ], { timeoutMs: 35_000 });
  if (result.code !== 0) {
    return {
      remote,
      root: remoteRoot,
      currentPath: requested,
      blocked: false,
      items: [],
      error: result.stderr.slice(-2000) || result.stdout.slice(-2000) || `rclone lsjson failed: ${source}`,
    };
  }
  let parsed = [];
  try {
    parsed = JSON.parse(result.stdout || "[]");
  } catch {
    parsed = [];
  }
  const items = parsed
    .map((item) => {
      const name = String(item.Name || item.Path || "").replace(/\/+$/g, "");
      const childPath = [requested, name].filter(Boolean).join("/");
      return {
        name,
        remotePath: childPath,
        type: item.IsDir ? "directory" : "file",
        size: Number(item.Size || 0),
        updatedAt: item.ModTime || "",
      };
    })
    .filter((item) => item.name)
    .filter((item) => !isExcludedDrivePath(item.remotePath, env))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const parentPath = requested.includes("/") ? requested.split("/").slice(0, -1).join("/") : "";
  return {
    remote,
    root: remoteRoot,
    currentPath: requested,
    parentPath,
    blocked: false,
    items,
  };
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

function defaultDriveExcludePatterns(env = {}) {
  return String(env.RCLONE_EXCLUDE_PATTERNS || "Github/**,GitHub/**,github/**,Obsidian_wiki/**,obsidianwiki/**")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isExcludedDrivePath(path, env = {}) {
  const normalized = String(path || "").replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
  return defaultDriveExcludePatterns(env).some((pattern) => {
    const base = pattern.replace(/\*\*.*$/, "").replace(/\*.*$/, "").replace(/\/+$/, "").toLowerCase();
    return base && (normalized === base || normalized.startsWith(`${base}/`) || normalized.includes(`/${base}/`));
  });
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
    .map((token) => token.trim().replace(/(을|를|은|는|이|가|에서|으로|해서|해줘|해)$/g, ""))
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
  const lightOptions = glmLightTaskOptions(env, { maxTokens: 600, cap: 800 });
  const model = lightOptions.model;
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
      temperature: lightOptions.temperature,
      max_tokens: lightOptions.maxTokens,
      thinking: lightOptions.thinking,
      response_format: { type: "json_object" },
    }, {
      feature: "drive_instruction_light_plan",
      reason: "short safe routing plan for drive collection",
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
  const excludeArgs = defaultDriveExcludePatterns(env).flatMap((pattern) => ["--exclude", pattern]);
  const pages = await wikiIndex();
  const coverage = await coverageSummary().catch(() => ({ rows: [], statuses: {}, documentsInManifest: 0, processedDocuments: 0 }));
  const manifest = await readJsonFile(join(driveRuntime, "manifest.json"), { documents: [] });
  const runOutput = await readJsonFile(join(driveRuntime, "run_output.json"), { results: [] });
  const requiredKinds = ["hub", "overview", "sources", "evidence", "status", "business_flow", "ceo_brief", "pm_action", "customer_followup", "actions", "risks", "decisions", "conflict", "changelog"];
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
  const driveFolders = rclone.code === 0
    ? parseRcloneLsd(rclone.stdout).filter((folder) => !isExcludedDrivePath(folder.name, env))
    : [];
  const trackedFolders = new Set((coverage.rows || []).map((row) => row.folderPath).filter(Boolean));
  const manifestFolders = new Set((manifest.documents || []).map((doc) => doc.folder_path).filter(Boolean));
  const processedFiles = new Set((runOutput.results || []).map((result) => result.record?.file_path || result.file_path).filter(Boolean));
  const candidates = [];

  for (const folderInfo of driveFolders) {
    const folder = folderInfo.name;
    if (isExcludedDrivePath(folder, env)) continue;
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
      recommendedCommand: `rclone copy ${remote}:${remoteRoot ? `${remoteRoot}/${folder}` : folder} ${relative(repoRoot, join(driveRuntime, "mirror", safePathSegment(folder)))} --check-first --transfers 1 --checkers 1 --tpslimit ${env.RCLONE_TPSLIMIT || 1} ${excludeArgs.join(" ")}`,
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
    if (!relatedFolder || relatedFolder.overlap < 1 || isExcludedDrivePath(relatedFolder.folder, env)) continue;
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
      recommendedCommand: `rclone copy ${remote}:${remoteRoot ? `${remoteRoot}/${relatedFolder.folder}` : relatedFolder.folder} ${relative(repoRoot, join(driveRuntime, "mirror", safePathSegment(relatedFolder.folder)))} --check-first --transfers 1 --checkers 1 --tpslimit ${env.RCLONE_TPSLIMIT || 1} ${excludeArgs.join(" ")}`,
    });
  }

  const analysis = {
    createdAt: new Date().toISOString(),
    source,
    safety: {
      driveDeleteSource: false,
      remoteDeleteAllowed: false,
      commandSurface: "rclone lsd + selected rclone copy only",
      excludedPatterns: defaultDriveExcludePatterns(env),
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

async function targetRcloneCopy(remotePath, dryRun = true, options = {}) {
  const { values: env } = await readEnvFile();
  if (isExcludedDrivePath(remotePath, env)) {
    return {
      status: "blocked",
      error: `Excluded Drive path: ${remotePath}`,
      safety: "Google Drive Github/Obsidian_wiki folders are excluded to prevent self-ingestion loops.",
    };
  }
  const mirrorRoot = join(repoRoot, env.RCLONE_MIRROR_ROOT || "automation/drive_wikify/runtime/mirror", safePathSegment(remotePath));
  const existingMode = options.existingMode === "overwrite" ? "overwrite" : "skip-existing";
  const localMirrorExists = existsSync(mirrorRoot);
  if (localMirrorExists && existingMode === "skip-existing") {
    const entry = {
      runId: `${Date.now()}-target-rclone-skip`,
      command: dryRun ? "target-rclone-copy --dry-run" : "target-rclone-copy",
      status: "skipped",
      code: 0,
      stdout: `기수집 mirror가 있어 제외했습니다: ${relative(repoRoot, mirrorRoot)}`,
      stderr: "",
      createdAt: new Date().toISOString(),
      targetRemotePath: remotePath,
      targetMirrorRoot: relative(repoRoot, mirrorRoot),
      existingMode,
      progress: {
        summary: "기수집 대상 제외",
        currentFile: relative(repoRoot, mirrorRoot),
        updatedAt: new Date().toISOString(),
      },
      safety: "local mirror only; source Google Drive delete is not implemented",
    };
    await appendRunHistory(entry);
    return entry;
  }
  if (localMirrorExists && existingMode === "overwrite" && !dryRun) {
    await rm(mirrorRoot, { recursive: true, force: true });
  }
  return runCommand("rclone-copy", Boolean(dryRun), {
    extraArgs: ["--remote-path", remotePath, "--mirror-root", mirrorRoot],
    targeted: true,
    targetRemotePath: remotePath,
    targetMirrorRoot: relative(repoRoot, mirrorRoot),
    existingMode,
    localMirrorExisted: localMirrorExists,
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
  const wantsBusinessOpsConversion = /운영형|실무\s*중심|CEO|PM|프로젝트\s*허브|허브\s*연결|중복|충돌|컨버팅|컨버전|business\s*ops|status|decision\s*brief/i.test(command || "");
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
      ...(wantsBusinessOpsConversion ? [{
        type: "business_ops_conversion",
        targetProjects: [...new Set(targetPages.map((page) => page.projectKey).filter(Boolean))],
        applyMode: "preview_only",
        proposedChanges: {
          createOrUpdate: ["Status.md", "Business_Flow.md", "CEO_Brief.md", "PM_Action_Plan.md", "Customer_Followup.md", "Raw_Evidence_Index.md"],
          hubRole: "프로젝트 허브를 중복/충돌 방지 앵커와 CEO/PM 운영 브리프로 사용",
          sourcePreservation: "파일 원문과 긴 추출문은 요약으로 대체하지 않고 원문 경로/발췌/버전/한계를 보존",
        },
      }] : []),
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
              "사용자가 운영형/실무중심/CEO/PM/프로젝트 허브 연결/중복/충돌/컨버팅을 말하면 business_ops_conversion 작업을 포함한다.",
              "중요: 파일 해석 결과를 짧은 요약으로 대체하지 말고 원문/긴 추출문 보존, Raw_Evidence_Index, Evidence_Log, Decision Queue 승인 단계를 제안한다.",
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
      }, {
        feature: "wiki_management_plan",
        reason: "safe preview plan for wiki management command",
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
    "## 운영 원칙",
    "- 이 허브는 자료 보관함이 아니라 CEO/PM이 현재 상태, 막힌 지점, 다음 결정을 판단하는 운영 브리프입니다.",
    "- 파일/문서 원문은 요약으로 대체하지 않고 `Raw_Evidence_Index.md`, `Sources.md`, `Evidence_Log.md`에 원문 위치와 핵심 발췌를 분리 보존합니다.",
    "- LLM 변환 결과는 확정 지식이 아니라 Decision Queue 검토 후보입니다.",
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
    "- CEO 결정 필요: 확인 필요",
    "- PM 실행 필요: 확인 필요",
    "- 고객 후속 필요: 확인 필요",
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

function businessOpsDocScaffold(fileName, title, projectName, evidenceLinks = []) {
  const links = evidenceLinks.length ? evidenceLinks : ["- 아직 연결된 증적 없음"];
  const commonHeader = [
    `# ${title}`,
    "",
    "## 원문 보존 원칙",
    "- 파일/슬랙/Drive 문서 내용은 요약으로 대체하지 않습니다.",
    "- 이 문서는 CEO/PM 운영 판단을 위한 구조화 레이어이며, 원문과 긴 추출문은 Sources, Evidence_Log, Raw_Evidence_Index에 경로/발췌/버전으로 보존합니다.",
    "- LLM 해석은 확정이 아니라 검토 후보이며, 확정 반영은 Decision Queue 승인 후 수행합니다.",
    "",
    "## 연결 근거",
    ...links,
    "",
  ];
  const sections = {
    "Status.md": [
      "## 현재 상태",
      "- 단계: 확인 필요",
      "- 최근 추진: 확인 필요",
      "- 다음 액션: 확인 필요",
      "- 담당/Owner: 확인 필요",
      "- 고객 온도감: 확인 필요",
      "- 내부 준비도: 확인 필요",
      "- 의사결정 필요: 확인 필요",
      "",
      "## 상태 변경 이력",
      "| 일시 | 이전 상태 | 변경 상태 | 근거 | 판단 |",
      "| --- | --- | --- | --- | --- |",
    ],
    "Business_Flow.md": [
      "## 비즈니스 흐름",
      "| 단계 | 상태 | 근거 | 다음 게이트 | 담당 |",
      "| --- | --- | --- | --- | --- |",
      "| 리드/기회 | 확인 필요 |  |  |  |",
      "| 고객 미팅/요구사항 | 확인 필요 |  |  |  |",
      "| 제안/견적/PoC | 확인 필요 |  |  |  |",
      "| 기술 검증 | 확인 필요 |  |  |  |",
      "| 계약/과제/납품 | 확인 필요 |  |  |  |",
      "| 운영/확장 | 확인 필요 |  |  |  |",
      "",
      "## 흐름상 병목",
      "- 확인 필요",
    ],
    "CEO_Brief.md": [
      "## CEO 판단 브리프",
      "- 지금 볼 것: 현재 사업 단계, 수익/전략성, 리스크, 의사결정 기한",
      "- 결정 필요: 확인 필요",
      "- 추천안: 근거 부족",
      "",
      "## 선택지",
      "| 선택지 | 기대효과 | 비용/리스크 | 필요한 근거 | 추천 여부 |",
      "| --- | --- | --- | --- | --- |",
    ],
    "PM_Action_Plan.md": [
      "## PM 실행 계획",
      "| 액션 | Owner | 기한 | 선행조건 | 근거 | 상태 |",
      "| --- | --- | --- | --- | --- | --- |",
      "",
      "## 이번 주 실무 포인트",
      "- 확인 필요",
    ],
    "Customer_Followup.md": [
      "## 고객 후속 대응",
      "| 고객/상대 | 마지막 접점 | 요청/관심사 | 다음 연락 | 준비물 | 상태 |",
      "| --- | --- | --- | --- | --- | --- |",
      "",
      "## 고객에게 확인할 질문",
      "- 확인 필요",
    ],
    "Raw_Evidence_Index.md": [
      "## 원문/추출문 인덱스",
      "- 긴 파일 내용은 이 문서에서 원문 위치, 추출 산출물, 버전, 확인 한계를 연결합니다.",
      "- 운영 문서에는 판단 레이어만 두고, 근거 본문은 가능한 한 원문 경로와 발췌 단위로 추적합니다.",
      "",
      "| 원천 | 원문/추출 경로 | 유형 | 버전/일시 | 보존 범위 | 위키 반영 상태 |",
      "| --- | --- | --- | --- | --- | --- |",
    ],
  };
  return [...commonHeader, ...(sections[fileName] || [`## ${projectName} 운영 메모`, "- 확인 필요"])];
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
    ["Conflict_Register.md", "conflict", `${names.projectName} Conflict Register`, "명시적 충돌만 관리합니다."],
    ["Change_Log.md", "changelog", `${names.projectName} Change Log`, "위키 구조와 주요 내용 변경 이력을 기록합니다."],
  ];
  for (const [fileName, type, title, description] of projectDocs) {
    const result = await upsertManagedMarkdown(`${projectRoot}/${fileName}`, (before) => {
      const base = before || baseHubMarkdown(type, title, description);
      if (fileName === "Conflict_Register.md") {
        return base;
      }
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

function projectRootsFromTargets(entry, operation = {}, targetPages = []) {
  const roots = new Map();
  for (const page of targetPages || []) {
    const projectKey = page.projectKey || (page.path || "").split("/")[2] || "";
    if (!projectKey || !["project", "account"].includes(page.division || "")) continue;
    const projectLabel = page.projectLabel || projectKey.replace(/_/g, " ");
    roots.set(projectKey, {
      projectKey,
      projectLabel,
      root: `obsidian/Wiki/${projectKey}`,
      hubPath: page.docKind === "hub" ? page.path : `obsidian/Wiki/${projectKey}/hub.md`,
    });
  }
  const explicitProjectKey = operationValue(operation, ["projectKey", "project_key", "targetProjectKey", "target_project_key"]);
  if (explicitProjectKey && !roots.has(explicitProjectKey)) {
    roots.set(explicitProjectKey, {
      projectKey: explicitProjectKey,
      projectLabel: operationValue(operation, ["projectLabel", "project_label"]) || explicitProjectKey.replace(/_/g, " "),
      root: `obsidian/Wiki/${explicitProjectKey}`,
      hubPath: `obsidian/Wiki/${explicitProjectKey}/hub.md`,
    });
  }
  if (!roots.size) {
    const names = promotionNames(entry, operation);
    roots.set(names.projectKey, {
      projectKey: names.projectKey,
      projectLabel: names.projectName,
      root: `obsidian/Wiki/${names.projectKey}`,
      hubPath: `obsidian/Wiki/${names.projectKey}/hub.md`,
    });
  }
  return [...roots.values()];
}

async function applyBusinessOpsConversion(entry, operation, targetPages, dryRun) {
  const now = new Date().toISOString();
  const marker = `<!-- wiki-management:${entry.id}:business_ops_conversion -->`;
  const changed = [];
  const evidenceLinks = (targetPages || [])
    .filter((page) => page.path)
    .map((page) => `- ${wikiLinkFromPath(page.path)}: ${page.title || page.path}`)
    .slice(0, 40);
  const evidenceSummary = evidenceLinks.length
    ? evidenceLinks.slice(0, 6).map((line) => line.replace(/^- /, "")).join("<br>")
    : "연결 증적 없음";
  const roots = projectRootsFromTargets(entry, operation, targetPages);
  const opsDocs = [
    ["Status.md", "status", "Status"],
    ["Business_Flow.md", "business_flow", "Business Flow"],
    ["CEO_Brief.md", "ceo_brief", "CEO Brief"],
    ["PM_Action_Plan.md", "pm_action", "PM Action Plan"],
    ["Customer_Followup.md", "customer_followup", "Customer Follow-up"],
    ["Raw_Evidence_Index.md", "raw_evidence", "Raw Evidence Index"],
  ];

  for (const root of roots) {
    const eventMemo = changeEventMemo({
      timestamp: now,
      source: "wiki management business ops conversion",
      change: `${root.projectLabel} 운영형 허브/상태 문서 생성`,
      action: "Status, Business_Flow, CEO_Brief, PM_Action_Plan, Customer_Followup, Raw_Evidence_Index 연결",
    });
    const hubResult = await upsertManagedMarkdown(root.hubPath, (before) => {
      const base = before || baseHubMarkdown("hub", `${root.projectLabel} Project Hub`, `${root.projectLabel} 운영형 프로젝트 허브입니다.`);
      const lines = [
        "",
        "### 운영형 위키 전환",
        `- 전환 시각: ${now}`,
        `- 명령: ${entry.command}`,
        "- 목적: 수집 자료를 단순 요약하지 않고 원문 보존, 실무 상태, CEO/PM 의사결정, 고객 후속, PM 액션으로 분리 관리",
        "- 중복 방지: 프로젝트 허브를 기준 앵커로 삼고 새 자료는 Status/Business_Flow/CEO_Brief/PM_Action_Plan/Customer_Followup/Raw_Evidence_Index 후보로 라우팅",
        "- 충돌 방지: 상충 수치/일정/버전/주장은 Conflict_Register 또는 Decision Queue 검토 대상으로 유지",
        "- 원문 보존: 파일 원문과 긴 추출문은 요약 대체 금지. Raw_Evidence_Index와 Evidence_Log에 원천 경로, 추출 산출물, 버전, 한계를 남김",
        `- 상태 변화 메모: ${eventMemo}`,
        "",
        "### 운영 링크",
        `- Status: ${wikiLinkFromPath(`${root.root}/Status.md`)}`,
        `- Business Flow: ${wikiLinkFromPath(`${root.root}/Business_Flow.md`)}`,
        `- CEO Brief: ${wikiLinkFromPath(`${root.root}/CEO_Brief.md`)}`,
        `- PM Action Plan: ${wikiLinkFromPath(`${root.root}/PM_Action_Plan.md`)}`,
        `- Customer Follow-up: ${wikiLinkFromPath(`${root.root}/Customer_Followup.md`)}`,
        `- Raw Evidence Index: ${wikiLinkFromPath(`${root.root}/Raw_Evidence_Index.md`)}`,
        "",
        "### 연결 대상 증적",
        ...evidenceLinks,
      ];
      return appendManagedBlock(base, marker, `Business Ops Conversion ${now}`, lines);
    }, dryRun);
    if (hubResult) changed.push({ ...hubResult, operation: "business_ops_conversion" });

    for (const [fileName, type, label] of opsDocs) {
      const result = await upsertManagedMarkdown(`${root.root}/${fileName}`, (before) => {
        const heading = `${root.projectLabel} ${label}`;
        const base = before || [
          "---",
          `type: ${type}`,
          `created: ${now.slice(0, 10)}`,
          `updated: ${now.slice(0, 10)}`,
          'source: "wiki management business ops conversion"',
          "---",
          "",
          ...businessOpsDocScaffold(fileName, heading, root.projectLabel, evidenceLinks),
          "",
        ].join("\n");
        const lines = [
          `- 명령: ${entry.command}`,
          `- 실행시각: ${now}`,
          `- 프로젝트 허브: ${wikiLinkFromPath(root.hubPath)}`,
          "- 실무 의미: 수집 자료를 CEO/PM 운영 판단에 쓰기 위한 구조화 후보를 생성",
          "- 보존 원칙: 원문/긴 추출문을 요약으로 대체하지 않고 Raw_Evidence_Index/Evidence_Log에서 추적",
          `- 상태 변화 메모: ${eventMemo}`,
          `- 대표 연결 증적: ${evidenceSummary}`,
        ];
        return appendManagedBlock(base, marker, `Business Ops Conversion ${now}`, lines);
      }, dryRun);
      if (result) changed.push({ ...result, operation: "business_ops_conversion" });
    }

    if (!dryRun) {
      await enqueueDecisionQueueItem({
        id: `business-ops-${entry.id}-${root.projectKey}`,
        sourceType: "wiki_management",
        kind: "business_ops_conversion",
        title: `운영형 위키 전환 검토: ${root.projectLabel}`,
        projectKey: root.projectKey,
        projectLabel: root.projectLabel,
        path: root.hubPath,
        content: [
          "프로젝트 허브를 운영형 관리 앵커로 연결했습니다.",
          "CEO/PM 판단 문서와 Raw_Evidence_Index가 생성/갱신되었습니다.",
          "파일 원문은 요약 대체 금지이며, 실제 근거 발췌와 상태 판단은 검토 후 승인해야 합니다.",
        ].join("\n"),
      });
    }
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
  const shouldConvertBusinessOps = structuralOps.some((operation) => /business[_-]?ops|operational|status|ceo|pm|hub[_-]?link|컨버|운영형|실무|허브\s*연결|중복|충돌/i.test(operation.type || ""))
    || /운영형|실무\s*중심|CEO|PM|프로젝트\s*허브|허브\s*연결|중복|충돌|컨버팅|컨버전|business\s*ops/i.test(entry.command || "");
  if (shouldConvertBusinessOps) {
    const opsOperation = structuralOps.find((operation) => /business[_-]?ops|operational|status|ceo|pm|hub[_-]?link|컨버|운영형|실무|허브\s*연결/i.test(operation.type || "")) || { type: "business_ops_conversion" };
    const opsChanges = await applyBusinessOpsConversion(entry, opsOperation, targetPages, dryRun);
    changedFiles.push(...opsChanges);
  }
  const unsupportedStructuralOps = structuralOps
    .filter((operation) => !/project|customer|account|promotion|promote|승격|business[_-]?ops|operational|status|ceo|pm|hub[_-]?link|컨버|운영형|실무|허브\s*연결/i.test(operation.type || ""))
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

function parseRcloneProgressText(text = "") {
  const normalized = String(text || "").replace(/\r/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const oneLineProgressMatches = [...normalized.matchAll(/([\d.]+\s*(?:B|KiB|MiB|GiB|TiB)\s*\/\s*[\d.]+\s*(?:B|KiB|MiB|GiB|TiB),\s*[\d.]+%,\s*[^,\n]+\/s,\s*ETA\s*[^()\n]+(?:\s*\(xfr#[^)]+\))?)/gi)];
  const progress = {
    summary: "",
    transferred: "",
    percent: null,
    speed: "",
    eta: "",
    currentFile: "",
    lastLogLine: lines.at(-1) || "",
    recentLines: lines.slice(-8),
    updatedAt: new Date().toISOString(),
  };
  if (oneLineProgressMatches.length) {
    const latest = oneLineProgressMatches.at(-1)[1].trim();
    progress.summary = latest;
    const parts = latest.match(/^([^,]+),\s*([\d.]+)%,\s*([^,]+),\s*ETA\s*([^()]+)/i);
    if (parts) {
      progress.transferred = parts[1].trim();
      progress.percent = Number(parts[2]);
      progress.speed = parts[3].trim();
      progress.eta = parts[4].trim();
    }
  }
  for (const line of lines.slice(-80)) {
    if (/Transferred:/i.test(line)) {
      progress.summary = line;
      const transferred = line.match(/Transferred:\s*([^,]+(?:,\s*[^,]+)?)/i);
      if (transferred) progress.transferred = transferred[1].trim();
      const percent = line.match(/(\d+(?:\.\d+)?)%/);
      if (percent) progress.percent = Number(percent[1]);
      const speed = line.match(/,\s*([^,]+\/s),/i);
      if (speed) progress.speed = speed[1].trim();
      const eta = line.match(/ETA\s+([^,\s]+)/i);
      if (eta) progress.eta = eta[1].trim();
    }
    const fileMatch = line.match(/(?:^|\s)(?:Transferring|Transferred|Copied|Checks?):\s*(.+)$/i)
      || line.match(/^\*\s+(.+?):\s*(?:transferring|copied|checking)/i)
      || line.match(/INFO\s+:\s+(.+?):\s+(?:Copied|Updated|Deleted|Skipped|Transferred|Checks?)/i);
    if (fileMatch) progress.currentFile = fileMatch[1].trim();
  }
  return progress;
}

async function runCommand(command, dryRun, meta = {}) {
  const allowed = new Set(["rclone-copy", "build-manifest", "run", "refresh-global", "slack-collect"]);
  if (!allowed.has(command)) {
    throw new Error(`Unsupported automation command: ${command}`);
  }
  const { values: configEnv } = await readEnvFile();
  const { extraArgs = [], ...entryMeta } = meta;
  const args = ["-m", "drive_wikify.cli", command];
  if ((command === "rclone-copy" || command === "slack-collect") && dryRun) args.push("--dry-run");
  args.push(...extraArgs);

  const env = {
    ...process.env,
    PYTHONPATH: driveWikifySrc,
  };
  const copyTimeoutMinutes = command === "rclone-copy" && !dryRun ? rcloneCopyTimeoutMinutes(configEnv, meta) : null;
  const timeoutMs = command === "rclone-copy" && !dryRun
    ? Math.max(1, Number(copyTimeoutMinutes || 30)) * 60 * 1000
    : command === "slack-collect"
      ? Math.max(1, Number(configEnv.SLACK_COLLECT_MAX_MINUTES || 10)) * 60 * 1000
    : command === "refresh-global"
      ? 1000 * 60 * 3
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
    let progress = parseRcloneProgressText("");
    let stopped = false;
    let timedOut = false;
    const child = spawn(python, args, { cwd: repoRoot, env });
    const timeout = setTimeout(() => {
      stopped = true;
      timedOut = true;
      child.kill("SIGTERM");
      stderr += `\nReached configured collection window (${Math.round(timeoutMs / 60000)} minutes). Stopped safely; rerun will resume from local mirror.`;
    }, timeoutMs);
    const updateProgress = () => {
      progress = command === "rclone-copy"
        ? parseRcloneProgressText(`${stdout}\n${stderr}`)
        : { lastLogLine: `${stdout}\n${stderr}`.trim().split("\n").filter(Boolean).at(-1) || "", updatedAt: new Date().toISOString() };
      const job = activeJobs.get(runId);
      if (job) job.progress = progress;
      return progress;
    };
    activeJobs.set(runId, {
      runId,
      command: commandLabel,
      status: "running",
      child,
      startedAt,
      progress,
      stop: () => {
        stopped = true;
        stderr += "\nStopped by user.";
        child.kill("SIGTERM");
      },
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      updateRunHistory(runId, { stdout: stdout.slice(-8000), stderr: stderr.slice(-8000), progress: updateProgress() }).catch(() => {});
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      updateRunHistory(runId, { stdout: stdout.slice(-8000), stderr: stderr.slice(-8000), progress: updateProgress() }).catch(() => {});
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
        progress: updateProgress(),
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
        progress: updateProgress(),
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
      await recordLlmUsage({
        provider: "local-rule",
        feature: `automation:${command}`,
        reason: "automation command executed without GLM inference",
        status: finalEntry.status,
        durationMs: Date.parse(finalEntry.finishedAt) - Date.parse(startedAt),
        tokens: {},
        fallback: dryRun ? "dry_run" : "",
      }).catch(() => null);
      await suggestPaperclipAfterAutomation(command, finalEntry).catch(() => {});
      resolvePromise(finalEntry);
    });
  });
}

async function suggestPaperclipAfterAutomation(command, finalEntry = {}) {
  const nextTemplateByCommand = {
    "rclone-copy": "manifest-builder",
    "build-manifest": "wiki-ingest-operator",
    run: "validator",
  };
  const templateId = nextTemplateByCommand[command];
  if (!templateId) return null;
  const signature = `automation:${command}:${finalEntry.runId}:${templateId}`;
  const existing = await readJsonFile(paperclipTasksPath, []);
  if (existing.some((task) => task.payload?.agentSignature === signature)) return null;
  return createPaperclipTask(templateId, {
    title: `Paperclip Agent 다음 단계 · ${templateId}`,
    status: "agent_suggested",
    payload: {
      source: "automation_background_agent",
      command,
      runId: finalEntry.runId,
      runStatus: finalEntry.status,
      agentSignature: signature,
      approvalRequired: true,
      note: [
        `${command} 완료 후 다음 단계 후보입니다.`,
        "자동 실행하지 않고 사용자가 Paperclip Studio에서 검토/실행합니다.",
        finalEntry.collectionSummary ? JSON.stringify(finalEntry.collectionSummary) : "",
      ].filter(Boolean).join("\n"),
    },
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

async function continueAfterCollection() {
  if (activeJobs.size) {
    return {
      status: "blocked",
      reason: "automation_running",
      running: [...activeJobs.values()].map((job) => ({
        runId: job.runId,
        command: job.command,
        status: job.status,
        startedAt: job.startedAt,
        progress: job.progress,
      })),
    };
  }
  const steps = [];
  steps.push(await runCommand("build-manifest", false, { source: "continue_after_collection" }));
  steps.push(await runCommand("run", false, { source: "continue_after_collection" }));
  steps.push(await runCommand("refresh-global", false, { source: "continue_after_collection" }));
  return {
    runId: `${Date.now()}-continue-after-collection`,
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
      status: job.status || "running",
      startedAt: job.startedAt,
      progress: job.progress || {},
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
  const allowed = new Set(["rclone-copy", "build-manifest", "run", "full-cycle", "slack-collect", "mirror-cleanup"]);
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
    completionMode: body.completionMode === "timebox" ? "timebox" : "objective",
    connectionPolicy: body.connectionPolicy === "stop" ? "stop" : "retry",
    retryAfterMinutes: Math.max(1, Number(body.retryAfterMinutes || 10)),
    retentionDays: Number(body.retentionDays || 0) || undefined,
    scope: body.scope === "all" ? "all" : body.scope === "uploads" ? "uploads" : undefined,
    cleanupMode: body.cleanupMode === "processed" || body.cleanupMode === "processed_or_age" ? body.cleanupMode : body.cleanupMode === "age" ? "age" : undefined,
    retentionMaxBytes: Number(body.retentionMaxBytes || 0) || undefined,
    retentionManaged: Boolean(body.retentionManaged),
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
  if (schedule.command === "mirror-cleanup") {
    const { values: env } = await readEnvFile();
    const result = await cleanupMirrorData({
      env,
      scope: schedule.scope === "all" ? "all" : "uploads",
      olderThanDays: Math.max(1, Number(schedule.retentionDays || 7)),
      dryRun: Boolean(schedule.dryRun),
      cleanupMode: schedule.cleanupMode === "processed" || schedule.cleanupMode === "processed_or_age" ? schedule.cleanupMode : "age",
      thresholdBytes: Math.max(0, Number(schedule.retentionMaxBytes || 0)),
    });
    const entry = {
      runId: `${Date.now()}-mirror-cleanup`,
      command: schedule.command,
      status: "completed",
      code: 200,
      stdout: [
        `scope=${result.scope}`,
        `olderThanDays=${result.olderThanDays}`,
        `cleanupMode=${result.cleanupMode || "age"}`,
        `thresholdBytes=${result.thresholdBytes || 0}`,
        `currentBytes=${result.currentBytes || 0}`,
        `skipped=${Boolean(result.skipped)}`,
        `matchedFiles=${result.matchedFiles}`,
        `deletedFiles=${result.deletedFiles}`,
        `deletedDirectories=${result.deletedDirectories}`,
        `freedBytes=${result.freedBytes}`,
      ].join("\n"),
      stderr: "",
      createdAt: new Date().toISOString(),
      scheduleId: schedule.id,
      retentionManaged: Boolean(schedule.retentionManaged),
    };
    await appendRunHistory(entry);
    return entry;
  }
  return runCommand(schedule.command, Boolean(schedule.dryRun), meta);
}

async function tickSchedules() {
  const now = new Date();
  const schedules = await readJsonFile(schedulesPath, []);
  let changed = false;
  for (const schedule of schedules) {
    if (!schedule.enabled || !schedule.nextRunAt || new Date(schedule.nextRunAt) > now) continue;
    if (activeJobs.size > 0) {
      const retryMinutes = Math.max(1, Number(schedule.retryAfterMinutes || 5));
      schedule.nextRunAt = new Date(now.getTime() + retryMinutes * 60 * 1000).toISOString();
      changed = true;
      continue;
    }
    schedule.lastRunAt = now.toISOString();
    schedule.nextRunAt = schedule.mode === "once" ? "" : nextScheduleRun(schedule, now);
    if (schedule.mode === "once") schedule.enabled = false;
    changed = true;
    runScheduledCommand(schedule).catch((error) => {
      if (schedule.connectionPolicy !== "stop") {
        const retryMinutes = Math.max(1, Number(schedule.retryAfterMinutes || 10));
        readJsonFile(schedulesPath, [])
          .then((latestSchedules) => saveSchedules(latestSchedules.map((latestSchedule) => (
            latestSchedule.id === schedule.id
              ? { ...latestSchedule, enabled: true, nextRunAt: new Date(Date.now() + retryMinutes * 60 * 1000).toISOString() }
              : latestSchedule
          ))))
          .catch(() => {});
      }
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

const readOnlyChatAutoTemplateIds = [
  "os-file-browser",
  "filesystem-wiki-intake",
  "rhwp-hwp-reader",
  "pdf-document-reader",
  "pptx-slide-reader",
  "spreadsheet-stat-analyzer",
  "grant-rfp-strategy",
  "grant-presentation-eval-strategy",
];

const approvalRequiredChatTemplateIds = [
  "wiki-ingest-operator",
  "drive-collector",
  "slack-evidence-collector",
  "manifest-builder",
  "openclaw-cycle",
  "wiki-ops-converter",
];

function chatPaperclipFollowupRequested(message = "") {
  return /(계속|결과\s*확인|이어서|진행(?:\s*상태)?\s*확인|상태\s*확인|방금.*(분석|결과|진행)|partial\s*report|final\.md)/i.test(String(message || ""));
}

function extractMentionedPaperclipTaskId(message = "") {
  return String(message || "").match(/\b\d{10,}-[a-z0-9-]+\b/i)?.[0] || "";
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

function glmLightTaskOptions(env = {}, defaults = {}) {
  const maxTokens = Number(process.env.GLM_LIGHT_MAX_TOKENS || env.GLM_LIGHT_MAX_TOKENS || defaults.maxTokens || 1000);
  return {
    model: process.env.GLM_LIGHT_MODEL || env.GLM_LIGHT_MODEL || "glm-4.5-air",
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, defaults.cap || 1500) : (defaults.maxTokens || 1000),
    thinking: { type: "disabled" },
    temperature: defaults.temperature ?? 0.1,
  };
}

function glmDecisionTriageOptions(env = {}) {
  const maxTokens = Number(process.env.GLM_DECISION_MAX_TOKENS || env.GLM_DECISION_MAX_TOKENS || 900);
  return {
    model: process.env.GLM_DECISION_MODEL || env.GLM_DECISION_MODEL || "glm-4.5-air",
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 1200) : 900,
    thinking: { type: "disabled" },
    temperature: 0.1,
  };
}

function glmDecisionFinalOptions(env = {}) {
  const maxTokens = Number(process.env.GLM_DECISION_FINAL_MAX_TOKENS || env.GLM_DECISION_FINAL_MAX_TOKENS || 1400);
  return {
    model: process.env.GLM_DECISION_FINAL_MODEL || env.GLM_DECISION_FINAL_MODEL || process.env.GLM_MODEL || env.GLM_MODEL || "glm-5.1",
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 2400) : 1400,
    thinking: glmThinkingOptions(env),
    temperature: 0.05,
  };
}

function glmConflictMergeOptions(env = {}) {
  const maxTokens = Number(process.env.GLM_CONFLICT_MAX_TOKENS || env.GLM_CONFLICT_MAX_TOKENS || 2800);
  return {
    model: process.env.GLM_CONFLICT_MODEL || env.GLM_CONFLICT_MODEL || process.env.GLM_MODEL || env.GLM_MODEL || "glm-4.5",
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 5000) : 2800,
    thinking: glmThinkingOptions(env),
    temperature: 0.1,
  };
}

function glmContextMode(env = {}, requested = "") {
  const mode = requested || process.env.GLM_CONTEXT_MODE || env.GLM_CONTEXT_MODE || "standard";
  return ["economy", "standard", "deep"].includes(mode) ? mode : "standard";
}

async function requestGlmChatCompletion(apiUrl, apiKey, body, options = {}) {
  const primary = normalizeGlmChatUrl(apiUrl);
  const codingFallback = codingPlanGlmUrl(apiUrl);
  const candidates = [primary, codingFallback].filter(Boolean);
  const timeoutMs = Number(options.timeoutMs || process.env.GLM_TIMEOUT_MS || 45000);
  const started = Date.now();
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
        await recordLlmUsage({
          feature: options.feature || "glm_chat_completion",
          reason: options.reason || "semantic reasoning or generation",
          model: requestBody.model || body.model || "",
          endpoint: url.includes("/api/coding/paas/") ? "coding" : "paas",
          status: "completed",
          durationMs: Date.now() - started,
          tokens: payload.usage || { estimatedInputChars: JSON.stringify(requestBody).length, estimatedOutputChars: JSON.stringify(payload).length },
        }).catch(() => null);
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

  await recordLlmUsage({
    feature: options.feature || "glm_chat_completion",
    reason: options.reason || "semantic reasoning or generation",
    model: body.model || "",
    status: "failed",
    durationMs: Date.now() - started,
    error: lastError?.message || "GLM request failed",
    fallback: options.fallback || "caller_local_fallback",
  }).catch(() => null);
  throw lastError || new Error("GLM request failed");
}

async function glmDigest(text, projectHint) {
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const shortInput = String(text || "").length <= 8000;
  const lightOptions = shortInput ? glmLightTaskOptions(env, { maxTokens: 1100, cap: 1300 }) : null;
  const model = lightOptions?.model || process.env.GLM_MODEL || env.GLM_MODEL || "glm-4.5";
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
      temperature: lightOptions?.temperature ?? 0.1,
      max_tokens: lightOptions?.maxTokens || 1200,
      thinking: lightOptions?.thinking || glmThinkingOptions(env),
      response_format: { type: "json_object" },
    }, {
      feature: shortInput ? "ingest_light_digest" : "ingest_digest",
      reason: shortInput ? "short Korean wiki ingest digest" : "long evidence-preserving wiki ingest digest",
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

function localConflictMergeSuggestion(body = {}) {
  const sourceLines = String(body.sourceMarkdown || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const targetLines = String(body.targetMarkdown || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const sourceOnly = sourceLines.filter((line) => line && !targetLines.includes(line)).slice(0, 5);
  const targetOnly = targetLines.filter((line) => line && !sourceLines.includes(line)).slice(0, 5);
  return {
    provider: "local-fallback",
    summary: "GLM 연결이 없어서 규칙 기반 병합 초안을 생성했습니다. 출처 우선으로 보되 대상 문서의 기존 구조를 유지하는 방식으로 검토하세요.",
    conflictingPoints: [
      ...sourceOnly.map((line) => `출처에만 있는 내용: ${line}`),
      ...targetOnly.map((line) => `대상에만 있는 내용: ${line}`),
    ].slice(0, 8),
    mergeStrategy: [
      "출처의 최신 사실과 수치를 우선 검토합니다.",
      "대상 문서의 섹션 구조와 기존 문맥은 가능하면 유지합니다.",
      "불확실한 문장은 삭제하지 말고 확인 필요 메모로 남깁니다.",
    ],
    caution: "자동 병합안이므로 최신값, 고객 확인 필요 항목, 수치 충돌은 사용자가 최종 검토해야 합니다.",
    mergedMarkdown: String(body.sourceMarkdown || body.targetMarkdown || "").trim(),
  };
}

async function verifyDecisionFinalApproval(item = {}, body = {}, target = {}, workspaceId = "rtm") {
  if (isDeletionDecisionItem(item)) {
    try {
      deletableWikiPath(item.path || body.path || "", workspaceId);
      return {
        provider: "local-rule",
        model: "",
        decision: "approve",
        reason: "삭제 후보 카드로 판정되었고, 삭제 허용 루트 및 보호 문서 규칙을 통과했습니다.",
        blockingIssues: [],
        safeAppendNote: "승인 시 Decisions append 대신 실제 문서 삭제와 deletion audit 기록을 수행합니다.",
      };
    } catch (error) {
      return {
        provider: "local-rule",
        model: "",
        decision: "investigate",
        reason: error instanceof Error ? error.message : "삭제 허용 규칙 검증 실패",
        blockingIssues: ["delete_guard_failed"],
        safeAppendNote: "",
      };
    }
  }
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const options = glmDecisionFinalOptions(env);
  const local = {
    provider: "local-rule",
    model: "",
    decision: target.targetPath && (item.projectKey || target.projectKey) ? "approve" : "investigate",
    reason: target.targetPath ? "projectKey와 반영 경로가 계산되어 사용자 승인을 로컬 규칙으로 통과시켰습니다." : "반영 경로 또는 projectKey가 불명확합니다.",
    blockingIssues: target.targetPath ? [] : ["missing_target_path_or_project_key"],
    safeAppendNote: "",
  };
  if (!apiKey || !apiUrl) return local;
  const payload = {
    workspaceId,
    userAction: body.action || "approve",
    item: {
      id: item.id,
      title: item.title,
      kind: item.kind,
      sourceType: item.sourceType,
      projectKey: item.projectKey || target.projectKey || "",
      projectLabel: item.projectLabel || target.projectLabel || "",
      content: item.content,
      sourcePath: item.path || "",
      note: body.note || "",
    },
    target: {
      targetFile: target.targetFile || "",
      targetPath: target.targetPath ? relative(repoRoot, target.targetPath) : "",
      mode: target.mode || "",
    },
    policy: {
      scope: "wiki_data_consistency_only",
      block_if_missing_project_or_target: true,
      output_json_only: true,
    },
  };
  try {
    const { payload: completion, endpoint } = await requestGlmChatCompletion(apiUrl, apiKey, {
      model: options.model,
      messages: [
        {
          role: "system",
          content: [
            "당신은 Obsidian 위키 반영 직전 최종 승인 검증자다.",
            "Decision Deck 항목은 업무 리스크가 아니라 위키 데이터 정합성/충돌 관리 대상이다.",
            "사용자의 승인 의도가 있어도 projectKey, targetPath, 근거 path, Conflict_Register/Decisions 반영 적합성이 불명확하면 approve하지 않는다.",
            "반드시 JSON 객체만 반환한다: decision, reason, blockingIssues, safeAppendNote.",
            "decision은 approve, hold, investigate 중 하나다.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      thinking: options.thinking,
      response_format: { type: "json_object" },
    }, {
      feature: "decision_final_approval",
      reason: "top model gate before writing approved decision to wiki",
      fallback: "local_decision_final_rule",
    });
    const parsed = JSON.parse(glmMessageContent(completion) || "{}");
    const decision = ["approve", "hold", "investigate"].includes(parsed.decision) ? parsed.decision : "investigate";
    return {
      provider: "glm",
      model: options.model,
      endpoint,
      decision,
      reason: String(parsed.reason || "").trim(),
      blockingIssues: Array.isArray(parsed.blockingIssues) ? parsed.blockingIssues.map((issue) => String(issue)).filter(Boolean) : [],
      safeAppendNote: String(parsed.safeAppendNote || "").trim(),
    };
  } catch (error) {
    return {
      ...local,
      provider: "local-rule",
      upstreamStatus: error.message,
      reason: `${local.reason} GLM 최종 검증 실패: ${error.message}`,
    };
  }
}

async function suggestConflictMerge(body = {}) {
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const conflictOptions = glmConflictMergeOptions(env);
  const model = conflictOptions.model;
  if (!apiKey || !apiUrl) return localConflictMergeSuggestion(body);
  try {
    const payload = {
      id: body.id || "",
      title: body.title || "",
      content: body.content || "",
      projectKey: body.projectKey || "",
      projectLabel: body.projectLabel || "",
      sourcePath: body.sourcePath || "",
      targetPath: body.targetPath || "",
      sourceMarkdown: String(body.sourceMarkdown || "").slice(0, 18000),
      targetMarkdown: String(body.targetMarkdown || "").slice(0, 18000),
    };
    const { payload: completion, endpoint } = await requestGlmChatCompletion(apiUrl, apiKey, {
      model,
      messages: [
        {
          role: "system",
          content: [
            "당신은 Obsidian 위키 충돌 병합 보조자다.",
            "반드시 한국어 JSON 객체만 반환한다.",
            "입력으로 출처 문서와 대상 문서를 비교해 사용자가 실무적으로 판단할 수 있는 병합안을 제시한다.",
            "사실 확정이 어려운 항목은 단정하지 말고 확인 필요로 둔다.",
            "키는 정확히 summary, conflictingPoints, mergeStrategy, caution, mergedMarkdown 를 사용한다.",
            "conflictingPoints 와 mergeStrategy 는 문자열 배열이다.",
            "mergedMarkdown 는 대상 문서에 붙여넣을 수 있는 추천 병합 초안 전체다.",
            "출처 수치나 일정이 더 최신으로 보이면 그 근거를 반영하되, 불확실하면 [확인 필요] 표기를 남긴다.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
      temperature: conflictOptions.temperature,
      max_tokens: conflictOptions.maxTokens,
      thinking: conflictOptions.thinking,
      response_format: { type: "json_object" },
    }, {
      feature: "conflict_merge_suggestion",
      reason: "user-triggered conflict merge proposal in decision deck",
      fallback: "local_conflict_merge",
    });
    const content = glmMessageContent(completion);
    const parsed = JSON.parse(content || "{}");
    return {
      provider: "glm",
      model,
      endpoint,
      summary: String(parsed.summary || "").trim(),
      conflictingPoints: Array.isArray(parsed.conflictingPoints) ? parsed.conflictingPoints.map((item) => String(item)).filter(Boolean) : [],
      mergeStrategy: Array.isArray(parsed.mergeStrategy) ? parsed.mergeStrategy.map((item) => String(item)).filter(Boolean) : [],
      caution: String(parsed.caution || "").trim(),
      mergedMarkdown: String(parsed.mergedMarkdown || "").trim(),
    };
  } catch (error) {
    return {
      ...localConflictMergeSuggestion(body),
      upstreamStatus: error.message,
      summary: `GLM 병합안 생성에 실패해 규칙 기반 초안으로 대체했습니다. ${error.message}`,
    };
  }
}

function routeChatSkills(message, evidence = [], paperclip = null, options = {}) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  const browserBlock = inspectBrowserPathBlock(text);
  const uploadContext = inspectUploadContextBlock(text);
  const localPaths = extractLocalPaths(text, ["hwp", "hwpx", "pdf", "docx", "pptx", "xlsx", "xls", "csv", "html", "htm"]);
  const needsFileBrowsing = browserBlock.hasBlock
    || uploadContext.hasBlock
    || /os 파일|파일 브라우징|파일 브라우저|폴더 조회|디렉터리 조회|directory|folder|browse|tree|ls\b|find\b|manifest|경로 분석|파일 구조/i.test(text);
  const needsFilesystemWikiIntake = /(rclone|로컬 파일시스템|내부 파일시스템|local filesystem).*(위키화|반영|ingest|수집)|((위키화|반영|ingest).*(폴더|디렉터리|파일시스템|filesystem))/i.test(text);
  const needsHwp = localPaths.some((path) => [".hwp", ".hwpx"].includes(extname(path).toLowerCase()))
    || browserBlock.extensions.some((ext) => [".hwp", ".hwpx"].includes(ext))
    || uploadContext.extensions.some((ext) => [".hwp", ".hwpx"].includes(ext))
    || uploadContext.routes.includes("rhwp-hwp-reader")
    || /\.(hwp|hwpx)\b/i.test(text);
  const needsPdf = localPaths.some((path) => extname(path).toLowerCase() === ".pdf")
    || browserBlock.extensions.includes(".pdf")
    || uploadContext.extensions.includes(".pdf")
    || uploadContext.routes.includes("pdf-document-reader")
    || /\.pdf\b|pdf 문서|피디에프/i.test(text);
  const needsPptx = localPaths.some((path) => extname(path).toLowerCase() === ".pptx")
    || browserBlock.extensions.includes(".pptx")
    || uploadContext.extensions.includes(".pptx")
    || uploadContext.routes.includes("pptx-slide-reader")
    || /\.(pptx|ppt)\b|powerpoint|파워포인트|슬라이드|발표자료|피피티/i.test(text);
  const needsSpreadsheet = localPaths.some((path) => [".xlsx", ".xls", ".csv"].includes(extname(path).toLowerCase()))
    || browserBlock.extensions.some((ext) => [".xlsx", ".xls", ".csv"].includes(ext))
    || uploadContext.extensions.some((ext) => [".xlsx", ".xls", ".csv"].includes(ext))
    || uploadContext.routes.includes("spreadsheet-stat-analyzer")
    || /\.(xlsx|xls|csv)\b/i.test(text);
  const needsGrantRfp = /공고|rfp|사업계획서|연구개발계획서|작성양식|평가방안|심사표|평가기준|지원 가능|지원가능|support gate|kpi|성과지표|연차계획|예산 전략|국책과제|바우처/i.test(text)
    || uploadContext.files.some((item) => /공고|rfp|사업계획서|평가기준|작성양식|지원자격|지원 규모/i.test(`${item.path} ${item.summary}`));
  const totalContextFiles = browserBlock.fileCount + uploadContext.fileCount;
  const needsGrantPresentationEval = (
    /발표평가|평가위원|발표자료 작성|발표자료 전략|발표전략|슬라이드별|발표시간|예상\s*q&a|예상질의|백업 장표|본 발표 장표|발표 장표|장표 제목/i.test(text)
    || uploadContext.files.some((item) => /발표자료|발표평가|회의자료|심사표|평가표/i.test(`${item.path} ${item.summary}`))
  ) && (needsGrantRfp || needsPptx || totalContextFiles >= 2);
  const wantsComprehensiveAnalysis = totalContextFiles >= 3
    || (totalContextFiles >= 2 && (needsGrantRfp || needsGrantPresentationEval || needsHwp || needsPdf || needsPptx || needsSpreadsheet));
  const needsValidation = wantsComprehensiveAnalysis
    || /검수|검증|coverage|커버리지|누락|충돌|conflict|정합|리스크 점검|근거 점검/i.test(lower)
    || evidence.some((item) => item.docKind === "conflict" || (item.conflicts || []).length);
  const needsWikiOpsConversion = /운영형|실무\s*중심|CEO|PM|프로젝트\s*허브|허브\s*연결|중복|충돌|컨버팅|컨버전|business\s*ops|status|decision\s*brief|위키\s*관리\s*llm/i.test(text);
  const blockedWriteActions = [];
  const suggestedTemplateIds = [];
  if (/위키화|반영|실행|run\b|ingest|수집|manifest|rclone|openclaw|동기화/i.test(lower)) {
    if (/manifest|목록/i.test(lower)) suggestedTemplateIds.push("manifest-builder");
    if (/rclone|수집/i.test(lower)) suggestedTemplateIds.push("drive-collector");
    if (/openclaw/i.test(lower)) suggestedTemplateIds.push("openclaw-cycle");
    if (/위키화|반영|ingest|run\b|동기화/i.test(lower)) suggestedTemplateIds.push("wiki-ingest-operator");
    blockedWriteActions.push("wiki_or_drive_write_requested");
  }
  if (needsFileBrowsing) suggestedTemplateIds.push("os-file-browser");
  if (needsFilesystemWikiIntake) suggestedTemplateIds.push("filesystem-wiki-intake");
  if (needsWikiOpsConversion) suggestedTemplateIds.push("wiki-ops-converter");
  if (needsGrantRfp) suggestedTemplateIds.push("grant-rfp-strategy");
  if (needsGrantPresentationEval) suggestedTemplateIds.push("grant-presentation-eval-strategy");
  if (needsHwp) suggestedTemplateIds.push("rhwp-hwp-reader");
  if (needsPdf) suggestedTemplateIds.push("pdf-document-reader");
  if (needsPptx) suggestedTemplateIds.push("pptx-slide-reader");
  if (needsSpreadsheet) suggestedTemplateIds.push("spreadsheet-stat-analyzer");
  if (needsValidation) suggestedTemplateIds.push("validator");
  const availableTemplates = new Set((paperclip?.templates || []).map((item) => item.id));
  const forcedTemplateIds = [...new Set([].concat(options.forcedTemplateIds || []).map((item) => String(item || "").trim()).filter(Boolean))]
    .filter((id) => availableTemplates.size ? availableTemplates.has(id) : true);
  suggestedTemplateIds.push(...forcedTemplateIds);
  return {
    needs_reading_skill: needsFileBrowsing || needsFilesystemWikiIntake || needsWikiOpsConversion || needsHwp || needsPdf || needsPptx || needsSpreadsheet || needsGrantRfp || needsGrantPresentationEval || forcedTemplateIds.some((id) => readOnlyChatAutoTemplateIds.includes(id)),
    needs_validation_skill: needsValidation || forcedTemplateIds.includes("validator"),
    suggested_template_ids: [...new Set(suggestedTemplateIds)].filter((id) => availableTemplates.size ? availableTemplates.has(id) : true),
    blocked_write_actions: [...new Set(blockedWriteActions)],
    reason: [
      forcedTemplateIds.length ? `사용자 태그 요청: ${forcedTemplateIds.join(", ")}` : "",
      wantsComprehensiveAnalysis ? `다중 파일 종합 분석 요청(${totalContextFiles} files)` : "",
      needsFileBrowsing ? "OS 파일/폴더 구조 조회 필요" : "",
      needsFilesystemWikiIntake ? "로컬 파일시스템 위키화 intake 필요" : "",
      needsWikiOpsConversion ? "프로젝트 허브 연결/운영형 위키 컨버팅 필요" : "",
      needsGrantRfp ? "공고/RFP/사업계획서 전략 분석 필요" : "",
      needsGrantPresentationEval ? "정부과제 발표평가 발표전략 분석 필요" : "",
      needsHwp ? "hwp/hwpx 문서 해석 필요" : "",
      needsPdf ? "PDF 문서 조회 필요" : "",
      needsPptx ? "PowerPoint 슬라이드 조회 필요" : "",
      needsSpreadsheet ? "xlsx/csv 통계 해석 필요" : "",
      needsValidation ? "coverage/충돌 검수 필요" : "",
      blockedWriteActions.length ? "write/run 계열은 추천만 허용" : "",
    ].filter(Boolean).join(" / "),
    user_selected_template_ids: forcedTemplateIds,
    raw_message: text,
    browser_block: browserBlock,
    upload_context: uploadContext,
    has_auto_read_input: uploadContext.fileCount > 0,
    local_paths: localPaths.map((path) => ({
      path,
      allowed: localPathAllowedForAutoSkill(path),
      ext: extname(path).toLowerCase(),
    })),
  };
}

function autoReadablePathsForTemplate(route = {}, templateId = "") {
  const uploadPaths = (route.upload_context?.files || [])
    .map((item) => String(item.path || "").trim())
    .filter(Boolean)
    .map((path) => resolve(repoRoot, path))
    .filter((path) => localPathAllowedForAutoSkill(path));
  const allowedPaths = (route.local_paths || [])
    .filter((item) => item.allowed)
    .map((item) => item.path);
  const candidatePaths = [...new Set(uploadPaths.concat(allowedPaths))];
  return candidatePaths
    .filter((path) => {
      const ext = extname(path).toLowerCase();
      if (templateId === "filesystem-wiki-intake" || templateId === "wiki-ops-converter") return [".hwp", ".hwpx", ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv", ".html", ".htm", ".md", ".txt", ".json"].includes(ext);
      if (templateId === "rhwp-hwp-reader") return [".hwp", ".hwpx"].includes(ext);
      if (templateId === "pdf-document-reader") return ext === ".pdf";
      if (templateId === "pptx-slide-reader") return ext === ".pptx";
      if (templateId === "grant-rfp-strategy") return [".hwp", ".hwpx", ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv", ".html", ".htm"].includes(ext);
      if (templateId === "grant-presentation-eval-strategy") return [".hwp", ".hwpx", ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv", ".html", ".htm"].includes(ext);
      if (templateId === "spreadsheet-stat-analyzer") return [".xlsx", ".xls", ".csv"].includes(ext);
      return true;
    });
}

async function resolveChatAutoReadablePaths(route = {}, options = {}) {
  const directPaths = (route.local_paths || [])
    .filter((item) => item.allowed)
    .map((item) => item.path);
  const existingDirectPaths = directPaths.filter((path) => existsSync(resolveReadablePath(path)));
  const resolvedTargets = await resolvePaperclipInputTargets(route.raw_message || "", [
    "hwp", "hwpx", "pdf", "docx", "pptx", "xlsx", "xls", "csv", "html", "htm", "md", "txt", "json",
  ], options).catch(() => ({ files: [] }));
  return [...new Set(existingDirectPaths.concat((resolvedTargets.files || []).filter((path) => localPathAllowedForAutoSkill(path))))];
}

async function autoRunAllowedSkills(route, options = {}) {
  const autoRuns = [];
  const recommendedTasks = [];
  const blockedActions = [...new Set(route.blocked_write_actions || [])];
  const resolvedReadablePaths = await resolveChatAutoReadablePaths(route, options);
  for (const templateId of route.suggested_template_ids || []) {
    if (approvalRequiredChatTemplateIds.includes(templateId)) {
      recommendedTasks.push({
        templateId,
        approval: "required",
        reason: "run/write 계열은 GLM 채팅에서 자동 실행하지 않음",
      });
      continue;
    }
    if (templateId === "validator") {
      const coverage = await coverageSummary().catch((error) => ({ error: error.message }));
      autoRuns.push({
        templateId,
        status: "completed",
        mode: "validator_summary",
        provenance: "coverageSummary()",
        result: coverage,
      });
      continue;
    }
    const allowedPaths = (route.local_paths || []).filter((item) => item.allowed);
    const blockedPaths = (route.local_paths || []).filter((item) => !item.allowed);
    if (blockedPaths.length) {
      blockedActions.push(`path_outside_allowed_root:${blockedPaths.map((item) => item.path).join(",")}`);
    }
    const matchingPaths = autoReadablePathsForTemplate({
      ...route,
      local_paths: resolvedReadablePaths.map((path) => ({ path, allowed: true, ext: extname(path).toLowerCase() })),
    }, templateId);
    if (!matchingPaths.length) {
      recommendedTasks.push({
        templateId,
        approval: "required",
        reason: "자동 실행 가능한 허용 경로가 없어서 추천만 생성",
      });
      continue;
    }
    autoRuns.push({
      templateId,
      status: "planned",
      mode: "read_only_skill_async",
      provenance: matchingPaths.map((path) => displayPath(path)),
      checkpoint: "routed",
    });
  }
  return {
    autoRuns,
    recommendedTasks,
    blockedActions: [...new Set(blockedActions)],
  };
}

function paperclipCheckpointForPhase(task = {}, run = null) {
  const phase = run?.phase || task.status || "queued";
  if (phase === "completed") {
    return {
      phase,
      label: "최종 분석 완료",
      message: "final 결과가 준비되었습니다. 결과 확인 또는 요약 후속 질문으로 이어갈 수 있습니다.",
      availableActions: [
        { id: "summarize_result", label: "결과 확인", type: "prompt", prompt: "방금 분석 결과 확인해줘." },
        { id: "open_paperclip", label: "Paperclip 열기", type: "surface", surface: "paperclip" },
      ],
    };
  }
  if (phase === "partial_completed") {
    return {
      phase,
      label: "부분 분석 완료",
      message: "partial report가 준비되었습니다. 현재 확보된 내용과 미완료 항목을 검토할 수 있습니다.",
      availableActions: [
        { id: "review_partial", label: "partial 확인", type: "prompt", prompt: "방금 부분 분석 결과 기준으로 확인된 내용과 미완료 항목을 정리해줘." },
        { id: "open_paperclip", label: "Paperclip 열기", type: "surface", surface: "paperclip" },
      ],
    };
  }
  if (phase === "extraction_completed") {
    return {
      phase,
      label: "본문 추출 완료",
      message: "원문 추출은 끝났고 최종 분석은 아직 진행 전 또는 대기 중입니다.",
      availableActions: [
        { id: "summarize_extraction", label: "추출문만 보기", type: "prompt", prompt: "방금 추출 결과만 먼저 요약해줘." },
        { id: "open_paperclip", label: "Paperclip 열기", type: "surface", surface: "paperclip" },
      ],
    };
  }
  if (phase === "chunk_analysis_running" || phase === "final_synthesis_running" || phase === "running") {
    return {
      phase,
      label: "백그라운드 분석 진행 중",
      message: "긴 분석이 진행 중입니다. 잠시 후 결과 확인 또는 Paperclip에서 상태 확인이 가능합니다.",
      availableActions: [
        { id: "check_status", label: "계속 확인", type: "prompt", prompt: "방금 분석 진행 상태 확인해줘." },
        { id: "open_paperclip", label: "Paperclip 열기", type: "surface", surface: "paperclip" },
      ],
    };
  }
  if (phase === "failed") {
    return {
      phase,
      label: "분석 실패",
      message: "실패 원인 확인이 필요합니다. Paperclip 상세 상태를 먼저 보는 편이 안전합니다.",
      availableActions: [
        { id: "open_paperclip", label: "Paperclip 열기", type: "surface", surface: "paperclip" },
      ],
    };
  }
  return {
    phase,
    label: "읽기 요청 생성됨",
    message: "task가 생성되었습니다. 바로 실행되거나 곧 백그라운드 실행됩니다.",
    availableActions: [
      { id: "check_status", label: "상태 확인", type: "prompt", prompt: "방금 생성된 분석 요청 상태 확인해줘." },
      { id: "open_paperclip", label: "Paperclip 열기", type: "surface", surface: "paperclip" },
    ],
  };
}

async function summarizeChatPaperclipTask(task = {}) {
  if (!task?.id) return null;
  const runs = await listPaperclipRuns({ taskId: task.id }).catch(() => []);
  const run = runs[0] || null;
  const previewArtifactName = run?.preferredArtifactName || "";
  const preview = run?.runId && previewArtifactName
    ? await readPaperclipRunArtifact(run.runId, previewArtifactName).then((item) => String(item.content || "").slice(0, 1800)).catch(() => "")
    : "";
  return {
    taskId: task.id,
    templateId: task.templateId,
    title: task.title,
    status: task.status,
    command: task.command,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    finishedAt: task.finishedAt,
    runId: run?.runId || task.result?.runId || "",
    runPath: run?.runPath || task.result?.runPath || "",
    outputPath: task.result?.path || "",
    hasFinal: Boolean(run?.artifacts?.some((item) => item.name === "final.md")),
    hasPartial: Boolean(run?.artifacts?.some((item) => item.name === "partial_report.md")),
    phase: run?.phase || "",
    sourcePaths: run?.sourcePaths || [],
    previewArtifactName,
    preview,
    checkpoint: paperclipCheckpointForPhase(task, run),
  };
}

function paperclipTaskCompleted(summary = null) {
  if (!summary) return false;
  return ["completed", "partial_completed"].includes(String(summary.phase || summary.status || ""));
}

async function readChatPaperclipResult(summary = null, maxChars = 7000) {
  if (!summary?.runId) return null;
  const artifactName = summary.hasFinal
    ? "final.md"
    : summary.hasPartial
      ? "partial_report.md"
      : summary.previewArtifactName || "";
  if (!artifactName) return null;
  const payload = await readPaperclipRunArtifact(summary.runId, artifactName).catch(() => null);
  if (!payload?.content) return null;
  return {
    taskId: summary.taskId,
    templateId: summary.templateId,
    status: summary.status,
    phase: summary.phase,
    runId: summary.runId,
    runPath: summary.runPath,
    outputPath: summary.outputPath,
    sourcePaths: summary.sourcePaths || [],
    artifactName,
    content: String(payload.content || "").slice(0, maxChars),
    hasFinal: Boolean(summary.hasFinal),
    hasPartial: Boolean(summary.hasPartial),
  };
}

async function triggerChatPaperclipAutoRuns(route, project = {}, options = {}) {
  const triggeredTasks = [];
  const recommendedTasks = [];
  const blockedActions = [...new Set(route.blocked_write_actions || [])];
  const existing = await readJsonFile(paperclipTasksPath, []);
  const projectId = project.id || "default";
  const resolvedReadablePaths = await resolveChatAutoReadablePaths(route, options);
  for (const templateId of route.suggested_template_ids || []) {
    if (approvalRequiredChatTemplateIds.includes(templateId)) {
      recommendedTasks.push({
        templateId,
        approval: "required",
        reason: "승인 필요 스킬",
      });
      continue;
    }
    if (templateId === "validator") continue;
    const matchingPaths = autoReadablePathsForTemplate({
      ...route,
      local_paths: resolvedReadablePaths.map((path) => ({ path, allowed: true, ext: extname(path).toLowerCase() })),
    }, templateId);
    const blockedPaths = (route.local_paths || []).filter((item) => !item.allowed).map((item) => item.path);
    if (blockedPaths.length) blockedActions.push(`path_outside_allowed_root:${blockedPaths.join(",")}`);
    if (!matchingPaths.length) {
      recommendedTasks.push({
        templateId,
        approval: "required",
        reason: "자동 실행 가능한 입력 경로 없음",
      });
      continue;
    }
    const signature = `chat_auto:${templateId}:${projectId}:${shortHash([route.raw_message || "", ...matchingPaths].join("\n"))}`;
    const reusable = existing.find((task) => task.payload?.chatAutoSignature === signature && ["queued", "running", "completed"].includes(task.status));
    if (reusable) {
      const summary = await summarizeChatPaperclipTask(reusable);
      if (summary) triggeredTasks.push(summary);
      continue;
    }
    const task = await createPaperclipTask(templateId, {
      title: `GLM Auto · ${templateId}`,
      payload: {
        note: matchingPaths.join("\n"),
        source: "glm_chat_auto_run",
        autoRun: true,
        sourceProjectId: projectId,
        sourceProjectName: project.name || "",
        sourceWorkspace: options.workspaceId || "rtm",
        originPrompt: route.raw_message || "",
        routeReason: route.reason || "",
        chatAutoSignature: signature,
      },
    });
    enqueuePaperclipTaskExecution(task);
    const summary = await summarizeChatPaperclipTask(task);
    if (summary) triggeredTasks.push(summary);
  }
  return {
    triggeredTasks,
    recommendedTasks,
    blockedActions: [...new Set(blockedActions)],
  };
}

async function recentProjectPaperclipTasks(projectId = "", limit = 6) {
  if (!projectId) return [];
  const tasks = await readJsonFile(paperclipTasksPath, []);
  const filtered = tasks
    .filter((task) => task.payload?.sourceProjectId === projectId && task.payload?.autoRun === true)
    .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))
    .slice(0, limit);
  return Promise.all(filtered.map((task) => summarizeChatPaperclipTask(task)));
}

async function latestProjectPaperclipFollowup(projectId = "", options = {}) {
  const mentionedTaskId = String(options.taskId || "").trim();
  if (projectId && mentionedTaskId) {
    const tasks = await readJsonFile(paperclipTasksPath, []);
    const exact = tasks.find((task) => task.id === mentionedTaskId && task.payload?.sourceProjectId === projectId && task.payload?.autoRun === true);
    if (exact) return summarizeChatPaperclipTask(exact);
  }
  const tasks = (await recentProjectPaperclipTasks(projectId, 8)).filter(Boolean);
  if (mentionedTaskId) {
    const exactRecent = tasks.find((task) => task.taskId === mentionedTaskId);
    if (exactRecent) return exactRecent;
  }
  return tasks.find((task) => paperclipTaskCompleted(task))
    || tasks.find((task) => ["running", "queued"].includes(task.status || ""))
    || null;
}

async function createPaperclipAgentDrafts(route, message, project = {}) {
  const suggested = (route.suggested_template_ids || [])
    .filter((templateId) => {
      if (!route.has_auto_read_input) return true;
      if (!["filesystem-wiki-intake", "wiki-ops-converter", "rhwp-hwp-reader", "pdf-document-reader", "pptx-slide-reader", "grant-rfp-strategy", "grant-presentation-eval-strategy", "spreadsheet-stat-analyzer"].includes(templateId)) return true;
      return !autoReadablePathsForTemplate(route, templateId).length;
    })
    .filter((templateId) => templateId !== "validator")
    .slice(0, 4);
  if (!suggested.length) return [];
  const existing = await readJsonFile(paperclipTasksPath, []);
  const drafts = [];
  for (const templateId of suggested) {
    const signature = `${templateId}:${project.id || "default"}:${String(message || "").slice(0, 120)}`;
    const already = existing.find((task) => task.payload?.agentSignature === signature && ["agent_suggested", "queued"].includes(task.status));
    if (already) {
      drafts.push(already);
      continue;
    }
    const task = await createPaperclipTask(templateId, {
      title: `Paperclip Agent 제안 · ${templateId}`,
      status: "agent_suggested",
      payload: {
        note: String(message || "").slice(0, 4000),
        source: "glm_chat_background_agent",
        projectId: project.id || "",
        projectName: project.name || "",
        agentSignature: signature,
        reason: route.reason || "chat context skill routing",
        approvalRequired: true,
      },
    });
    drafts.push(task);
  }
  return drafts;
}

function extractComposerWikiMentions(message = "", workspaceId = "rtm") {
  const mentions = [];
  const seen = new Set();
  const blockRegex = /\[위키프로젝트 멘션\]([\s\S]*?)\[\/위키프로젝트 멘션\]/g;
  for (const match of String(message || "").matchAll(blockRegex)) {
    const blocks = String(match[1] || "").split(/\n(?=- project_key:)/);
    for (const block of blocks) {
      const projectKey = block.match(/project_key:\s*(.+)/)?.[1]?.trim();
      if (!projectKey) continue;
      const projectLabel = block.match(/project_label:\s*(.+)/)?.[1]?.trim() || projectKey;
      const workspace = block.match(/workspace:\s*(.+)/)?.[1]?.trim() || workspaceId;
      const path = block.match(/path:\s*(.+)/)?.[1]?.trim() || "";
      const key = `${workspace}:${projectKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mentions.push(normalizeLinkedWikiProject({ workspace, projectKey, projectLabel, path }, workspaceId));
    }
  }
  return mentions.filter(Boolean);
}

function projectAliasTerms(projectKey = "", projectLabel = "", path = "") {
  const base = [projectKey, projectLabel, path].filter(Boolean).join(" ").toLowerCase();
  const aliases = new Set([projectKey, projectLabel].filter(Boolean).map((value) => String(value).trim()).filter(Boolean));
  if (/sawnics|쏘닉스|sonics/.test(base)) {
    ["쏘닉스", "소닉스", "sawnics", "sonics"].forEach((item) => aliases.add(item));
  }
  if (/asahi|아사히카세이|아사히카세히/.test(base)) {
    ["아사히카세이", "아사히카세히", "asahi kasei", "asahi"].forEach((item) => aliases.add(item));
  }
  if (/trust[\s_-]*my[\s_-]*tech|tmt|탈레스/.test(base)) {
    ["trust my tech", "tmt", "탈레스", "thales"].forEach((item) => aliases.add(item));
  }
  if (/psk/.test(base)) {
    ["psk"].forEach((item) => aliases.add(item));
  }
  return [...aliases].filter(Boolean);
}

async function detectPlaintextWikiProjects(message = "", workspaceId = "rtm", limit = 3) {
  const text = String(message || "").trim();
  if (!text) return [];
  const pages = await wikiIndex(workspaceId).catch(() => []);
  const projectPages = pages.filter((page) => ["project", "account"].includes(page.division || ""));
  const byProject = new Map();
  for (const page of projectPages) {
    const key = String(page.projectKey || "").trim();
    if (!key) continue;
    const current = byProject.get(key) || {
      workspace: workspaceId,
      projectKey: key,
      projectLabel: page.projectLabel || key,
      path: "",
      score: 0,
    };
    const aliases = projectAliasTerms(page.projectKey || "", page.projectLabel || "", page.path || "");
    const lexical = Math.max(
      overlapScore(text, page.projectKey || ""),
      overlapScore(text, page.projectLabel || ""),
      ...aliases.map((alias) => overlapScore(text, alias)),
    );
    const normalizedText = text.toLowerCase();
    const substringBoost = aliases.some((alias) => alias && normalizedText.includes(String(alias).toLowerCase())) ? 3 : 0;
    const slackPenalty = /^Slack_/i.test(page.projectKey || "") ? 1.5 : 0;
    const score = lexical * 2 + substringBoost - slackPenalty;
    if (page.docKind === "hub") current.path = page.path;
    if (!current.path && page.path) current.path = page.path;
    if (score > current.score) current.score = score;
    byProject.set(key, current);
  }
  return [...byProject.values()]
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.projectLabel || "").localeCompare(String(b.projectLabel || ""), "ko"))
    .slice(0, limit)
    .map((item) => normalizeLinkedWikiProject(item, workspaceId))
    .filter(Boolean);
}

function uniqueLinkedWikiProjects(projects = []) {
  const seen = new Set();
  const unique = [];
  for (const project of projects.filter(Boolean)) {
    const key = `${project.workspace || "rtm"}:${project.projectKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(project);
  }
  return unique;
}

function sourceKindForProject(project, linkedWikiProject, explicitWikiMentions = [], detectedWikiProjects = []) {
  if (!project?.projectKey) return "";
  if (linkedWikiProject?.projectKey === project.projectKey) return "linked_project";
  if (explicitWikiMentions.some((item) => item.projectKey === project.projectKey)) return "explicit_project_mention";
  if (detectedWikiProjects.some((item) => item.projectKey === project.projectKey)) return "detected_project";
  return "";
}

async function linkedProjectContextForProject(linkedWikiProject, workspaceId = "rtm", mode = "standard") {
  if (!linkedWikiProject?.projectKey) return null;
  const pages = await wikiIndex(linkedWikiProject.workspace || workspaceId).catch(() => []);
  const projectPages = pages.filter((page) => page.projectKey === linkedWikiProject.projectKey);
  const bundle = await projectMarkdownBundle(linkedWikiProject.projectKey, linkedWikiProject.workspace || workspaceId).catch(() => ({}));
  return {
    projectKey: linkedWikiProject.projectKey,
    projectLabel: linkedWikiProject.projectLabel,
    workspace: linkedWikiProject.workspace || workspaceId,
    path: linkedWikiProject.path || projectPages.find((page) => page.docKind === "hub")?.path || "",
    summary: {
      hub: compactLine(bundle["hub.md"] || bundle["Project_Overview.md"] || "", 320),
      evidence: extractMeaningfulLines(bundle["Evidence_Log.md"] || "", linkedWikiProject.projectLabel, contextBudget(mode)).slice(0, 6),
      decisions: extractPatternLines(bundle["Decisions.md"] || bundle["Action_Items.md"] || "", /결정|완료|진행|리스크|이슈|다음|액션|납기|고객|일정/i, 6),
    },
    relatedPages: projectPages
      .filter((page) => ["hub", "overview", "sources", "evidence", "conflict", "actions", "decisions", "risks"].includes(page.docKind))
      .slice(0, 12)
      .map((page) => ({
        title: page.title,
        path: page.path,
        docKind: page.docKind,
        updatedAt: page.updatedAt,
      })),
  };
}

async function buildGlmChatContext(message, project, workspaceId = "rtm", mode = "standard", options = {}) {
  const budget = contextBudget(mode);
  const linkedWikiProject = normalizeLinkedWikiProject(project?.linkedWikiProject, workspaceId);
  const explicitWikiMentions = extractComposerWikiMentions(message, workspaceId);
  const detectedWikiProjects = explicitWikiMentions.length
    ? []
    : await detectPlaintextWikiProjects(message, workspaceId, 3).catch(() => []);
  const wikiContextProjects = uniqueLinkedWikiProjects([linkedWikiProject, ...explicitWikiMentions, ...detectedWikiProjects]);
  const contextSourceKinds = new Map(
    wikiContextProjects
      .filter((item) => item?.projectKey)
      .map((item) => [item.projectKey, sourceKindForProject(item, linkedWikiProject, explicitWikiMentions, detectedWikiProjects)]),
  );
  const projectSearchHint = isGenericChatProjectName(project?.name || "") ? "" : String(project?.name || "").trim();
  const wikiMentionSearchHint = wikiContextProjects
    .map((item) => [item.projectKey, item.projectLabel].filter(Boolean).join(" "))
    .join(" ");
  const sparseQuery = [projectSearchHint, wikiMentionSearchHint, message].filter(Boolean).join(" ").trim() || String(message || "").trim();
  const sparseQueryTerms = sparseTerms(sparseQuery);
  const sparseHits = (sparseQueryTerms.length
    ? await sparseWikiSearch(sparseQuery, workspaceId, Math.max(budget.maxCards + 2, 8))
    : [])
    .filter((item) => !isGlmChatProjectMemoryPath(item.path));
  const seedPaths = sparseHits.slice(0, Math.min(6, sparseHits.length)).map((item) => item.path);
  const rawGraphExpandedHits = await expandGraphNeighbors(seedPaths, workspaceId, {
    seedLimit: Math.min(6, sparseHits.length),
    firstHopLimit: Math.max(10, budget.maxCards * 2),
    secondHopLimit: Math.max(12, budget.maxCards * 2),
  });
  const contextProjectKeySet = new Set(wikiContextProjects.map((item) => item.projectKey).filter(Boolean));
  const graphExpandedHits = rawGraphExpandedHits.filter((item) => {
    const classification = classifyWikiPage(item.path, { type: item.node?.type || "" });
    if (contextProjectKeySet.has(classification.projectKey)) return true;
    return classification.division === "common" || classification.division === "shared";
  });
  const candidateMap = new Map();
  for (const hit of sparseHits) {
    const classification = classifyWikiPage(hit.path, hit.frontmatter || {});
    if (isGlmChatProjectMemoryPath(hit.path)) continue;
    candidateMap.set(hit.path, {
      ...hit,
      graph_hops: 0,
      classification,
      docKind: classification.docKind,
      division: classification.division,
      projectKey: classification.projectKey,
    });
  }
  for (const hit of graphExpandedHits) {
    if (candidateMap.has(hit.path)) continue;
    if (isGlmChatProjectMemoryPath(hit.path)) continue;
    const classification = classifyWikiPage(hit.path, { type: hit.node?.type || "" });
    candidateMap.set(hit.path, {
      title: hit.node?.title || titleFromMarkdown(hit.path, ""),
      path: hit.path,
      frontmatter: { type: hit.node?.type || "" },
      snippet: hit.node?.title || hit.path,
      score: Math.max(0.25, Number(hit.node?.degree || 0) / 10),
      matched_terms: [],
      retrieval_source: hit.retrieval_source,
      graph_hops: hit.graph_hops,
      classification,
      docKind: classification.docKind,
      division: classification.division,
      projectKey: classification.projectKey,
    });
  }
  for (const contextProject of wikiContextProjects) {
    const pages = await wikiIndex(contextProject.workspace || workspaceId).catch(() => []);
    for (const page of pages.filter((item) => item.projectKey === contextProject.projectKey).slice(0, 14)) {
      if (candidateMap.has(page.path)) continue;
      if (isGlmChatProjectMemoryPath(page.path)) continue;
      const classification = classifyWikiPage(page.path, {});
      candidateMap.set(page.path, {
        title: page.title,
        path: page.path,
        frontmatter: {},
        snippet: `${contextProject.projectLabel || contextProject.projectKey} 명시 멘션 컨텍스트`,
        score: 1.35,
        matched_terms: [contextProject.projectKey],
        retrieval_source: (() => {
          const sourceKind = contextSourceKinds.get(contextProject.projectKey) || "";
          if (sourceKind === "linked_project") return "linked_project_scope";
          if (sourceKind === "explicit_project_mention") return "explicit_project_mention";
          if (sourceKind === "detected_project") return "project_detect";
          return "project_context";
        })(),
        graph_hops: 0,
        priority_reason: (() => {
          const sourceKind = contextSourceKinds.get(contextProject.projectKey) || "";
          if (sourceKind === "linked_project") return "linked project scope";
          if (sourceKind === "explicit_project_mention") return "explicit @project mention";
          if (sourceKind === "detected_project") return "project detected from plain text";
          return "project context";
        })(),
        classification,
        docKind: page.docKind || classification.docKind,
        division: page.division || classification.division,
        projectKey: page.projectKey || classification.projectKey,
      });
    }
  }
  const reranked = rerankEvidenceCandidates([...candidateMap.values()], {
    mode: "evidence_l1_first",
    contextProjectKeys: wikiContextProjects.map((item) => item.projectKey).filter(Boolean),
    linkedProjectPath: linkedWikiProject?.path || "",
    queryText: message,
  });
  const evidence = [];
  for (const item of reranked.slice(0, budget.maxCards)) {
    const card = await wikiContextCardForResult(item, message, mode).catch(() => ({
      title: item.title,
      path: item.path,
      snippet: item.snippet,
      score: item.score,
      docKind: item.docKind,
      division: item.division,
      projectKey: item.projectKey,
      keyLines: [],
      conflicts: [],
    }));
    evidence.push({
      ...card,
      retrieval_source: item.retrieval_source || "sparse_bm25",
      graph_hops: item.graph_hops || 0,
      priority_reason: item.priority_reason || "",
    });
  }
  const automation = await automationSnapshot().catch(() => ({ running: [], runs: [], schedules: [] }));
  const coverage = await coverageSummary().catch(() => null);
  const paperclip = await paperclipStatus().catch(() => null);
  const route = routeChatSkills(message, evidence, paperclip, { forcedTemplateIds: options.skillTags || [] });
  const autoSkill = await autoRunAllowedSkills(route, { workspaceId });
  const triggeredAutoRuns = await triggerChatPaperclipAutoRuns(route, project, { workspaceId }).catch(() => ({
    triggeredTasks: [],
    recommendedTasks: [],
    blockedActions: [],
  }));
  const agentDrafts = await createPaperclipAgentDrafts(route, message, project).catch(() => []);
  const recentProjectTasks = (await recentProjectPaperclipTasks(project?.id || "", 6)).filter(Boolean);
  const mentionedTaskId = extractMentionedPaperclipTaskId(message);
  const followupTask = (chatPaperclipFollowupRequested(message) || mentionedTaskId)
    ? await latestProjectPaperclipFollowup(project?.id || "", { taskId: mentionedTaskId }).catch(() => null)
    : null;
  const activeResultTask = followupTask && paperclipTaskCompleted(followupTask)
    ? followupTask
    : recentProjectTasks.find((task) => paperclipTaskCompleted(task)) || null;
  const activeResult = activeResultTask
    ? await readChatPaperclipResult(activeResultTask, 9000).catch(() => null)
    : null;
  const coverageWarnings = [];
  if (coverage?.statuses?.hold) coverageWarnings.push(`coverage_hold:${coverage.statuses.hold}`);
  if (coverage?.statuses?.retry) coverageWarnings.push(`coverage_retry:${coverage.statuses.retry}`);
  if (coverage?.documentsInManifest === 0) coverageWarnings.push("manifest_empty");
  const conflictHotspots = evidence
    .filter((item) => item.docKind === "conflict" || (item.conflicts || []).length)
    .slice(0, 6)
    .map((item) => ({
      path: item.path,
      title: item.title,
      conflicts: (item.conflicts || []).slice(0, 3),
    }));
  const mentionedProjectContexts = (await Promise.all(
    wikiContextProjects.slice(0, 4).map((contextProject) => linkedProjectContextForProject(contextProject, workspaceId, mode)),
  )).filter(Boolean);
  const linkedProjectContext = linkedWikiProject?.projectKey
    ? mentionedProjectContexts.find((context) => context.projectKey === linkedWikiProject.projectKey) || null
    : mentionedProjectContexts[0] || null;
  const retrievalSourceCounts = evidence.reduce((acc, item) => {
    const key = String(item.retrieval_source || "retrieval");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    tokenBudget: {
      mode,
      inputStrategy: "sparse_graph_skill_orchestrated_cards",
      maxCards: budget.maxCards,
      recentTurns: budget.recentTurns,
      maxMemoryItems: budget.maxMemoryItems,
      estimatedEvidenceChars: evidence.reduce((sum, page) => sum + (page.estimatedChars || estimateChars(page)), 0),
    },
    evidence,
    retrieval: {
      mode,
      sparseHits: sparseHits.slice(0, 10).map((item) => ({
        path: item.path,
        title: item.title,
        score: Number(item.score || 0),
        matchedTerms: item.matched_terms || [],
        retrievalSource: item.retrieval_source || "sparse_bm25",
      })),
      graphExpandedHits: graphExpandedHits.slice(0, 18).map((item) => ({
        path: item.path,
        title: item.node?.title || item.path,
        graphHops: item.graph_hops,
        retrievalSource: item.retrieval_source,
      })),
      finalEvidence: evidence.map((item) => ({
        path: item.path,
        title: item.title,
        docKind: item.docKind,
        graphHops: item.graph_hops,
        retrievalSource: item.retrieval_source,
        priorityReason: item.priority_reason,
      })),
      coverageWarnings,
      tokenBudget: {
        mode,
        estimatedEvidenceChars: evidence.reduce((sum, page) => sum + (page.estimatedChars || estimateChars(page)), 0),
      },
    },
    validation: {
      coverageWarnings,
      conflictHotspots,
    },
    projectBinding: {
      chatProjectId: project?.id || "",
      chatProjectName: project?.name || "",
      linkedWikiProject,
      linkedProjectContext,
      explicitWikiMentions,
      detectedWikiProjects,
      mentionedProjectContexts,
    },
    retrievalMeta: {
      sparseSource: sparseHits.some((item) => item.retrieval_source === "sparse_bm25") ? "sparse_bm25" : sparseHits[0]?.retrieval_source || "",
      graphActive: Boolean(graphExpandedHits.length),
      sourceCounts: retrievalSourceCounts,
      projectResolution: linkedWikiProject?.projectKey
        ? "linked_project"
        : explicitWikiMentions.length
          ? "explicit_project_mention"
          : detectedWikiProjects.length
            ? "detected_project"
            : "none",
    },
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
    paperclip: {
      route,
      userRequestedSkillTags: route.user_selected_template_ids || [],
      autoRuns: autoSkill.autoRuns,
      triggeredTasks: triggeredAutoRuns.triggeredTasks,
      agentMode: "background_skill_router",
      agentDrafts: agentDrafts.map((task) => ({
        id: task.id,
        templateId: task.templateId,
        agent: task.agent,
        title: task.title,
        status: task.status,
        safety: task.safety,
      })),
      recentProjectTasks,
      followupTaskId: mentionedTaskId,
      followupTask,
      activeResult,
      checkpoint: triggeredAutoRuns.triggeredTasks[0]?.checkpoint || followupTask?.checkpoint || null,
      recommendedTasks: [...new Map(autoSkill.recommendedTasks.concat(triggeredAutoRuns.recommendedTasks).concat((route.suggested_template_ids || [])
        .filter((id) => approvalRequiredChatTemplateIds.includes(id))
        .map((templateId) => ({
          templateId,
          approval: "required",
          reason: "자동 실행 금지 template",
        }))).map((item) => [item.templateId, item])).values()],
      blockedActions: [...new Set([...(autoSkill.blockedActions || []), ...(triggeredAutoRuns.blockedActions || [])])],
    },
  };
}

async function operationalWikiContext(message, mode = "standard", workspaceId = "rtm", project = null) {
  return buildGlmChatContext(message, project || defaultChatProject(), workspaceId, mode);
}

function defaultChatProject() {
  return {
    id: "default",
    name: "기본 업무 챗",
    workspace: "work",
    linkedWikiProject: null,
    instructions: "",
    memories: [],
    instructionCandidates: [],
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function ensureDefaultChatProject(projects = []) {
  const base = defaultChatProject();
  const existing = (projects || []).find((project) => project.id === base.id);
  if (existing) {
    return [
      {
        ...base,
        ...existing,
        id: base.id,
        name: existing.name || base.name,
      },
      ...(projects || []).filter((project) => project.id !== base.id),
    ];
  }
  return [base, ...(projects || [])];
}

const DEFAULT_GLOBAL_CHAT_INSTRUCTION_LINES = [
  "로컬 Obsidian 위키를 근거 저장소로 사용하는 한국어 업무 파트너로 답한다.",
  "위키/검색 시스템 자체를 설명하지 말고 사용자의 질문, 문서, 업무 대상에 바로 답한다.",
  "주 역할은 위키 기반 질의응답, 토론, 조사, 비교, 초안 작성, 구조화, 의사결정 보조다.",
  "현황 정리, 리스크, 다음 액션 형식은 사용자가 상태 보고나 실행 정리를 원할 때만 우선 적용한다.",
  "프로젝트 메모리는 관리되는 보조 기억이고, 대화내역은 결정/검증된 지식이 아닐 수 있는 보조 맥락으로 취급한다.",
  "대화에서 나온 사실은 원문 근거가 확인되거나 사용자가 결정한 경우에만 확정 지식으로 승격한다.",
  "근거가 약하면 확인 필요로 표시하고, 확인할 Markdown path 또는 다음 액션을 제안한다.",
];

const LEGACY_GLOBAL_CHAT_INSTRUCTION_LINES = [
  "위키를 근거 저장소로 사용해 고객 프로젝트의 업무 상태, 리스크, 다음 액션을 중심으로 답한다.",
  "위키/검색 시스템 자체를 설명하지 말고 프로젝트 또는 업무 대상에 바로 답한다.",
  "프로젝트 메모리는 관리되는 보조 기억이고, 대화내역은 결정/검증된 지식이 아닐 수 있는 보조 맥락으로 취급한다.",
  "대화에서 나온 사실은 원문 근거가 확인되거나 사용자가 결정한 경우에만 확정 지식으로 승격한다.",
  "근거가 약하면 확인 필요로 표시하고, 확인할 Markdown path 또는 다음 액션을 제안한다.",
];

function defaultGlobalChatSettings() {
  return {
    instructions: DEFAULT_GLOBAL_CHAT_INSTRUCTION_LINES.join("\n"),
    autoMemory: true,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeGlobalChatSettings(settings) {
  const instructions = String(settings?.instructions || "").trim();
  const legacyInstructions = LEGACY_GLOBAL_CHAT_INSTRUCTION_LINES.join("\n");
  const defaultInstructions = DEFAULT_GLOBAL_CHAT_INSTRUCTION_LINES.join("\n");
  const normalizedInstructions = !instructions || instructions === legacyInstructions
    ? defaultInstructions
    : instructions;
  const autoMemory = settings?.autoMemory !== false;
  return {
    ...defaultGlobalChatSettings(),
    ...(settings || {}),
    instructions: normalizedInstructions,
    autoMemory,
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
    const normalized = normalizeGlobalChatSettings(existing);
    if (JSON.stringify(normalized) !== JSON.stringify(existing)) {
      await saveGlobalChatSettings(normalized);
      return normalized;
    }
    await syncGlobalChatSettingsToL1(normalized);
    return normalized;
  }
  const initial = defaultGlobalChatSettings();
  await saveGlobalChatSettings(initial);
  return initial;
}

async function saveGlobalChatSettings(settings) {
  const next = {
    ...normalizeGlobalChatSettings(settings),
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
    "위키를 근거 저장소로 사용해 고객 프로젝트의 업무 상태와 다음 액션 중심으로 답한다.",
    LEGACY_GLOBAL_CHAT_INSTRUCTION_LINES.join(" "),
    LEGACY_GLOBAL_CHAT_INSTRUCTION_LINES.join("\n"),
  ].includes(text);
}

function normalizeProjectInstructions(instructions, workspace = "work") {
  const text = String(instructions || "").trim();
  if (!text) return "";
  const legacyWorkDefault = "업무용 RTM 위키와 고객 프로젝트 운영 범위에서 답한다.";
  const legacyPersonalDefault = "개인용 위키와 개인 메모리 범위에서만 답한다.";
  if (text === legacyWorkDefault) return "";
  if (workspace === "personal" && text === legacyPersonalDefault) return "개인용 위키 범위에서 답한다.";
  return text;
}

function migrateGlobalInstructionMemories(projects) {
  let changed = false;
  const migrated = (projects || []).map((project) => {
    const memories = (project.memories || []).filter((memory) => {
      const keep = !isGlobalInstructionText(memory.content);
      if (!keep) changed = true;
      return keep;
    });
    const instructions = isGlobalInstructionText(project.instructions)
      ? ""
      : normalizeProjectInstructions(project.instructions, project.workspace || "work");
    if (instructions !== project.instructions) changed = true;
    const linkedWikiProject = normalizeLinkedWikiProject(project.linkedWikiProject, project.workspace === "personal" ? "personal" : "rtm");
    if (JSON.stringify(linkedWikiProject) !== JSON.stringify(project.linkedWikiProject || null)) changed = true;
    return {
      ...project,
      instructions,
      memories,
      instructionCandidates: project.instructionCandidates || [],
      linkedWikiProject,
    };
  });
  return { projects: migrated, changed };
}

async function listChatProjects() {
  let projects = await readJsonFile(chatProjectsPath, []);
  if (projects.length) {
    const migrated = migrateGlobalInstructionMemories(projects);
    const withMessageIds = ensureDefaultChatProject(migrated.projects).map((project) => ({
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

function normalizeLinkedWikiProject(linked = {}, workspaceId = "rtm") {
  const projectKey = String(linked?.projectKey || "").trim();
  if (!projectKey) return null;
  return {
    workspace: String(linked?.workspace || workspaceId || "rtm").trim() || "rtm",
    projectKey,
    projectLabel: String(linked?.projectLabel || projectKey).trim() || projectKey,
    path: String(linked?.path || "").trim(),
    linkedAt: String(linked?.linkedAt || new Date().toISOString()),
  };
}

function chatProjectMarkdown(project, options = {}) {
  const now = new Date().toISOString();
  const memories = project.memories || [];
  const instructionCandidates = project.instructionCandidates || [];
  const messages = project.messages || [];
  const linkedWikiProject = normalizeLinkedWikiProject(project.linkedWikiProject, project.workspace === "personal" ? "personal" : "rtm");
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
    "## 고정 지침",
    project.instructions ? quoteMarkdown(project.instructions) : "- 없음",
    "",
    "## 연결된 위키 프로젝트",
    linkedWikiProject
      ? [
          `- workspace: ${linkedWikiProject.workspace}`,
          `- project_key: ${linkedWikiProject.projectKey}`,
          `- project_label: ${linkedWikiProject.projectLabel}`,
          linkedWikiProject.path ? `- path: [[${linkedWikiProject.path.replace(/\.md$/i, "")}]]` : "",
          `- linked_at: ${linkedWikiProject.linkedAt || now}`,
        ].filter(Boolean).join("\n")
      : "- 연결 안 됨",
    "",
    "## 자동 축적 메모리",
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
    "## 지침 승격 후보",
    instructionCandidates.length
      ? instructionCandidates.map((candidate) => [
          `### ${candidate.title || "후보"}`,
          `- id: \`${candidate.id}\``,
          `- source: ${candidate.source || "manual"}`,
          `- confidence: ${candidate.confidence || "candidate_unconfirmed"}`,
          `- updated: ${candidate.updatedAt || candidate.createdAt || ""}`,
          "",
          quoteMarkdown(candidate.content || ""),
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
  const linkedWikiProject = body.linkedWikiProject === null
    ? null
    : normalizeLinkedWikiProject(
        body.linkedWikiProject || existing?.linkedWikiProject,
        body.workspace === "personal" ? "personal" : "rtm",
      );
  const next = {
    ...(existing || { id, createdAt: now, messages: [], memories: [], instructionCandidates: [] }),
    name: body.name || existing?.name || "새 GLM 프로젝트",
    instructions: body.instructions ?? existing?.instructions ?? "",
    workspace: body.workspace || existing?.workspace || "work",
    linkedWikiProject,
    instructionCandidates: existing?.instructionCandidates || [],
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

async function upsertInstructionCandidate(projectId, body) {
  const projects = await listChatProjects();
  const now = new Date().toISOString();
  const candidate = {
    id: body.id || `${Date.now()}-instruction-candidate`,
    title: body.title || "지침 승격 후보",
    content: body.content || "",
    source: body.source || "manual",
    confidence: body.confidence || "candidate_unconfirmed",
    createdAt: body.createdAt || now,
    updatedAt: now,
  };
  const updated = projects.map((project) => project.id === projectId ? {
    ...project,
    instructionCandidates: [candidate, ...(project.instructionCandidates || []).filter((item) => item.id !== candidate.id)],
    updatedAt: now,
  } : project);
  await saveChatProjects(updated);
  return candidate;
}

function autoMemoryCandidate(message) {
  const text = String(message || "").trim();
  if (!text || text.length < 6 || text.length > 1200) return null;
  if (isGlobalInstructionText(text)) {
    return {
      scope: "global",
      title: "전역 응답 원칙",
      content: "로컬 Obsidian 위키를 근거 저장소로 사용하는 한국어 업무 파트너로 답한다.",
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
    scope: explicit ? "project_instruction_candidate" : "project",
    title: explicit ? (titleBase ? `지침 후보 - ${titleBase}` : "지침 승격 후보") : (titleBase ? `자동 기억 - ${titleBase}` : "자동 기억"),
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
  if (candidate.scope === "project_instruction_candidate") {
    const duplicate = (project?.instructionCandidates || []).some((item) => item.content === candidate.content);
    if (duplicate || !project) return null;
    const instructionCandidate = await upsertInstructionCandidate(project.id, {
      title: candidate.title,
      content: candidate.content,
      source: "auto_from_chat",
      confidence: "candidate_unconfirmed",
    });
    return { scope: "project_instruction_candidate", projectId: project.id, instructionCandidate };
  }
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

async function deleteInstructionCandidate(projectId, candidateId) {
  const projects = await listChatProjects();
  const updated = projects.map((project) => project.id === projectId ? {
    ...project,
    instructionCandidates: (project.instructionCandidates || []).filter((candidate) => candidate.id !== candidateId),
    updatedAt: new Date().toISOString(),
  } : project);
  await saveChatProjects(updated);
  return { deleted: true, projectId, candidateId };
}

async function promoteInstructionCandidate(projectId, candidateId) {
  const projects = await listChatProjects();
  const now = new Date().toISOString();
  let nextProject = null;
  const updated = projects.map((project) => {
    if (project.id !== projectId) return project;
    const candidate = (project.instructionCandidates || []).find((item) => item.id === candidateId);
    if (!candidate) return project;
    const alreadyIncluded = String(project.instructions || "").includes(candidate.content);
    nextProject = {
      ...project,
      instructions: alreadyIncluded
        ? String(project.instructions || "")
        : [String(project.instructions || "").trim(), candidate.content].filter(Boolean).join("\n"),
      instructionCandidates: (project.instructionCandidates || []).filter((item) => item.id !== candidateId),
      updatedAt: now,
    };
    return nextProject;
  });
  await saveChatProjects(updated);
  return nextProject || updated.find((project) => project.id === projectId) || null;
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
  const retraction = deleted ? await retractChatMessageEvidence(projectId, messageId) : null;
  return {
    deleted,
    projectId,
    messageId,
    syncedL1Path: updated.find((project) => project.id === projectId) ? relative(repoRoot, chatProjectMemoryPath(updated.find((project) => project.id === projectId))) : "",
    retractedPromotionPaths: retraction?.retractedPromotionPaths || [],
    auditLogPath: retraction?.auditLogPath || "",
    manualReviewRequired: retraction?.manualReviewRequired || false,
  };
}

async function moveChatProjectMessages(sourceProjectId, targetProjectId) {
  const projects = await listChatProjects();
  const now = new Date().toISOString();
  const sourceProject = projects.find((project) => project.id === sourceProjectId);
  const targetProject = projects.find((project) => project.id === targetProjectId);
  if (!sourceProject) throw new Error("Source chat project not found.");
  if (!targetProject) throw new Error("Target chat project not found.");
  if (sourceProject.id === targetProject.id) throw new Error("Target chat project must be different.");
  if ((sourceProject.workspace || "work") !== (targetProject.workspace || "work")) {
    throw new Error("Chat conversation can only move inside the same workspace.");
  }

  const sourceMessages = sourceProject.messages || [];
  const targetMessageIds = new Set((targetProject.messages || []).map((message) => message.id).filter(Boolean));
  const movedMessageIdMap = new Map();
  const movedMessages = sourceMessages.map((message, index) => ({
    ...message,
    id: (() => {
      const currentId = message.id || "";
      const nextId = currentId && !targetMessageIds.has(currentId)
        ? currentId
        : `moved-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      targetMessageIds.add(nextId);
      if (currentId) movedMessageIdMap.set(currentId, nextId);
      return nextId;
    })(),
    movedFromProjectId: sourceProject.id,
    movedAt: now,
  }));
  const updatedProjects = projects.map((project) => {
    if (project.id === sourceProject.id) {
      return { ...project, messages: [], updatedAt: now };
    }
    if (project.id === targetProject.id) {
      return {
        ...project,
        messages: [...(project.messages || []), ...movedMessages].slice(-100),
        updatedAt: now,
      };
    }
    return project;
  });

  await saveChatProjects(updatedProjects);
  const promotionRefsMoved = await moveChatMessagePromotionRefs(sourceProject.id, targetProject.id, movedMessageIdMap, now);
  const nextSourceProject = updatedProjects.find((project) => project.id === sourceProject.id);
  const nextTargetProject = updatedProjects.find((project) => project.id === targetProject.id);
  return {
    moved: movedMessages.length,
    promotionRefsMoved,
    sourceProject: nextSourceProject,
    targetProject: nextTargetProject,
  };
}

async function moveChatMessagePromotionRefs(sourceProjectId, targetProjectId, messageIdMap, movedAt) {
  if (!messageIdMap.size) return 0;
  const promotions = await readJsonFile(knowledgePromotionPath, []);
  let changedCount = 0;
  const updated = [];
  for (const entry of promotions) {
    const nextMessageId = messageIdMap.get(entry.sourceMessageId);
    if (entry.sourceProjectId !== sourceProjectId || !nextMessageId) {
      updated.push(entry);
      continue;
    }
    const nextEntry = {
      ...entry,
      sourceProjectId: targetProjectId,
      sourceMessageId: nextMessageId,
      movedFromProjectId: sourceProjectId,
      movedAt,
    };
    nextEntry.markdown = promotionMarkdown(nextEntry);
    if (nextEntry.path) {
      await writeFile(writableWikiPath(nextEntry.path), nextEntry.markdown, "utf-8").catch(() => {});
    }
    updated.push(nextEntry);
    changedCount += 1;
  }
  if (changedCount) await writeJsonFile(knowledgePromotionPath, updated);
  return changedCount;
}

async function retractChatMessageEvidence(projectId, messageId) {
  const promotions = await readJsonFile(knowledgePromotionPath, []);
  const retracted = [];
  const remaining = [];
  for (const entry of promotions) {
    if (entry.sourceProjectId === projectId && entry.sourceMessageId === messageId) {
      retracted.push(entry);
    } else {
      remaining.push(entry);
    }
  }
  const retractedPromotionPaths = [];
  for (const entry of retracted) {
    if (!entry.path) continue;
    try {
      const fullPath = writableWikiPath(entry.path);
      await unlink(fullPath);
      retractedPromotionPaths.push(entry.path);
    } catch {
      retractedPromotionPaths.push(`${entry.path} (delete_failed_or_missing)`);
    }
  }
  if (retracted.length) await writeJsonFile(knowledgePromotionPath, remaining);
  const audit = {
    timestamp: new Date().toISOString(),
    projectId,
    messageId,
    deletedFromChat: true,
    syncedL1Path: relative(repoRoot, chatProjectMemoryPath({ id: projectId })),
    retractedPromotionPaths,
    manualReviewRequired: false,
  };
  await appendJsonl(chatRetractionsPath, audit);
  return { ...audit, auditLogPath: relative(repoRoot, chatRetractionsPath) };
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

function compactInstructionCandidates(candidates = [], mode = "standard") {
  const budget = contextBudget(mode);
  return candidates
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      source: candidate.source || "manual",
      confidence: candidate.confidence || "candidate_unconfirmed",
      updatedAt: candidate.updatedAt || candidate.createdAt || "",
      content: compactLine(candidate.content || "", budget.maxLineChars * 2),
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, Math.max(4, Math.floor(budget.maxMemoryItems / 2)));
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

function glmGeneralSystemPrompt(project, globalSettings) {
  return [
    "당신은 위키 검색 결과를 설명하는 챗봇이 아니라, 로컬 Obsidian 위키를 근거 저장소로 쓰는 한국어 업무 파트너다.",
    "주 역할은 위키 기반 질의응답, 토론, 조사, 비교, 초안 작성, 구조화, 의사결정 보조다.",
    "사용자의 의도에 맞는 형식으로 답하고, 현황 정리/리스크/다음 액션 형식은 사용자가 상태 보고나 실행 정리를 원할 때만 우선 적용한다.",
    `전역 운영 지침: ${globalSettings.instructions || "없음"}`,
    `현재 GLM 챗 프로젝트: ${project.name}`,
    `프로젝트 고정 지침: ${project.instructions || "없음"}`,
    `연결된 위키 프로젝트: ${project.linkedWikiProject?.projectLabel || project.linkedWikiProject?.projectKey || "없음"}`,
    "충분히 깊게 내부 추론하되, 최종 답변에는 추론 과정을 장황하게 노출하지 말고 검토 결과와 근거만 정리하라.",
    "프로젝트 메모리는 관리되는 보조 기억이고, 최근 대화내역은 결정/검증된 지식이 아닐 수 있는 보조 맥락이다.",
    "지침 승격 후보는 아직 고정 지침이 아니며, 사용자 승격 전까지는 약한 운영 힌트로만 취급한다.",
    "대화 내용은 사용자가 명시적으로 결정했거나 별도 근거 Markdown으로 확인된 경우에만 확정 사실처럼 취급하라.",
    "Evidence Log, Conflict Register, hub, L1 memory를 우선 근거로 보고, 충돌이 있으면 Conflict Register 계열을 더 우선한다.",
    "금지: '제공된 위키 검색 결과', '스니펫', '메타데이터를 종합하면', '현재 위키에 색인된' 같은 메타 표현으로 시작하지 마라.",
    "위키나 검색 시스템 자체를 설명하지 말고, 프로젝트/업무 대상에 대해 바로 답하라.",
    "Paperclip 컨텍스트가 있으면 이를 별도 실행 결과처럼 과장하지 말고, 사용 가능한 agent/template/task 힌트로만 활용하라.",
    "자동 실행된 read/validator skill 결과는 보조 증거로만 쓰고, run/write가 필요하면 실행한 척하지 말고 승인 필요 작업으로만 제안하라.",
    "paperclip.activeResult가 있으면 final.md 또는 partial_report.md 기반의 실제 실행 결과로 간주하고 그 내용을 우선 근거로 사용하라.",
    "근거는 path로 짧게 붙인다. 확실하지 않으면 '확인 필요'로 표시하고, 무엇을 열어봐야 하는지 제안한다.",
  ].join(" ");
}

async function glmChat(message, projectId = "default", options = {}) {
  const projects = await listChatProjects();
  const project = projects.find((item) => item.id === projectId) || projects[0] || defaultChatProject();
  const globalSettings = await getGlobalChatSettings();
  const { values: env } = await readEnvFile();
  const mode = glmContextMode(env, options.contextMode);
  const context = await buildGlmChatContext(message, project, options.workspace || project.workspace || "rtm", mode, { skillTags: options.skillTags || [] });
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const model = process.env.GLM_MODEL || env.GLM_MODEL || "glm-4.5";
  if (!apiKey || !apiUrl) {
    return {
      provider: "fallback",
      message: "GLM_API_URL과 GLM_API_KEY를 운영 설정에 넣으면 위키 기반 업무 파트너 챗이 연결됩니다.",
      context,
    };
  }
  try {
    const { payload, endpoint } = await requestGlmChatCompletion(apiUrl, apiKey, {
        model,
        messages: [
          {
            role: "system",
            content: glmGeneralSystemPrompt(project, globalSettings),
          },
          {
            role: "user",
            content: JSON.stringify({
              task_request: message,
              global_instruction_role: "global_operating_rule",
              project_memory: compactProjectMemories(project.memories || [], mode),
              project_memory_role: "managed_auxiliary_memory",
              instruction_candidates: compactInstructionCandidates(project.instructionCandidates || [], mode),
              instruction_candidates_role: "promotion_candidates_not_yet_policy",
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

function glmDecisionTriageMessages(project, globalSettings, message, context, mode = "economy") {
  return [
    {
      role: "system",
      content: [
        "당신은 Decision Deck 안에서만 동작하는 위키 데이터 정합성 판정 보조자다.",
        "범위는 위키 원본 간 데이터 불일치와 반영 경로 판단이다. 불필요한 Conflict_Register 남발은 피한다.",
        "thinking 또는 추론 과정은 출력하지 않는다. 짧고 실행 가능한 검토 결과만 한국어로 낸다.",
        "명시적 상충값/상충주장이 없으면 Conflict_Register보다 Action_Items, Decisions, Risks, Status, hub 중 어디를 고치면 좋은지 먼저 제안한다.",
        "출력 형식은 반드시 1) 판정 2) 충돌 또는 문제 요약 3) 권장 처리 4) 권장 위키 수정 문서 5) 확인할 근거 path 순서로 한다.",
        "판정은 approve, hold, investigate 중 하나로 시작한다.",
        "근거가 부족하면 승인하지 말고 hold 또는 investigate를 제안한다.",
        "실무 일정, 마감, 담당자 같은 업무 질문은 단순 conflict로 보내지 말고 어느 위키 문서를 검토/수정하면 좋은지 제안한다.",
        `전역 운영 지침: ${globalSettings.instructions || "없음"}`,
        `현재 프로젝트: ${project.name}`,
        `프로젝트 고정 지침: ${project.instructions || "없음"}`,
        `연결된 위키 프로젝트: ${project.linkedWikiProject?.projectLabel || project.linkedWikiProject?.projectKey || "없음"}`,
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        decision_card_request: message,
        output_policy: "no_thinking_short_decision_triage",
        wiki_evidence_and_ops_context: context,
        token_budget_policy: context.tokenBudget || { mode },
      }),
    },
  ];
}

function glmChatMessages(project, globalSettings, message, context, mode = "standard", options = {}) {
  if (options.profile === "decision_triage") {
    return glmDecisionTriageMessages(project, globalSettings, message, context, mode);
  }
  return [
    {
      role: "system",
      content: glmGeneralSystemPrompt(project, globalSettings),
    },
    {
      role: "user",
      content: JSON.stringify({
        task_request: message,
        global_instruction_role: "global_operating_rule",
        project_memory: compactProjectMemories(project.memories || [], mode),
        project_memory_role: "managed_auxiliary_memory",
        instruction_candidates: compactInstructionCandidates(project.instructionCandidates || [], mode),
        instruction_candidates_role: "promotion_candidates_not_yet_policy",
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

function withRunId(payload, runId) {
  if (!runId) return payload;
  return { ...(payload || {}), runId };
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
  const decisionMode = options.profile === "decision_triage";
  const mode = decisionMode ? "economy" : glmContextMode(env, options.contextMode);
  const context = await buildGlmChatContext(message, project, options.workspace || project.workspace || "rtm", mode, { skillTags: options.skillTags || [] });
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const decisionOptions = decisionMode ? glmDecisionTriageOptions(env) : null;
  const model = decisionOptions?.model || process.env.GLM_MODEL || env.GLM_MODEL || "glm-4.5";
  sseWrite(res, "project_binding", withRunId({ projectBinding: context.projectBinding || null }, options.runId));
  sseWrite(res, "retrieval", withRunId({
    retrieval: context.retrieval || null,
    retrievalMeta: context.retrievalMeta || null,
  }, options.runId));
  sseWrite(res, "validation", withRunId({ validation: context.validation || null }, options.runId));
  sseWrite(res, "paperclip", withRunId({ paperclip: context.paperclip || null }, options.runId));
  if (!apiKey || !apiUrl) {
    const fallback = "GLM_API_URL과 GLM_API_KEY를 운영 설정에 넣으면 위키 기반 업무 파트너 챗이 연결됩니다.";
    sseWrite(res, "delta", { content: fallback });
    return { provider: "fallback", model, message: fallback, context, projectId: project.id };
  }

  const body = {
    model,
    messages: glmChatMessages(project, globalSettings, message, context, mode, { profile: options.profile || "" }),
    temperature: decisionOptions?.temperature ?? 0.2,
    max_tokens: decisionOptions?.maxTokens || glmChatMaxTokens(env),
    thinking: decisionOptions?.thinking || glmThinkingOptions(env),
    stream: true,
  };
  const primary = normalizeGlmChatUrl(apiUrl);
  const codingFallback = codingPlanGlmUrl(apiUrl);
  const candidates = [primary, codingFallback].filter(Boolean);
  const timeoutMs = Number(process.env.GLM_TIMEOUT_MS || env.GLM_TIMEOUT_MS || 120000);
  const started = Date.now();
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
      sseWrite(res, "status", withRunId({
        phase: "connecting",
        endpoint: url.includes("/api/coding/paas/") ? "coding" : "paas",
        maxTokens: body.max_tokens,
        thinking: body.thinking,
        tokenBudget: context.tokenBudget,
        profile: options.profile || "chat",
        model,
      }, options.runId));
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
          if (thinking && !decisionMode) {
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
      await recordLlmUsage({
        feature: decisionMode ? "decision_triage_stream" : "chat_stream",
        reason: decisionMode ? "decision deck lightweight consistency triage" : "project operating chat with wiki evidence",
        model,
        endpoint: url.includes("/api/coding/paas/") ? "coding" : "paas",
        status: "completed",
        durationMs: Date.now() - started,
        tokens: { estimatedInputChars: JSON.stringify(body.messages).length, estimatedOutputChars: fullMessage.length + fullThinking.length },
      }).catch(() => null);
      return { provider: "glm", model, endpoint: url.includes("/api/coding/paas/") ? "coding" : "paas", message: fullMessage, thinking: fullThinking, context, projectId: project.id };
    } catch (error) {
      lastError = new Error(error.name === "AbortError" && options.signal?.aborted ? "GLM request stopped by user" : error.name === "AbortError" ? `GLM stream timeout after ${timeoutMs}ms` : error.message);
    } finally {
      clearTimeout(timeout);
      if (options.signal) options.signal.removeEventListener("abort", abortFromParent);
    }
  }
  await recordLlmUsage({
    feature: decisionMode ? "decision_triage_stream" : "chat_stream",
    reason: decisionMode ? "decision deck lightweight consistency triage" : "project operating chat with wiki evidence",
    model,
    status: "failed",
    durationMs: Date.now() - started,
    error: lastError?.message || "GLM stream failed",
    fallback: "frontend_error_and_local_features_continue",
  }).catch(() => null);
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

function cleanupActiveChatRequest(projectId, controller = null, active = null) {
  const currentController = activeChatControllers.get(projectId);
  const currentActive = activeChatRequests.get(projectId);
  if (!controller || currentController === controller) activeChatControllers.delete(projectId);
  if (!active || currentActive === active) activeChatRequests.delete(projectId);
}

async function stopChatRequest(projectId) {
  const targetId = projectId || [...activeChatRequests.keys()][0];
  const active = activeChatRequests.get(targetId);
  const controller = activeChatControllers.get(targetId);
  if (!active || !controller) return { status: "not_running", projectId: targetId || null };
  active.status = "stopping";
  active.phase = "user_stop_requested";
  cleanupActiveChatRequest(targetId, controller, active);
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
    entry.sourceProjectId ? `source_project_id: "${String(entry.sourceProjectId).replace(/"/g, '\\"')}"` : "",
    entry.sourceMessageId ? `source_message_id: "${String(entry.sourceMessageId).replace(/"/g, '\\"')}"` : "",
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
  ].filter((line) => line !== "").join("\n");
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
    sourceProjectId: body.sourceProjectId || "",
    sourceMessageId: body.sourceMessageId || "",
    sourceType: body.sourceMessageId ? "chat_message" : body.sourceType || "manual",
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
  const paperclipAgent = await createPaperclipAgentDrafts({
    suggested_template_ids: ["validator", "wiki-ingest-operator"],
    blocked_write_actions: ["knowledge_promotion_requires_user_approval"],
    reason: "knowledge promotion candidate created; validate before wiki write",
    local_paths: [],
  }, content, { id: body.sourceProjectId || "ingest", name: body.projectHint || "지식 승격" }).catch(() => []);
  return {
    status: entry.status,
    promotion: entry,
    path: entry.path,
    markdown,
    paperclipAgent,
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
  const embeddedAvailable = templates.length > 0;
  const base = {
    url,
    recommendedAgents: templates.map((template) => template.agent),
    templates,
    tasks: tasks.slice(0, 20),
    events: events.slice(0, 30),
  };
  try {
    const response = await fetch(url);
    return {
      ...base,
      available: response.ok || embeddedAvailable,
      bridgeAvailable: response.ok,
      mode: response.ok ? "bridge" : embeddedAvailable ? "embedded_runtime" : "unavailable",
      status: response.ok ? "reachable" : embeddedAvailable ? `embedded runtime active (bridge HTTP ${response.status})` : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ...base,
      available: embeddedAvailable,
      bridgeAvailable: false,
      mode: embeddedAvailable ? "embedded_runtime" : "unavailable",
      status: embeddedAvailable ? `embedded runtime active (${error.message})` : error.message,
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
      id: "slack-evidence-collector",
      name: "Slack 증적 수집기",
      type: "paperclip-automation-skill",
      status: "available",
      safety: "slack_read_api_to_local_raw_export",
      description: "Slack API 토큰으로 채널 목록 조회와 증분 메시지 수집을 수행하고, 결과를 `obsidian/raw/exports/slack` 아래 raw export로 저장한다.",
      bestFor: ["영업/프로젝트 채널 백필", "주기적 증분 수집", "위키 승격 전 raw 증적 확보"],
      output: "obsidian/raw/exports/slack/*.json + automation/wiki_api/runtime/slack_collection_state.json",
    },
    {
      id: "os-file-browser",
      name: "OS 파일 브라우저",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "allowlist_local_read_only",
      description: "로컬 repo/mirror/chat upload 범위에서 폴더 트리, 후보 파일, 확장자 분포를 조회하고 후속 Paperclip 스킬 연결용 입력 후보를 만든다.",
      bestFor: ["폴더 구조 파악", "후속 분석 대상 선정", "파일 기반 스킬 라우팅"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "filesystem-wiki-intake",
      name: "로컬 파일시스템 위키화 Intake",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "allowlist_local_read_only",
      description: "로컬 파일/폴더를 rclone 보조 입력으로 읽어 문서 분류, 후보 사실, 위키 승격 계획, 승인 전 다음 액션을 정리한다.",
      bestFor: ["rclone 미러 보조 분석", "로컬 폴더 위키화 준비", "내부 파일시스템 기반 증적 intake"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "wiki-ops-converter",
      name: "운영형 위키 컨버터",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "local_markdown_output_decision_queue_required",
      description: "기존 자료/허브/파일 해석 결과를 CEO/PM 운영형 위키 구조로 변환할 후보를 만들고, 프로젝트 허브 연결/중복/충돌 방지 기준을 제안한다.",
      bestFor: ["프로젝트 허브 연결", "기존 자료 운영형 전환", "CEO/PM 브리프", "중복/충돌 방지 라우팅"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md + Decision Queue 검토 후보",
    },
    {
      id: "meeting-minutes-writer",
      name: "회의록/미팅정리 작성",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "local_markdown_output",
      description: "Paperclip에서 GLM으로 표준 회의록과 경영진 보고용 요약을 생성한다.",
      bestFor: ["고객 미팅", "내부 회의록", "경영진 공유"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "rhwp-hwp-reader",
      name: "rhwp 기반 한글문서 해석",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "local_read_and_markdown_output",
      description: "hwp/hwpx 문서를 로컬 추출 후 GLM으로 업무 관점 해석 Markdown을 생성한다.",
      bestFor: ["HWP 제안서", "HWPX 결과보고서", "한글 원문 검토"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "pdf-document-reader",
      name: "PDF 문서 조회",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "local_read_and_markdown_output",
      description: "PDF를 pypdf 우선, fallback 보조로 페이지 텍스트와 근거 위치를 추출해 업무 관점 Markdown으로 정리한다.",
      bestFor: ["PDF 제안서", "PDF 결과보고서", "스캔 가능성/추출 한계 점검"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "pptx-slide-reader",
      name: "PowerPoint 슬라이드 조회",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "local_read_and_markdown_output",
      description: "PPTX를 zip/xml 기반으로 읽어 슬라이드 텍스트, 표/도형 텍스트, 발표 흐름, 버전/제안 근거를 추출한다.",
      bestFor: ["고객 발표자료", "PoC 결과 발표", "제품/솔루션 소개서"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "grant-rfp-strategy",
      name: "Grant RFP 전략 분석",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "local_read_and_markdown_output",
      description: "공고문, RFP, 작성양식, 평가방안, 기존 작성본을 교차 해석해 Support Gate, RTM, KPI, 연차계획, 증빙/예산/RAG 추천 전략을 만든다.",
      bestFor: ["국책과제 공고/RFP", "사업계획서 작성 전략", "KPI/예산/증빙 설계"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "grant-presentation-eval-strategy",
      name: "정부과제 발표평가 발표전략",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "local_read_and_markdown_output",
      description: "공고문, RFP, 사업계획서, 연구개발계획서, 기존 발표자료, 회의자료를 교차 해석해 평가위원 설득용 발표자료 전략과 장표 구조를 만든다.",
      bestFor: ["정부지원사업 발표평가", "발표자료 재구성", "슬라이드 메시지/예상 Q&A 설계"],
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "spreadsheet-stat-analyzer",
      name: "엑셀 분석/통계",
      type: "paperclip-glm-skill",
      status: "available",
      safety: "local_read_and_markdown_output",
      description: "xlsx/csv 구조와 기초통계를 추출하고 GLM으로 업무 분석 요약을 만든다.",
      bestFor: ["매출/비용 표", "실험 데이터", "프로젝트 관리표"],
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
      id: "os-file-browser-mcp",
      name: "OS File Browser MCP",
      type: "applied-mcp-bridge",
      status: "available",
      safety: "strict_allowlist_required",
      description: "읽기 전용 allowlist 범위에서 파일/폴더 탐색 결과를 Paperclip 스킬 입력으로 연결하는 로컬 MCP 브리지다.",
      bestFor: ["OS 파일 브라우징", "폴더 내 분석 대상 선별", "Paperclip 스킬 협업"],
      installHint: "현재 wiki_api 내부 브리지로 제공되며 repo/mirror/chat upload 범위만 허용",
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
      id: "os-file-browser",
      agent: "OS File Browser",
      title: "OS 파일 브라우징",
      description: "로컬 파일/폴더 경로를 읽기 전용으로 탐색해 구조 요약, 후보 파일, 후속 Paperclip 스킬 연결 포인트를 만든다.",
      command: "glm-skill",
      dryRun: false,
      safety: "allowlist_local_read_only",
      inputHint: "폴더 또는 파일 경로와 찾고 싶은 관점(예: RFP 후보, HWP 문서, 관리표, HTML 리포트)을 적으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "filesystem-wiki-intake",
      agent: "Filesystem Wiki Intake",
      title: "로컬 파일시스템 위키화 Intake",
      description: "로컬 파일/폴더를 읽기 전용으로 조사해 위키 승격 후보, 프로젝트 라우팅, 근거 문서 분류, 다음 액션을 만든다.",
      command: "glm-skill",
      dryRun: false,
      safety: "allowlist_local_read_only",
      inputHint: "로컬 폴더/파일 경로와 위키화 목적(예: Common intake, 특정 프로젝트 반영, rclone 보조 정리)을 적으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "wiki-ops-converter",
      agent: "Wiki Ops Manager",
      title: "운영형 위키 컨버터",
      description: "기존 위키/파일 해석 결과를 원문 보존형 근거 레이어와 CEO/PM 운영 레이어로 분리하고 프로젝트 허브 연결 후보를 만든다.",
      command: "glm-skill",
      dryRun: false,
      safety: "local_markdown_output_decision_queue_required",
      inputHint: "연결할 프로젝트 허브, 기존 자료 경로, 운영 관점(CEO/PM/고객 후속/중복/충돌)을 적으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "meeting-minutes-writer",
      agent: "PM Minutes Writer",
      title: "회의록/미팅정리 작성",
      description: "RTM 수석 PM 관점으로 입력 자료를 표준 회의록과 경영진 보고용 요약 Markdown으로 작성한다.",
      command: "glm-skill",
      dryRun: false,
      safety: "local_markdown_output",
      inputHint: "미팅 정보, 참석자, 회의 노트/녹취/초안을 붙여넣으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "rhwp-hwp-reader",
      agent: "HWP/HWPX Interpreter",
      title: "rhwp 기반 한글문서 해석",
      description: "hwp/hwpx 경로 또는 추출 텍스트를 받아 핵심 내용, 수치, 결정, 확인 필요 항목을 정리한다.",
      command: "glm-skill",
      dryRun: false,
      safety: "local_read_and_markdown_output",
      inputHint: "로컬 hwp/hwpx 경로와 해석 목적을 적으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "pdf-document-reader",
      agent: "PDF Evidence Reader",
      title: "PDF 문서 조회",
      description: "PDF 경로를 받아 페이지별 텍스트, 핵심 주장, 수치, 추출 한계, 위키 반영 후보를 정리한다.",
      command: "glm-skill",
      dryRun: false,
      safety: "local_read_and_markdown_output",
      inputHint: "로컬 pdf 경로와 분석 목적(예: 제안서 근거, 결과보고서 수치, 계약/공고 확인)을 적으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "pptx-slide-reader",
      agent: "PowerPoint Slide Reader",
      title: "PowerPoint 슬라이드 조회",
      description: "pptx 경로를 받아 슬라이드별 텍스트/표/도형 문구와 발표 흐름, 근거 후보, 누락 가능성을 정리한다.",
      command: "glm-skill",
      dryRun: false,
      safety: "local_read_and_markdown_output",
      inputHint: "로컬 pptx 경로와 분석 목적(예: PoC 발표자료, 제품 소개, 고객 미팅 자료)을 적으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "grant-rfp-strategy",
      agent: "Grant RFP Strategist",
      title: "공고/RFP 전략 분석",
      description: "공고문, RFP, 작성양식, 평가방안, 기존 작성본을 교차 분석해 지원 가능성, 평가 대응, KPI, 연차계획, 증빙, 예산, RAG 추천 카드를 만든다.",
      command: "glm-skill",
      dryRun: false,
      safety: "local_read_and_markdown_output",
      inputHint: "공고문/RFP/양식/평가표/기존 작성본 경로와 과제명, 분석 모드(Quick Scan/Strategy Build/Draft Ready 등)를 적으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "grant-presentation-eval-strategy",
      agent: "Grant Presentation Eval Strategist",
      title: "정부과제 발표평가 발표전략",
      description: "공고문, RFP, 사업계획서, 연구개발계획서, 기존 발표자료, 회의자료를 묶어 평가위원 설득용 발표 논리, 추천 목차, 슬라이드 메시지, 예상 Q&A를 설계한다.",
      command: "glm-skill",
      dryRun: false,
      safety: "local_read_and_markdown_output",
      inputHint: "공고문/RFP/사업계획서/연구개발계획서/기존 발표자료/회의자료 경로와 발표시간, 과제명을 적으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
    {
      id: "spreadsheet-stat-analyzer",
      agent: "Spreadsheet Analyst",
      title: "엑셀 분석/통계",
      description: "xlsx/csv 경로 또는 표 데이터를 받아 시트 구조, 숫자 컬럼 통계, 결측, 상위값과 업무적 시사점을 정리한다.",
      command: "glm-skill",
      dryRun: false,
      safety: "local_read_and_markdown_output",
      inputHint: "xlsx/csv 경로, 분석 목적, 보고 관점을 적으세요.",
      output: "automation/wiki_api/runtime/skill_outputs/*.md",
    },
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
      id: "slack-evidence-collector",
      agent: "Slack Evidence Collector",
      title: "Slack raw 증적 수집",
      description: "Slack API로 채널 목록, 메시지, 스레드, 파일 메타데이터를 로컬 raw export로 수집한다. 위키 반영은 별도 검토 후 진행한다.",
      command: "slack-collect",
      dryRun: true,
      safety: "slack_read_only_local_export",
      inputHint: "SLACK_CHANNELS, SLACK_HISTORY_LIMIT, SLACK_OLDEST_DAYS를 설정하거나 task payload로 채널명을 넘기세요.",
      output: "obsidian/raw/exports/slack/*.json + automation/wiki_api/runtime/slack_collection_state.json",
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
    status: overrides.status || "queued",
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

function paperclipRunningTaskIsStale(task = {}) {
  const staleMs = Number(process.env.PAPERCLIP_RUNNING_STALE_MS || 15 * 60 * 1000);
  const started = Date.parse(task.startedAt || task.updatedAt || task.createdAt || "");
  return Number.isFinite(started) && Date.now() - started > staleMs;
}

async function executePaperclipTask(task) {
  if (!task?.id) throw new Error("Paperclip task id is required");
  if (task.status === "running" && !paperclipRunningTaskIsStale(task)) throw new Error("Paperclip task is already running");
  if (task.status === "running" && paperclipRunningTaskIsStale(task)) {
    await prependJsonHistory(paperclipEventsPath, {
      taskId: task.id,
      type: "task_recovered_from_stale_running",
      message: `${task.agent}: stale running task recovered for rerun`,
      createdAt: new Date().toISOString(),
    });
  }
  if (task.status === "completed" && !task.payload?.allowReRun) {
    throw new Error("Paperclip task is already completed. Create a new task for rerun.");
  }
  const startedAt = new Date().toISOString();
  await updatePaperclipTask(task.id, {
    status: "running",
    startedAt,
  });
  await prependJsonHistory(paperclipEventsPath, {
    taskId: task.id,
    type: "task_started",
    message: `${task.agent}: ${task.title}`,
    createdAt: startedAt,
  });
  let result;
  try {
    if (task.command === "openclaw") {
      result = await triggerOpenClaw("drive_wikify_cycle");
    } else if (task.command === "validate") {
      result = { status: "completed", coverage: await coverageSummary() };
    } else if (task.command === "glm-skill") {
      result = await runPaperclipGlmSkill(task);
    } else {
      result = await runCommand(task.command, Boolean(task.dryRun));
    }
  } catch (error) {
    result = { status: "failed", error: error.message };
  }
  const status = result.status === "completed" || result.status === "sent" ? "completed" : "failed";
  let decisionQueueItem = null;
  if (status === "completed" && (result.markdown || result.path || task.command === "validate")) {
    decisionQueueItem = await enqueueDecisionQueueItem({
      id: `paperclip-${task.id}`,
      sourceType: "paperclip_task",
      kind: task.templateId === "validator" ? "decision" : "knowledge",
      title: `Paperclip 결과 검토: ${task.title}`,
      projectKey: task.payload?.projectKey || task.payload?.projectHint || "",
      content: result.markdown || result.summary || JSON.stringify(result).slice(0, 4000),
      path: result.path || "",
      original: {
        taskId: task.id,
        templateId: task.templateId,
        command: task.command,
        result,
      },
    }).catch(() => null);
  }
  const updatedTask = await updatePaperclipTask(task.id, {
    status,
    result: decisionQueueItem ? { ...result, decisionQueueItemId: decisionQueueItem.id } : result,
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

async function triggerPaperclipTask(templateId, options = {}) {
  const task = await createPaperclipTask(templateId, options);
  return executePaperclipTask(task);
}

function enqueuePaperclipTaskExecution(task) {
  setImmediate(() => {
    executePaperclipTask(task).catch(async (error) => {
      await updatePaperclipTask(task.id, {
        status: "failed",
        result: { status: "failed", error: error.message },
        finishedAt: new Date().toISOString(),
      }).catch(() => null);
      await prependJsonHistory(paperclipEventsPath, {
        taskId: task.id,
        type: "task_failed",
        message: `${task.agent}: ${error.message}`,
        createdAt: new Date().toISOString(),
      }).catch(() => null);
    });
  });
  return {
    status: "accepted",
    async: true,
    task,
  };
}

async function triggerPaperclipTaskAsync(templateId, options = {}) {
  const task = await createPaperclipTask(templateId, options);
  return enqueuePaperclipTaskExecution(task);
}

async function triggerExistingPaperclipTask(taskId) {
  const tasks = await readJsonFile(paperclipTasksPath, []);
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Paperclip task not found: ${taskId}`);
  return executePaperclipTask(task);
}

async function triggerExistingPaperclipTaskAsync(taskId) {
  const tasks = await readJsonFile(paperclipTasksPath, []);
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Paperclip task not found: ${taskId}`);
  return enqueuePaperclipTaskExecution(task);
}

function paperclipSkillSystemPrompt(templateId) {
  if (templateId === "meeting-minutes-writer") {
    return [
      "당신은 RTM의 수석 프로젝트 매니저(PM)입니다. 아래 제공된 [입력 자료]를 분석하여, 다음 3단계 프로세스에 따라 결과물을 작성해 주세요.",
      "[작업 원칙]",
      "1. 객관성: 감정을 배제하고 사실 기반의 건조하고 전문적인 어조를 유지하십시오.",
      "2. 내용 보존: 원문의 핵심 내용은 절대 왜곡하지 말고, 구조화 및 정리에 집중하십시오.",
      "3. 참석자 정렬: 모든 참석자는 회사별로 분류하되, 반드시 직급/직책이 높은 순서(임원 > 팀장 > 매니저)로 정렬하여 기재하십시오.",
      "[출력 요구사항]",
      "SECTION 1. 표준 회의록 (Minutes): 비존칭 실무체/개조식(~함, ~결정됨, ~논의함). 존댓말 금지. 미팅 개요, 주요 논의 및 결정 사항, Next Steps / TO DO 표를 포함하십시오.",
      "SECTION 2. 경영진 보고용 요약 (Key Summary): 5~6줄 내외의 개조식 글머리 기호로 날짜/차수, 목적/배경, 고객 현황/Pain Point, 주요 논의/반응, 합의/향후 일정을 담으십시오.",
    ].join("\n");
  }
  if (templateId === "os-file-browser") {
    return [
      "당신은 RTM의 OS 파일 브라우징 분석 담당자입니다.",
      "입력된 파일/폴더 구조를 읽기 전용으로 검토하고, 다른 Paperclip 스킬이 후속 작업에 바로 사용할 수 있도록 정리합니다.",
      "반드시 다음 순서로 답하십시오: 1) 대상 경로 요약 2) 폴더 구조/확장자 분포 3) 업무적으로 유의미한 후보 파일 4) 추천 후속 스킬과 그 이유 5) 확인 필요/권한 제한.",
      "파일 내용을 보지 못한 경우 구조 기반 추정이라고 명시하고, 확인 가능한 파일 경로는 상대경로로 나열하십시오.",
      "실행/수정/삭제를 제안하더라도 자동 수행된 것처럼 쓰지 마십시오.",
    ].join("\n");
  }
  if (templateId === "filesystem-wiki-intake") {
    return [
      "당신은 RTM의 로컬 파일시스템 위키화 intake 담당자입니다.",
      "목표는 로컬 파일/폴더를 읽기 전용으로 조사하여, rclone 수집의 보조 또는 대체 입력으로 위키 반영 후보를 만드는 것입니다.",
      "가장 중요한 원칙: 파일 내용을 요약본으로 대체하지 마십시오. 원문/긴 추출문/표/수치/버전/출처 위치를 보존하고, 운영 요약은 별도 레이어로만 작성하십시오.",
      "반드시 다음 순서로 답하십시오.",
      "1) Intake 범위 요약: 어떤 폴더/파일이 들어왔는지, 경로 범위와 구조 특징",
      "2) Source inventory: 문서 유형별 분류(HWP/HWPX/PDF/DOCX/PPTX/XLSX/CSV/HTML/MD/TXT/JSON 등), 대표 파일, 추출 한계",
      "3) Wiki promotion plan: Sources.md, Evidence_Log.md, Conflict_Register.md, Change_Log.md에 각각 무엇이 들어가야 하는지",
      "4) Project routing: 어느 프로젝트 hub 또는 Common intake로 가야 하는지와 이유",
      "5) Candidate facts: 핵심 수치, 결정, 일정, 조직/참석자, 리스크, 충돌 후보",
      "6) Next actions: 읽기+검수 자동으로 끝낼 일과 승인 후 write/run 해야 할 일을 분리",
      "문서 내용이 실제로 추출된 부분과 구조만 보고 추정한 부분을 구분하고, 위키에 이미 쓴 것처럼 표현하지 마십시오.",
    ].join("\n");
  }
  if (templateId === "wiki-ops-converter") {
    return [
      "당신은 RTM의 위키 관리 LLM입니다.",
      "목표는 산재한 기존 자료와 파일 해석 결과를 프로젝트 허브에 연결하고, 중복/충돌을 막으면서 실무 중심의 운영형 위키로 전환할 검토 초안을 만드는 것입니다.",
      "",
      "[절대 원칙]",
      "1. 파일 내용, 긴 추출문, 표, 수치, 원문 문장은 요약본으로 대체하지 않습니다.",
      "2. 원문 보존 레이어(Sources, Evidence_Log, Raw_Evidence_Index)와 운영 판단 레이어(Status, Business_Flow, CEO_Brief, PM_Action_Plan, Customer_Followup)를 분리합니다.",
      "3. 새 사실을 확정하지 말고, 근거 위치가 없으면 '근거 위치 미확인'으로 둡니다.",
      "4. 중복 가능 문서는 기존 프로젝트 허브 후보와 비교하고, 상충 수치/일정/버전은 Conflict_Register 또는 Decision Queue 후보로 남깁니다.",
      "5. 실제 위키에 반영된 것처럼 쓰지 말고 적용 전 변환 계획과 append 후보만 제시합니다.",
      "",
      "[필수 출력]",
      "1. 프로젝트 허브 연결 후보: projectKey, hub path, 연결 이유, confidence, 중복 후보",
      "2. 원문 보존 계획: 원천별 Sources/Evidence_Log/Raw_Evidence_Index에 남길 내용과 보존 단위",
      "3. 운영형 변환 계획: Status, Business_Flow, CEO_Brief, PM_Action_Plan, Customer_Followup별 append 후보",
      "4. 충돌/중복 방지: 같은 고객/프로젝트/버전/수치/일정 후보와 처리 원칙",
      "5. Decision Queue 카드 초안: 사람이 승인해야 할 결정 항목",
      "6. LLM Chat 활용 방식: 이후 질문에 어떤 운영 컨텍스트를 우선 검색해야 하는지",
    ].join("\n");
  }
  if (templateId === "rhwp-hwp-reader") {
    return [
      "당신은 RTM의 문서 해석 담당자입니다.",
      "제공된 한글문서 추출문을 왜곡 없이 분석해 핵심 내용, 수치, 조직/참석자, 결정/요청, 리스크, 확인 필요 항목을 한국어 Markdown으로 정리하십시오.",
      "파일 내용을 요약본으로 대체하지 말고, 원문/긴 추출문/표/수치/버전/출처 위치를 보존해야 할 단위로 분리하십시오.",
      "추출 품질 경고가 있으면 한계로 명시하십시오.",
      "중요: 입력에 `Paperclip 경로 차단`, `Paperclip 경로 미해결`, `Paperclip 입력 파일 없음`이 있으면 파일을 읽지 못한 것입니다. 이 경우를 HWP 보안 설정, 암호화, 배포용 문서, 권한 잠금으로 단정하지 마십시오.",
      "보안/암호화 실패라고 말할 수 있는 경우는 로컬 추출 결과 또는 extractor warning에 그 원인이 명시된 때뿐입니다.",
    ].join("\n");
  }
  if (templateId === "pdf-document-reader") {
    return [
      "당신은 RTM의 PDF 증거 문서 조회 담당자입니다.",
      "제공된 PDF 추출문을 페이지/섹션 단위 근거로 보존하면서 핵심 주장, 수치, 일정, 조직/고객명, 결정/요청, 리스크, 확인 필요 항목을 한국어 Markdown으로 정리하십시오.",
      "요약은 운영 판단 보조일 뿐이며, 원문 페이지/섹션/표 단위 근거를 보존 대상으로 별도 표시하십시오.",
      "pypdf 또는 fallback 추출 한계가 있으면 반드시 한계로 명시하고, 스캔 이미지처럼 텍스트가 비어 있는 부분은 추측하지 마십시오.",
      "위키 승격 후보는 Sources/Evidence_Log/Conflict_Register/Change_Log 관점으로 나누되, 실제 반영된 것처럼 쓰지 마십시오.",
    ].join("\n");
  }
  if (templateId === "pptx-slide-reader") {
    return [
      "당신은 RTM의 PowerPoint 슬라이드 조회 담당자입니다.",
      "제공된 PPTX 추출문을 슬라이드 흐름 기준으로 해석하고, 제목/표/도형 텍스트/발표 노트에서 확인되는 핵심 주장, 수치, 제품명, 고객명, 일정, 리스크, 버전 차이를 한국어 Markdown으로 정리하십시오.",
      "슬라이드별 원문 텍스트와 운영 판단 요약을 분리하고, 슬라이드 원문을 요약으로 대체하지 마십시오.",
      "슬라이드 이미지나 차트에만 존재해 텍스트로 추출되지 않은 정보는 추출 한계로 표시하고 추측하지 마십시오.",
      "위키 승격 후보는 Sources/Evidence_Log/Conflict_Register/Change_Log 관점으로 나누되, 실제 반영된 것처럼 쓰지 마십시오.",
    ].join("\n");
  }
  if (templateId === "grant-rfp-strategy") {
    return [
      "당신은 RTM의 Grant/RFP 전략 PMO입니다. 업로드된 공고문, RFP, 작성양식, 평가방안, 기존 작성본, 증빙자료를 교차 해석해 지원 가능성 및 작성 전략을 산출합니다.",
      "",
      "[핵심 원칙]",
      "1. 단순 요약 금지: 평가자가 묻는 질문, 탈락 조건, 배점 대응, KPI/증빙/예산 설계가 중심입니다.",
      "2. 사실/해석/전략/가정/추가 요청을 반드시 분리합니다.",
      "3. 문서 간 충돌은 통합하지 말고 원문 기준 문서 우선순위와 함께 Conflict로 남깁니다.",
      "4. 허위 성능 수치, 출처 없는 benchmark, 법률/회계 확정 판단을 만들지 않습니다.",
      "5. 지식승격 전제: 모든 확정값은 문서명, 페이지/섹션/표 위치 또는 추출 근거를 붙일 수 있어야 합니다. 위치가 없으면 '근거 위치 미확인'으로 표시합니다.",
      "6. 내부 위키/RAG 추천은 업로드 문서에서 확인된 키워드와 requirement 기반으로 제안하되, 실제 외부 API 조회를 수행한 척하지 않습니다.",
      "",
      "[작동 순서]",
      "Support Gate -> 평가구조 해석 -> Requirement Traceability Matrix -> KPI 카드 -> 연차별 개발계획 -> Evidence Log/Data Request -> Risk Matrix -> 예산 전략 -> 유사 과제/RAG 추천 -> 작성 초안 블록 순서로 작성합니다.",
      "",
      "[필수 출력]",
      "1. 문서 인벤토리: 파일명, 문서유형, 핵심 포함 내용, 우선순위, 추출 한계",
      "2. Support Gate: Go/Conditional Go/High Risk/No-Go, fatal blockers, critical risks, missing documents, deadline feasibility, budget fit, confidence, next action",
      "3. 평가기준 해석표: 평가항목, 배점, 평가 질문, 대응 논리, 필요 근거",
      "4. Requirement Traceability Matrix: req_id, 출처문서, 위치, 요구사항 원문, 유형, 우선순위, 대응 전략, 반영 목차, 필요한 증빙, 상태, 담당",
      "5. KPI 카드: 지표명, 단위, 기준값, 최종목표, 비중, 국내/글로벌 benchmark, 평가방법, 평가환경, 설정근거, 연차목표, 증빙자료, 상태",
      "6. 연차별 개발계획: 연차, 연결 KPI, 개발 범위, 산출물, 측정방법, 검증게이트, 파트너 역할, 예산 포인트, 리스크",
      "7. Evidence Log와 Data Request: 주장별 근거, 부족한 증빙, owner, 우선순위, 마감 제안",
      "8. Risk Matrix: 자격/기술/일정/증빙/예산/사업화/파트너 리스크와 완화조치",
      "9. 예산 전략: 보수안/목표안/적극안, 비목별 근거, KPI/과업 연결, 허용성, 필요 증빙",
      "10. 유사 과제/RAG 추천 카드: 검색 차원, 추천 이유, 재사용 가능 항목, 재사용 금지 항목, 후속 질의",
      "11. 바로 작성 가능한 초안 블록: 확정 근거가 있는 문장과 보류 문장을 분리",
      "",
      "[검증 규칙]",
      "- KPI weight 합계가 100인지 점검하고, 모르면 미확정으로 둡니다.",
      "- 기준값/단위/평가방법/평가환경 없는 KPI는 draft 또는 gap으로 분류합니다.",
      "- 필수 제출서류, 신청자격, 민간부담, 마감, 파트너 조건은 Support Gate에서 먼저 다룹니다.",
      "- 예산 숫자는 산출 근거가 없으면 basis_missing으로 표시합니다.",
      "- 모든 핵심 주장에 Evidence Log 또는 Data Request를 연결합니다.",
    ].join("\n");
  }
  if (templateId === "grant-presentation-eval-strategy") {
    return [
      "당신은 RTM의 정부지원사업 발표평가 발표전략 PMO입니다. 업로드된 공고문, RFP, 사업계획서, 연구개발계획서, 기존 발표자료, 회의자료를 교차 해석해 평가위원 설득용 발표자료 작성 전략을 만듭니다.",
      "",
      "[핵심 원칙]",
      "1. 특정 과제 요약본이 아니라 평가위원 설득 구조로 재구성합니다.",
      "2. 계획서 문장을 그대로 축약하지 말고, 평가항목과 발표시간에 맞는 발표 논리로 재배치합니다.",
      "3. 장표 제목은 반드시 결론형으로 작성합니다.",
      "4. 문서에 없는 수치, 고객 반응, 성과, 비교우위를 발명하지 않습니다.",
      "5. 사실/해석/전략/보강 필요를 구분하되, 최종 출력은 발표 실무자가 바로 장표화할 수 있는 수준으로 씁니다.",
      "6. 기술 설명보다 문제 정의, 실증 가능성, 수행역량, 사업화 가능성, 리스크 통제 논리를 우선합니다.",
      "7. 본 발표 장표와 백업 장표를 분리하고, 질의응답 대응 논리를 별도로 설계합니다.",
      "",
      "[작동 순서]",
      "문서 커버리지 점검 -> 평가항목/배점 해석 -> 평가위원 질문 역산 -> 설득 논리 재배치 -> 발표시간 기준 목차 구성 -> 슬라이드 메시지/시각화 설계 -> 보강자료/예상 Q&A -> 작성 우선순위 -> 본 발표/백업 장표 분리 순서로 작성합니다.",
      "",
      "[필수 출력]",
      "1. 발표 전략 요약: 이번 발표가 무엇을 증명해야 하는지, 어떤 순서로 설득할지, 반드시 피해야 할 설명 방식을 5~8문장으로 정리",
      "2. 과제 한 문장 정의: 평가위원이 바로 이해할 수 있는 문제-해결-실증-효과 구조의 한 문장",
      "3. 평가항목별 대응 전략: 평가항목, 평가위원 질문, 대응 논리, 반드시 넣을 근거, 피해야 할 실수",
      "4. 발표시간 기준 추천 목차: 발표시간 미확정이면 10분/15분/20분 기본안 중 가장 적합한 안을 제시하고 그렇게 판단한 이유를 짧게 설명",
      "5. 슬라이드별 핵심 메시지, 포함 내용, 시각화 방식: 장표 번호, 결론형 제목, 핵심 메시지, 포함 내용, 시각화 방식, 본/백업 구분을 표로 작성",
      "6. 반드시 보강해야 할 자료: 현재 문서군만으로 약한 부분, 필요한 수치/증빙/도식/고객확인/평가방법",
      "7. 예상 Q&A: 공격 질문, 질문 의도, 답변 논리, 근거 자료, 백업 장표 연결",
      "8. 발표자료 작성 우선순위: 지금 바로 만들 장표, 근거 수집 후 만들 장표, 마지막에 다듬을 장표",
      "9. 본 발표 장표와 백업 장표 구분: 왜 본 장표인지/왜 백업인지까지 설명",
      "",
      "[작성 규칙]",
      "- 평가항목이 명시돼 있으면 그 기준을 따른다. 명시돼 있지 않으면 문서 기반 추정이라고 표시한 뒤 필요성/차별성/실현가능성/사업화/수행역량 축으로 임시 재구성한다.",
      "- 발표시간이 짧을수록 '왜 이 과제가 지금 지원받아야 하는가'와 '왜 우리가 해낼 수 있는가'를 먼저 배치한다.",
      "- 슬라이드마다 주장 1개만 남기고, 장표 제목이 그 주장 자체가 되게 쓴다.",
      "- 계획서 목차 순서를 그대로 따라가지 말고, 평가위원 이해 순서에 맞게 문제 -> 해법 -> 검증 -> 수행역량 -> 사업화/파급효과로 재배치한다.",
      "- 기존 발표자료가 있으면 재사용 가능한 장표와 버려야 할 장표를 구분한다.",
      "- 회의자료에만 있는 합의/고객요청/제약조건은 발표 논리의 제약 또는 Q&A 대응 근거로 분리한다.",
      "- 문서상 근거가 약한 메시지는 '보강 필요'로 표시하고, 확정 사실처럼 쓰지 않는다.",
      "",
      "[검증 규칙]",
      "- 장표 제목이 명사형/설명형이면 결론형으로 다시 쓴다.",
      "- 평가항목별 대응 전략과 슬라이드 구성이 서로 연결되지 않으면 누락으로 본다.",
      "- 실증 계획, 정량 KPI, 수요처/시장성, 수행기관 신뢰도 중 하나라도 빠지면 보강 필요로 표시한다.",
      "- 예상 Q&A는 최소 8개 이상 작성하고, 기술/사업화/예산/실증/차별성 질문을 고르게 포함한다.",
    ].join("\n");
  }
  if (templateId === "spreadsheet-stat-analyzer") {
    return "당신은 RTM의 데이터 분석 담당자입니다. 제공된 엑셀/CSV 구조와 기초통계를 바탕으로 업무적으로 중요한 패턴, 이상치, 결측, 리스크, 추가 분석 액션을 한국어 Markdown으로 정리하십시오. 수치는 입력 근거를 보존하십시오.";
  }
  if (templateId === "html-report-reader") {
    return "당신은 RTM의 HTML 보고서 분석 담당자입니다. 제공된 HTML 보고서 추출문을 기반으로 핵심 주장, 수치, 섹션 구조, 증거, 결정/리스크/다음 액션을 한국어 Markdown으로 정리하십시오. 스크립트나 차트 이미지로만 존재해 추출되지 않은 정보는 한계로 명시하십시오.";
  }
  return "당신은 RTM 운영 스킬 실행자입니다. 입력을 사실 기반 한국어 Markdown 결과물로 정리하십시오.";
}

function extractLocalPaths(text, extensions = []) {
  const allowed = new Set(extensions.map((item) => item.toLowerCase()));
  const extensionPattern = "hwp|hwpx|pdf|docx|pptx|xlsx|xls|csv|html|htm|md|txt|json";
  const matches = [];
  const lines = String(text || "").split(/\r?\n/);
  const normalizePathFragment = (value = "") => String(value || "")
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[),.;]+$/g, "");
  const pathMatchPattern = new RegExp(`(/.+?\\.(${extensionPattern}))(?=$|\\s)`, "i");
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizePathFragment(lines[index]);
    if (!line || !line.includes("/")) continue;
    const quotedAbsolutePath = line.match(new RegExp(`["'](/.+\\.(${extensionPattern}))["']`, "i"))?.[1];
    if (quotedAbsolutePath) {
      matches.push(quotedAbsolutePath);
      continue;
    }
    const wholeLineAbsolutePath = line.match(new RegExp(`(/.+\\.(${extensionPattern}))\\s*$`, "i"))?.[1];
    if (wholeLineAbsolutePath) {
      matches.push(wholeLineAbsolutePath);
      continue;
    }
    if (!line.startsWith("/")) continue;
    let candidate = line;
    let matchedCandidate = candidate.match(pathMatchPattern)?.[1] || "";
    if (!matchedCandidate) {
      for (let nextIndex = index + 1; nextIndex < Math.min(lines.length, index + 8); nextIndex += 1) {
        const next = normalizePathFragment(lines[nextIndex]);
        if (!next) break;
        if (next.startsWith("/") && next !== line) break;
        candidate = `${candidate} ${next}`.trim();
        matchedCandidate = candidate.match(pathMatchPattern)?.[1] || "";
        if (matchedCandidate) {
          matches.push(matchedCandidate);
          index = nextIndex;
          break;
        }
      }
    }
  }
  matches.push(...(String(text || "").match(new RegExp(`(/[^\n"'<>]+\\.(${extensionPattern}))`, "gi")) || []));
  return [...new Set(matches)]
    .map((item) => item.trim().replace(/[),.;]+$/g, ""))
    .filter((item) => !allowed.size || allowed.has(extname(item).toLowerCase().replace(".", "")))
    .map((item) => resolve(repoRoot, item));
}

function extractPathSearchRoots(text) {
  const roots = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = String(rawLine || "")
      .trim()
      .replace(/^[-*]\s+/, "")
      .replace(/^["'`]+|["'`]+$/g, "");
    if (!line.startsWith("/") || !line.includes("/")) continue;
    const parent = dirname(line);
    const resolvedParent = resolveReadablePath(parent);
    if (!existsSync(resolvedParent)) continue;
    roots.push(resolvedParent);
  }
  return [...new Set(roots)];
}

function extractDirectoryLikePaths(text) {
  const matches = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cleaned = line
      .replace(/^[-*]\s+/, "")
      .replace(/^`|`$/g, "")
      .replace(/^["']|["']$/g, "")
      .replace(/[),.;]+$/g, "");
    if (/^(\/|\.{1,2}\/|obsidian\/|automation\/)/.test(cleaned)) matches.push(cleaned);
  }
  matches.push(...(String(text || "").match(/(?:\/[^\n"'<>]+|\.{1,2}\/[^\n"'<>]+|(?:obsidian|automation)\/[^\n"'<>]+)/g) || []));
  return [...new Set(matches)]
    .map((item) => item.trim().replace(/[),.;]+$/g, ""))
    .map((item) => resolve(repoRoot, item))
    .filter((item) => existsSync(item));
}

function inspectBrowserPathBlock(text) {
  const match = String(text || "").match(/\[파일브라우징 경로\]([\s\S]*?)\[\/파일브라우징 경로\]/);
  if (!match) {
    return {
      hasBlock: false,
      fileCount: 0,
      directoryCount: 0,
      fileHints: [],
      directoryHints: [],
      extensions: [],
    };
  }
  const lines = match[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fileHints = lines
    .filter((line) => line.startsWith("- file:"))
    .map((line) => line.replace(/^- file:\s*/, "").trim())
    .filter(Boolean);
  const directoryHints = lines
    .filter((line) => line.startsWith("- directory:"))
    .map((line) => line.replace(/^- directory:\s*/, "").trim())
    .filter(Boolean);
  return {
    hasBlock: true,
    fileCount: fileHints.length,
    directoryCount: directoryHints.length,
    fileHints,
    directoryHints,
    extensions: [...new Set(fileHints.map((item) => extname(item).toLowerCase()).filter(Boolean))],
  };
}

function normalizeBrowserHintName(value = "") {
  return String(value || "")
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[★☆•\s]+/, "")
    .replace(/\s+/g, " ");
}

function normalizeFileHintForMatch(value = "") {
  return normalizeBrowserHintName(value)
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function fileHintTokens(value = "") {
  return [...new Set(
    normalizeFileHintForMatch(value)
      .replace(/\.[a-z0-9]+$/i, "")
      .match(/[0-9a-z가-힣]{2,}/giu) || [],
  )].filter((token) => !["hwp", "hwpx", "pdf", "docx", "pptx", "xlsx", "xls", "csv", "html", "htm", "file", "source"].includes(token));
}

function extractFilenameHints(text, extensions = []) {
  const allowed = new Set((extensions || []).map((item) => `.${String(item).toLowerCase().replace(/^\./, "")}`));
  const extensionPattern = (allowed.size ? [...allowed].map((item) => item.slice(1)) : ["hwp", "hwpx", "pdf", "docx", "pptx", "xlsx", "xls", "csv", "html", "htm", "md", "txt", "json"]).join("|");
  const hints = [];
  const raw = String(text || "");
  for (const match of raw.matchAll(new RegExp("`([^`]+\\.(" + extensionPattern + "))`", "gi"))) {
    hints.push(match[1]);
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!new RegExp(`\\.(${extensionPattern})\\b`, "i").test(line)) continue;
    const cleaned = line
      .replace(/^[-*]\s+/, "")
      .replace(/^(file|source|path)\s*:\s*/i, "")
      .replace(/^.*?:\s*(?=[^:]*\.(?:hwp|hwpx|pdf|docx|pptx|xlsx|xls|csv|html|htm|md|txt|json)\b)/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[),.;]+$/g, "")
      .trim();
    if (cleaned && !cleaned.includes("/")) hints.push(cleaned);
  }
  return [...new Set(hints.map(normalizeBrowserHintName).filter(Boolean))]
    .filter((hint) => {
      const ext = extname(hint).toLowerCase();
      return ext && (!allowed.size || allowed.has(ext));
    });
}

async function resolveFilenameHintFiles(text, extensions = [], options = {}) {
  const hints = extractFilenameHints(text, extensions);
  if (!hints.length) return [];
  const extensionPattern = (extensions.length ? extensions : ["hwp", "hwpx", "pdf", "docx", "pptx", "xlsx", "xls", "csv", "html", "htm", "md", "txt", "json"]).join("|");
  const hintedRoots = extractPathSearchRoots(text);
  const fallbackRoots = [
    chatUploadMirrorRoot,
    chatUploadsRoot,
    resolveRepoPath("automation/drive_wikify/runtime/mirror"),
    "/Users/rtm/Library/CloudStorage",
    "/Users/rtm/Library/CloudStorage/GoogleDrive-jaykafka12@gmail.com",
    "/Users/rtm/Library/CloudStorage/GoogleDrive-jaykafka12@gmail.com/.shortcut-targets-by-id",
    join(hostUserMountRoot, "Library/CloudStorage"),
    join(hostUserMountRoot, "Library/CloudStorage/GoogleDrive-jaykafka12@gmail.com"),
    join(hostUserMountRoot, "Library/CloudStorage/GoogleDrive-jaykafka12@gmail.com/.shortcut-targets-by-id"),
    repoRoot,
  ].map((item) => resolve(item));
  const roots = [...new Set(hintedRoots.concat(fallbackRoots))];
  const maxMatches = Math.max(4, Number(options.maxHintMatches || 16));
  const maxCollectedMatches = Math.max(maxMatches * 6, 24);
  const maxVisited = Math.max(2000, Number(options.maxHintSearchFiles || 100000));
  const allowedExts = new Set((extensions || []).map((item) => `.${String(item).toLowerCase().replace(/^\./, "")}`));
  const matches = [];
  const seen = new Set();
  let visited = 0;
  const pathContextTokens = [...new Set(
    String(text || "")
      .split(/\r?\n/)
      .filter((line) => line.includes("/") || new RegExp(`\\.(${extensionPattern})\\b`, "i").test(line))
      .flatMap((line) => normalizeFileHintForMatch(line).match(/[0-9a-z가-힣]{2,}/giu) || []),
  )].filter((token) => !["hwp", "hwpx", "pdf", "docx", "pptx", "xlsx", "xls", "csv", "html", "htm", "md", "txt", "json", "file", "source", "path"].includes(token));

  function matchScore(fileName, hint) {
    const normalizedName = normalizeFileHintForMatch(fileName);
    const normalizedHint = normalizeFileHintForMatch(hint);
    if (normalizedName === normalizedHint) return 1000;
    if (normalizedName.includes(normalizedHint)) return 800;
    const tokens = fileHintTokens(hint);
    if (!tokens.length) return 0;
    const required = tokens.filter((token) => /\d{4,}/.test(token) || /[가-힣a-z]{3,}/iu.test(token));
    const score = required.filter((token) => normalizedName.includes(token)).length;
    if (score < Math.min(required.length, Math.max(2, Math.ceil(required.length * 0.65)))) return 0;
    return score * 100;
  }

  function rootPriority(path) {
    if (!hintedRoots.length) return 0;
    const resolvedPath = resolve(path);
    const exactRootIndex = hintedRoots.findIndex((root) => resolvedPath === root || resolvedPath.startsWith(`${root}/`));
    if (exactRootIndex === -1) return 0;
    return (hintedRoots.length - exactRootIndex) * 1000;
  }

  async function walk(rootPath) {
    if (matches.length >= maxCollectedMatches || visited >= maxVisited) return;
    const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (matches.length >= maxCollectedMatches || visited >= maxVisited) return;
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__pycache__") continue;
      const fullPath = join(rootPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      visited += 1;
      const ext = extname(entry.name).toLowerCase();
      if (allowedExts.size && !allowedExts.has(ext)) continue;
      if (!localPathAllowedForAutoSkill(fullPath)) continue;
      const baseScore = Math.max(...hints.map((hint) => matchScore(entry.name, hint)));
      if (!baseScore) continue;
      const key = resolve(fullPath);
      if (seen.has(key)) continue;
      seen.add(key);
      const normalizedPath = normalizeFileHintForMatch(key);
      const pathScore = pathContextTokens.filter((token) => normalizedPath.includes(token)).length;
      matches.push({ path: key, score: baseScore + pathScore + rootPriority(key) });
    }
  }

  for (const rootPath of roots) {
    const info = await stat(rootPath).catch(() => null);
    if (!info?.isDirectory?.()) continue;
    await walk(rootPath);
    if (hintedRoots.includes(rootPath) && matches.length) break;
    if (matches.length >= maxCollectedMatches || visited >= maxVisited) break;
  }
  return matches
    .sort((left, right) => right.score - left.score)
    .slice(0, maxMatches)
    .map((item) => item.path);
}

const RESOLVED_BROWSER_FILE_BLOCK_START = "[자동해결 파일경로]";
const RESOLVED_BROWSER_FILE_BLOCK_END = "[/자동해결 파일경로]";

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripResolvedBrowserFileBlock(text = "") {
  return String(text || "")
    .replace(new RegExp(`\\n?${escapeRegex(RESOLVED_BROWSER_FILE_BLOCK_START)}[\\s\\S]*?${escapeRegex(RESOLVED_BROWSER_FILE_BLOCK_END)}\\n?`, "g"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function resolveBrowserHintEntries(text, extensions = [], options = {}) {
  const browserBlock = inspectBrowserPathBlock(text);
  if (!browserBlock.hasBlock || !browserBlock.fileHints.length) return [];
  const allowedExts = new Set((extensions || []).map((item) => `.${String(item).toLowerCase().replace(/^\./, "")}`));
  const candidateRoots = [
    chatUploadMirrorRoot,
    resolveRepoPath("automation/drive_wikify/runtime/mirror"),
    repoRoot,
  ];
  const maxResults = Math.max(4, Number(options.maxHintMatches || 12));
  const exactHints = browserBlock.fileHints
    .map((item) => normalizeBrowserHintName(item))
    .filter(Boolean);
  const matches = [];
  const seen = new Set();

  for (const hint of exactHints) {
    for (const rootPath of candidateRoots) {
      if (matches.length >= maxResults) break;
      const info = await stat(rootPath).catch(() => null);
      if (!info?.isDirectory?.()) continue;
      const files = await walkFiles(rootPath).catch(() => []);
      for (const filePath of files) {
        if (matches.length >= maxResults) break;
        const fileName = filePath.split("/").at(-1) || "";
        const normalizedFileName = normalizeBrowserHintName(fileName);
        const fileExt = extname(filePath).toLowerCase();
        if (allowedExts.size && !allowedExts.has(fileExt)) continue;
        if (normalizedFileName !== hint) continue;
        if (!localPathAllowedForAutoSkill(filePath)) continue;
        const key = resolve(filePath);
        if (seen.has(`${hint}::${key}`)) continue;
        seen.add(`${hint}::${key}`);
        matches.push({ hint, path: key });
      }
    }
  }
  return matches;
}

async function resolveBrowserHintFiles(text, extensions = [], options = {}) {
  const entries = await resolveBrowserHintEntries(text, extensions, options);
  return [...new Set(entries.map((entry) => entry.path))];
}

async function enrichMessageWithResolvedBrowserFiles(message = "") {
  const baseText = stripResolvedBrowserFileBlock(message);
  const browserBlock = inspectBrowserPathBlock(baseText);
  if (!browserBlock.hasBlock || !browserBlock.fileHints.length) return baseText;
  const resolvedEntries = await resolveBrowserHintEntries(baseText, [], { maxHintMatches: 16 });
  if (!resolvedEntries.length) return baseText;
  const lines = [
    RESOLVED_BROWSER_FILE_BLOCK_START,
    "- source: browser_hint_resolver",
    ...resolvedEntries.map((entry) => [
      `- file: ${relative(repoRoot, entry.path)}`,
      `  original_hint: ${entry.hint}`,
    ].join("\n")),
    RESOLVED_BROWSER_FILE_BLOCK_END,
  ];
  return [baseText, lines.join("\n")].filter(Boolean).join("\n\n").trim();
}

function inspectUploadContextBlock(text) {
  const raw = String(text || "");
  const contextMatch = raw.match(/\[파일 해석 컨텍스트\]([\s\S]*?)\[\/파일 해석 컨텍스트\]/);
  const contextLines = contextMatch ? contextMatch[1].split(/\r?\n/).map((line) => line.trim()) : [];
  const contextFiles = [];
  let current = null;
  for (const line of contextLines.filter(Boolean)) {
    if (line.startsWith("- file:")) {
      if (current) contextFiles.push(current);
      current = { path: line.replace(/^- file:\s*/, "").trim(), route: "", summary: "" };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("route:")) current.route = line.replace(/^route:\s*/, "").trim();
    if (line.startsWith("summary:")) current.summary = line.replace(/^summary:\s*/, "").trim();
  }
  if (current) contextFiles.push(current);
  const attachmentSummaryFiles = [...raw.matchAll(/\[첨부 파일\]\s+([^\n]+)/g)].map((match) => ({
    name: String(match[1] || "").trim(),
  }));
  const extensions = [
    ...contextFiles.map((item) => extname(item.path || "").toLowerCase()).filter(Boolean),
    ...attachmentSummaryFiles.map((item) => extname(item.name || "").toLowerCase()).filter(Boolean),
  ];
  const routes = contextFiles.map((item) => item.route).filter(Boolean);
  return {
    hasBlock: Boolean(contextMatch),
    fileCount: contextFiles.length || attachmentSummaryFiles.length,
    files: contextFiles,
    attachmentSummaryFiles,
    routes,
    extensions: [...new Set(extensions)],
  };
}

function stripStaleUploadContextSummaries(text = "") {
  const raw = String(text || "");
  const contextMatch = raw.match(/\[파일 해석 컨텍스트\]([\s\S]*?)\[\/파일 해석 컨텍스트\]/);
  if (!contextMatch) return raw;
  const cleanedBlock = contextMatch[0]
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("summary:"))
    .join("\n");
  return raw.replace(contextMatch[0], cleanedBlock);
}

async function collectFilesFromDirectory(rootPath, allowedExtensions = [], options = {}) {
  const maxDepth = Number(options.maxDepth || 4);
  const maxFiles = Number(options.maxFiles || 80);
  const maxEntriesPerDirectory = Number(options.maxEntriesPerDirectory || 60);
  const allowed = new Set((allowedExtensions || []).map((item) => `.${String(item).toLowerCase().replace(/^\./, "")}`));
  const files = [];
  const directories = [];

  async function walk(currentPath, depth) {
    if (depth > maxDepth || files.length >= maxFiles) return;
    let entries = [];
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, maxEntriesPerDirectory)) {
      if (files.length >= maxFiles) break;
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        directories.push(fullPath);
        await walk(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (allowed.size && !allowed.has(extname(entry.name).toLowerCase())) continue;
      files.push(fullPath);
    }
  }

  directories.push(rootPath);
  await walk(rootPath, 0);
  return { files, directories: [...new Set(directories)] };
}

async function resolvePaperclipInputTargets(text, extensions = [], options = {}) {
  const filePaths = extractLocalPaths(text, extensions);
  const directoryPaths = extractDirectoryLikePaths(text);
  const browserHintPaths = await resolveBrowserHintFiles(text, extensions, options);
  const filenameHintPaths = await resolveFilenameHintFiles(text, extensions, options);
  const targets = [];
  const blocked = [];
  const missing = [];
  for (const inputPath of [...new Set(filePaths.concat(directoryPaths, browserHintPaths, filenameHintPaths))]) {
    const fullPath = resolveReadablePath(inputPath);
    const allowed = localPathAllowedForAutoSkill(fullPath);
    if (!allowed) {
      blocked.push(fullPath);
      continue;
    }
    const info = await stat(fullPath).catch(() => null);
    if (!info) {
      missing.push(fullPath);
      continue;
    }
    if (info.isDirectory()) {
      const collected = await collectFilesFromDirectory(fullPath, extensions, options);
      targets.push({ path: fullPath, type: "directory", fileCount: collected.files.length, directoryCount: collected.directories.length });
      for (const filePath of collected.files) {
        targets.push({ path: filePath, type: "file" });
      }
      continue;
    }
    if (info.isFile()) {
      if (extensions.length && !extensions.map((item) => `.${item.toLowerCase().replace(/^\./, "")}`).includes(extname(fullPath).toLowerCase())) continue;
      targets.push({ path: fullPath, type: "file" });
    }
  }
  const files = [...new Set(targets.filter((item) => item.type === "file").map((item) => item.path))];
  const directories = [...new Set(targets.filter((item) => item.type === "directory").map((item) => item.path))];
  return {
    files,
    directories,
    targets,
    blocked,
    missing,
  };
}

async function inspectFilesystemTargets(text, options = {}) {
  const resolved = await resolvePaperclipInputTargets(text, options.extensions || [], options);
  const entries = [];
  for (const target of resolved.targets.filter((item) => item.type === "directory")) {
    const tree = [];
    const maxDepth = Number(options.maxDepth || 4);
    const maxEntriesPerDirectory = Number(options.maxEntriesPerDirectory || 40);
    async function walk(currentPath, depth) {
      if (depth > maxDepth) return;
      let children = [];
      try {
        children = await readdir(currentPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const child of children.sort((a, b) => a.name.localeCompare(b.name)).slice(0, maxEntriesPerDirectory)) {
        const fullPath = join(currentPath, child.name);
        tree.push({
          depth,
          type: child.isDirectory() ? "directory" : child.isFile() ? "file" : "other",
          path: displayPath(fullPath),
        });
        if (child.isDirectory()) await walk(fullPath, depth + 1);
      }
    }
    await walk(target.path, 0);
    entries.push({
      path: displayPath(target.path),
      type: "directory",
      fileCount: target.fileCount || 0,
      directoryCount: target.directoryCount || 0,
      tree: tree.slice(0, Number(options.maxTreeEntries || 200)),
    });
  }
  for (const filePath of resolved.files.slice(0, Number(options.maxFiles || 80))) {
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile?.()) continue;
    entries.push({
      path: displayPath(filePath),
      type: "file",
      ext: extname(filePath).toLowerCase(),
      size: info.size,
      updatedAt: new Date(info.mtimeMs).toISOString(),
    });
  }
  return {
    targets: resolved.targets,
    files: resolved.files.map((item) => displayPath(item)),
    directories: resolved.directories.map((item) => displayPath(item)),
    blocked: resolved.blocked.map((item) => displayPath(item)),
    entries,
  };
}

async function extractTextLike(paths) {
  const sections = [];
  for (const filePath of paths.slice(0, 24)) {
    const ext = extname(filePath).toLowerCase();
    if (![".md", ".txt", ".json", ".csv", ".html", ".htm"].includes(ext)) continue;
    const content = await readFile(filePath, "utf-8").catch(() => "");
    if (!content) continue;
    sections.push([
      `## ${relative(repoRoot, filePath)}`,
      content.slice(0, 6000),
    ].join("\n"));
  }
  return sections.join("\n\n");
}

function parseMultipartForm(buffer, contentType = "") {
  const boundary = contentType.match(/boundary=([^;]+)/i)?.[1];
  if (!boundary) throw new Error("multipart boundary is required");
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const separatorBuffer = Buffer.from("\r\n\r\n");
  const fields = {};
  const files = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, cursor);
    if (boundaryIndex < 0) break;
    cursor = boundaryIndex + boundaryBuffer.length;
    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) break;
    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) cursor += 2;
    const headerEnd = buffer.indexOf(separatorBuffer, cursor);
    if (headerEnd < 0) break;
    const headerText = buffer.slice(cursor, headerEnd).toString("utf-8");
    cursor = headerEnd + separatorBuffer.length;
    let nextBoundary = buffer.indexOf(boundaryBuffer, cursor);
    if (nextBoundary < 0) nextBoundary = buffer.length;
    let bodyBuffer = buffer.slice(cursor, nextBoundary);
    if (bodyBuffer.length >= 2 && bodyBuffer.at(-2) === 13 && bodyBuffer.at(-1) === 10) {
      bodyBuffer = bodyBuffer.subarray(0, bodyBuffer.length - 2);
    }
    cursor = nextBoundary;

    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || "";
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
    const mimeType = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
    if (!name) continue;
    if (filename) {
      files.push({
        fieldName: name,
        filename,
        mimeType,
        buffer: bodyBuffer,
      });
    } else {
      fields[name] = bodyBuffer.toString("utf-8");
    }
  }
  return { fields, files };
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function extractHwpLike(paths) {
  if (!paths.length) return "";
  const timeoutMs = Number(process.env.PAPERCLIP_EXTRACTION_TIMEOUT_MS || 500000);
  const script = [
    "import json, sys",
    "from pathlib import Path",
    "from drive_wikify.extractors.base import extract_document",
    "out=[]",
    "for raw in sys.argv[1:]:",
    "    p=Path(raw)",
    "    try:",
    "        c=extract_document(p)",
    "        out.append({'path':str(p),'extractor':c.extractor_name,'warnings':c.warnings,'text':c.text[:12000]})",
    "    except Exception as e:",
    "        out.append({'path':str(p),'error':str(e)})",
    "print(json.dumps(out, ensure_ascii=False))",
  ].join("\n");
  const result = await runCapture(resolvePythonBin(), ["-c", script, ...paths], {
    timeoutMs,
    env: { PYTHONPATH: driveWikifySrc },
  });
  return result.stdout || result.stderr;
}

function extractionDiagnostics(targets = {}, expectedLabel = "파일") {
  const lines = [];
  if (targets.blocked?.length) {
    lines.push("## Paperclip 경로 차단");
    lines.push("아래 경로는 자동 읽기 allowlist 밖이라 문서 추출을 실행하지 않았습니다. 이 경우를 HWP 보안/암호화 실패로 해석하지 마십시오.");
    lines.push(...targets.blocked.map((path) => `- ${displayPath(path)}`));
  }
  if (targets.missing?.length) {
    lines.push("## Paperclip 경로 미해결");
    lines.push("아래 경로는 파일시스템에서 찾지 못했습니다. 이 경우를 HWP 보안/암호화 실패로 해석하지 마십시오.");
    lines.push(...targets.missing.map((path) => `- ${displayPath(path)}`));
  }
  if (!targets.files?.length && !targets.blocked?.length && !targets.missing?.length) {
    lines.push("## Paperclip 입력 파일 없음");
    lines.push(`${expectedLabel} 경로가 해석되지 않아 추출을 실행하지 않았습니다. 파일명 힌트만 있는 경우 실제 절대경로 또는 업로드 mirror 경로가 필요합니다.`);
  }
  return lines.join("\n");
}

async function extractSpreadsheetLike(paths) {
  if (!paths.length) return "";
  const script = [
    "import csv, json, sys",
    "from pathlib import Path",
    "def numeric(vals):",
    "    out=[]",
    "    for v in vals:",
    "        try: out.append(float(str(v).replace(',','')))",
    "        except: pass",
    "    return out",
    "def summarize_rows(name, rows):",
    "    header=rows[0] if rows else []",
    "    body=rows[1:] if len(rows)>1 else []",
    "    cols=[]",
    "    for i,h in enumerate(header[:40]):",
    "        vals=[r[i] if i<len(r) else '' for r in body]",
    "        nums=numeric(vals)",
    "        item={'name':str(h),'non_empty':sum(1 for v in vals if str(v).strip()),'missing':sum(1 for v in vals if not str(v).strip())}",
    "        if nums: item.update({'count':len(nums),'min':min(nums),'max':max(nums),'mean':round(sum(nums)/len(nums),4)})",
    "        cols.append(item)",
    "    return {'sheet':name,'rows':len(body),'columns':len(header),'column_stats':cols[:20],'sample':body[:5]}",
    "out=[]",
    "for raw in sys.argv[1:]:",
    "    p=Path(raw)",
    "    try:",
    "        if p.suffix.lower()=='.csv':",
    "            rows=list(csv.reader(open(p, encoding='utf-8-sig', errors='ignore')))",
    "            out.append({'path':str(p),'sheets':[summarize_rows('csv', rows)]})",
    "        else:",
    "            import openpyxl",
    "            wb=openpyxl.load_workbook(p, read_only=True, data_only=True)",
    "            out.append({'path':str(p),'sheets':[summarize_rows(ws.title, [[c for c in row] for row in ws.iter_rows(max_row=300, values_only=True)]) for ws in wb.worksheets[:8]]})",
    "    except Exception as e:",
    "        out.append({'path':str(p),'error':str(e)})",
    "print(json.dumps(out, ensure_ascii=False))",
  ].join("\n");
  const result = await runCapture(resolvePythonBin(), ["-c", script, ...paths], { timeoutMs: 60000 });
  return result.stdout || result.stderr;
}

async function summarizeAttachmentWithGlm({ templateId, fileName, extracted, imageDataUrl = "", userNote = "" }) {
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const model = imageDataUrl
    ? (process.env.GLM_VLM_MODEL || env.GLM_VLM_MODEL || process.env.GLM_MODEL || env.GLM_MODEL || "glm-5.1")
    : (process.env.GLM_FILE_ANALYSIS_MODEL || env.GLM_FILE_ANALYSIS_MODEL || process.env.GLM_MODEL || env.GLM_MODEL || "glm-5.1");
  if (!apiKey || !apiUrl) {
    return [
      `# 파일 분석 대기 - ${fileName}`,
      "",
      "- GLM_API_URL / GLM_API_KEY가 설정되면 파일 형식별 분석을 수행합니다.",
      extracted ? "## 로컬 추출 결과" : "",
      extracted ? extracted.slice(0, 6000) : "",
    ].filter(Boolean).join("\n");
  }
  const system = imageDataUrl
    ? "당신은 RTM의 VLM 파일 분석가입니다. 이미지를 업무 맥락에서 해석하고, 보이는 텍스트/표/다이어그램/리스크/다음 액션을 한국어 Markdown으로 정리하십시오. 보이지 않는 내용은 추측하지 마십시오."
    : paperclipSkillSystemPrompt(templateId || "attachment-reader");
  const text = [
    `파일명: ${fileName}`,
    userNote ? `사용자 요청: ${userNote}` : "",
    extracted ? "## 로컬 추출/통계" : "",
    extracted ? extracted.slice(0, 18000) : "",
  ].filter(Boolean).join("\n");
  const userContent = imageDataUrl
    ? [
        { type: "text", text },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ]
    : text;
  const completion = await requestGlmChatCompletion(apiUrl, apiKey, {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    temperature: 0.2,
    max_tokens: Math.min(glmChatMaxTokens(env), 6000),
    thinking: glmThinkingOptions(env),
  }, {
    feature: imageDataUrl ? "chat_file_vlm_analysis" : "chat_file_analysis",
    reason: imageDataUrl ? "visual file analysis from chat upload" : "document file analysis from chat upload",
  });
  return glmMessageContent(completion.payload) || "GLM 파일 분석 응답이 비어 있습니다.";
}

function normalizeChatUploadWorkspace(value) {
  return String(value || "").trim() === "personal" ? "personal" : "work";
}

function normalizeChatUploadProjectSegment(fields = {}) {
  return slugifyName(fields.projectKey || fields.projectId || fields.projectHint || "default_project") || "default_project";
}

function sanitizeUploadRelativePath(rawPath, fallbackName = "upload") {
  const normalized = String(rawPath || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");
  const safeSegments = normalized.map((segment, index) => {
    const parsedExt = extname(segment);
    const base = parsedExt ? segment.slice(0, -parsedExt.length) : segment;
    const safeBase = slugifyName(base) || (index === normalized.length - 1 ? slugifyName(fallbackName) : "folder");
    const safeExt = parsedExt.toLowerCase();
    return safeExt ? `${safeBase}${safeExt}` : safeBase;
  });
  if (!safeSegments.length) {
    const fallbackExt = extname(fallbackName || "").toLowerCase();
    const fallbackBase = slugifyName(fallbackName || "upload") || "upload";
    return fallbackExt ? `${fallbackBase}${fallbackExt}` : fallbackBase;
  }
  return safeSegments.join("/");
}

function compactChatUploadAnalysis(text = "", maxChars = 800) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, maxChars);
}

function buildChatUploadContextBlock(attachments = [], fields = {}, batchMirrorPath = "") {
  if (!attachments.length) return "";
  const lines = [
    "[파일 해석 컨텍스트]",
    `- source: ${fields.source || "chat_upload"}`,
    `- workspace: ${normalizeChatUploadWorkspace(fields.workspace)}`,
    fields.projectHint ? `- project_hint: ${fields.projectHint}` : "",
    fields.projectKey ? `- project_key: ${fields.projectKey}` : "",
    batchMirrorPath ? `- mirror_batch: ${batchMirrorPath}` : "",
  ].filter(Boolean);
  for (const attachment of attachments.slice(0, 8)) {
    lines.push(`- file: ${attachment.mirrorPath || attachment.path || attachment.fileName}`);
    if (attachment.originalPath) lines.push(`  original_path: ${attachment.originalPath}`);
    if (attachment.route) lines.push(`  route: ${attachment.route}`);
    if (attachment.analysisPath) lines.push(`  analysis_md: ${attachment.analysisPath}`);
    const summary = compactChatUploadAnalysis(attachment.analysis, 700);
    if (summary) lines.push(`  summary: ${summary}`);
  }
  lines.push("[/파일 해석 컨텍스트]");
  return lines.join("\n");
}

async function analyzeUploadedChatFile(file, fields = {}, fileMeta = {}, batchId = "") {
  await mkdir(chatUploadsRoot, { recursive: true });
  const ext = extname(file.filename || "").toLowerCase();
  const savedName = `${Date.now()}_${slugifyName(file.filename || "upload") || "upload"}${ext && !file.filename.endsWith(ext) ? ext : ""}`;
  const savedPath = join(chatUploadsRoot, savedName);
  await writeFile(savedPath, file.buffer);
  const workspaceSegment = normalizeChatUploadWorkspace(fields.workspace);
  const projectSegment = normalizeChatUploadProjectSegment(fields);
  const effectiveBatchId = slugifyName(batchId || fields.batchId || `${Date.now()}-${projectSegment}`) || `${Date.now()}-${projectSegment}`;
  const relativeMirrorPath = sanitizeUploadRelativePath(fileMeta.relativePath || file.filename || savedName, file.filename || savedName);
  const mirrorPath = join(chatUploadMirrorRoot, workspaceSegment, projectSegment, effectiveBatchId, relativeMirrorPath);
  await mkdir(dirname(mirrorPath), { recursive: true });
  await writeFile(mirrorPath, file.buffer);
  const fileName = file.filename || savedName;
  let route = "text";
  let templateId = "attachment-reader";
  let extracted = "";
  let analysis = "";
  if ([".hwp", ".hwpx", ".pdf", ".docx", ".pptx", ".html", ".htm"].includes(ext)) {
    route = ext === ".hwp" || ext === ".hwpx"
      ? "rhwp-hwp-reader"
      : ext === ".pdf"
        ? "pdf-document-reader"
        : ext === ".pptx"
          ? "pptx-slide-reader"
          : ext === ".html" || ext === ".htm"
            ? "html-report-reader"
            : "document-reader";
    templateId = ext === ".html" || ext === ".htm"
      ? "html-report-reader"
      : ext === ".pdf"
        ? "pdf-document-reader"
        : ext === ".pptx"
          ? "pptx-slide-reader"
          : "rhwp-hwp-reader";
    extracted = await extractHwpLike([savedPath]);
    analysis = await summarizeAttachmentWithGlm({ templateId, fileName, extracted, userNote: fields.note || "" });
  } else if ([".xlsx", ".xls", ".csv"].includes(ext)) {
    route = "spreadsheet-stat-analyzer";
    templateId = "spreadsheet-stat-analyzer";
    extracted = await extractSpreadsheetLike([savedPath]);
    analysis = await summarizeAttachmentWithGlm({ templateId, fileName, extracted, userNote: fields.note || "" });
  } else if (file.mimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext)) {
    route = "vlm-image-analysis";
    const imageDataUrl = `data:${file.mimeType || "image/png"};base64,${file.buffer.toString("base64")}`;
    analysis = await summarizeAttachmentWithGlm({ templateId: "image-vlm", fileName, imageDataUrl, userNote: fields.note || "" });
  } else {
    route = "plain-text-reader";
    extracted = file.buffer.toString("utf-8").slice(0, 18000);
    analysis = await summarizeAttachmentWithGlm({ templateId: "attachment-reader", fileName, extracted, userNote: fields.note || "" });
  }
  const id = `${Date.now()}-${slugifyName(fileName)}`;
  const result = {
    id,
    fileName,
    mimeType: file.mimeType,
    size: file.buffer.length,
    route,
    path: relative(repoRoot, savedPath),
    mirrorPath: relative(repoRoot, mirrorPath),
    mirrorBatchPath: relative(repoRoot, join(chatUploadMirrorRoot, workspaceSegment, projectSegment, effectiveBatchId)),
    originalPath: fileMeta.originalPath || "",
    selectionKind: fileMeta.kind || "file",
    analysis,
    extractedPreview: extracted.slice(0, 1600),
    createdAt: new Date().toISOString(),
  };
  const outputPath = join(skillOutputsRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}_${slugifyName(fileName)}_chat_upload_analysis.md`);
  await mkdir(skillOutputsRoot, { recursive: true });
  await writeFile(outputPath, [
    "---",
    "type: chat_file_analysis",
    `file: "${fileName.replace(/"/g, '\\"')}"`,
    `route: ${route}`,
    `created: ${result.createdAt}`,
    "local_only: true",
    "---",
    "",
    analysis,
  ].join("\n"), "utf-8");
  result.analysisPath = relative(repoRoot, outputPath);
  return result;
}

async function handleChatFileUpload(req) {
  const raw = await readRawBody(req);
  const { fields, files } = parseMultipartForm(raw, req.headers["content-type"] || "");
  if (!files.length) throw new Error("file is required");
  let browserManifest = [];
  if (fields.browser_manifest) {
    try {
      const parsed = JSON.parse(fields.browser_manifest);
      if (Array.isArray(parsed)) browserManifest = parsed;
    } catch {
      browserManifest = [];
    }
  }
  const browserManifestByField = new Map(
    browserManifest
      .filter((item) => item && typeof item === "object")
      .map((item) => [String(item.fieldName || ""), item]),
  );
  const batchId = slugifyName(fields.batchId || `${Date.now()}_${fields.projectKey || fields.projectId || fields.projectHint || "chat_upload"}`) || `${Date.now()}_chat_upload`;
  const attachments = [];
  for (const file of files.slice(0, 5)) {
    attachments.push(await analyzeUploadedChatFile(file, fields, browserManifestByField.get(file.fieldName) || {}, batchId));
  }
  const batchMirrorPath = attachments[0]?.mirrorBatchPath || "";
  return {
    status: "completed",
    attachments,
    mirrorBatchPath: batchMirrorPath,
    contextBlock: buildChatUploadContextBlock(attachments, fields, batchMirrorPath),
  };
}

async function handleFilesystemFolderImport(req) {
  const raw = await readRawBody(req);
  const { fields, files } = parseMultipartForm(raw, req.headers["content-type"] || "");
  if (!files.length) throw new Error("folder files are required");
  const { values: env } = await readEnvFile();
  const maxFiles = Number(fields.maxFiles || env.FILESYSTEM_BROWSE_MAX_FILES || 5000);
  const maxDepth = Number(fields.maxDepth || env.FILESYSTEM_BROWSE_MAX_DEPTH || 8);
  const maxEntriesPerDirectory = Number(fields.maxEntriesPerDirectory || env.FILESYSTEM_BROWSE_MAX_ENTRIES || 300);
  let browserManifest = [];
  if (fields.browser_manifest) {
    try {
      const parsed = JSON.parse(fields.browser_manifest);
      if (Array.isArray(parsed)) browserManifest = parsed;
    } catch {
      browserManifest = [];
    }
  }
  const browserManifestByField = new Map(
    browserManifest
      .filter((item) => item && typeof item === "object")
      .map((item) => [String(item.fieldName || ""), item]),
  );
  const workspaceSegment = normalizeChatUploadWorkspace(fields.workspace);
  const projectSegment = normalizeChatUploadProjectSegment(fields);
  const effectiveBatchId = slugifyName(fields.batchId || `${Date.now()}-pipeline-filesystem`) || `${Date.now()}-pipeline-filesystem`;
  const batchRoot = join(chatUploadMirrorRoot, workspaceSegment, projectSegment, effectiveBatchId);
  await mkdir(batchRoot, { recursive: true });
  const imported = [];
  const skipped = Math.max(0, files.length - maxFiles);
  for (const file of files.slice(0, maxFiles)) {
    const meta = browserManifestByField.get(file.fieldName) || {};
    const relativePath = sanitizeUploadRelativePath(meta.relativePath || meta.originalPath || file.filename, file.filename || "upload");
    const targetPath = join(batchRoot, relativePath);
    if (!targetPath.startsWith(`${batchRoot}/`) && targetPath !== batchRoot) continue;
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.buffer);
    imported.push({
      fileName: file.filename,
      originalPath: meta.originalPath || meta.relativePath || file.filename,
      mirrorPath: displayPath(targetPath),
      size: file.buffer.length,
    });
  }
  const browse = await inspectFilesystemTargets(batchRoot, {
    includeDirectories: true,
    maxDepth,
    maxFiles,
    maxEntriesPerDirectory,
    maxTreeEntries: 400,
  });
  const runId = `${Date.now()}-filesystem-import`;
  await appendRunHistory({
    runId,
    command: "filesystem-import",
    status: "completed",
    code: 0,
    stdout: `Filesystem explorer import: ${imported.length} files -> ${displayPath(batchRoot)}`,
    stderr: "",
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    source: "pipeline_filesystem_explorer",
    filesystemPath: displayPath(batchRoot),
    progress: {
      summary: `${imported.length} files imported · ${skipped} skipped`,
      currentFile: displayPath(batchRoot),
      updatedAt: new Date().toISOString(),
    },
  });
  return {
    status: "completed",
    runId,
    importedFiles: imported.length,
    skippedFiles: skipped,
    mirrorBatchPath: displayPath(batchRoot),
    files: imported.slice(0, 20),
    browse,
  };
}

async function paperclipSkillExtraction(task) {
  const note = task.payload?.note || "";
  if (task.templateId === "os-file-browser") {
    const inspected = await inspectFilesystemTargets(note, {
      extensions: [],
      includeDirectories: true,
      maxDepth: 4,
      maxFiles: 80,
      maxEntriesPerDirectory: 60,
      maxTreeEntries: 200,
    });
    return {
      paths: inspected.files.map((path) => resolve(repoRoot, path)),
      extracted: JSON.stringify(inspected, null, 2),
    };
  }
  if (task.templateId === "filesystem-wiki-intake") {
    const targets = await resolvePaperclipInputTargets(note, ["hwp", "hwpx", "pdf", "docx", "pptx", "xlsx", "xls", "csv", "html", "htm", "md", "txt", "json"], { maxDepth: 5, maxFiles: 100, maxEntriesPerDirectory: 80 });
    const inspected = await inspectFilesystemTargets(note, {
      extensions: [],
      includeDirectories: true,
      maxDepth: 5,
      maxFiles: 100,
      maxEntriesPerDirectory: 80,
      maxTreeEntries: 240,
    });
    const documentPaths = targets.files.filter((path) => [".hwp", ".hwpx", ".pdf", ".docx", ".pptx", ".html", ".htm"].includes(extname(path).toLowerCase()));
    const sheetPaths = targets.files.filter((path) => [".xlsx", ".xls", ".csv"].includes(extname(path).toLowerCase()));
    const textPaths = targets.files.filter((path) => [".md", ".txt", ".json"].includes(extname(path).toLowerCase()));
    return {
      paths: targets.files,
      extracted: [
        extractionDiagnostics(targets, "문서"),
        "# Filesystem inspection",
        JSON.stringify(inspected, null, 2),
        targets.directories.length ? `# Expanded directories\n${targets.directories.map((path) => `- ${relative(repoRoot, path)}`).join("\n")}` : "",
        documentPaths.length ? "## Document extraction" : "",
        documentPaths.length ? await extractHwpLike(documentPaths) : "",
        sheetPaths.length ? "## Spreadsheet extraction" : "",
        sheetPaths.length ? await extractSpreadsheetLike(sheetPaths) : "",
        textPaths.length ? "## Text-like previews" : "",
        textPaths.length ? await extractTextLike(textPaths) : "",
      ].filter(Boolean).join("\n\n"),
    };
  }
  if (task.templateId === "rhwp-hwp-reader") {
    const targets = await resolvePaperclipInputTargets(note, ["hwp", "hwpx"], { maxDepth: 4, maxFiles: 60 });
    return {
      paths: targets.files,
      extracted: [
        extractionDiagnostics(targets, "HWP/HWPX"),
        targets.directories.length ? `# Expanded directories\n${targets.directories.map((path) => `- ${relative(repoRoot, path)}`).join("\n")}` : "",
        await extractHwpLike(targets.files),
      ].filter(Boolean).join("\n\n"),
    };
  }
  if (task.templateId === "pdf-document-reader") {
    const targets = await resolvePaperclipInputTargets(note, ["pdf"], { maxDepth: 4, maxFiles: 80 });
    return {
      paths: targets.files,
      extracted: [
        extractionDiagnostics(targets, "PDF"),
        targets.directories.length ? `# Expanded directories\n${targets.directories.map((path) => `- ${relative(repoRoot, path)}`).join("\n")}` : "",
        await extractHwpLike(targets.files),
      ].filter(Boolean).join("\n\n"),
    };
  }
  if (task.templateId === "pptx-slide-reader") {
    const targets = await resolvePaperclipInputTargets(note, ["pptx"], { maxDepth: 4, maxFiles: 80 });
    return {
      paths: targets.files,
      extracted: [
        extractionDiagnostics(targets, "PPTX"),
        targets.directories.length ? `# Expanded directories\n${targets.directories.map((path) => `- ${relative(repoRoot, path)}`).join("\n")}` : "",
        await extractHwpLike(targets.files),
      ].filter(Boolean).join("\n\n"),
    };
  }
  if (task.templateId === "grant-rfp-strategy") {
    const targets = await resolvePaperclipInputTargets(note, ["hwp", "hwpx", "pdf", "docx", "pptx", "xlsx", "xls", "csv", "html", "htm"], { maxDepth: 4, maxFiles: 80 });
    const documentPaths = targets.files.filter((path) => [".hwp", ".hwpx", ".pdf", ".docx", ".pptx", ".html", ".htm"].includes(extname(path).toLowerCase()));
    const sheetPaths = targets.files.filter((path) => [".xlsx", ".xls", ".csv"].includes(extname(path).toLowerCase()));
    return {
      paths: targets.files,
      extracted: [
        extractionDiagnostics(targets, "공고/RFP/사업계획서"),
        targets.directories.length ? `# Expanded directories\n${targets.directories.map((path) => `- ${relative(repoRoot, path)}`).join("\n")}` : "",
        documentPaths.length ? "## Document extraction" : "",
        documentPaths.length ? await extractHwpLike(documentPaths) : "",
        sheetPaths.length ? "## Spreadsheet extraction" : "",
        sheetPaths.length ? await extractSpreadsheetLike(sheetPaths) : "",
      ].filter(Boolean).join("\n\n"),
    };
  }
  if (task.templateId === "grant-presentation-eval-strategy") {
    const targets = await resolvePaperclipInputTargets(note, ["hwp", "hwpx", "pdf", "docx", "pptx", "xlsx", "xls", "csv", "html", "htm"], { maxDepth: 4, maxFiles: 80 });
    const documentPaths = targets.files.filter((path) => [".hwp", ".hwpx", ".pdf", ".docx", ".pptx", ".html", ".htm"].includes(extname(path).toLowerCase()));
    const sheetPaths = targets.files.filter((path) => [".xlsx", ".xls", ".csv"].includes(extname(path).toLowerCase()));
    return {
      paths: targets.files,
      extracted: [
        extractionDiagnostics(targets, "정부과제 발표평가 발표자료"),
        targets.directories.length ? `# Expanded directories\n${targets.directories.map((path) => `- ${relative(repoRoot, path)}`).join("\n")}` : "",
        documentPaths.length ? "## Document extraction" : "",
        documentPaths.length ? await extractHwpLike(documentPaths) : "",
        sheetPaths.length ? "## Spreadsheet extraction" : "",
        sheetPaths.length ? await extractSpreadsheetLike(sheetPaths) : "",
      ].filter(Boolean).join("\n\n"),
    };
  }
  if (task.templateId === "spreadsheet-stat-analyzer") {
    const targets = await resolvePaperclipInputTargets(note, ["xlsx", "xls", "csv"], { maxDepth: 4, maxFiles: 60 });
    return {
      paths: targets.files,
      extracted: [
        extractionDiagnostics(targets, "스프레드시트"),
        targets.directories.length ? `# Expanded directories\n${targets.directories.map((path) => `- ${relative(repoRoot, path)}`).join("\n")}` : "",
        await extractSpreadsheetLike(targets.files),
      ].filter(Boolean).join("\n\n"),
    };
  }
  return { paths: [], extracted: "" };
}

function paperclipPlanModeEnabled(env = {}) {
  const raw = String(process.env.GLM_PAPERCLIP_PLAN_MODE || env.GLM_PAPERCLIP_PLAN_MODE || "true").toLowerCase();
  return !["0", "false", "off", "no"].includes(raw);
}

function chunkTextForPaperclip(text = "", maxChars = 7000) {
  const raw = String(text || "");
  const size = Math.max(2000, Number(maxChars || 7000));
  if (raw.length <= size) return raw ? [raw] : [];
  const chunks = [];
  let index = 0;
  while (index < raw.length) {
    let end = Math.min(raw.length, index + size);
    if (end < raw.length) {
      const boundary = raw.lastIndexOf("\n", end);
      if (boundary > index + Math.floor(size * 0.6)) end = boundary;
    }
    chunks.push(raw.slice(index, end).trim());
    index = end;
  }
  return chunks.filter(Boolean);
}

function shortHash(value = "") {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function paperclipStableRunId(task = {}, extraction = {}) {
  return [
    slugifyName(task.templateId || "paperclip"),
    shortHash([
      task.templateId || "",
      task.title || "",
      task.payload?.note || "",
      extraction.extracted || "",
    ].join("\n---\n")),
  ].join("_");
}

async function writePaperclipRunState(runDir, state = {}) {
  const next = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(join(runDir, "state.json"), next);
  return next;
}

async function writePaperclipRunArtifact(runDir, fileName, content = "") {
  await mkdir(runDir, { recursive: true });
  const path = join(runDir, fileName);
  await writeFile(path, String(content || ""), "utf-8");
  return path;
}

function paperclipRunArtifactKind(name = "") {
  if (name === "state.json") return "state";
  if (name === "final.md") return "final";
  if (name === "partial_report.md") return "partial_report";
  if (name === "extraction.txt") return "extraction";
  if (/^chunk-\d+\.md$/.test(name)) return "chunk_markdown";
  if (/^chunk-\d+\.json$/.test(name)) return "chunk_state";
  return "artifact";
}

function paperclipRunArtifactPriority(name = "") {
  if (name === "final.md") return 0;
  if (name === "partial_report.md") return 1;
  if (name === "state.json") return 2;
  if (name === "extraction.txt") return 3;
  if (/^chunk-\d+\.md$/.test(name)) return 4;
  if (/^chunk-\d+\.json$/.test(name)) return 5;
  return 10;
}

function preferredPaperclipRunArtifactName(artifacts = []) {
  return artifacts.find((item) => item.name === "final.md")?.name
    || artifacts.find((item) => item.name === "partial_report.md")?.name
    || artifacts.find((item) => item.name === "state.json")?.name
    || artifacts[0]?.name
    || "";
}

async function listPaperclipRunArtifacts(runDir) {
  const entries = await readdir(runDir, { withFileTypes: true }).catch(() => []);
  const artifacts = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const artifactPath = join(runDir, entry.name);
    const info = await stat(artifactPath).catch(() => null);
    artifacts.push({
      name: entry.name,
      kind: paperclipRunArtifactKind(entry.name),
      path: displayPath(artifactPath),
      size: info?.size || 0,
      updatedAt: info?.mtime ? new Date(info.mtime).toISOString() : "",
    });
  }
  artifacts.sort((left, right) => {
    const priority = paperclipRunArtifactPriority(left.name) - paperclipRunArtifactPriority(right.name);
    if (priority !== 0) return priority;
    return left.name.localeCompare(right.name);
  });
  return artifacts;
}

async function paperclipRunSummaryFromDir(runDir) {
  const runId = basename(runDir);
  const dirInfo = await stat(runDir).catch(() => null);
  const state = await readJsonFile(join(runDir, "state.json"), null);
  const artifacts = await listPaperclipRunArtifacts(runDir);
  return {
    runId,
    runPath: displayPath(runDir),
    taskId: state?.taskId || "",
    templateId: state?.templateId || "",
    title: state?.title || runId,
    phase: state?.phase || "unknown",
    provider: state?.provider || "",
    updatedAt: state?.updatedAt || (dirInfo?.mtime ? new Date(dirInfo.mtime).toISOString() : ""),
    sourcePaths: Array.isArray(state?.sourcePaths) ? state.sourcePaths : [],
    planMode: Boolean(state?.planMode),
    chunkCount: Number.isFinite(state?.chunkCount) ? Number(state.chunkCount) : 0,
    artifacts,
    preferredArtifactName: preferredPaperclipRunArtifactName(artifacts),
  };
}

async function listPaperclipRuns(filters = {}) {
  const entries = await readdir(paperclipRunsRoot, { withFileTypes: true }).catch(() => []);
  const runs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const summary = await paperclipRunSummaryFromDir(join(paperclipRunsRoot, entry.name)).catch(() => null);
    if (!summary) continue;
    if (filters.taskId && summary.taskId !== filters.taskId) continue;
    runs.push(summary);
  }
  runs.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  return runs;
}

async function readPaperclipRun(runId) {
  const runDir = safeJoin(paperclipRunsRoot, runId);
  const info = await stat(runDir);
  if (!info.isDirectory()) throw new Error(`Paperclip run not found: ${runId}`);
  const summary = await paperclipRunSummaryFromDir(runDir);
  return {
    ...summary,
    state: await readJsonFile(join(runDir, "state.json"), null),
  };
}

async function readPaperclipRunArtifact(runId, artifactName) {
  const runDir = safeJoin(paperclipRunsRoot, runId);
  const artifactPath = safeJoin(runDir, artifactName);
  const info = await stat(artifactPath);
  if (!info.isFile()) throw new Error(`Paperclip artifact not found: ${runId}/${artifactName}`);
  return {
    runId,
    artifact: {
      name: artifactName,
      kind: paperclipRunArtifactKind(artifactName),
      path: displayPath(artifactPath),
      size: info.size || 0,
      updatedAt: info.mtime ? new Date(info.mtime).toISOString() : "",
    },
    content: await readFile(artifactPath, "utf-8"),
  };
}

async function runPaperclipGlmSkill(task) {
  const { values: env } = await readEnvFile();
  const apiKey = process.env.GLM_API_KEY || env.GLM_API_KEY;
  const apiUrl = process.env.GLM_API_URL || env.GLM_API_URL;
  const model = process.env.GLM_PAPERCLIP_MODEL || env.GLM_PAPERCLIP_MODEL || process.env.GLM_MODEL || env.GLM_MODEL || "glm-5.1";
  if (!apiKey || !apiUrl) throw new Error("GLM_API_URL and GLM_API_KEY are required for Paperclip GLM skills");
  const extraction = await paperclipSkillExtraction(task);
  const input = [
    "# Paperclip Skill Input",
    `template: ${task.templateId}`,
    `title: ${task.title}`,
    "",
    "## 사용자 입력",
    task.payload?.note || "- 없음",
    "",
    extraction.extracted ? "## 로컬 추출 결과" : "",
    extraction.extracted ? extraction.extracted.slice(0, 18000) : "",
  ].filter(Boolean).join("\n");
  const paperclipTimeoutMs = Number(process.env.GLM_PAPERCLIP_TIMEOUT_MS || env.GLM_PAPERCLIP_TIMEOUT_MS || process.env.GLM_TIMEOUT_MS || env.GLM_TIMEOUT_MS || 500000);
  let completion = null;
  let markdown = "";
  let provider = "glm";
  let endpoint = "";
  const planMode = paperclipPlanModeEnabled(env);
  const chunkChars = Number(process.env.GLM_PAPERCLIP_CHUNK_CHARS || env.GLM_PAPERCLIP_CHUNK_CHARS || 7000);
  const extractedChunks = planMode ? chunkTextForPaperclip(extraction.extracted || "", chunkChars) : [];
  const runId = paperclipStableRunId(task, extraction);
  const runDir = join(paperclipRunsRoot, runId);
  await writePaperclipRunArtifact(runDir, "extraction.txt", extraction.extracted || "");
  await writePaperclipRunState(runDir, {
    runId,
    taskId: task.id,
    templateId: task.templateId,
    title: task.title,
    phase: "extraction_completed",
    provider: "local",
    sourcePaths: extraction.paths.map((path) => displayPath(path)),
    extractedChars: (extraction.extracted || "").length,
    chunkCount: extractedChunks.length,
    chunkChars,
    planMode,
  });
  try {
    if (planMode && extractedChunks.length > 1) {
      const partials = [];
      for (let index = 0; index < extractedChunks.length; index += 1) {
        const chunkNo = String(index + 1).padStart(3, "0");
        const chunkMarkdownPath = join(runDir, `chunk-${chunkNo}.md`);
        const chunkStatePath = join(runDir, `chunk-${chunkNo}.json`);
        const cachedChunk = await readJsonFile(chunkStatePath, null);
        if (cachedChunk?.status === "completed" && existsSync(chunkMarkdownPath)) {
          const cachedMarkdown = await readFile(chunkMarkdownPath, "utf-8");
          partials.push(cachedMarkdown);
          continue;
        }
        const stageInput = [
          "# Paperclip Plan Mode Chunk",
          `template: ${task.templateId}`,
          `title: ${task.title}`,
          `chunk: ${index + 1}/${extractedChunks.length}`,
          "",
          "## 사용자 입력",
          task.payload?.note || "- 없음",
          "",
          "## 이 chunk에서만 추출할 것",
          "- 사업계획서/문서 구조",
          "- 핵심 사실과 수치",
          "- 결정/리스크/충돌/확인 필요",
          "- 최종 사업계획서 작성에 반영할 문장 후보",
          "",
          "## Chunk Text",
          extractedChunks[index],
        ].join("\n");
        await writePaperclipRunState(runDir, {
          runId,
          taskId: task.id,
          templateId: task.templateId,
          title: task.title,
          phase: "chunk_analysis_running",
          currentChunk: index + 1,
          chunkCount: extractedChunks.length,
          sourcePaths: extraction.paths.map((path) => displayPath(path)),
        });
        try {
          const started = Date.now();
          const partial = await requestGlmChatCompletion(apiUrl, apiKey, {
            model,
            messages: [
              { role: "system", content: `${paperclipSkillSystemPrompt(task.templateId)}\n\n지금은 Plan Mode의 부분 분석 단계입니다. 이 chunk 밖의 내용을 추정하지 말고, 다음 최종 종합 단계가 재사용하기 쉬운 Markdown으로 압축하십시오.` },
              { role: "user", content: stageInput },
            ],
            temperature: 0.15,
            max_tokens: Math.min(glmChatMaxTokens(env), 4000),
            thinking: glmThinkingOptions(env),
          }, {
            feature: `paperclip_skill:${task.templateId || "unknown"}:chunk`,
            reason: "approved Paperclip GLM plan-mode chunk analysis",
            timeoutMs: paperclipTimeoutMs,
          });
          endpoint = endpoint || partial.endpoint;
          const partialMarkdown = `## Chunk ${index + 1}/${extractedChunks.length}\n\n${glmMessageContent(partial.payload) || "GLM 응답이 비어 있습니다."}`;
          await writePaperclipRunArtifact(runDir, `chunk-${chunkNo}.md`, partialMarkdown);
          await writeJsonFile(chunkStatePath, {
            status: "completed",
            chunk: index + 1,
            chunkCount: extractedChunks.length,
            model,
            endpoint: partial.endpoint,
            inputHash: shortHash(stageInput),
            durationMs: Date.now() - started,
            completedAt: new Date().toISOString(),
          });
          partials.push(partialMarkdown);
        } catch (error) {
          const partialMarkdown = [
            `## Chunk ${index + 1}/${extractedChunks.length}`,
            "",
            `- 상태: GLM 부분 분석 실패 (${error.message})`,
            "- 처리: 로컬 추출 원문 일부를 보존합니다.",
            "",
            "```text",
            extractedChunks[index].slice(0, 2500),
            "```",
          ].join("\n");
          await writePaperclipRunArtifact(runDir, `chunk-${chunkNo}.md`, partialMarkdown);
          await writeJsonFile(chunkStatePath, {
            status: "failed",
            chunk: index + 1,
            chunkCount: extractedChunks.length,
            model,
            inputHash: shortHash(stageInput),
            error: error.message,
            failedAt: new Date().toISOString(),
          });
          partials.push(partialMarkdown);
        }
      }
      await writePaperclipRunState(runDir, {
        runId,
        taskId: task.id,
        templateId: task.templateId,
        title: task.title,
        phase: "final_synthesis_running",
        chunkCount: extractedChunks.length,
        sourcePaths: extraction.paths.map((path) => displayPath(path)),
      });
      try {
        completion = await requestGlmChatCompletion(apiUrl, apiKey, {
          model,
          messages: [
            { role: "system", content: `${paperclipSkillSystemPrompt(task.templateId)}\n\n지금은 Plan Mode의 최종 종합 단계입니다. 아래 chunk별 분석만 근거로 삼고, 추정/확인 필요를 분리하십시오.` },
            { role: "user", content: [
              "# Paperclip Plan Mode Final Synthesis",
              `template: ${task.templateId}`,
              `title: ${task.title}`,
              "",
              "## 사용자 입력",
              task.payload?.note || "- 없음",
              "",
              "## Chunk Summaries",
              partials.join("\n\n---\n\n"),
            ].join("\n") },
          ],
          temperature: 0.2,
          max_tokens: glmChatMaxTokens(env),
          thinking: glmThinkingOptions(env),
        }, {
          feature: `paperclip_skill:${task.templateId || "unknown"}:final`,
          reason: "approved Paperclip GLM plan-mode final synthesis",
          timeoutMs: paperclipTimeoutMs,
        });
        endpoint = completion.endpoint || endpoint;
        markdown = [
          "<!-- paperclip_plan_mode: enabled -->",
          "",
          glmMessageContent(completion.payload) || "GLM 응답이 비어 있습니다.",
          "",
          "## Plan Mode 부분 분석 로그",
          partials.join("\n\n---\n\n"),
        ].join("\n");
        await writePaperclipRunArtifact(runDir, "final.md", markdown);
        await writePaperclipRunState(runDir, {
          runId,
          taskId: task.id,
          templateId: task.templateId,
          title: task.title,
          phase: "completed",
          provider: "glm-plan-mode",
          model,
          endpoint,
          chunkCount: extractedChunks.length,
          sourcePaths: extraction.paths.map((path) => displayPath(path)),
        });
      } catch (error) {
        provider = "glm-partial";
        endpoint = endpoint || "partial";
        markdown = [
          "<!-- paperclip_plan_mode: partial -->",
          "",
          "# Paperclip Plan Mode 부분 분석 리포트",
          "",
          "최종 종합 GLM 호출은 실패했지만, chunk별 분석 결과는 보존되었습니다.",
          "",
          `- 최종 종합 상태: 실패 (${error.message})`,
          `- chunk 수: ${partials.length}`,
          "",
          "## Plan Mode 부분 분석 로그",
          partials.join("\n\n---\n\n"),
        ].join("\n");
        await writePaperclipRunArtifact(runDir, "partial_report.md", markdown);
        await writePaperclipRunState(runDir, {
          runId,
          taskId: task.id,
          templateId: task.templateId,
          title: task.title,
          phase: "partial_completed",
          provider,
          model,
          endpoint,
          finalError: error.message,
          chunkCount: extractedChunks.length,
          sourcePaths: extraction.paths.map((path) => displayPath(path)),
        });
      }
    } else {
      completion = await requestGlmChatCompletion(apiUrl, apiKey, {
        model,
        messages: [
          { role: "system", content: paperclipSkillSystemPrompt(task.templateId) },
          { role: "user", content: input },
        ],
        temperature: 0.2,
        max_tokens: glmChatMaxTokens(env),
        thinking: glmThinkingOptions(env),
      }, {
        feature: `paperclip_skill:${task.templateId || "unknown"}`,
        reason: "approved Paperclip GLM skill execution",
        timeoutMs: paperclipTimeoutMs,
      });
      endpoint = completion.endpoint;
      markdown = glmMessageContent(completion.payload) || "GLM 응답이 비어 있습니다.";
      await writePaperclipRunArtifact(runDir, "final.md", markdown);
      await writePaperclipRunState(runDir, {
        runId,
        taskId: task.id,
        templateId: task.templateId,
        title: task.title,
        phase: "completed",
        provider: "glm",
        model,
        endpoint,
        sourcePaths: extraction.paths.map((path) => displayPath(path)),
      });
    }
  } catch (error) {
    if (!extraction.extracted) throw error;
    provider = "local-extraction";
    endpoint = "local";
    markdown = [
      "# Paperclip 로컬 추출 결과",
      "",
      "GLM 분석 단계는 실패했지만, 문서 본문 추출은 완료되었습니다. 이 상태를 HWP 보안/암호화/본문 추출 실패로 해석하지 마십시오.",
      "",
      `- 스킬: ${task.templateId}`,
      `- GLM 상태: ${error.message}`,
      `- 추출 파일 수: ${extraction.paths.length}`,
      "",
      "## 추출 소스",
      ...extraction.paths.map((path) => `- ${displayPath(path)}`),
      "",
      "## 로컬 추출문",
      extraction.extracted.slice(0, 24000),
    ].join("\n");
    await writePaperclipRunArtifact(runDir, "partial_report.md", markdown);
    await writePaperclipRunState(runDir, {
      runId,
      taskId: task.id,
      templateId: task.templateId,
      title: task.title,
      phase: "partial_completed",
      provider,
      model,
      endpoint,
      finalError: error.message,
      sourcePaths: extraction.paths.map((path) => displayPath(path)),
    });
  }
  await mkdir(skillOutputsRoot, { recursive: true });
  const outputPath = join(skillOutputsRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}_${slugifyName(task.templateId)}_${slugifyName(task.title)}.md`);
  const payload = [
    "---",
    "type: paperclip_skill_output",
    `template: ${task.templateId}`,
    `task_id: ${task.id}`,
    `created: ${new Date().toISOString()}`,
    "local_only: true",
    "---",
    "",
    markdown,
  ].join("\n");
  await writeFile(outputPath, payload, "utf-8");
  return {
    status: "completed",
    provider,
    model,
    endpoint,
    path: relative(repoRoot, outputPath),
    runId,
    runPath: relative(repoRoot, runDir),
    markdown: payload,
    extractedSources: extraction.paths.map((path) => displayPath(path)),
  };
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
  const headers = { "Content-Type": type };
  if (extname(filePath) === ".html") {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    headers.Pragma = "no-cache";
    headers.Expires = "0";
  } else if (targetPath.includes("/assets/")) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }
  if (targetPath === "assistant-ui/index.html") {
    const html = await readFile(filePath, "utf-8");
    const injected = html
      .replace("__DEFAULT_WORKSPACE__", defaultWorkspaceId)
      .replace("__ALLOWED_WORKSPACES__", JSON.stringify(Object.keys(wikiWorkspaces)));
    res.writeHead(200, headers);
    res.end(injected);
    return;
  }
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, {
        status: "ok",
        repoRoot,
        defaultWorkspaceId,
        workspaces: wikiWorkspaceList(),
        driveWikifyEnv,
        driveRuntime,
        apiRuntime,
      });
    }
    if (pathname === "/api/workspaces" && req.method === "GET") {
      return sendJson(res, 200, {
        defaultWorkspaceId,
        workspaces: wikiWorkspaceList(),
      });
    }
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
    if (pathname === "/api/pipeline/state" && req.method === "GET") {
      return sendJson(res, 200, await pipelineStatePayload());
    }
    if (pathname === "/api/pipeline/state" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await writePipelineState(body.state || {}));
    }
    if (pathname === "/api/pipeline/plan" && req.method === "POST") {
      const body = await readBody(req);
      const plan = collectionPlanFromBody(body);
      return sendJson(res, 200, { plan, preview: await pipelinePlanPreview(plan) });
    }
    if (pathname === "/api/pipeline/test" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { run: await createPipelineRun(body, "test") });
    }
    if (pathname === "/api/pipeline/run" && req.method === "POST") {
      const body = await readBody(req);
      const run = await createPipelineRun(body, "run");
      return sendJson(res, ["completed", "blocked"].includes(run.status) ? 200 : run.status === "failed" ? 500 : 200, { run });
    }
    if (pathname === "/api/pipeline/runs" && req.method === "GET") {
      return sendJson(res, 200, { runs: await pipelineRunHistory() });
    }
    if (pathname.match(/^\/api\/pipeline\/runs\/[^/]+$/) && req.method === "GET") {
      const runId = decodeURIComponent(pathname.replace("/api/pipeline/runs/", ""));
      const run = (await pipelineRunHistory()).find((entry) => entry.runId === runId);
      return run ? sendJson(res, 200, { run }) : sendJson(res, 404, { error: "Pipeline run not found" });
    }
    if (pathname === "/api/coverage" && req.method === "GET") {
      return sendJson(res, 200, await coverageSummary());
    }
    if (pathname === "/api/projects/command-center" && req.method === "GET") {
      const workspace = url.searchParams.get("workspace") || "rtm";
      return sendJson(res, 200, await projectCommandCenter(workspace));
    }
    if (pathname.match(/^\/api\/projects\/[^/]+\/brief$/) && req.method === "GET") {
      const projectKey = decodeURIComponent(pathname.split("/")[3]);
      const workspace = url.searchParams.get("workspace") || "rtm";
      return sendJson(res, 200, await projectBrief(projectKey, workspace));
    }
    if (pathname.match(/^\/api\/projects\/[^/]+\/action$/) && req.method === "POST") {
      const projectKey = decodeURIComponent(pathname.split("/")[3]);
      const body = await readBody(req);
      return sendJson(res, 200, await appendProjectAction(projectKey, body));
    }
    if (pathname.match(/^\/api\/projects\/[^/]+\/decision$/) && req.method === "POST") {
      const projectKey = decodeURIComponent(pathname.split("/")[3]);
      const body = await readBody(req);
      return sendJson(res, 200, await appendProjectDecision(projectKey, body));
    }
    if (pathname === "/api/documents/core" && req.method === "GET") {
      const workspace = url.searchParams.get("workspace") || "rtm";
      return sendJson(res, 200, await coreDocuments(workspace));
    }
    if (pathname === "/api/documents/usage" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await appendDocumentUsage(body));
    }
    if (pathname === "/api/documents/status" && req.method === "PATCH") {
      const body = await readBody(req);
      return sendJson(res, 200, await updateDocumentStatus(body));
    }
    if (pathname === "/api/ops/llm-usage" && req.method === "GET") {
      return sendJson(res, 200, { usage: await readJsonFile(llmUsagePath, []) });
    }
    if (pathname === "/api/ops/llm-policy" && req.method === "GET") {
      const { values } = await readEnvFile();
      const usage = await readJsonFile(llmUsagePath, []);
      return sendJson(res, 200, { policies: llmPolicyCatalog(values, usage), usage });
    }
    if (pathname === "/api/decision-queue" && req.method === "GET") {
      const workspace = url.searchParams.get("workspace") || "rtm";
      return sendJson(res, 200, await decisionQueue(workspace));
    }
    if (pathname.match(/^\/api\/decision-queue\/[^/]+\/resolve$/) && req.method === "POST") {
      const id = decodeURIComponent(pathname.split("/")[3]);
      const body = await readBody(req);
      return sendJson(res, 200, await resolveDecisionQueueItem(id, body));
    }
    if (pathname === "/api/decision-queue/merge-candidates" && req.method === "POST") {
      const body = await readBody(req);
      const workspace = body.workspace || "rtm";
      const scan = await wikiMergeCandidateScan(workspace, body);
      if (body.enqueueTop) {
        const count = Math.min(Number(body.enqueueTop || 0), scan.candidates.length);
        const enqueued = [];
        for (const candidate of scan.candidates.slice(0, count)) {
          enqueued.push(await enqueueMergeCandidate(candidate, workspace));
        }
        return sendJson(res, 200, { ...scan, enqueued });
      }
      return sendJson(res, 200, scan);
    }
    if (pathname === "/api/decision-queue/merge-candidates/enqueue" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { item: await enqueueMergeCandidate(body.candidate, body.workspace || "rtm") });
    }
    if (pathname === "/api/wiki/integration-candidates" && req.method === "POST") {
      const body = await readBody(req);
      const workspace = body.workspace || "rtm";
      const scan = await wikiIntegrationCandidateScan(workspace, body);
      if (body.enqueueTop) {
        const count = Math.min(Number(body.enqueueTop || 0), scan.candidates.length);
        const enqueued = [];
        for (const candidate of scan.candidates.slice(0, count)) {
          enqueued.push(await enqueueWikiIntegrationCandidate(candidate, workspace));
        }
        return sendJson(res, 200, { ...scan, enqueued });
      }
      return sendJson(res, 200, scan);
    }
    if (pathname === "/api/wiki/integration-candidates/enqueue" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { item: await enqueueWikiIntegrationCandidate(body.candidate, body.workspace || "rtm") });
    }
    if (pathname === "/api/spotlite" && req.method === "GET") {
      const scope = url.searchParams.get("scope") || "work";
      return sendJson(res, 200, await spotliteSummary(scope));
    }
    if (pathname === "/api/spotlite/glm-refresh" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await refreshSpotliteGlm(body.scope || "work"));
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
    if (pathname === "/api/slack/status" && req.method === "GET") {
      return sendJson(res, 200, await slackStatus());
    }
    if (pathname === "/api/slack/channels" && req.method === "GET") {
      const query = url.searchParams.get("q") || "";
      const limit = url.searchParams.get("limit") || "200";
      const channelTypes = url.searchParams.get("channelTypes") || "";
      const includeArchived = url.searchParams.get("includeArchived") === "true";
      const payload = await runPythonJson([
        "-m",
        "drive_wikify.cli",
        "slack-channels",
        "--json",
        "--query",
        query,
        "--limit",
        limit,
        ...(channelTypes ? ["--channel-types", channelTypes] : []),
        ...(includeArchived ? ["--include-archived"] : []),
      ]);
      return sendJson(res, 200, payload);
    }
    if (pathname === "/api/slack/collect" && req.method === "POST") {
      const body = await readBody(req);
      const existingSlackJob = runningCommand("slack-collect");
      if (existingSlackJob) {
        return sendJson(res, 409, {
          error: "Slack 수집이 이미 실행 중입니다.",
          running: {
            runId: existingSlackJob.runId,
            command: existingSlackJob.command,
            status: existingSlackJob.status || "running",
            startedAt: existingSlackJob.startedAt,
            progress: existingSlackJob.progress || {},
          },
        });
      }
      const extraArgs = [];
      for (const channel of body.channels || []) {
        extraArgs.push("--channel", String(channel));
      }
      if (body.sinceDate) extraArgs.push("--since-date", String(body.sinceDate));
      if (body.untilDate) extraArgs.push("--until-date", String(body.untilDate));
      if (body.oldestDays) extraArgs.push("--oldest-days", String(body.oldestDays));
      if (body.limitPerChannel) extraArgs.push("--limit-per-channel", String(body.limitPerChannel));
      if (body.includeThreads === false) extraArgs.push("--no-threads");
      if (body.includeFiles === false) extraArgs.push("--no-files");
      const result = await runCommand("slack-collect", Boolean(body.dryRun), {
        source: "slack_collect_api",
        extraArgs,
        slackScopeKey: slackScopeKeyFromBody(body),
        slackScope: {
          channels: body.channels || [],
          sinceDate: body.sinceDate || "",
          untilDate: body.untilDate || "",
          oldestDays: body.oldestDays || null,
          limitPerChannel: body.limitPerChannel || null,
        },
      });
      return sendJson(res, ["completed", "previewed"].includes(result.status) ? 200 : 500, result);
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
      if (activeJobs.size && body.command !== "refresh-global") {
        return sendJson(res, 409, {
          error: "다른 수집 작업이 이미 실행 중입니다.",
          running: [...activeJobs.values()].map((job) => ({
            runId: job.runId,
            command: job.command,
            status: job.status || "running",
            startedAt: job.startedAt,
            progress: job.progress || {},
          })),
        });
      }
      const result = body.command === "full-cycle" ? await fullCycle(Boolean(body.dryRun)) : await runCommand(body.command, Boolean(body.dryRun));
      return sendJson(res, result.status === "completed" ? 200 : 500, result);
    }
    if (pathname === "/api/automation/continue-after-collection" && req.method === "POST") {
      const result = await continueAfterCollection();
      return sendJson(res, result.status === "blocked" ? 409 : result.status === "completed" ? 200 : 500, result);
    }
    if (pathname === "/api/automation/target-rclone-copy" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.remotePath) return sendJson(res, 400, { error: "remotePath is required" });
      if (activeJobs.size) {
        return sendJson(res, 409, {
          error: "다른 수집 작업이 이미 실행 중입니다.",
          running: [...activeJobs.values()].map((job) => ({
            runId: job.runId,
            command: job.command,
            status: job.status || "running",
            startedAt: job.startedAt,
            progress: job.progress || {},
          })),
        });
      }
      const result = await targetRcloneCopy(body.remotePath, body.dryRun !== false, { existingMode: body.existingMode });
      return sendJson(res, ["completed", "blocked", "skipped"].includes(result.status) ? 200 : 500, result);
    }
    if (pathname === "/api/collection/status" && req.method === "GET") {
      const { values: env } = await readEnvFile();
      return sendJson(res, 200, await collectionStatusSnapshot(env));
    }
    if (pathname === "/api/mirror/status" && req.method === "GET") {
      const { values: env } = await readEnvFile();
      return sendJson(res, 200, await mirrorStatusSnapshot(env));
    }
    if (pathname === "/api/mirror/cleanup" && req.method === "POST") {
      const { values: env } = await readEnvFile();
      const body = await readBody(req);
      return sendJson(res, 200, await cleanupMirrorData({
        env,
        scope: body.scope === "all" ? "all" : "uploads",
        olderThanDays: Number(body.olderThanDays || 0),
        dryRun: body.dryRun !== false,
        deleteAll: Boolean(body.deleteAll),
      }));
    }
    if (pathname === "/api/mirror/retention" && req.method === "GET") {
      const { values: env } = await readEnvFile();
      return sendJson(res, 200, await mirrorStatusSnapshot(env));
    }
    if (pathname === "/api/mirror/retention" && req.method === "POST") {
      const { values: env } = await readEnvFile();
      const body = await readBody(req);
      return sendJson(res, 200, await saveMirrorRetentionPolicy(body, env));
    }
    if (pathname === "/api/skills/catalog" && req.method === "GET") {
      return sendJson(res, 200, { skills: skillCatalog() });
    }
    if (pathname === "/api/skills/draft" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await createSkillDraft(body));
    }
    if (pathname === "/api/filesystem/roots" && req.method === "GET") {
      return sendJson(res, 200, { roots: await filesystemRootOptions() });
    }
    if (pathname === "/api/filesystem/import-folder" && req.method === "POST") {
      return sendJson(res, 200, await handleFilesystemFolderImport(req));
    }
    if (pathname === "/api/filesystem/browse" && req.method === "POST") {
      const body = await readBody(req);
      const { values: env } = await readEnvFile();
      const result = await inspectFilesystemTargets([body.path || "", body.note || ""].filter(Boolean).join("\n"), {
        extensions: Array.isArray(body.extensions) ? body.extensions : [],
        includeDirectories: true,
        maxDepth: body.maxDepth || env.FILESYSTEM_BROWSE_MAX_DEPTH || 8,
        maxFiles: body.maxFiles || env.FILESYSTEM_BROWSE_MAX_FILES || 5000,
        maxEntriesPerDirectory: body.maxEntriesPerDirectory || env.FILESYSTEM_BROWSE_MAX_ENTRIES || 300,
        maxTreeEntries: body.maxTreeEntries || 400,
      });
      return sendJson(res, 200, result);
    }
    if (pathname === "/api/filesystem/collect" && req.method === "POST") {
      const body = await readBody(req);
      const result = await collectFilesystemPath(body);
      return sendJson(res, result.status === "blocked" ? 409 : result.status === "failed" ? 500 : 200, result);
    }
    if (pathname === "/api/drive/remote-browser" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await browseRemoteDrive(body.path || ""));
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
    if (pathname === "/api/chat/files" && req.method === "POST") {
      return sendJson(res, 200, await handleChatFileUpload(req));
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
    if (pathname.match(/^\/api\/chat\/projects\/[^/]+\/messages\/move$/) && req.method === "POST") {
      const parts = pathname.split("/");
      const body = await readBody(req);
      return sendJson(res, 200, await moveChatProjectMessages(decodeURIComponent(parts[4]), body.targetProjectId || ""));
    }
    if (pathname.match(/^\/api\/chat\/projects\/[^/]+\/instruction-candidates\/[^/]+\/promote$/) && req.method === "POST") {
      const parts = pathname.split("/");
      return sendJson(res, 200, { project: await promoteInstructionCandidate(decodeURIComponent(parts[4]), decodeURIComponent(parts[6])) });
    }
    if (pathname.match(/^\/api\/chat\/projects\/[^/]+\/instruction-candidates\/[^/]+$/) && req.method === "DELETE") {
      const parts = pathname.split("/");
      return sendJson(res, 200, await deleteInstructionCandidate(decodeURIComponent(parts[4]), decodeURIComponent(parts[6])));
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
      const workspace = url.searchParams.get("workspace") || "rtm";
      return sendJson(res, 200, { results: query ? await searchWiki(query, workspace) : [] });
    }
    if (pathname === "/api/wiki/index" && req.method === "GET") {
      const workspace = url.searchParams.get("workspace") || "rtm";
      return sendJson(res, 200, { pages: await wikiIndex(workspace), workspace });
    }
    if (pathname === "/api/wiki/project-governance" && req.method === "GET") {
      const workspace = url.searchParams.get("workspace") || "rtm";
      return sendJson(res, 200, await projectKeyGovernance(workspace));
    }
    if (pathname === "/api/wiki/status" && req.method === "GET") {
      return sendJson(res, 200, { catalog: wikiStatusCatalog, store: await wikiStatusStore() });
    }
    if (pathname === "/api/wiki/status" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await updateWikiStatus(body));
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
    if (pathname === "/api/wiki/graph/refresh" && req.method === "POST") {
      const result = await runCommand("refresh-global", false, { source: "wiki_graph_refresh" });
      return sendJson(res, 200, result);
    }
    if (pathname === "/api/wiki/search/brief" && req.method === "GET") {
      const query = url.searchParams.get("q") || "";
      const workspace = url.searchParams.get("workspace") || "rtm";
      return sendJson(res, 200, await searchWikiBrief(query, [], "standard", workspace));
    }
    if (pathname === "/api/wiki/search/brief" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await searchWikiBrief(body.query || "", body.paths || [], body.mode || "standard", body.workspace || "rtm"));
    }
    if (pathname === "/api/wiki/conflict-merge" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await suggestConflictMerge(body));
    }
    if (pathname === "/api/wiki/page" && req.method === "GET") {
      const path = url.searchParams.get("path") || "";
      return sendJson(res, 200, await pageByPath(path));
    }
    if (pathname === "/api/wiki/page" && req.method === "PUT") {
      const body = await readBody(req);
      return sendJson(res, 200, await writeWikiPage(body));
    }
    if (pathname === "/api/wiki/page/delete" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await deleteWikiPage(body));
    }
    if (pathname === "/api/wiki/project/delete" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await deleteWikiProjectPackage(body));
    }
    if (pathname === "/api/wiki/deletion-candidates" && req.method === "GET") {
      const workspace = url.searchParams.get("workspace") || "rtm";
      const limit = Number(url.searchParams.get("limit") || "24");
      return sendJson(res, 200, await wikiDeletionCandidates(workspace, limit));
    }
    if (pathname === "/api/wiki/deletion-candidates/enqueue" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await enqueueWikiDeletionCandidates(body));
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
      const effectiveMessage = stripStaleUploadContextSummaries(
        await enrichMessageWithResolvedBrowserFiles(body.message || ""),
      );
      const busy = chatBusyPayload(projectId);
      if (busy) return sendJson(res, 409, busy);
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const controller = new AbortController();
      const runId = `${Date.now()}-chat-${String(projectId || "default").replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
      const active = {
        runId,
        projectId,
        status: "thinking",
        phase: "glm_streaming",
        startedAt: new Date().toISOString(),
      };
      activeChatRequests.set(projectId, active);
      activeChatControllers.set(projectId, controller);
      const handleStreamClose = () => {
        if (!controller.signal.aborted) controller.abort();
        cleanupActiveChatRequest(projectId, controller, active);
      };
      req.on("aborted", handleStreamClose);
      res.on("close", handleStreamClose);
      try {
        const transient = body.transient === true || body.profile === "decision_triage";
        const userMessage = transient
          ? { id: "", role: "user", content: effectiveMessage, transient: true }
          : await appendChatProjectMessage(projectId, { role: "user", content: effectiveMessage });
        if (!transient) sseWrite(res, "user_saved", { message: userMessage });
        const remembered = transient ? null : await autoRememberFromMessage(projectId, effectiveMessage);
        if (remembered) sseWrite(res, "memory", { remembered });
        const result = await streamGlmChat(effectiveMessage, projectId, res, {
          signal: controller.signal,
          contextMode: body.contextMode || body.mode,
          runId,
          workspace: body.workspace || "rtm",
          skillTags: Array.isArray(body.skillTags) ? body.skillTags : [],
          profile: body.profile === "decision_triage" ? "decision_triage" : "",
        });
        if (controller.signal.aborted) {
          sseWrite(res, "done", {
            status: "stopped",
            runId,
            message: "GLM 추론이 사용자 요청으로 중지되었습니다.",
            messages: { user: userMessage },
            context: result.context || null,
          });
          return res.end();
        }
        const assistantMessage = transient
          ? { id: "", role: "assistant", content: result.message || "", thinking: "", transient: true }
          : await appendChatProjectMessage(result.projectId || projectId, {
            role: "assistant",
            content: result.message || "",
            thinking: result.thinking || "",
          });
        sseWrite(res, "done", {
          status: "completed",
          runId,
          provider: result.provider,
          model: result.model,
          endpoint: result.endpoint,
          remembered,
          context: result.context || null,
          messages: { user: userMessage, assistant: assistantMessage },
        });
        return res.end();
      } catch (error) {
        sseWrite(res, "error", { error: error.message, runId });
        return res.end();
      } finally {
        req.off("aborted", handleStreamClose);
        res.off("close", handleStreamClose);
        cleanupActiveChatRequest(projectId, controller, active);
      }
    }
    if (pathname === "/api/chat/glm" && req.method === "POST") {
      const body = await readBody(req);
      const projectId = body.projectId || "default";
      const effectiveMessage = stripStaleUploadContextSummaries(
        await enrichMessageWithResolvedBrowserFiles(body.message || ""),
      );
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
        const userMessage = await appendChatProjectMessage(projectId, { role: "user", content: effectiveMessage });
        const remembered = await autoRememberFromMessage(projectId, effectiveMessage);
        const result = await glmChat(effectiveMessage, projectId, {
          signal: controller.signal,
          contextMode: body.contextMode || body.mode,
          workspace: body.workspace || "rtm",
          skillTags: Array.isArray(body.skillTags) ? body.skillTags : [],
        });
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
        cleanupActiveChatRequest(projectId, controller, active);
      }
    }
    if (pathname === "/api/chat/evidence" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, await promoteKnowledge({
        content: body.content || "",
        projectHint: body.projectHint || "",
        source: "chat_promotion",
        sourceProjectId: body.sourceProjectId || body.projectId || "",
        sourceMessageId: body.sourceMessageId || body.messageId || "",
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
    if (pathname === "/api/paperclip/runs" && req.method === "GET") {
      return sendJson(res, 200, {
        runs: await listPaperclipRuns({ taskId: url.searchParams.get("taskId") || "" }),
      });
    }
    if (pathname.match(/^\/api\/paperclip\/runs\/[^/]+$/) && req.method === "GET") {
      const runId = decodeURIComponent(pathname.split("/")[4]);
      return sendJson(res, 200, { run: await readPaperclipRun(runId) });
    }
    if (pathname.match(/^\/api\/paperclip\/runs\/[^/]+\/artifacts\/[^/]+$/) && req.method === "GET") {
      const runId = decodeURIComponent(pathname.split("/")[4]);
      const artifactName = decodeURIComponent(pathname.split("/")[6]);
      return sendJson(res, 200, await readPaperclipRunArtifact(runId, artifactName));
    }
    if (pathname === "/api/paperclip/tasks" && req.method === "POST") {
      const body = await readBody(req);
      return sendJson(res, 200, { task: await createPaperclipTask(body.templateId || "validator", body) });
    }
    if (pathname.match(/^\/api\/paperclip\/tasks\/[^/]+\/trigger$/) && req.method === "POST") {
      const body = await readBody(req);
      const id = decodeURIComponent(pathname.split("/")[4]);
      if (body.async === true || body.wait === false) return sendJson(res, 202, await triggerExistingPaperclipTaskAsync(id));
      return sendJson(res, 200, await triggerExistingPaperclipTask(id));
    }
    if (pathname === "/api/paperclip/trigger" && req.method === "POST") {
      const body = await readBody(req);
      if (!body.templateId) return sendJson(res, 400, { status: "failed", error: "templateId is required for /api/paperclip/trigger" });
      if (body.async === true || body.wait === false) return sendJson(res, 202, await triggerPaperclipTaskAsync(body.templateId, body));
      return sendJson(res, 200, await triggerPaperclipTask(body.templateId, body));
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    if (String(error.message).includes("ENOENT") || String(error.message).includes("Not found")) {
      return sendText(res, 404, "Not found");
    }
    return sendJson(res, 500, { error: error.message });
  }
});

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  server.listen(port, host, () => {
    console.log(`Wiki API listening at http://${host}:${port}`);
  });

  setInterval(() => {
    tickSchedules().catch((error) => {
      console.error(`Schedule tick failed: ${error.message}`);
    });
  }, 30 * 1000);

  tickSchedules().catch(() => {});
}

export {
  enqueueWikiIntegrationCandidate,
  wikiIntegrationCandidateScan,
};
