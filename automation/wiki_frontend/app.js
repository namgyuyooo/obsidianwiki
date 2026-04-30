const state = {
  status: {
    targetDrive: "gdrive: 최상위",
    manifest: "automation/drive_wikify/runtime/manifest.json",
    lastRun: "준비됨",
    cleanup: "로컬 mirror만",
  },
  runs: [
    {
      command: "rclone-copy --dry-run",
      status: "준비됨",
      detail: "rclone copy, tpslimit=1, checkers=1, transfers=1 기준.",
    },
    {
      command: "run",
      status: "안전",
      detail: "DRIVE_DELETE_SOURCE=false를 CLI에서 강제.",
    },
  ],
  paperclip: [
    {
      command: "Drive Collector",
      status: "planned",
      detail: "process adapter calls drive_wikify CLI.",
    },
    {
      command: "Wiki Ingest Operator",
      status: "planned",
      detail: "codex_local or openclaw handles evidence-preserving writes.",
    },
  ],
  paperclipTemplates: [],
  paperclipTasks: [],
  paperclipEvents: [],
  mission: null,
  projectGovernance: null,
  coreDocuments: [],
  decisionQueue: [],
  llmUsage: [],
  llmPolicies: [],
  automationSnapshot: null,
  activeMissionProjectKey: "",
  activeDecisionId: "",
  activeDecisionEvidencePath: "",
  decisionLastResolution: null,
  decisionPending: { busy: false, itemId: "", action: "" },
  decisionChatDirective: localStorage.getItem("wiki_ops_decision_chat_directive") || "",
  decisionInference: { busy: false, itemId: "", status: "", content: "", thinking: "", error: "", assistantId: "" },
  decisionCompare: {
    itemId: "",
    sourcePath: "",
    targetPath: "",
    sourceMarkdown: "",
    targetMarkdown: "",
    mergePending: false,
    mergeSuggestion: null,
  },
  activeSpace: localStorage.getItem("wiki_ops_active_space") || "work",
  sidebarCollapsed: localStorage.getItem("wiki_ops_sidebar_collapsed") === "true",
  running: [],
  schedules: [],
  slack: {
    status: null,
    channels: [],
    selectedChannels: new Set(),
    lastResult: null,
    filter: "all",
  },
  driveTargets: [],
  searchResults: [],
  selectedSearchPaths: new Set(),
  wikiPages: [],
  wikiGraph: { nodes: [], edges: [] },
  activeWikiPath: "",
  wikiManagementCommands: [],
  activeWikiManagementCommandId: "",
  activeProjectKey: "",
  selectedAccountKeys: new Set(),
  selectedWikiPaths: new Set(),
  wikiFilters: {
    division: "all",
    nature: "all",
    status: "all",
    tag: "all",
    projectKey: "all",
    query: "",
    viewMode: "grid",
    sortBy: "name",
  },
  skills: [],
  chatProjects: [],
  chatProjectWikiOptions: [],
  chatGlobal: { instructions: "", autoMemory: true },
  chatAttachments: [],
  chatPendingFiles: [],
  chatSelectedSkillTags: [],
  chatMentionActiveIndex: 0,
  activeChatProjectId: "default",
  chatComposing: false,
  chatSending: false,
  chatPhase: "idle",
  pendingUserMessageId: "",
  lastChatText: "",
  notionCurrentCategory: "all",
  spotlite: {
    work: null,
    personal: null,
    personalUnlocked: sessionStorage.getItem("spotlite_personal_unlocked") === "true",
    templates: [],
  },
};

const titles = {
  mission: "Mission Control",
  decisions: "위키 정합성 대기",
  spotlite: "Spotlite",
  "spotlite-work": "Spotlite Work",
  "spotlite-personal": "Spotlite Personal",
  operations: "운영",
  pipeline: "수집 파이프라인",
  wiki: "위키",
  ingest: "지식 주입",
  chat: "GLM 챗",
  paperclip: "Paperclip Studio",
};

const settingLabels = {
  RCLONE_REMOTE: "rclone remote",
  RCLONE_REMOTE_PATH: "Drive 경로",
  RCLONE_MIRROR_ROOT: "로컬 mirror 경로",
  RCLONE_BWLIMIT: "대역폭 제한",
  RCLONE_TPSLIMIT: "TPS 제한",
  RCLONE_CHECKERS: "checkers",
  RCLONE_TRANSFERS: "transfers",
  RCLONE_COPY_MAX_MINUTES: "수집 실행 시간 제한",
  RCLONE_EXCLUDE_PATTERNS: "수집 제외 경로",
  DRIVE_NAME: "Drive 표시명",
  MANIFEST_PATH: "manifest 경로",
  RUN_OUTPUT_PATH: "run output 경로",
  MAX_FOLDERS_PER_RUN: "폴더/회",
  MAX_FILES_PER_FOLDER: "파일/폴더",
  MAX_FETCH_DOCS: "최대 fetch",
  CHUNK_SIZE_MIN_CHARS: "청크 최소",
  CHUNK_SIZE_MAX_CHARS: "청크 최대",
  CLEANUP_LOCAL_MIRROR: "로컬 mirror 정리",
  AUTO_CREATE_PROJECT_SPACE: "프로젝트 자동 생성",
  ALLOWED_FILE_TYPES: "위키화 대상 파일",
  GLM_API_URL: "GLM API URL",
  GLM_API_KEY: "GLM API Key",
  GLM_MODEL: "GLM 모델",
  GLM_LIGHT_MODEL: "경량 LLM 모델",
  GLM_LIGHT_MAX_TOKENS: "경량 LLM 최대 토큰",
  GLM_DECISION_MODEL: "Decision Deck 경량 모델",
  GLM_DECISION_MAX_TOKENS: "Decision Deck 최대 토큰",
  GLM_DECISION_FINAL_MODEL: "Decision Deck 최종 검증 모델",
  GLM_DECISION_FINAL_MAX_TOKENS: "Decision Deck 최종 검증 토큰",
  GLM_CONFLICT_MODEL: "충돌 병합 모델",
  GLM_CONFLICT_MAX_TOKENS: "충돌 병합 최대 토큰",
  GLM_FILE_ANALYSIS_MODEL: "파일 분석 모델",
  GLM_VLM_MODEL: "이미지/VLM 모델",
  GLM_PAPERCLIP_MODEL: "Paperclip 스킬 모델",
  GLM_SLACK_FILTER_MODEL: "Slack 필터 경량 모델",
  GLM_SLACK_FILTER_MAX_TOKENS: "Slack 필터 최대 토큰",
  GLM_AVAILABLE_MODELS: "GLM 선택 가능 모델",
  GLM_THINKING_TYPE: "GLM thinking",
  GLM_THINKING_BUDGET_TOKENS: "GLM thinking budget",
  GLM_CHAT_MAX_TOKENS: "GLM 챗 출력 토큰",
  GLM_CHAT_STREAM: "GLM 챗 스트리밍",
  GLM_CONTEXT_MODE: "GLM 컨텍스트 절약 모드",
  OPENCLAW_WEBHOOK_URL: "OpenClaw GLM Webhook override",
  OPENCLAW_API_KEY: "OpenClaw GLM API Key override",
  PAPERCLIP_URL: "Paperclip URL",
  PAPERCLIP_API_KEY: "Paperclip API Key",
  SLACK_BOT_TOKEN: "Slack Bot Token",
  SLACK_USER_TOKEN: "Slack User Token",
  SLACK_WORKSPACE_NAME: "Slack Workspace 이름",
  SLACK_CHANNEL_TYPES: "Slack 채널 타입",
  SLACK_CHANNELS: "Slack 기본 수집 채널",
  SLACK_EXPORT_ROOT: "Slack export 경로",
  SLACK_STATE_PATH: "Slack state 경로",
  SLACK_HISTORY_LIMIT: "Slack 채널당 메시지 수",
  SLACK_OLDEST_DAYS: "Slack 기본 lookback 일수",
  SLACK_INCLUDE_THREADS: "Slack 스레드 수집",
  SLACK_INCLUDE_FILES: "Slack 파일 메타 수집",
  SLACK_COLLECT_MAX_MINUTES: "Slack 수집 시간 제한",
  SLACK_FILTER_WITH_GLM: "Slack GLM 필터",
  SLACK_FILTER_EXPORT_ROOT: "Slack filtered export 경로",
  SLACK_PROJECT_CHANNEL_PREFIXES: "Slack 프로젝트 채널 prefix",
  SLACK_COMPANY_CHANNEL_PREFIXES: "Slack 회사소식 채널 prefix",
  SLACK_MIXED_CHANNEL_PREFIXES: "Slack 혼합 채널 prefix",
  SLACK_PROJECT_WIKI_ROOT: "Slack 프로젝트 인입 위키 루트",
  SLACK_COMPANY_WIKI_ROOT: "Slack 회사소식 위키 루트",
};

const ASSISTANT_UI_CHAT_BUILD = "20260430-project-settings";
const ASSISTANT_UI_TOP_LEVEL_VIEWS = {
  chat: "chat",
  decisions: "decisions",
  paperclip: "paperclip",
  wiki: "wiki",
  mission: "mission",
  pipeline: "pipeline",
  spotlite: "spotlite",
  operations: "operations",
  ingest: "ingest",
};

function personalSpotlitePin() {
  return localStorage.getItem("spotlite_personal_pin") || "0953";
}

function wikiWorkspaceParam() {
  return state.activeSpace === "personal" ? "personal" : "rtm";
}

function assistantUiProjectIdParam() {
  return state.activeChatProjectId || "default";
}

function assistantUiTopLevelUrl(surface = "chat") {
  const workspace = wikiWorkspaceParam();
  const projectId = assistantUiProjectIdParam();
  const url = new URL("/assistant-ui/index.html", window.location.origin);
  url.searchParams.set("workspace", workspace);
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("ui", ASSISTANT_UI_CHAT_BUILD);
  if (surface !== "chat") url.searchParams.set("surface", surface);
  return `${url.pathname}${url.search}`;
}

function syncAssistantUiFrame() {
  const frame = $("#chat-assistantui-frame");
  if (!frame) return;
  const next = assistantUiTopLevelUrl("chat");
  if (frame.getAttribute("src") !== next) frame.setAttribute("src", next);
}

function $(selector) {
  return document.querySelector(selector);
}

function syncSidebarState() {
  const shell = document.querySelector(".app-shell");
  const toggle = $("#sidebar-toggle");
  shell?.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
    toggle.setAttribute("aria-label", state.sidebarCollapsed ? "네비게이션 펼치기" : "네비게이션 닫기");
    toggle.querySelector(".sidebar-toggle-text").textContent = state.sidebarCollapsed ? "네비 열기" : "네비 닫기";
  }
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem("wiki_ops_sidebar_collapsed", String(state.sidebarCollapsed));
  syncSidebarState();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
      const cleanTarget = String(target || "").trim();
      const cleanLabel = String(label || target || "").trim();
      return `<a href="#" class="wiki-internal-link" data-wiki-target="${escapeHtml(cleanTarget)}">${escapeHtml(cleanLabel)}</a>`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+\.md)(?:#[^)]+)?\)/g, (_, label, target) => {
      return `<a href="#" class="wiki-internal-link" data-wiki-target="${escapeHtml(target.trim())}">${escapeHtml(label.trim())}</a>`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderMarkdownDocument(markdown) {
  const lines = String(markdown || "").split("\n");
  const html = [];
  let inCode = false;
  let codeLines = [];
  let codeLang = "";
  let inList = false;
  let inTable = false;

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  function closeTable() {
    if (inTable) {
      html.push("</tbody></table>");
      inTable = false;
    }
  }

  function flushCode() {
    html.push(`<section class="code-window"><div>${escapeHtml(codeLang || "code")}</div><pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre></section>`);
    codeLines = [];
    codeLang = "";
  }

  for (const line of lines) {
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        closeList();
        closeTable();
        inCode = true;
        codeLang = fence[1].trim();
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      closeTable();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      closeTable();
      const level = Math.min(heading[1].length + 2, 6);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\|.+\|$/.test(line.trim())) {
      const cells = line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      closeList();
      if (!inTable) {
        html.push("<table><tbody>");
        inTable = true;
      }
      html.push(`<tr>${cells.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      closeTable();
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    closeList();
    closeTable();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  closeTable();
  if (inCode) flushCode();
  return `<article class="markdown-preview">${html.join("")}</article>`;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "wiki-ops-output.md";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function renderMarkdownBullets(markdown) {
  const lines = String(markdown || "").split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "<p>정리할 내용이 아직 없습니다.</p>";
  return lines
    .map((line) => {
      const cleaned = line.replace(/^[-*]\s*/, "");
      return `<p>${escapeHtml(cleaned)}</p>`;
    })
    .join("");
}

function renderBriefList(title, items) {
  if (!items || !items.length) return "";
  return `<h4>${escapeHtml(title)}</h4><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderSearchBrief(brief) {
  $("#search-brief-provider").textContent = brief?.upstreamStatus
    ? `${brief.provider} · ${brief.upstreamStatus}`
    : `${brief?.provider || "정리 완료"}${brief?.model ? ` · ${brief.model}` : ""}${brief?.endpoint ? ` · ${brief.endpoint}` : ""}`;
  $("#search-brief").innerHTML = [
    brief?.tokenBudget ? `<p class="token-budget-note">컨텍스트: ${escapeHtml(brief.tokenBudget.mode)} · 압축카드 ${escapeHtml(brief.tokenBudget.evidenceCards)}개 · 근거 약 ${escapeHtml(brief.tokenBudget.estimatedEvidenceChars)}자</p>` : "",
    renderMarkdownBullets(brief?.summaryMarkdown),
    renderBriefList("핵심 발견", brief?.keyFindings),
    renderBriefList("프로젝트 후보", brief?.relatedProjects),
    renderBriefList("충돌 후보", brief?.conflictCandidates),
    renderBriefList("다음 처리", brief?.nextActions),
  ].join("");
}

function updateSelectedCount() {
  $("#selected-result-count").textContent = `선택 ${state.selectedSearchPaths.size}건`;
  $("#summarize-selected").disabled = state.selectedSearchPaths.size === 0;
}

function renderStatus() {
  $("#target-drive").textContent = state.status.targetDrive;
  $("#manifest-status").textContent = state.status.manifest;
  $("#last-run").textContent = state.status.lastRun;
  $("#cleanup-status").textContent = state.status.cleanup;
  const pipelineDrive = $("#pipeline-drive-default");
  if (pipelineDrive) pipelineDrive.textContent = `기본 경로: ${state.status.targetDrive || "gdrive: 최상위"}`;
}

function slackBucketLabel(bucket) {
  if (bucket === "project") return "프로젝트";
  if (bucket === "company_news") return "회사소식";
  if (bucket === "mixed") return "혼합";
  if (bucket === "casual") return "잡담 제외";
  return bucket || "미분류";
}

function slackFilterChannels() {
  const query = ($("#slack-channel-query")?.value || "").trim().toLowerCase();
  const filter = state.slack.filter || "all";
  return (state.slack.channels || []).filter((channel) => {
    const bucket = channel.routing?.channel_bucket || channel.routing?.channel_profile?.channel_bucket || "company_news";
    const text = [channel.name, channel.topic, channel.purpose].join(" ").toLowerCase();
    if (query && !text.includes(query)) return false;
    if (filter === "all") return true;
    return bucket === filter;
  });
}

function slackSelectedChannels() {
  return [...state.slack.selectedChannels];
}

function renderSlackRoutingPanel() {
  const status = state.slack.status || {};
  const routing = status.routingSummary || { channelBuckets: {}, messageBuckets: {} };
  const channels = slackFilterChannels();
  const list = $("#slack-channel-list");
  const summary = $("#slack-routing-summary");
  const resultBox = $("#slack-collection-result");
  const total = $("#slack-channel-count");
  const selected = $("#slack-selected-count");
  const workspace = $("#slack-workspace-status");
  const collectStatus = $("#slack-collect-status");

  if (workspace) workspace.textContent = status.workspace ? `${status.workspace} · ${status.authMode || "token"}` : "Slack 설정 대기";
  if (total) total.textContent = `${channels.length}개`;
  if (selected) selected.textContent = `${state.slack.selectedChannels.size}개 선택`;
  if (collectStatus) collectStatus.textContent = status.lastCollectedAt ? `최근 수집 ${status.lastCollectedAt}` : "아직 수집 기록 없음";

  if (summary) {
    const cards = [
      { title: "프로젝트 채널", count: routing.channelBuckets?.project || 0, detail: `${routing.messageBuckets?.project || 0}개 메시지` },
      { title: "회사소식 채널", count: routing.channelBuckets?.company_news || 0, detail: `${routing.messageBuckets?.company_news || 0}개 메시지` },
      { title: "혼합 채널", count: routing.channelBuckets?.mixed || 0, detail: `잡담 제외 ${routing.messageBuckets?.casual || 0}개` },
    ];
    summary.innerHTML = cards.map((card) => [
      `<article class="slack-summary-card">`,
      `<strong>${escapeHtml(card.title)}</strong>`,
      `<span>${escapeHtml(String(card.count))}</span>`,
      `<small>${escapeHtml(card.detail)}</small>`,
      `</article>`,
    ].join("")).join("");
  }

  if (list) {
    list.innerHTML = channels.length ? channels.map((channel) => {
      const bucket = channel.routing?.channel_bucket || channel.routing?.channel_profile?.channel_bucket || "company_news";
      const target = channel.routing?.wiki_target_root || channel.routing?.channel_profile?.wiki_target_root || "";
      const checked = state.slack.selectedChannels.has(channel.name) ? "checked" : "";
      return [
        `<label class="slack-channel-card">`,
        `<input type="checkbox" data-slack-channel="${escapeHtml(channel.name)}" ${checked} />`,
        `<div>`,
        `<strong>#${escapeHtml(channel.name)}</strong>`,
        `<small>${escapeHtml(slackBucketLabel(bucket))} · ${escapeHtml(channel.type || "")}</small>`,
        `<p>${escapeHtml(channel.topic || channel.purpose || "토픽/목적 미기재")}</p>`,
        `<div class="wiki-status-tags">`,
        `<span>${escapeHtml(target || "대상 경로 미설정")}</span>`,
        `</div>`,
        `</div>`,
        `</label>`,
      ].join("");
    }).join("") : `<p class="pipeline-note">조회된 Slack 채널이 없습니다.</p>`;

    list.querySelectorAll("[data-slack-channel]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) state.slack.selectedChannels.add(input.dataset.slackChannel);
        else state.slack.selectedChannels.delete(input.dataset.slackChannel);
        renderSlackRoutingPanel();
      });
    });
  }

  if (resultBox) {
    const result = state.slack.lastResult;
    if (!result) {
      resultBox.innerHTML = `<p class="pipeline-note">최근 2일 수집 결과가 여기에 표시됩니다.</p>`;
    } else {
      resultBox.innerHTML = [
        `<strong>${escapeHtml(result.status || "completed")} · ${escapeHtml(String(result.channel_count || 0))}개 채널</strong>`,
        `<small>skip ${escapeHtml(String(result.skipped_count || 0))} · ${escapeHtml(result.started_at || "")}</small>`,
        `<div class="event-list">`,
        ...(result.exports || []).slice(0, 8).map((item) => [
          `<article class="event">`,
          `<strong>#${escapeHtml(item.channel_name || "")}</strong>`,
          `<small>${escapeHtml(slackBucketLabel(item.routing?.channel_bucket || item.routing?.channel_profile?.channel_bucket || ""))} · ${escapeHtml(String(item.messages || 0))}개 메시지</small>`,
          `<small>${escapeHtml(item.filtered_export_path || item.export_path || "")}</small>`,
          `</article>`,
        ].join("")),
        `</div>`,
      ].join("");
    }
  }
}

async function loadSlackRouting() {
  const [status, channels] = await Promise.all([
    api("/api/slack/status"),
    api(`/api/slack/channels?limit=1200&q=${encodeURIComponent(($("#slack-channel-query")?.value || "").trim())}`),
  ]);
  if (!status.mock && !status.error) state.slack.status = status;
  if (!channels.mock && !channels.error) state.slack.channels = channels.channels || [];
  renderSlackRoutingPanel();
}

function selectSlackChannelsByBucket(bucket) {
  state.slack.filter = bucket;
  state.slack.selectedChannels = new Set(
    slackFilterChannels()
      .filter((channel) => (channel.routing?.channel_bucket || channel.routing?.channel_profile?.channel_bucket || "") === bucket)
      .map((channel) => channel.name)
  );
  renderSlackRoutingPanel();
}

function clearSlackChannelSelection() {
  state.slack.filter = "all";
  state.slack.selectedChannels = new Set();
  renderSlackRoutingPanel();
}

async function runSlackCollection(dryRun = false) {
  const channels = slackSelectedChannels();
  const oldestDays = Number($("#slack-oldest-days")?.value || 2) || 2;
  const limitPerChannel = Number($("#slack-limit-per-channel")?.value || 80) || 80;
  const status = $("#slack-collect-status");
  if (!channels.length) {
    if (status) status.textContent = "수집할 채널을 먼저 선택하세요.";
    return;
  }
  if (status) status.textContent = dryRun ? "Slack 미리보기 수집 중..." : "Slack 2일 수집 실행 중...";
  const result = await api("/api/slack/collect", {
    method: "POST",
    body: JSON.stringify({ channels, oldestDays, limitPerChannel, dryRun }),
  });
  state.slack.lastResult = result;
  if (!result.error) await loadSlackRouting();
  if (status) status.textContent = result.error ? `실패: ${result.error}` : `${dryRun ? "미리보기" : "수집"} 완료`;
  renderSlackRoutingPanel();
}

function spotliteItemHtml(item) {
  return [
    `<article class="spotlite-item spotlite-${escapeHtml(item.kind || "action")}">`,
    `<div><strong>${escapeHtml(item.project || "Wiki")}</strong><span>${escapeHtml(item.kind || "action")} · ${escapeHtml(item.docKind || "page")}</span></div>`,
    `<p>${escapeHtml(item.line || "")}</p>`,
    `<button type="button" data-notion-path="${escapeHtml(item.path || "")}">${escapeHtml(item.title || item.path || "문서 열기")}</button>`,
    `</article>`,
  ].join("");
}

function spotliteLane(title, items, emptyText) {
  return [
    `<section class="spotlite-lane">`,
    `<div class="spotlite-lane-head"><h3>${escapeHtml(title)}</h3><span>${items?.length || 0}건</span></div>`,
    items?.length ? items.map(spotliteItemHtml).join("") : `<div class="spotlite-empty">${escapeHtml(emptyText)}</div>`,
    `</section>`,
  ].join("");
}

function renderSpotlite(scope, payload) {
  const target = scope === "work"
    ? ($("#mission-spotlite-content") || $("#spotlite-work-content"))
    : $(`#spotlite-${scope}-content`);
  if (!target) return;
  if (payload?.error || payload?.mock) {
    target.innerHTML = `<div class="spotlite-empty">Spotlite API 연결 실패: ${escapeHtml(payload.error || "mock")}</div>`;
    return;
  }
  const summary = payload.summary || {};
  target.innerHTML = [
    `<section class="spotlite-summary" data-anchor="주요 분석">`,
    `<article><span>오늘</span><strong>${summary.today || 0}</strong></article>`,
    `<article><span>오늘 위키화</span><strong>${summary.todayUpdates || 0}</strong></article>`,
    `<article><span>이번주</span><strong>${summary.week || 0}</strong></article>`,
    `<article><span>리스크</span><strong>${summary.risks || 0}</strong></article>`,
    `<article><span>진행 프로젝트</span><strong>${summary.ongoingProjects || summary.projects || 0}</strong></article>`,
    `</section>`,
    payload.digest ? [
      `<section class="spotlite-glm-digest">`,
      `<div class="spotlite-lane-head"><h3>GLM 실행 정리</h3><span>${escapeHtml(payload.digest.provider || "glm")} · ${escapeHtml(payload.generatedAt || "")}</span></div>`,
      renderMarkdownDocument(payload.digest.markdown || payload.digest.summaryMarkdown || "GLM 정리 내용이 비어 있습니다."),
      payload.digest.upstreamStatus ? `<p class="spotlite-warning">GLM 상태: ${escapeHtml(payload.digest.upstreamStatus)}</p>` : "",
      `</section>`,
    ].join("") : "",
    `<section class="spotlite-analysis">`,
    `<h3>주요 분석</h3>`,
    `<ul>${(payload.analysis || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    `<small>${escapeHtml(payload.workspace?.label || scope)} · ${escapeHtml(payload.generatedAt || "")}</small>`,
    payload.focus ? `<small>범위: ${escapeHtml(payload.focus.mode)} · 제외: ${escapeHtml(payload.focus.excluded)}</small>` : "",
    `</section>`,
    `<div class="spotlite-grid">`,
    spotliteLane("오늘 위키화/업데이트", payload.today || [], "Python KST 오늘 날짜 기준 새로 위키화/수정된 진행 프로젝트 문서가 없습니다."),
    spotliteLane("이번주 해야 할 일", payload.week || [], "이번주로 명시된 항목이 없습니다. 주간 액션을 허브/Action_Items에 추가하세요."),
    spotliteLane("주요 리스크", payload.risks || [], "감지된 리스크가 없습니다."),
    spotliteLane("운영 메모", payload.memos || [], "허브 운영 메모를 보강하면 진행 맥락이 여기에 모입니다."),
    `</div>`,
    `<section class="spotlite-projects">`,
    `<h3>우선 확인 프로젝트</h3>`,
    (payload.projects || []).map((project) => [
      `<article>`,
      `<strong>${escapeHtml(project.project)}</strong>`,
      `<span>액션 ${project.actions || 0} · 리스크 ${project.risks || 0} · 신호 ${project.count || 0}</span>`,
      `<button type="button" data-notion-path="${escapeHtml(project.latestPath || "")}">관련 문서 열기</button>`,
      `</article>`,
    ].join("")).join("") || `<div class="spotlite-empty">우선순위 프로젝트가 아직 없습니다.</div>`,
    `</section>`,
  ].join("");
  target.querySelectorAll("[data-notion-path]").forEach((button) => {
    button.addEventListener("click", () => {
      activateView("wiki");
      openNotionWikiPage(button.dataset.notionPath);
    });
  });
}

async function loadSpotlite(scope = "work") {
  const target = scope === "work"
    ? ($("#mission-spotlite-content") || $("#spotlite-work-content"))
    : $(`#spotlite-${scope}-content`);
  if (target) target.innerHTML = `<div class="spotlite-empty">Spotlite를 분석하는 중입니다.</div>`;
  const payload = await api(`/api/spotlite?scope=${encodeURIComponent(scope)}`);
  state.spotlite[scope] = payload;
  renderSpotlite(scope, payload);
}

async function refreshSpotliteGlm(scope = "work") {
  const target = scope === "work"
    ? ($("#mission-spotlite-content") || $("#spotlite-work-content"))
    : $(`#spotlite-${scope}-content`);
  if (target) target.insertAdjacentHTML("afterbegin", `<div class="spotlite-empty">GLM이 진행 프로젝트 중심으로 Spotlite를 다시 정리하는 중입니다.</div>`);
  const payload = await api("/api/spotlite/glm-refresh", {
    method: "POST",
    body: JSON.stringify({ scope }),
  });
  state.spotlite[scope] = payload.summary ? { ...payload.summary, digest: payload.digest, generatedAt: payload.generatedAt } : payload;
  renderSpotlite(scope, state.spotlite[scope]);
}

function renderSpotliteTemplates(scope = "work") {
  const container = $(`#spotlite-${scope}-templates`);
  if (!container) return;
  const wanted = scope === "personal"
    ? new Set(["hub_memo", "personal_prompt"])
    : new Set(["hub_memo", "work_prompt"]);
  const templates = (state.spotlite.templates || []).filter((template) => wanted.has(template.id));
  container.innerHTML = templates.length
    ? templates.map((template) => [
        `<article class="spotlite-template-card">`,
        `<div><strong>${escapeHtml(template.title)}</strong><small>${escapeHtml(template.description)}</small></div>`,
        `<pre>${escapeHtml(template.markdown || "")}</pre>`,
        `<button type="button" data-copy-template="${escapeHtml(template.id)}" class="command-button">복사</button>`,
        `</article>`,
      ].join("")).join("")
    : `<div class="spotlite-empty">템플릿을 불러오는 중입니다.</div>`;
  container.querySelectorAll("[data-copy-template]").forEach((button) => {
    button.addEventListener("click", async () => {
      const template = templates.find((item) => item.id === button.dataset.copyTemplate);
      await navigator.clipboard?.writeText(template?.markdown || "");
      button.textContent = "복사됨";
    });
  });
}

async function loadSpotliteTemplates() {
  const payload = await api("/api/spotlite/templates");
  if (payload.error || payload.mock) return;
  state.spotlite.templates = payload.templates || [];
  renderSpotliteTemplates("personal");
}

function renderPersonalLock() {
  const locked = !state.spotlite.personalUnlocked;
  $("#personal-lock-panel")?.classList.toggle("hidden", !locked);
  $("#personal-spotlite-panel")?.classList.toggle("hidden", locked);
  if (!locked && !state.spotlite.personal) loadSpotlite("personal");
}

function unlockPersonalSpotlite() {
  const input = $("#personal-pin-input");
  const value = input?.value.trim() || "";
  if (value === personalSpotlitePin()) {
    state.spotlite.personalUnlocked = true;
    sessionStorage.setItem("spotlite_personal_unlocked", "true");
    $("#personal-lock-status").textContent = "잠금 해제됨";
    renderPersonalLock();
    return;
  }
  $("#personal-lock-status").textContent = "PIN이 맞지 않습니다.";
  input?.select?.();
}

function renderEvents(target, events) {
  const container = $(target);
  container.innerHTML = "";
  events.forEach((event) => {
    const item = document.createElement("article");
    item.className = "event";
    item.innerHTML = `<strong>${event.command}</strong><small>${event.status}</small><p>${event.detail}</p>`;
    container.appendChild(item);
  });
}

function missionLineList(items, emptyText) {
  const values = (items || []).filter(Boolean).slice(0, 4);
  if (!values.length) return `<p class="mission-muted">${escapeHtml(emptyText)}</p>`;
  return `<ul>${values.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`;
}

function renderMissionProjectCard(project) {
  const status = project.workflowStatusLabel || project.workflowStatus || "미지정";
  const docs = (project.coreDocuments || []).slice(0, 3);
  return [
    `<article class="mission-project-card ${project.projectKey === state.activeMissionProjectKey ? "active" : ""}" data-mission-project="${escapeHtml(project.projectKey)}">`,
    `<div class="mission-project-head">`,
    `<div><strong>${escapeHtml(project.projectLabel || project.projectKey)}</strong><small>${escapeHtml(status)} · 데이터확인 ${escapeHtml(project.decisionQueueCount || 0)}건 · ${escapeHtml((project.pages || []).length)}문서</small></div>`,
    `<button class="command-button" type="button" data-mission-open="${escapeHtml(project.projectKey)}">운영 보기</button>`,
    `</div>`,
    `<p>${escapeHtml(project.oneLine || "운영 메모 보강 필요")}</p>`,
    `<div class="mission-card-grid">`,
    `<section><span>다음 액션</span>${missionLineList(project.nextActions, "액션 보강 필요")}</section>`,
    `<section><span>막힘/리스크</span>${missionLineList(project.risks, "명시 막힘 없음")}</section>`,
    `</div>`,
    docs.length ? `<div class="mission-doc-chips">${docs.map((doc) => `<button type="button" data-mission-doc="${escapeHtml(doc.key)}">${escapeHtml(doc.title)} · ${escapeHtml(doc.statusLabel)}</button>`).join("")}</div>` : `<small class="mission-muted">핵심문서 연결 부족</small>`,
    `</article>`,
  ].join("");
}

function renderMissionDetail(project) {
  if (!project) {
    $("#mission-detail-title").textContent = "프로젝트 선택";
    $("#mission-detail-subtitle").textContent = "카드를 누르면 실무 운영 브리핑이 표시됩니다.";
    $("#mission-detail").innerHTML = `<p>오늘 무엇을 밀어야 하는지, 어디가 막혔는지, 어떤 근거로 움직일지 여기서 봅니다.</p>`;
    return;
  }
  $("#mission-detail-title").textContent = project.projectLabel || project.projectKey;
  $("#mission-detail-subtitle").textContent = `${project.workflowStatusLabel || project.workflowStatus || "미지정"} · 마지막 활동 ${project.lastActivityAt?.slice(0, 10) || "알 수 없음"}`;
  $("#mission-detail").innerHTML = [
    `<section><h4>현재 업무상태</h4><p>${escapeHtml(project.oneLine || "운영 메모 보강 필요")}</p></section>`,
    `<section><h4>다음 액션</h4>${missionLineList(project.nextActions, "다음 액션 없음")}</section>`,
    `<section><h4>막힘/리스크</h4>${missionLineList(project.risks, "명시 막힘/리스크 없음")}</section>`,
    `<section><h4>데이터 확인/핵심근거</h4><p>데이터 확인 대기 ${escapeHtml(project.decisionQueueCount || 0)}건 · 핵심문서 ${(project.coreDocuments || []).length}건</p></section>`,
    `<div class="mission-detail-actions">`,
    project.hubPath ? `<button class="command-button" type="button" data-mission-wiki="${escapeHtml(project.hubPath)}">허브 열기</button>` : "",
    `<button class="command-button accent" type="button" data-mission-chat="${escapeHtml(project.projectLabel || project.projectKey)}">GLM 업무 챗으로 논의</button>`,
    `</div>`,
  ].join("");
}

function renderProjectGovernancePanel() {
  const payload = state.projectGovernance;
  const summaryNode = $("#mission-project-governance-summary");
  const listNode = $("#mission-project-governance");
  if (!summaryNode || !listNode) return;
  if (!payload?.summary) {
    summaryNode.textContent = "조회 대기";
    listNode.innerHTML = `<div class="spotlite-empty">업무 보드를 흐릴 수 있는 위키 정합성 이슈를 확인하는 중입니다.</div>`;
    return;
  }
  const summary = payload.summary;
  summaryNode.textContent = `${summary.projectsWithIssues || 0}건 이슈`;
  const problemProjects = (payload.projects || []).filter((project) => (project.issues || []).length).slice(0, 8);
  if (!problemProjects.length) {
    listNode.innerHTML = `<div class="spotlite-empty">업무 보드를 흐릴 만한 위키 정합성 이슈가 없습니다.</div>`;
    return;
  }
  listNode.innerHTML = problemProjects.map((project) => [
    `<article class="event">`,
    `<strong>${escapeHtml(project.projectLabel || project.projectKey)}</strong>`,
    `<small>정합성 이슈 ${escapeHtml(String((project.missingProjectKey || 0) + (project.mismatchedProjectKey || 0)))}건 · 문서 누락 ${escapeHtml(String((project.missingDocs || []).length))}건</small>`,
    `<p>${escapeHtml((project.issues || []).slice(0, 2).map((issue) => issue.message).join(" / ") || "이슈 없음")}</p>`,
    `</article>`,
  ].join("")).join("");
}

function renderMissionControl() {
  const mission = state.mission || { summary: {}, projects: [] };
  const summary = mission.summary || {};
  const coverage = state.coverage || {};
  const projects = mission.projects || [];
  const queue = state.decisionQueue.filter((item) => item.status === "pending");
  const docs = state.coreDocuments;
  const risky = projects.filter((project) => (project.risks || []).length || (project.conflicts || []).length || project.decisionQueueCount);
  const actionProject = projects.find((project) => (project.nextActions || []).length) || projects[0];
  const latestRun = state.automationSnapshot?.running?.[0] || state.automationSnapshot?.runs?.[0] || null;
  $("#mission-answer-today").textContent = actionProject
    ? `${actionProject.projectLabel || actionProject.projectKey}: ${(actionProject.nextActions || [actionProject.oneLine || "운영 메모 보강"])[0]}`
    : "진행 프로젝트/액션 보강 필요";
  $("#mission-answer-evidence").textContent = docs.length
    ? `${docs.length}개 활용 근거 후보 · high ${docs.filter((doc) => doc.priority === "high").length}개`
    : `manifest ${coverage.documentsInManifest || 0}건 · 아직 활용 근거 후보 없음`;
  $("#mission-answer-pending").textContent = queue.length ? `${queue.length}건 데이터 확인 필요` : "데이터 확인 대기 없음";
  $("#mission-answer-risk").textContent = risky.length ? `${risky[0].projectLabel || risky[0].projectKey} 외 ${Math.max(0, risky.length - 1)}건 막힘` : "명시 막힘 없음";
  $("#mission-answer-next").textContent = latestRun?.status === "running"
    ? `${latestRun.command} 진행 중`
    : coverage.documentsInManifest ? "데이터 확인 대기와 다음 액션 검토" : "근거 수집 성공 경험부터 만들기";
  renderMissionPipelineFlow(coverage, latestRun);
  $("#mission-ongoing").textContent = String(summary.ongoing || 0);
  $("#mission-decisions").textContent = String(summary.decisionQueue || state.decisionQueue.filter((item) => item.status === "pending").length || 0);
  $("#mission-core-docs").textContent = String(summary.highPriorityDocuments || state.coreDocuments.filter((item) => item.priority === "high").length || 0);
  $("#mission-coverage").textContent = `${coverage.progressPercent || 0}%`;
  $("#mission-project-count").textContent = `${(mission.projects || []).length}건`;
  $("#mission-projects").innerHTML = projects.length
    ? projects.map(renderMissionProjectCard).join("")
    : `<div class="spotlite-empty">프로젝트 운영 정보가 아직 없습니다. 진행 중 상태와 Hub 운영 메모를 보강하세요.</div>`;
  const active = projects.find((item) => item.projectKey === state.activeMissionProjectKey) || projects[0];
  if (active && !state.activeMissionProjectKey) state.activeMissionProjectKey = active.projectKey;
  renderMissionDetail(active);

  const queueItems = queue.slice(0, 8);
  $("#mission-decision-count").textContent = `${queueItems.length}건`;
  renderEvents("#mission-decision-queue", queueItems.length ? queueItems.map((item) => ({
    command: item.title || item.id,
    status: `data_check · ${item.projectLabel || item.projectKey || "미분류"}`,
    detail: `${escapeHtml(String(item.content || "").slice(0, 180))} <button class="inline-delete" data-decision-approve="${escapeHtml(item.id)}">승인</button> <button class="inline-delete" data-decision-hold="${escapeHtml(item.id)}">보류</button>`,
  })) : [{ command: "데이터 확인 대기 없음", status: "clear", detail: "불일치/충돌 후보가 생기면 여기에 표시됩니다." }]);

  const docItems = docs.slice(0, 8);
  $("#mission-doc-count").textContent = `${docItems.length}건`;
  renderEvents("#mission-core-documents", docItems.length ? docItems.map((doc) => ({
    command: doc.title,
    status: `${doc.priority} · ${doc.statusLabel} · ${doc.projectLabel}`,
    detail: `score ${doc.score} · ${doc.folderPath || "-"} <button class="inline-delete" data-doc-status="${escapeHtml(doc.key)}" data-status="decision_evidence">판단근거</button> <button class="inline-delete" data-doc-status="${escapeHtml(doc.key)}" data-status="in_use">활용중</button>`,
  })) : [{ command: "핵심 근거 후보 없음", status: "manifest 대기", detail: "Drive manifest가 쌓이면 판단 근거 후보가 표시됩니다." }]);

  const usage = state.llmUsage.slice(0, 6);
  $("#mission-llm-count").textContent = `${usage.length}건`;
  renderEvents("#mission-llm-usage", usage.length ? usage.map((item) => ({
    command: item.feature || "glm",
    status: `${item.status} · ${item.model || item.provider || "glm"}`,
    detail: `${item.reason || ""} · ${item.durationMs || 0}ms${item.error ? ` · ${item.error}` : ""}`,
  })) : [{ command: "GLM 호출 없음", status: "local-first", detail: "로컬 규칙으로 가능한 기능은 GLM 없이 동작합니다." }]);
  renderLlmPolicyPanel();
  renderProjectGovernancePanel();

  document.querySelectorAll("[data-mission-open]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeMissionProjectKey = button.dataset.missionOpen;
      renderMissionControl();
    });
  });
  document.querySelectorAll("[data-mission-wiki]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("[data-view='wiki']")?.click();
      openNotionWikiPage(button.dataset.missionWiki);
    });
  });
  document.querySelectorAll("[data-mission-chat]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("[data-view='chat']")?.click();
      $("#chat-input").value = `${button.dataset.missionChat} 프로젝트의 현재 업무상태, 리스크, 다음 액션을 PM 관점으로 정리하고 오늘 추진할 일을 제안해줘.`;
      $("#chat-input").focus();
    });
  });
  document.querySelectorAll("[data-decision-approve]").forEach((button) => {
    button.addEventListener("click", () => resolveDecision(button.dataset.decisionApprove, "approve"));
  });
  document.querySelectorAll("[data-decision-hold]").forEach((button) => {
    button.addEventListener("click", () => resolveDecision(button.dataset.decisionHold, "hold"));
  });
  document.querySelectorAll("[data-doc-status]").forEach((button) => {
    button.addEventListener("click", () => updateDocumentStatus(button.dataset.docStatus, button.dataset.status));
  });
  document.querySelectorAll("[data-llm-policy-apply]").forEach((button) => {
    button.addEventListener("click", () => applyLlmPolicy(button.dataset.llmPolicyApply));
  });
}

function renderLlmPolicyPanel() {
  const policies = state.llmPolicies || [];
  const count = $("#mission-llm-policy-count");
  const list = $("#mission-llm-policy-list");
  if (count) count.textContent = `${policies.length}개`;
  if (!list) return;
  if (!policies.length) {
    list.innerHTML = `<div class="spotlite-empty">LLM 정책 API 연결 대기 중입니다.</div>`;
    return;
  }
  list.innerHTML = policies.map((policy) => {
    const classLabel = policy.modelClass === "light" ? "경량" : policy.modelClass === "hybrid" ? "혼합" : "일반";
    const env = (policy.envKeys || []).join(", ");
    const prompt = String(policy.prompt || "").slice(0, 900);
    return [
      `<article class="llm-policy-card ${escapeHtml(policy.modelClass || "general")}">`,
      `<div class="llm-policy-head">`,
      `<div><strong>${escapeHtml(policy.title || policy.id)}</strong><small>${escapeHtml(policy.surface || "")} · ${escapeHtml(classLabel)} · 최근 ${escapeHtml(String(policy.usageCount || 0))}회</small></div>`,
      `<span>${escapeHtml(policy.currentModel || "-")}</span>`,
      `</div>`,
      `<p>${escapeHtml(policy.purpose || "")}</p>`,
      `<div class="llm-policy-meta">추천 ${escapeHtml(policy.recommendedModel || "-")} · tokens ${escapeHtml(String(policy.maxTokens || "-"))} · thinking ${escapeHtml(policy.thinking || "-")}</div>`,
      `<details>`,
      `<summary>전용 프롬프트 보기</summary>`,
      `<pre>${escapeHtml(prompt)}</pre>`,
      `</details>`,
      `<div class="llm-policy-actions">`,
      `<small>${escapeHtml(env)}</small>`,
      `<button class="inline-delete" data-llm-policy-apply="${escapeHtml(policy.id)}">추천 설정 저장</button>`,
      `</div>`,
      `</article>`,
    ].join("");
  }).join("");
}

async function applyLlmPolicy(policyId) {
  const policy = (state.llmPolicies || []).find((item) => item.id === policyId);
  if (!policy?.applySettings) return;
  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify({ settings: policy.applySettings }),
  });
  if (result.error) {
    $("#settings-status").textContent = `LLM 정책 저장 실패: ${result.error}`;
    return;
  }
  $("#settings-status").textContent = `LLM 정책 저장 완료: ${policy.title}`;
  await loadSettings();
  await loadLlmPolicies();
  renderMissionControl();
}

function pendingDecisionItems() {
  return state.decisionQueue.filter((item) => item.status === "pending");
}

function resolvedDecisionItems() {
  return state.decisionQueue.filter((item) => item.status && item.status !== "pending");
}

function decisionProject(projectKey) {
  return (state.mission?.projects || []).find((project) => project.projectKey === projectKey) || null;
}

function normalizedText(value = "") {
  return String(value).toLowerCase().replace(/[\s_-]+/g, "");
}

function setDecisionChatDirective(value, persist = true) {
  state.decisionChatDirective = value;
  if (persist) localStorage.setItem("wiki_ops_decision_chat_directive", value);
  const input = $("#decision-chat-directive");
  if (input && input.value !== value) input.value = value;
}

function ensureActiveDecision() {
  const queue = pendingDecisionItems();
  if (!queue.length) {
    state.activeDecisionId = "";
    return null;
  }
  const active = queue.find((item) => item.id === state.activeDecisionId) || queue[0];
  state.activeDecisionId = active.id;
  return active;
}

function decisionStatusLabel(item) {
  if (!item) return "미선택";
  const source = item.sourceType === "knowledge_promotion" ? "지식승격" : item.sourceType === "wiki_signal" ? "위키 신호" : item.sourceType || "manual";
  const kind = isConflictDecision(item) ? "data_conflict" : "wiki_consistency";
  return `${kind} · ${source}`;
}

function decisionPrimaryPath(project, item) {
  return item?.path || project?.hubPath || "";
}

function findChatProjectForDecision(item = {}, project = null) {
  const projects = chatProjectsForSpace();
  if (!projects.length) return null;
  const candidates = [
    item.projectLabel,
    project?.projectLabel,
    item.projectKey,
    project?.projectKey,
  ].filter(Boolean);
  const normalizedCandidates = candidates.map((value) => normalizedText(value)).filter(Boolean);
  return projects.find((chatProject) => normalizedCandidates.some((candidate) => {
    const projectName = normalizedText(chatProject.name || "");
    return projectName === candidate || projectName.includes(candidate) || candidate.includes(projectName);
  })) || projects[0] || null;
}

function buildDecisionChatPrompt(item = {}, project = null, directive = "") {
  const contentItems = decisionContentItems(item.content);
  const conflicts = (project?.conflicts || []).slice(0, 5);
  const coreDocs = (project?.coreDocuments || []).slice(0, 5);
  const targetFile = decisionApplyTargetFile(item);
  const instruction = directive.trim() || "근거 충돌을 비교하고 Conflict_Register.md에 남길 병합안과 보류 조건만 짧게 제안해줘.";
  return JSON.stringify({
    task: "decision_deck_lightweight_triage",
    instruction,
    card: {
      id: item.id || "",
      title: item.title || "",
      projectKey: item.projectKey || project?.projectKey || "",
      projectLabel: item.projectLabel || project?.projectLabel || "",
      sourceType: item.sourceType || "",
      sourcePath: item.path || "",
      targetFile,
      content: contentItems.length ? contentItems : [item.content || "내용 없음"],
    },
    context: {
      oneLine: project?.oneLine || "",
      existingConflicts: conflicts,
      coreDocuments: coreDocs.map((doc) => ({ title: doc.title || doc.key || "", path: doc.path || doc.key || "" })),
    },
    outputContract: [
      "판정: approve | hold | investigate",
      "충돌 요약: 2줄 이하",
      "권장 처리: 3개 이하",
      "Conflict_Register 반영 문구: 바로 붙여넣을 Markdown bullet",
      "확인할 근거 path: 3개 이하",
    ],
  });
}

function renderDecisionInferencePanel() {
  const panel = $("#decision-llm-output");
  if (!panel) return;
  const active = ensureActiveDecision();
  const inference = state.decisionInference;
  if (!active) {
    panel.className = "decision-llm-output";
    panel.innerHTML = `<strong>GLM 응답 대기</strong><p>정합성 카드를 선택하면 이 안에서 바로 추론할 수 있습니다.</p>`;
    return;
  }
  const belongsToActive = inference.itemId === active.id;
  if (inference.busy && belongsToActive) {
    panel.className = "decision-llm-output pending";
    panel.innerHTML = [
      `<strong>${escapeHtml(inference.status || "GLM 추론 중…")}</strong>`,
      inference.content ? `<div class="decision-llm-body">${renderMarkdownDocument(inference.content)}</div>` : `<p>근거 비교와 병합안을 생성하는 중입니다.</p>`,
    ].join("");
    return;
  }
  if (inference.error && belongsToActive) {
    panel.className = "decision-llm-output warning";
    panel.innerHTML = `<strong>GLM 추론 실패</strong><p>${escapeHtml(inference.error)}</p>`;
    return;
  }
  if (inference.content && belongsToActive) {
    const recommended = decisionInferenceRecommendedAction(inference.content);
    panel.className = "decision-llm-output success";
    panel.innerHTML = [
      `<strong>${escapeHtml(inference.status || "GLM 추론 완료")}</strong>`,
      `<div class="decision-llm-body">${renderMarkdownDocument(inference.content)}</div>`,
      `<div class="decision-llm-actions">`,
      `<button class="command-button accent" type="button" data-decision-inference-apply="${escapeHtml(recommended)}">추천대로 반영 (${escapeHtml(decisionActionLabel(recommended))})</button>`,
      `<button class="command-button" type="button" data-decision-inference-apply="hold">보류로 반영</button>`,
      `<button class="command-button" type="button" data-decision-inference-apply="investigate">추가 조사로 반영</button>`,
      `</div>`,
      `<small>반영하면 이 GLM 응답이 처리 메모로 함께 저장되고 다음 카드로 이동합니다.</small>`,
    ].join("");
    panel.querySelectorAll("[data-decision-inference-apply]").forEach((button) => {
      button.addEventListener("click", () => applyDecisionInference(button.dataset.decisionInferenceApply));
    });
    return;
  }
  if (inference.content && !belongsToActive) {
    panel.className = "decision-llm-output";
    panel.innerHTML = `<strong>현재 카드 응답 없음</strong><p>이전 카드의 GLM 응답은 보존되어 있습니다. 현재 카드에서 새로 추론하려면 지시를 실행하세요.</p>`;
    return;
  }
  panel.className = "decision-llm-output";
  panel.innerHTML = `<strong>GLM 응답 대기</strong><p>지시를 입력하고 Enter 또는 버튼을 누르면 이 카드 안에서 바로 추론합니다.</p>`;
}

function decisionInferenceRecommendedAction(content = "") {
  const text = String(content || "").toLowerCase();
  const firstLine = text.split("\n").find((line) => /판정|decision|recommend|권장/.test(line)) || text.slice(0, 240);
  if (/investigate|추가\s*조사|조사/.test(firstLine)) return "investigate";
  if (/hold|보류|대기|확인\s*필요/.test(firstLine)) return "hold";
  if (/approve|승인|반영/.test(firstLine)) return "approve";
  return "hold";
}

function decisionActionLabel(action = "") {
  if (action === "approve") return "승인 반영";
  if (action === "investigate") return "추가 조사";
  return "보류";
}

function applyDecisionInference(action = "") {
  const active = ensureActiveDecision();
  if (!active || state.decisionPending.busy || state.decisionInference.busy) return;
  if (state.decisionInference.itemId !== active.id || !state.decisionInference.content.trim()) return;
  resolveActiveDecision(["approve", "hold", "investigate"].includes(action) ? action : decisionInferenceRecommendedAction(state.decisionInference.content));
}

async function runDecisionInference(item = null, directive = "") {
  if (state.decisionPending.busy || state.decisionInference.busy) return;
  const activeItem = item || ensureActiveDecision();
  if (!activeItem) return;
  await ensureActiveChatProject();
  const project = decisionProject(activeItem.projectKey);
  const matchedProject = findChatProjectForDecision(activeItem, project);
  const projectId = matchedProject?.id || state.activeChatProjectId || "default";
  const message = buildDecisionChatPrompt(activeItem, project, directive || state.decisionChatDirective);
  state.decisionInference = {
    busy: true,
    itemId: activeItem.id,
    status: "GLM 연결 준비 중",
    content: "",
    thinking: "",
    error: "",
    assistantId: "",
  };
  renderDecisionInferencePanel();
  setDecisionDeckControlsDisabled(true);
  try {
    await apiStream("/api/chat/glm/stream", {
      message,
      projectId,
      workspace: wikiWorkspaceParam(),
      profile: "decision_triage",
      contextMode: "economy",
      transient: true,
      skillTags: state.chatSelectedSkillTags || [],
    }, {
      status: (data) => {
        state.decisionInference.status = `경량 판정 모델 연결됨: ${data.model || "glm-4.5-air"} · ${data.maxTokens || "short"} tokens`;
        renderDecisionInferencePanel();
      },
      delta: (data) => {
        state.decisionInference.content += data.content || "";
        state.decisionInference.status = "응답 생성 중";
        renderDecisionInferencePanel();
      },
      paperclip: (data) => {
        const drafts = data.paperclip?.agentDrafts?.length || 0;
        const autoRuns = data.paperclip?.autoRuns?.length || 0;
        state.decisionInference.status = `Paperclip context 반영: draft ${drafts} · read ${autoRuns}`;
        renderDecisionInferencePanel();
      },
      done: (data) => {
        state.decisionInference.assistantId = data.messages?.assistant?.id || "";
        state.decisionInference.status = data.status === "stopped" ? "GLM 추론 중지됨" : "GLM 추론 완료";
      },
      error: (data) => {
        state.decisionInference.error = data.error || "GLM 추론 실패";
      },
    });
  } catch (error) {
    state.decisionInference.error = error.message;
  } finally {
    state.decisionInference.busy = false;
    renderDecisionInferencePanel();
    renderDecisionWorkbench();
  }
}

function decisionApplyTargetFile(item = {}) {
  const text = `${item.kind || ""} ${item.title || ""} ${item.content || ""}`.toLowerCase();
  if (/conflict|충돌|불일치|상이|미확정|버전 차이|값 차이/.test(text)) return "Conflict_Register.md";
  return "Conflict_Register.md";
}

function decisionSourceLabel(item = {}) {
  if (item.sourceType === "knowledge_promotion") return "지식승격 후보";
  if (item.sourceType === "wiki_signal") return "프로젝트 위키 신호";
  if (item.sourceType === "paperclip_task") return "Paperclip 검토결과";
  return item.sourceType || "manual";
}

function isConflictDecision(item = {}) {
  return /conflict|충돌|불일치|상이|미확정/.test(`${item.kind || ""} ${item.title || ""} ${item.content || ""}`.toLowerCase());
}

function decisionConflictGuide(item = {}, project = null) {
  const text = `${item.kind || ""} ${item.title || ""} ${item.content || ""}`.toLowerCase();
  if (!/conflict|충돌|불일치|상이|미확정/.test(text)) return [];
  return [
    "근거 문서와 현재 위키 내용을 나란히 열어 어떤 데이터가 충돌하는지 먼저 확인합니다.",
    "최신값이나 더 신뢰할 출처가 확실하면 승인 반영으로 `Conflict_Register.md`에 근거와 함께 남깁니다.",
    "판단이 어려우면 보류 또는 추가 조사로 넘기고, 어떤 값이 미확정인지 메모합니다.",
    project?.hubPath ? "허브와 Conflict Register를 함께 보고 다른 문서에도 같은 값이 퍼져 있는지 확인합니다." : "같은 프로젝트의 관련 문서에도 동일 충돌이 있는지 확인합니다.",
  ];
}

function decisionContentItems(content = "") {
  return String(content || "")
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 6);
}

function decisionTargetPath(project, item) {
  const targetFile = decisionApplyTargetFile(item);
  const hubPath = project?.hubPath || "";
  if (hubPath) return hubPath.replace(/hub\.md$/i, targetFile);
  if (project?.projectKey) {
    const root = state.activeSpace === "personal" ? "obsidian/Personal_Wiki" : "obsidian/Wiki";
    return `${root}/${project.projectKey}/${targetFile}`;
  }
  return "";
}

function renderDecisionCompareTargetPreview() {
  const preview = $("#decision-compare-target-preview");
  if (!preview) return;
  preview.innerHTML = renderMarkdownDocument($("#decision-compare-target-editor")?.value || "문서 내용이 비어 있습니다.");
}

function renderDecisionMergeSuggestion() {
  const panel = $("#decision-compare-merge-panel");
  const body = $("#decision-compare-merge-body");
  const meta = $("#decision-compare-merge-meta");
  const applyButton = $("#decision-compare-apply-merge");
  if (!panel || !body || !meta || !applyButton) return;
  const suggestion = state.decisionCompare.mergeSuggestion;
  panel.hidden = !suggestion && !state.decisionCompare.mergePending;
  applyButton.disabled = !suggestion?.mergedMarkdown || state.decisionCompare.mergePending || state.decisionPending.busy || state.decisionInference.busy;
  if (state.decisionCompare.mergePending) {
    meta.textContent = "GLM 분석 중";
    body.innerHTML = `<p class="pipeline-note">출처와 대상 문서를 비교해 병합안과 확인 포인트를 생성하고 있습니다.</p>`;
    return;
  }
  if (!suggestion) {
    meta.textContent = "대기 중";
    body.innerHTML = `<p class="pipeline-note">사용자가 요청하면 GLM이 충돌 요약과 병합 초안을 제안합니다.</p>`;
    return;
  }
  meta.textContent = `${suggestion.provider || "glm"}${suggestion.model ? ` · ${suggestion.model}` : ""}${suggestion.endpoint ? ` · ${suggestion.endpoint}` : ""}`;
  body.innerHTML = [
    suggestion.summary ? `<section><strong>요약</strong><p>${escapeHtml(suggestion.summary)}</p></section>` : "",
    suggestion.conflictingPoints?.length ? `<section><strong>충돌 포인트</strong><ul>${suggestion.conflictingPoints.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></section>` : "",
    suggestion.mergeStrategy?.length ? `<section><strong>병합 전략</strong><ul>${suggestion.mergeStrategy.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></section>` : "",
    suggestion.caution ? `<section><strong>주의</strong><p>${escapeHtml(suggestion.caution)}</p></section>` : "",
    suggestion.mergedMarkdown ? `<section><strong>추천 병합 초안</strong>${renderMarkdownDocument(suggestion.mergedMarkdown)}</section>` : "",
  ].filter(Boolean).join("");
}

function setDecisionDeckControlsDisabled(disabled) {
  [
    "#decision-prev",
    "#decision-next",
    "#decision-hold",
    "#decision-approve",
    "#decision-chat-open",
    "#decision-chat-preset-approve",
    "#decision-chat-preset-hold",
    "#decision-chat-preset-investigate",
    "#decision-chat-preset-plan",
    "#decision-compare-open-source",
    "#decision-compare-open-target",
    "#decision-compare-glm-merge",
    "#decision-compare-copy-source",
    "#decision-compare-save-target",
    "#decision-compare-approve",
    "#decision-compare-apply-merge",
  ].forEach((selector) => {
    const node = $(selector);
    if (node) node.disabled = disabled;
  });
  const editor = $("#decision-compare-target-editor");
  if (editor) editor.disabled = disabled;
  const directiveInput = $("#decision-chat-directive");
  if (directiveInput) directiveInput.disabled = disabled;
}

function activeDecisionInferenceNote(itemId = "") {
  const inference = state.decisionInference;
  if (!itemId || inference.itemId !== itemId || !inference.content.trim()) return "";
  return [
    "[GLM 정합성 검토]",
    inference.content.trim(),
  ].join("\n");
}

function renderDecisionActivityStrip() {
  const node = $("#decision-activity-strip");
  if (!node) return;
  if (state.decisionPending.busy) {
    node.className = "decision-activity-strip panel pending";
    node.innerHTML = `<strong>처리 중…</strong><p>${escapeHtml(state.decisionPending.action || "결정 처리")} · 현재 카드와 큐를 잠시 동기화하고 있습니다.</p>`;
    return;
  }
  if (state.decisionLastResolution) {
    node.className = `decision-activity-strip panel ${state.decisionLastResolution.ok ? "success" : "warning"}`;
    node.innerHTML = `<strong>${escapeHtml(state.decisionLastResolution.title)}</strong><p>${escapeHtml(state.decisionLastResolution.detail)}</p>`;
    return;
  }
  node.className = "decision-activity-strip panel";
  node.innerHTML = `<strong>대기 중</strong><p>카드를 처리하면 결과와 다음 상태가 여기에 표시됩니다.</p>`;
}

async function openDecisionEvidenceModal(path) {
  if (!path) return;
  state.activeDecisionEvidencePath = path;
  const modal = $("#decision-evidence-modal");
  $("#decision-evidence-title").textContent = "근거 문서";
  $("#decision-evidence-path").textContent = path;
  $("#decision-evidence-content").innerHTML = `<div class="notion-details-placeholder"><p>문서를 불러오는 중입니다.</p></div>`;
  if (typeof modal?.showModal === "function") modal.showModal();
  else modal?.setAttribute("open", "open");
  const payload = await api(`/api/wiki/page?path=${encodeURIComponent(path)}`);
  if (payload.error || payload.mock) {
    $("#decision-evidence-content").innerHTML = `<div class="notion-details-placeholder"><p>${escapeHtml(payload.error || "문서 API 연결 대기")}</p></div>`;
    return;
  }
  $("#decision-evidence-title").textContent = payload.title || path.split("/").at(-1) || "근거 문서";
  $("#decision-evidence-path").textContent = payload.path || path;
  $("#decision-evidence-content").innerHTML = renderMarkdownDocument(payload.markdown || "문서 내용이 비어 있습니다.");
}

function closeDecisionEvidenceModal() {
  const modal = $("#decision-evidence-modal");
  if (!modal) return;
  if (typeof modal.close === "function") modal.close();
  else modal.removeAttribute("open");
}

async function openDecisionCompareModal(itemId = "") {
  if (state.decisionPending.busy || state.decisionInference.busy) return;
  const item = state.decisionQueue.find((entry) => entry.id === (itemId || state.activeDecisionId));
  if (!item) return;
  const project = decisionProject(item.projectKey);
  const sourcePath = decisionPrimaryPath(project, item);
  const targetPath = decisionTargetPath(project, item);
  state.decisionCompare = {
    itemId: item.id,
    sourcePath,
    targetPath,
    sourceMarkdown: "",
    targetMarkdown: "",
    mergePending: false,
    mergeSuggestion: null,
  };
  $("#decision-compare-title").textContent = item.title || "충돌 비교";
  $("#decision-compare-summary").textContent = item.content || "출처와 반영 대상 문서를 동시에 확인하세요.";
  $("#decision-compare-source-path").textContent = sourcePath || "출처 경로 없음";
  $("#decision-compare-target-path").textContent = targetPath || "대상 경로 없음";
  $("#decision-compare-source").innerHTML = `<div class="notion-details-placeholder"><p>출처 문서를 불러오는 중입니다.</p></div>`;
  $("#decision-compare-target-editor").value = "";
  $("#decision-compare-target-preview").innerHTML = `<div class="notion-details-placeholder"><p>대상 문서를 불러오는 중입니다.</p></div>`;
  $("#decision-compare-status").textContent = "비교 후 채택 또는 수정 저장을 선택하세요.";
  renderDecisionMergeSuggestion();
  const modal = $("#decision-compare-modal");
  if (typeof modal?.showModal === "function") modal.showModal();
  else modal?.setAttribute("open", "open");

  const [sourcePayload, targetPayload] = await Promise.all([
    sourcePath ? api(`/api/wiki/page?path=${encodeURIComponent(sourcePath)}`) : Promise.resolve({ error: "출처 경로 없음" }),
    targetPath ? api(`/api/wiki/page?path=${encodeURIComponent(targetPath)}`) : Promise.resolve({ markdown: "", path: targetPath }),
  ]);

  if (sourcePayload.error || sourcePayload.mock) {
    $("#decision-compare-source").innerHTML = `<div class="notion-details-placeholder"><p>${escapeHtml(sourcePayload.error || "출처 문서 API 연결 대기")}</p></div>`;
  } else {
    state.decisionCompare.sourceMarkdown = sourcePayload.markdown || "";
    $("#decision-compare-source").innerHTML = renderMarkdownDocument(sourcePayload.markdown || "출처 문서 내용이 비어 있습니다.");
    $("#decision-compare-source-path").textContent = sourcePayload.path || sourcePath;
  }

  state.decisionCompare.targetMarkdown = targetPayload.error ? "" : (targetPayload.markdown || "");
  $("#decision-compare-target-editor").value = state.decisionCompare.targetMarkdown;
  $("#decision-compare-target-path").textContent = targetPayload.path || targetPath || "대상 경로 없음";
  renderDecisionCompareTargetPreview();
  renderDecisionMergeSuggestion();
  $("#decision-compare-status").textContent = targetPayload.error
    ? "대상 문서가 아직 없거나 불러오지 못했습니다. 우측에서 바로 새로 작성할 수 있습니다."
    : "좌측 근거와 우측 위키 문서를 비교한 뒤, 복사 또는 직접 수정 후 저장하세요.";
}

function closeDecisionCompareModal() {
  const modal = $("#decision-compare-modal");
  if (!modal) return;
  if (typeof modal.close === "function") modal.close();
  else modal.removeAttribute("open");
}

async function requestDecisionMergeSuggestion() {
  if (state.decisionPending.busy || state.decisionInference.busy || state.decisionCompare.mergePending) return;
  const item = state.decisionQueue.find((entry) => entry.id === state.decisionCompare.itemId) || {};
  state.decisionCompare.mergePending = true;
  renderDecisionMergeSuggestion();
  $("#decision-compare-status").textContent = "GLM 병합안을 생성 중입니다.";
  const result = await api("/api/wiki/conflict-merge", {
    method: "POST",
    body: JSON.stringify({
      id: state.decisionCompare.itemId,
      title: item.title || "",
      content: item.content || "",
      projectKey: item.projectKey || "",
      projectLabel: item.projectLabel || "",
      sourcePath: state.decisionCompare.sourcePath,
      targetPath: state.decisionCompare.targetPath,
      sourceMarkdown: state.decisionCompare.sourceMarkdown,
      targetMarkdown: $("#decision-compare-target-editor")?.value || "",
      workspace: wikiWorkspaceParam(),
    }),
  });
  state.decisionCompare.mergePending = false;
  if (result.error || result.mock) {
    state.decisionCompare.mergeSuggestion = {
      provider: "fallback",
      summary: `병합안 생성 실패: ${result.error || "API 연결 대기"}`,
      conflictingPoints: [],
      mergeStrategy: ["출처와 대상 문서를 다시 확인한 뒤 수동으로 병합 여부를 판단하세요."],
      caution: "GLM 결과를 받지 못했습니다.",
      mergedMarkdown: "",
    };
    $("#decision-compare-status").textContent = `병합안 생성 실패: ${result.error || "API 연결 대기"}`;
    renderDecisionMergeSuggestion();
    return;
  }
  state.decisionCompare.mergeSuggestion = result;
  $("#decision-compare-status").textContent = "GLM 병합안이 준비되었습니다.";
  renderDecisionMergeSuggestion();
}

function applyDecisionMergeSuggestion() {
  const merged = state.decisionCompare.mergeSuggestion?.mergedMarkdown || "";
  if (!merged) return;
  $("#decision-compare-target-editor").value = merged;
  renderDecisionCompareTargetPreview();
  $("#decision-compare-status").textContent = "GLM 병합 초안을 우측 편집기에 반영했습니다. 검토 후 저장하세요.";
}

async function saveDecisionCompareTarget() {
  if (state.decisionPending.busy || state.decisionInference.busy) return false;
  const path = state.decisionCompare.targetPath;
  if (!path) {
    $("#decision-compare-status").textContent = "대상 경로가 없어 저장할 수 없습니다.";
    return false;
  }
  const markdown = $("#decision-compare-target-editor")?.value || "";
  $("#decision-compare-status").textContent = "우측 문서를 저장 중입니다.";
  const result = await api("/api/wiki/page", {
    method: "PUT",
    body: JSON.stringify({ path, markdown }),
  });
  if (result.error || result.mock) {
    $("#decision-compare-status").textContent = `저장 실패: ${result.error || "API 연결 대기"}`;
    return false;
  }
  state.decisionCompare.targetMarkdown = markdown;
  $("#decision-compare-status").textContent = "우측 문서를 저장했습니다.";
  await loadNotionWikiBrowser();
  return true;
}

function copyDecisionSourceToTarget() {
  $("#decision-compare-target-editor").value = state.decisionCompare.sourceMarkdown || "";
  renderDecisionCompareTargetPreview();
  $("#decision-compare-status").textContent = "출처 문서를 우측 편집기에 복사했습니다.";
}

function renderDecisionWorkbench() {
  const queue = pendingDecisionItems();
  const resolved = resolvedDecisionItems();
  const active = ensureActiveDecision();
  const busy = state.decisionPending.busy || state.decisionInference.busy;
  const activeIndex = active ? queue.findIndex((item) => item.id === active.id) : -1;
  $("#decision-summary-pending").textContent = String(queue.length);
  $("#decision-summary-approved").textContent = String(resolved.filter((item) => item.status === "approved").length);
  $("#decision-summary-held").textContent = String(resolved.filter((item) => ["hold", "needs_investigation", "rejected"].includes(item.status)).length);
  $("#decision-summary-index").textContent = queue.length ? `${activeIndex + 1} / ${queue.length}` : "0 / 0";
  $("#decision-queue-count").textContent = `${queue.length}건`;
  $("#decision-stage-status").textContent = busy
    ? `${state.decisionPending.action || "처리"} 진행 중`
    : active ? `${activeIndex + 1}번째 카드` : "대기 없음";
  setDecisionDeckControlsDisabled(busy || !queue.length);
  renderDecisionActivityStrip();
  setDecisionChatDirective(state.decisionChatDirective, false);
  renderDecisionInferencePanel();
  const decisionChatOpen = $("#decision-chat-open");
  if (decisionChatOpen) {
    decisionChatOpen.textContent = active
      ? `${active.projectLabel || active.projectKey || "현재 카드"} 덱 안에서 추론`
      : "덱 안에서 추론";
  }

  const stack = $("#decision-card-stack");
  if (!stack) return;
  if (!active) {
    stack.innerHTML = `<div class="decision-empty"><strong>정합성 대기 없음</strong><p>데이터 충돌이나 출처 불일치가 생기면 여기서 한 장씩 검수합니다.</p></div>`;
    $("#decision-context-project").textContent = "미선택";
    $("#decision-context").innerHTML = `<p>카드를 선택하면 연결 프로젝트의 충돌 기록과 관련 핵심문서를 표시합니다.</p>`;
  } else {
    const project = decisionProject(active.projectKey);
    const sourcePath = decisionPrimaryPath(project, active);
    const contentItems = decisionContentItems(active.content);
    const coreDocs = (project?.coreDocuments || []).slice(0, 4);
    const projectDecisions = (project?.decisions || []).slice(0, 3);
    const recentMemos = (project?.recentMemos || []).slice(0, 3);
    const targetFile = decisionApplyTargetFile(active);
    const conflictGuide = decisionConflictGuide(active, project);
    const preview = queue.filter((item) => item.id !== active.id).slice(0, 2);
    stack.innerHTML = [
      preview.map((item, index) => [
        `<article class="decision-preview-card preview-${index + 1}">`,
        `<strong>${escapeHtml(item.title || item.id)}</strong>`,
        `<small>${escapeHtml(item.projectLabel || item.projectKey || "미분류")} · ${escapeHtml(decisionStatusLabel(item))}</small>`,
        `</article>`,
      ].join("")).join(""),
      `<article class="decision-card">`,
      `<div class="decision-card-head">`,
      `<div><span class="decision-chip">${escapeHtml(decisionStatusLabel(active))}</span><h4>${escapeHtml(active.title || active.id)}</h4><p class="decision-headline">${escapeHtml(project?.oneLine || active.projectLabel || active.projectKey || "프로젝트 요약 없음")}</p></div>`,
      `<div class="decision-head-side"><strong>${escapeHtml(active.projectLabel || project?.projectLabel || active.projectKey || "미분류")}</strong><small>${escapeHtml(project?.workflowStatusLabel || project?.workflowStatus || "상태 미지정")} · 대기 ${escapeHtml(project?.decisionQueueCount || 1)}건</small></div>`,
      `</div>`,
      `<div class="decision-card-grid">`,
      `<section class="decision-card-panel emphasis"><span>판단 내용</span>${contentItems.length ? `<ul>${contentItems.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : `<p>${escapeHtml(active.content || "내용 없음")}</p>`}</section>`,
      `<section class="decision-card-panel"><span>승인 시 반영</span><p>${escapeHtml(targetFile)}</p><small>${escapeHtml(project?.projectLabel || active.projectLabel || active.projectKey || "해당 프로젝트")}에 append 됩니다.</small></section>`,
      `</div>`,
      `<div class="decision-card-meta">`,
      `<span>생성 ${escapeHtml((active.createdAt || "").slice(0, 10) || "unknown")} · 출처 ${escapeHtml(decisionSourceLabel(active))}</span>`,
      `<span>승인 시 반영 파일 ${escapeHtml(targetFile)}</span>`,
      sourcePath ? `<button class="command-button" type="button" data-decision-open-path="${escapeHtml(sourcePath)}" ${busy ? "disabled" : ""}>근거 열기</button>` : "",
      `</div>`,
      `<div class="decision-signal-grid">`,
      `<section class="decision-card-panel"><span>기존 충돌 기록</span>${missionLineList(project?.conflicts, "기존 충돌 기록 없음")}</section>`,
      `<section class="decision-card-panel"><span>관련 핵심문서</span>${coreDocs.length ? `<ul>${coreDocs.map((doc) => `<li>${escapeHtml(doc.title || doc.key || "문서")} ${doc.path ? `· ${escapeHtml(doc.path)}` : ""}</li>`).join("")}</ul>` : `<p class="mission-muted">연결 핵심문서 없음</p>`}</section>`,
      `</div>`,
      conflictGuide.length ? `<div class="decision-card-panel guide"><span>Conflict 대처 가이드</span><ul>${conflictGuide.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></div>` : "",
      `<div class="decision-signal-grid">`,
      `<section class="decision-card-panel"><span>최근 확정/판단</span>${projectDecisions.length ? `<ul>${projectDecisions.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : `<p class="mission-muted">명시된 최근 결정 없음</p>`}</section>`,
      `<section class="decision-card-panel"><span>최근 운영 메모</span>${recentMemos.length ? `<ul>${recentMemos.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : `<p class="mission-muted">최근 메모 없음</p>`}</section>`,
      `</div>`,
      coreDocs.length ? `<div class="decision-card-panel"><span>연결 핵심문서</span><div class="decision-doc-chips">${coreDocs.map((doc) => `<button type="button" data-decision-doc="${escapeHtml(doc.key)}">${escapeHtml(doc.title)} · ${escapeHtml(doc.statusLabel || doc.priority || "")}</button>`).join("")}</div></div>` : "",
      `<div class="decision-card-actions">`,
      `<button class="command-button" type="button" data-decision-chat="${escapeHtml(active.projectLabel || project?.projectLabel || active.projectKey || "미분류")}" ${busy ? "disabled" : ""}>덱 추론</button>`,
      project?.hubPath ? `<button class="command-button" type="button" data-decision-hub="${escapeHtml(project.hubPath)}" ${busy ? "disabled" : ""}>허브 열기</button>` : "",
      isConflictDecision(active) ? `<button class="command-button" type="button" data-decision-compare="${escapeHtml(active.id)}" ${busy ? "disabled" : ""}>충돌 비교</button>` : "",
      `<button class="command-button" type="button" data-decision-investigate="${escapeHtml(active.id)}" ${busy ? "disabled" : ""}>추가 조사</button>`,
      `</div>`,
      `</article>`,
    ].join("");

    $("#decision-context-project").textContent = project?.projectLabel || active.projectLabel || active.projectKey || "미분류";
    $("#decision-context").innerHTML = project ? [
      `<section><h4>한 줄 상태</h4><p>${escapeHtml(project.oneLine || "위키 요약 보강 필요")}</p></section>`,
      `<section><h4>Conflict Register</h4>${missionLineList(project.conflicts, "명시 충돌 없음")}</section>`,
      `<section><h4>관련 핵심문서</h4>${coreDocs.length ? `<ul>${coreDocs.map((doc) => `<li>${escapeHtml(doc.title || doc.key || "문서")}</li>`).join("")}</ul>` : `<p class="mission-muted">연결 핵심문서 없음</p>`}</section>`,
      `<section><h4>정합성/문서</h4><p>정합성 대기 ${escapeHtml(project.decisionQueueCount || 0)}건 · 핵심문서 ${escapeHtml((project.coreDocuments || []).length)}건</p></section>`,
    ].join("") : `<p>연결된 프로젝트 요약이 아직 없습니다. 필요하면 위키 허브나 GLM 논의로 분기하세요.</p>`;
  }

  $("#decision-queue-rail").innerHTML = queue.length ? queue.map((item, index) => [
    `<button class="decision-rail-item ${item.id === state.activeDecisionId ? "active" : ""} ${item.id === state.decisionPending.itemId ? "resolving" : ""}" type="button" data-decision-focus="${escapeHtml(item.id)}" ${busy ? "disabled" : ""}>`,
    `<strong>${index + 1}. ${escapeHtml(item.projectLabel || item.projectKey || "미분류")}</strong>`,
    `<small>${escapeHtml(item.title || item.id)}</small>`,
    `<span>${escapeHtml(String(item.content || "").slice(0, 96) || "내용 없음")}</span>`,
    `</button>`,
  ].join("")) : `<div class="spotlite-empty">현재 대기 중인 카드가 없습니다.</div>`;

  const historyItems = resolved.slice(0, 8);
  $("#decision-history-count").textContent = `${historyItems.length}건`;
  renderEvents("#decision-history", historyItems.length ? historyItems.map((item) => ({
    command: item.title || item.id,
    status: `${item.status} · ${item.projectLabel || item.projectKey || "미분류"}`,
    detail: `${escapeHtml(String(item.content || "").slice(0, 160))}${item.appliedPath ? ` · ${escapeHtml(item.appliedPath)}` : ""}`,
  })) : [{ command: "최근 판정 없음", status: "대기", detail: "승인/보류한 항목이 여기에 쌓입니다." }]);

  document.querySelectorAll("[data-decision-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.decisionPending.busy || state.decisionInference.busy) return;
      state.activeDecisionId = button.dataset.decisionFocus;
      renderDecisionWorkbench();
    });
  });
  document.querySelectorAll("[data-decision-open-path]").forEach((button) => {
    button.addEventListener("click", () => {
      openDecisionEvidenceModal(button.dataset.decisionOpenPath);
    });
  });
  document.querySelectorAll("[data-decision-doc]").forEach((button) => {
    button.addEventListener("click", () => {
      const doc = state.coreDocuments.find((item) => item.key === button.dataset.decisionDoc);
      if (!doc?.path) return;
      openDecisionEvidenceModal(doc.path);
    });
  });
  document.querySelectorAll("[data-decision-hub]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("[data-view='wiki']")?.click();
      openNotionWikiPage(button.dataset.decisionHub);
    });
  });
  document.querySelectorAll("[data-decision-compare]").forEach((button) => {
    button.addEventListener("click", () => openDecisionCompareModal(button.dataset.decisionCompare));
  });
  document.querySelectorAll("[data-decision-chat]").forEach((button) => {
    button.addEventListener("click", () => {
      runDecisionInference(active, state.decisionChatDirective || `${button.dataset.decisionChat} 관련 위키 정합성 항목을 검토해서 충돌 근거, 병합안, 보류 조건, Conflict_Register.md 반영 문구를 정리해줘.`);
    });
  });
  document.querySelectorAll("[data-decision-investigate]").forEach((button) => {
    button.addEventListener("click", () => resolveActiveDecision("investigate"));
  });
}

function renderMissionPipelineFlow(coverage = {}, latestRun = null) {
  const manifest = Number(coverage.documentsInManifest || 0);
  const processed = Number(coverage.processedDocuments || 0);
  const pendingDecisions = state.decisionQueue.filter((item) => item.status === "pending").length;
  const runningCommand = latestRun?.status === "running" ? latestRun.command : "";
  const steps = [
    { id: "target", label: "목표 입력", detail: "한 문장 지시 또는 표적 분석", done: true, active: false },
    { id: "copy", label: "Drive 수집", detail: runningCommand.includes("rclone-copy") ? "rclone copy 진행 중" : manifest ? "수집 이력 있음" : "P0 병목: 실제 수집 필요", done: manifest > 0, active: runningCommand.includes("rclone-copy") },
    { id: "manifest", label: "Manifest", detail: `${manifest} docs`, done: manifest > 0, active: runningCommand.includes("build-manifest") },
    { id: "extract", label: "추출/위키화", detail: `${processed} processed`, done: processed > 0, active: runningCommand === "run" || runningCommand === "full-cycle" },
    { id: "review", label: "정합성 대기", detail: `${pendingDecisions} pending`, done: pendingDecisions === 0 && processed > 0, active: pendingDecisions > 0 },
    { id: "action", label: "오늘 액션", detail: "Mission Control 반영", done: Boolean(state.mission?.summary?.ongoing), active: false },
  ];
  const target = $("#mission-flow-steps");
  if (!target) return;
  target.innerHTML = steps.map((step) => [
    `<article class="${step.done ? "done" : ""} ${step.active ? "active" : ""}">`,
    `<strong>${escapeHtml(step.label)}</strong>`,
    `<small>${escapeHtml(step.detail)}</small>`,
    `</article>`,
  ].join("")).join("");
}

async function loadMissionControl() {
  const workspace = wikiWorkspaceParam();
  const [mission, docs, queue, llm, policy, coverage, automation, governance] = await Promise.all([
    api(`/api/projects/command-center?workspace=${encodeURIComponent(workspace)}`),
    api(`/api/documents/core?workspace=${encodeURIComponent(workspace)}`),
    api(`/api/decision-queue?workspace=${encodeURIComponent(workspace)}`),
    api("/api/ops/llm-usage"),
    api("/api/ops/llm-policy"),
    api("/api/coverage"),
    api("/api/automation/status"),
    api(`/api/wiki/project-governance?workspace=${encodeURIComponent(workspace)}`),
  ]);
  if (!mission.mock && !mission.error) state.mission = mission;
  if (!docs.mock && !docs.error) state.coreDocuments = docs.documents || [];
  if (!queue.mock && !queue.error) state.decisionQueue = queue.items || [];
  if (!llm.mock && !llm.error) state.llmUsage = llm.usage || [];
  if (!policy.mock && !policy.error) state.llmPolicies = policy.policies || [];
  if (!coverage.mock && !coverage.error) state.coverage = coverage;
  if (!automation.mock && !automation.error) state.automationSnapshot = automation;
  if (!governance.mock && !governance.error) state.projectGovernance = governance;
  renderMissionControl();
  renderDecisionWorkbench();
}

async function loadLlmPolicies() {
  const policy = await api("/api/ops/llm-policy");
  if (!policy.mock && !policy.error) {
    state.llmPolicies = policy.policies || [];
    state.llmUsage = policy.usage || state.llmUsage;
  }
}

function missionCommandText() {
  return $("#mission-command-input")?.value.trim() || "";
}

function missionCommandToChat() {
  const text = missionCommandText();
  document.querySelector("[data-view='chat']")?.click();
  $("#chat-input").value = text || "현재 Mission Control 기준으로 오늘 해야 할 일, 위험 프로젝트, 위키 정합성 이슈, 다음 액션을 PM/CEO 관점으로 정리해줘.";
  $("#chat-input").focus();
}

function missionCommandToPipeline() {
  const text = missionCommandText();
  document.querySelector("[data-view='pipeline']")?.click();
  if (text) $("#drive-instruction-input").value = text;
  $("#drive-instruction-input")?.focus();
}

function resolvedDecisionStatus(action) {
  if (action === "approve" || action === "edit_approve") return "approved";
  if (action === "reject") return "rejected";
  if (action === "investigate") return "needs_investigation";
  return "hold";
}

async function resolveDecision(id, action, options = {}) {
  const result = await api(`/api/decision-queue/${encodeURIComponent(id)}/resolve`, {
    method: "POST",
    body: JSON.stringify({ action, workspace: wikiWorkspaceParam(), note: options.note || "" }),
  });
  if (result.error && options.alertOnError !== false) alert(`결정 처리 실패: ${result.error}`);
  state.decisionLastResolution = result.error ? {
    id,
    projectKey: "",
    ok: false,
    title: "결정 처리 실패",
    detail: result.error,
  } : {
    id,
    projectKey: result.item?.projectKey || "",
    ok: Boolean(result.appliedPath),
    title: result.appliedPath
      ? "승인 반영 완료"
      : result.finalVerification && result.finalVerification.decision !== "approve"
        ? "최상위 모델 검증으로 반영 보류"
        : "승인은 기록됐지만 위키 반영은 미완료",
    detail: result.appliedPath
      ? `${result.appliedPath} (${result.targetFile || "문서"})`
      : (result.finalVerification?.reason || result.note || "반영 경로나 projectKey를 확인해야 합니다."),
  };
  if (!options.skipReload) await loadMissionControl();
  return result;
}

function moveDecisionFocus(offset) {
  if (state.decisionPending.busy || state.decisionInference.busy) return;
  const queue = pendingDecisionItems();
  if (!queue.length) return;
  const currentIndex = Math.max(0, queue.findIndex((item) => item.id === state.activeDecisionId));
  const nextIndex = (currentIndex + offset + queue.length) % queue.length;
  state.activeDecisionId = queue[nextIndex].id;
  renderDecisionWorkbench();
}

async function resolveActiveDecision(action) {
  const queue = pendingDecisionItems();
  if (!queue.length || state.decisionPending.busy || state.decisionInference.busy) return;
  const currentIndex = Math.max(0, queue.findIndex((item) => item.id === state.activeDecisionId));
  const current = queue[currentIndex] || queue[0];
  const next = queue[currentIndex + 1] || queue[currentIndex - 1] || null;
  const previousQueue = state.decisionQueue.slice();
  const previousActiveId = state.activeDecisionId;
  state.decisionPending = { busy: true, itemId: current.id, action: action === "approve" ? "승인 반영" : action === "hold" ? "보류" : "추가 조사" };
  state.decisionQueue = state.decisionQueue.map((item) => item.id === current.id
    ? { ...item, status: resolvedDecisionStatus(action), resolvedAction: action }
    : item);
  state.activeDecisionId = next?.id || "";
  renderMissionControl();
  renderDecisionWorkbench();
  const result = await resolveDecision(current.id, action, {
    skipReload: true,
    alertOnError: false,
    note: activeDecisionInferenceNote(current.id),
  });
  if (result.error) {
    state.decisionPending = { busy: false, itemId: "", action: "" };
    state.decisionQueue = previousQueue;
    state.activeDecisionId = previousActiveId;
    renderMissionControl();
    renderDecisionWorkbench();
    alert(`결정 처리 실패: ${result.error}`);
    return;
  }
  state.decisionPending = { busy: false, itemId: "", action: "" };
  if (state.decisionInference.itemId === current.id) {
    state.decisionInference = { busy: false, itemId: "", status: "", content: "", thinking: "", error: "", assistantId: "" };
  }
  closeDecisionCompareModal();
  await loadMissionControl();
}

async function updateDocumentStatus(key, status) {
  const result = await api("/api/documents/status", {
    method: "PATCH",
    body: JSON.stringify({ key, status }),
  });
  if (result.error) alert(`문서 상태 변경 실패: ${result.error}`);
  await loadMissionControl();
}

function filteredWikiPages() {
  const query = ($("#wiki-filter")?.value || "").trim().toLowerCase();
  if (!query) return state.wikiPages;
  return state.wikiPages.filter((page) => {
    const text = [
      page.title,
      page.path,
      page.section,
      page.frontmatter?.type,
      page.frontmatter?.source,
    ].filter(Boolean).join(" ").toLowerCase();
    return text.includes(query);
  });
}

function renderWikiPages() {
  const pages = filteredWikiPages();
  $("#wiki-page-count").textContent = `${pages.length}건`;
  $("#wiki-page-list").innerHTML = pages
    .slice(0, 260)
    .map((page) => [
      `<button class="wiki-page-item ${page.path === state.activeWikiPath ? "active" : ""}" data-wiki-path="${escapeHtml(page.path)}" type="button">`,
      `<strong>${escapeHtml(page.title)}</strong>`,
      `<small>${escapeHtml(page.section)} · ${escapeHtml(page.frontmatter?.type || "page")}</small>`,
      `<span>${escapeHtml(page.path)}</span>`,
      `</button>`,
    ].join(""))
    .join("");
  document.querySelectorAll("[data-wiki-path]").forEach((button) => {
    button.addEventListener("click", () => openWikiPage(button.dataset.wikiPath));
  });
}

function graphLayout(nodes, edges) {
  const width = 720;
  const height = 520;
  const centerX = width / 2;
  const centerY = height / 2;
  const groups = [...new Set(nodes.map((node) => node.section || "Wiki"))];
  const groupAngle = new Map(groups.map((group, index) => [group, (Math.PI * 2 * index) / Math.max(groups.length, 1)]));
  return nodes.map((node, index) => {
    const angle = groupAngle.get(node.section || "Wiki") + index * 0.43;
    const radius = 88 + Math.min(185, (index % 38) * 4.8) + (node.degree || 0) * 2.5;
    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      r: Math.max(5, Math.min(22, 5 + (node.degree || 0) * 1.2)),
    };
  });
}

function renderWikiGraph() {
  const nodes = (state.wikiGraph.nodes || []).slice(0, 120);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (state.wikiGraph.edges || []).filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).slice(0, 260);
  const placed = graphLayout(nodes, edges);
  const byId = new Map(placed.map((node) => [node.id, node]));
  $("#wiki-graph-count").textContent = `${nodes.length} nodes · ${edges.length} links`;
  $("#wiki-graph").innerHTML = [
    `<div class="graph-canvas">`,
    `<svg viewBox="0 0 720 520" class="graph-svg" aria-hidden="true">`,
    `<g class="graph-links">`,
    edges.map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return "";
      return `<line x1="${source.x.toFixed(1)}" y1="${source.y.toFixed(1)}" x2="${target.x.toFixed(1)}" y2="${target.y.toFixed(1)}" />`;
    }).join(""),
    `</g>`,
    `</svg>`,
    placed.map((node) => [
      `<button class="graph-node ${node.id === state.activeWikiPath ? "active" : ""}" data-graph-path="${escapeHtml(node.id)}" type="button" style="left:${(node.x / 720 * 100).toFixed(2)}%; top:${(node.y / 520 * 100).toFixed(2)}%; width:${(node.r * 2).toFixed(1)}px; height:${(node.r * 2).toFixed(1)}px;" title="${escapeHtml(node.title)}">`,
      `<span>${escapeHtml(node.title)}</span>`,
      `</button>`,
    ].join("")).join(""),
    `</div>`,
  ].join("");
  document.querySelectorAll("[data-graph-path]").forEach((button) => {
    button.addEventListener("click", () => openWikiPage(button.dataset.graphPath));
  });
}

async function loadWikiExplorer() {
  const [indexPayload, graphPayload] = await Promise.all([
    api(`/api/wiki/index?workspace=${encodeURIComponent(wikiWorkspaceParam())}`),
    api("/api/wiki/graph"),
  ]);
  if (!indexPayload.mock && indexPayload.pages) state.wikiPages = indexPayload.pages;
  if (!graphPayload.mock && graphPayload.nodes) state.wikiGraph = graphPayload;
  renderWikiPages();
  renderWikiGraph();
  if (!state.activeWikiPath && state.wikiPages[0]) {
    await openWikiPage(state.wikiPages[0].path);
  }
}

async function openWikiPage(path) {
  if (!path) return;
  state.activeWikiPath = path;
  const page = state.wikiPages.find((item) => item.path === path) || { title: path, path };
  $("#wiki-reader-title").textContent = page.title;
  $("#wiki-reader-path").textContent = page.path;
  $("#wiki-reader-body").textContent = "문서를 불러오는 중입니다.";
  renderWikiPages();
  renderWikiGraph();
  const payload = await api(`/api/wiki/page?path=${encodeURIComponent(path)}`);
  if (payload.error || payload.mock) {
    $("#wiki-reader-body").textContent = payload.error || "문서 API 연결 대기";
    return;
  }
  $("#wiki-reader-title").textContent = payload.title;
  $("#wiki-reader-path").textContent = payload.path;
  $("#wiki-reader-body").innerHTML = renderMarkdownDocument(payload.markdown);
}

const divisionLabels = {
  all: "전체",
  project: "프로젝트",
  account: "고객/계정",
  operations: "운영/자동화",
  common: "공통지식",
  memory: "메모리/챗",
  log: "로그/감사",
};

const natureLabels = {
  all: "전체 성격",
  hub: "허브",
  overview: "개요",
  sources: "출처",
  evidence: "근거",
  conflict: "충돌",
  actions: "액션",
  decisions: "결정",
  risks: "리스크",
  changelog: "변경이력",
  log: "로그",
  memory: "메모리",
  knowledge: "지식",
};

const workflowStatusLabels = {
  all: "상태 전체",
  completed: "완료",
  ongoing: "진행 중",
  hold: "보류",
  planned: "계획",
  archived: "보관",
  unknown: "미지정",
};

const wikiManagementExampleCommand = "아사히카세히의 위키를 모두 모아 프로젝트, 고객사로 승격해. 참고로 아사히카세이->아사히카세히 영칭도 일괄수정";

const projectShortcutKinds = ["hub", "overview", "sources", "evidence", "actions", "risks", "decisions", "conflict", "changelog"];

function normalizeWikiTarget(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^.*\//, "")
    .replace(/\.md$/i, "")
    .trim()
    .toLowerCase();
}

function resolveWikiTarget(target) {
  const normalized = normalizeWikiTarget(target);
  if (!normalized) return "";
  const direct = state.wikiPages.find((page) => page.path === target || page.path.endsWith(`/${target}`));
  if (direct) return direct.path;
  const byTitle = state.wikiPages.find((page) => normalizeWikiTarget(page.title) === normalized);
  if (byTitle) return byTitle.path;
  const byBase = state.wikiPages.find((page) => normalizeWikiTarget(page.path) === normalized);
  return byBase?.path || "";
}

function updateNotionStats() {
  const total = state.wikiPages.length;
  const divisions = new Set(state.wikiPages.map((page) => page.division || "operations"));
  const managedPages = state.wikiPages.filter((page) => page.statusManaged !== false);
  const ongoing = managedPages.filter((page) => page.workflowStatus === "ongoing").length;
  const completed = managedPages.filter((page) => page.workflowStatus === "completed").length;
  $("#notion-total-pages").textContent = `${total}`;
  $("#notion-total-categories").textContent = `${divisions.size} · 진행 ${ongoing} · 완료 ${completed}`;
}

function updateWikiFilterControls() {
  const projectSelect = $("#notion-project-filter");
  if (!projectSelect) return;
  const projects = [...new Map(state.wikiPages
    .filter((page) => ["project", "account"].includes(page.division))
    .map((page) => [page.projectKey, page.projectLabel || page.projectKey]))]
    .sort((a, b) => a[1].localeCompare(b[1]));
  projectSelect.innerHTML = [
    `<option value="all">프로젝트/계정 전체</option>`,
    ...projects.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`),
  ].join("");
  projectSelect.value = state.wikiFilters.projectKey;
  const tagSelect = $("#notion-tag-filter");
  if (tagSelect) {
    const tags = [...new Set(state.wikiPages.flatMap((page) => page.workflowTags || []))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    tagSelect.innerHTML = [
      `<option value="all">태그 전체</option>`,
      ...tags.map((tag) => `<option value="${escapeHtml(tag)}">#${escapeHtml(tag)}</option>`),
    ].join("");
    tagSelect.value = tags.includes(state.wikiFilters.tag) ? state.wikiFilters.tag : "all";
    state.wikiFilters.tag = tagSelect.value;
  }
}

function pagesByProject() {
  const groups = new Map();
  state.wikiPages.forEach((page) => {
    const key = page.projectKey || page.section || "Wiki";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: page.projectLabel || key,
        division: page.division || "operations",
        pages: [],
      });
    }
    groups.get(key).pages.push(page);
  });
  return [...groups.values()].sort((a, b) => {
    const byDivision = String(a.division).localeCompare(String(b.division));
    return byDivision || a.label.localeCompare(b.label);
  });
}

function filteredNotionPages() {
  const category = state.notionCurrentCategory || "all";
  const query = state.wikiFilters.query.toLowerCase();
  const pages = state.wikiPages.filter((page) => {
    if (category !== "all" && category !== "latest") {
      if (category.startsWith("kind:") && page.docKind !== category.replace("kind:", "")) return false;
      if (!category.startsWith("kind:") && page.division !== category) return false;
    }
    if (state.wikiFilters.division !== "all" && page.division !== state.wikiFilters.division) return false;
    if (state.wikiFilters.nature !== "all" && page.docKind !== state.wikiFilters.nature) return false;
    if (state.wikiFilters.status !== "all" && (page.statusManaged === false || page.workflowStatus !== state.wikiFilters.status)) return false;
    if (state.wikiFilters.tag !== "all" && !(page.workflowTags || []).includes(state.wikiFilters.tag)) return false;
    if (state.wikiFilters.projectKey !== "all" && page.projectKey !== state.wikiFilters.projectKey) return false;
    if (!query) return true;
    return [
      page.title,
      page.path,
      page.projectLabel,
      page.division,
      page.docKind,
      page.workflowStatusLabel,
      ...(page.workflowTags || []),
      page.frontmatter?.type,
      page.frontmatter?.source,
    ].filter(Boolean).join(" ").toLowerCase().includes(query);
  });
  return pages.sort((a, b) => {
    if (category === "latest") return String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.title.localeCompare(b.title);
    if (state.wikiFilters.sortBy === "updated") return String(b.updatedAt).localeCompare(String(a.updatedAt));
    if (state.wikiFilters.sortBy === "type") return String(a.docKind).localeCompare(String(b.docKind)) || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  });
}

function renderProjectCard(group) {
  const shortcutPages = projectShortcutKinds
    .map((kind) => group.pages.find((page) => page.docKind === kind))
    .filter(Boolean);
  const updated = group.pages.map((page) => page.updatedAt).sort().at(-1) || "";
  const managedPages = group.pages.filter((page) => page.statusManaged !== false);
  const status = managedPages.find((page) => page.workflowStatus && page.workflowStatus !== "unknown") || managedPages[0] || group.pages[0] || {};
  const tags = [...new Set(managedPages.flatMap((page) => page.workflowTags || []))].slice(0, 8);
  return [
    `<article class="notion-project-card status-${escapeHtml(status.workflowStatus || "unknown")}" data-project-key="${escapeHtml(group.key)}">`,
    group.division === "account" ? [
      `<label class="notion-bulk-check">`,
      `<input type="checkbox" data-account-select="${escapeHtml(group.key)}" ${state.selectedAccountKeys.has(group.key) ? "checked" : ""} />`,
      `<span>계정 선택</span>`,
      `</label>`,
    ].join("") : "",
    `<button class="notion-card-main" data-project-drill="${escapeHtml(group.key)}" type="button">`,
    `<span class="notion-card-kicker">${escapeHtml(divisionLabels[group.division] || group.division)}${status.statusManaged === false ? " · 상태관리 제외" : ` · ${escapeHtml(status.workflowStatusLabel || "미지정")}`}</span>`,
    `<strong>${escapeHtml(group.label)}</strong>`,
    status.workflowStatusHighlight ? `<em class="wiki-status-highlight">${escapeHtml(status.workflowStatusHighlight)}</em>` : "",
    `<small>${group.pages.length} docs · ${escapeHtml(updated.slice(0, 10) || "updated unknown")}</small>`,
    tags.length ? `<div class="wiki-status-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : "",
    `</button>`,
    `<div class="notion-shortcuts">`,
    shortcutPages.map((page) => `<button type="button" data-notion-path="${escapeHtml(page.path)}">${escapeHtml(natureLabels[page.docKind] || page.docKind)}</button>`).join(""),
    `</div>`,
    `</article>`,
  ].join("");
}

function renderAccountBulkToolbar() {
  const accountGroups = pagesByProject().filter((group) => group.division === "account");
  if (!accountGroups.length) return "";
  const visibleAccountKeys = new Set(accountGroups.map((group) => group.key));
  const selectedVisible = [...state.selectedAccountKeys].filter((key) => visibleAccountKeys.has(key));
  const statusOptions = Object.entries(workflowStatusLabels)
    .filter(([key]) => key !== "all")
    .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
    .join("");
  return [
    `<section class="notion-bulk-toolbar" aria-label="고객계정 상태 일괄 변경">`,
    `<div><strong>고객계정 상태 일괄 변경</strong><small>체크한 고객/계정 허브 상태를 한 번에 저장합니다.</small></div>`,
    `<span id="account-bulk-count">선택 ${selectedVisible.length}건</span>`,
    `<select id="account-bulk-status" class="notion-view-select">${statusOptions}</select>`,
    `<input id="account-bulk-tags" placeholder="태그: 완료, 온고잉" />`,
    `<input id="account-bulk-highlight" placeholder="전역 하이라이트 한 줄" />`,
    `<input id="account-bulk-note" placeholder="변경 사유 메모" />`,
    `<button id="account-bulk-apply" class="command-button accent" type="button" ${selectedVisible.length ? "" : "disabled"}>일괄 저장</button>`,
    `<button id="account-bulk-clear" class="command-button" type="button">선택 해제</button>`,
    `<span id="account-bulk-status-text"></span>`,
    `</section>`,
  ].join("");
}

function renderWikiBulkToolbar(pages = []) {
  const visiblePaths = new Set(pages.filter((page) => page.statusManaged !== false).map((page) => page.path));
  const selectedVisible = [...state.selectedWikiPaths].filter((path) => visiblePaths.has(path));
  return [
    `<section class="notion-bulk-toolbar wiki-tag-bulk-toolbar" aria-label="위키 문서 멀티태그 일괄 변경">`,
    `<div><strong>위키 멀티태그 일괄 관리</strong><small>문서를 체크한 뒤 태그를 추가하거나 교체합니다. 사용자 입력 태그를 쉼표로 여러 개 넣을 수 있습니다.</small></div>`,
    `<span id="wiki-bulk-count">선택 ${selectedVisible.length}건</span>`,
    `<select id="wiki-bulk-tag-mode" class="notion-view-select"><option value="append">기존 태그에 추가</option><option value="replace">태그 전체 교체</option></select>`,
    `<input id="wiki-bulk-tags" placeholder="태그: 고객대응, 이번주, 보고서" />`,
    `<input id="wiki-bulk-note" placeholder="태그 변경 메모" />`,
    `<button id="wiki-bulk-apply" class="command-button accent" type="button" ${selectedVisible.length ? "" : "disabled"}>태그 저장</button>`,
    `<button id="wiki-bulk-clear" class="command-button" type="button">선택 해제</button>`,
    `<span id="wiki-bulk-status-text"></span>`,
    `</section>`,
  ].join("");
}

function renderPageCard(page) {
  return [
    `<article class="notion-page-card status-${escapeHtml(page.workflowStatus || "unknown")} ${page.path === state.activeWikiPath ? "active" : ""}">`,
    page.statusManaged === false ? "" : [
      `<label class="notion-bulk-check">`,
      `<input type="checkbox" data-wiki-page-select="${escapeHtml(page.path)}" ${state.selectedWikiPaths.has(page.path) ? "checked" : ""} />`,
      `<span>문서 선택</span>`,
      `</label>`,
    ].join(""),
    `<button class="notion-card-main" data-notion-path="${escapeHtml(page.path)}" type="button">`,
    `<span class="notion-card-kicker">${escapeHtml(divisionLabels[page.division] || page.division)} · ${escapeHtml(natureLabels[page.docKind] || page.docKind)}${page.statusManaged === false ? " · 상태관리 제외" : ` · ${escapeHtml(page.workflowStatusLabel || "미지정")}`}</span>`,
    `<strong>${escapeHtml(page.title)}</strong>`,
    page.workflowStatusHighlight ? `<em class="wiki-status-highlight">${escapeHtml(page.workflowStatusHighlight)}</em>` : "",
    `<small>${escapeHtml(page.projectLabel || page.section)} · ${escapeHtml(page.path)}</small>`,
    page.workflowTags?.length ? `<div class="wiki-status-tags">${page.workflowTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : "",
    `</button>`,
    `</article>`,
  ].join("");
}

function renderNotionWikiContent() {
  const viewMode = $("#notion-view-mode")?.value || state.wikiFilters.viewMode || "grid";
  const sortBy = $("#notion-sort-by")?.value || state.wikiFilters.sortBy || "name";
  state.wikiFilters.viewMode = viewMode;
  state.wikiFilters.sortBy = sortBy;
  const pages = filteredNotionPages();
  const content = $("#notion-content-area");
  const categoryLabel = state.notionCurrentCategory === "latest"
    ? "최신 문서"
    : divisionLabels[state.notionCurrentCategory] || natureLabels[state.notionCurrentCategory?.replace?.("kind:", "")] || "전체";
  $("#notion-current-category").textContent = state.activeProjectKey
    ? `${categoryLabel} / ${state.activeProjectKey}`
    : categoryLabel;

  if (!pages.length) {
    content.innerHTML = `${renderWikiBulkToolbar(pages)}${renderAccountBulkToolbar()}<div class="notion-empty-state"><div class="notion-empty-icon">문서 없음</div><h3>조건에 맞는 문서가 없습니다</h3><p>검색어 또는 필터를 줄여보세요.</p></div>`;
    bindWikiBulkControls(pages);
    bindAccountBulkControls();
    return;
  }

  let body = "";
  if (viewMode === "tree") {
    const groups = pagesByProject().map((group) => ({ ...group, pages: group.pages.filter((page) => pages.includes(page)) })).filter((group) => group.pages.length);
    body = `<div class="notion-tree-list">${groups.map((group) => [
      `<section class="notion-tree-group">`,
      `<button class="notion-tree-heading" data-project-drill="${escapeHtml(group.key)}" type="button">${escapeHtml(group.label)} <span>${group.pages.length}</span></button>`,
      `<div class="notion-tree-pages">${group.pages.map(renderPageCard).join("")}</div>`,
      `</section>`,
    ].join("")).join("")}</div>`;
  } else if (viewMode === "list") {
    body = `<div class="notion-page-list">${pages.map(renderPageCard).join("")}</div>`;
  } else if (state.wikiFilters.projectKey === "all" && ["all", "project", "account"].includes(state.notionCurrentCategory)) {
    const groups = pagesByProject()
      .map((group) => ({ ...group, pages: group.pages.filter((page) => pages.includes(page)) }))
      .filter((group) => group.pages.length && ["project", "account"].includes(group.division));
    body = `<div class="notion-card-grid">${groups.map(renderProjectCard).join("")}</div>`;
  } else {
    body = `<div class="notion-card-grid">${pages.map(renderPageCard).join("")}</div>`;
  }
  content.innerHTML = `${renderWikiBulkToolbar(pages)}${renderAccountBulkToolbar()}${body}`;
  bindWikiBulkControls(pages);
  bindAccountBulkControls();

  document.querySelectorAll("[data-wiki-page-select]").forEach((input) => {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", () => {
      if (input.checked) state.selectedWikiPaths.add(input.dataset.wikiPageSelect);
      else state.selectedWikiPaths.delete(input.dataset.wikiPageSelect);
      renderNotionWikiContent();
    });
  });
  document.querySelectorAll("[data-account-select]").forEach((input) => {
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", () => {
      if (input.checked) state.selectedAccountKeys.add(input.dataset.accountSelect);
      else state.selectedAccountKeys.delete(input.dataset.accountSelect);
      renderNotionWikiContent();
    });
  });
  document.querySelectorAll("[data-notion-path]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openNotionWikiPage(button.dataset.notionPath);
    });
  });
  document.querySelectorAll("[data-project-drill]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeProjectKey = button.dataset.projectDrill;
      state.wikiFilters.projectKey = button.dataset.projectDrill;
      const projectFilter = $("#notion-project-filter");
      if (projectFilter) projectFilter.value = state.wikiFilters.projectKey;
      renderNotionWikiContent();
    });
  });
}

function bindAccountBulkControls() {
  $("#account-bulk-clear")?.addEventListener("click", () => {
    state.selectedAccountKeys.clear();
    renderNotionWikiContent();
  });
  $("#account-bulk-apply")?.addEventListener("click", applyAccountBulkStatus);
}

function bindWikiBulkControls(pages = []) {
  $("#wiki-bulk-clear")?.addEventListener("click", () => {
    state.selectedWikiPaths.clear();
    renderNotionWikiContent();
  });
  $("#wiki-bulk-apply")?.addEventListener("click", () => applyWikiBulkTags(pages));
}

function splitTags(value) {
  return String(value || "")
    .split(/[,，;；\n]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean);
}

async function applyWikiBulkTags(pages = []) {
  const selected = pages.filter((page) => page.statusManaged !== false && state.selectedWikiPaths.has(page.path));
  if (!selected.length) return;
  const statusEl = $("#wiki-bulk-status-text");
  const newTags = splitTags($("#wiki-bulk-tags")?.value || "");
  if (!newTags.length) {
    if (statusEl) statusEl.textContent = "태그를 1개 이상 입력하세요.";
    return;
  }
  if (statusEl) statusEl.textContent = "태그 저장 중";
  const mode = $("#wiki-bulk-tag-mode")?.value || "append";
  const items = selected.map((page) => {
    const tags = mode === "replace" ? newTags : [...new Set([...(page.workflowTags || []), ...newTags])];
    return {
      scope: "page",
      path: page.path,
      status: page.workflowStatus || "unknown",
      tags: tags.join(", "),
      highlight: page.workflowStatusHighlight || "",
      note: $("#wiki-bulk-note")?.value || `사용자 멀티태그 ${mode === "replace" ? "교체" : "추가"}`,
    };
  });
  const result = await api("/api/wiki/status", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  if (result.error || result.mock) {
    if (statusEl) statusEl.textContent = `저장 실패: ${result.error || "API 연결 대기"}`;
    return;
  }
  state.selectedWikiPaths.clear();
  if (statusEl) statusEl.textContent = `${result.count || selected.length}건 태그 저장 완료`;
  await loadNotionWikiBrowser();
}

async function applyAccountBulkStatus() {
  const keys = [...state.selectedAccountKeys];
  if (!keys.length) return;
  const statusEl = $("#account-bulk-status-text");
  if (statusEl) statusEl.textContent = "저장 중";
  const result = await api("/api/wiki/status", {
    method: "POST",
    body: JSON.stringify({
      items: keys.map((key) => ({
        scope: "project",
        projectKey: key,
        status: $("#account-bulk-status")?.value || "unknown",
        tags: $("#account-bulk-tags")?.value || "",
        highlight: $("#account-bulk-highlight")?.value || "",
        note: $("#account-bulk-note")?.value || "고객계정 상태 일괄 변경",
      })),
    }),
  });
  if (result.error || result.mock) {
    if (statusEl) statusEl.textContent = `저장 실패: ${result.error || "API 연결 대기"}`;
    return;
  }
  state.selectedAccountKeys.clear();
  if (statusEl) statusEl.textContent = `${result.count || keys.length}건 저장 완료`;
  await loadNotionWikiBrowser();
}

async function loadNotionWikiBrowser() {
  const payload = await api(`/api/wiki/index?workspace=${encodeURIComponent(wikiWorkspaceParam())}`);
  if (payload.mock || !payload.pages) {
    $("#notion-content-area").innerHTML = `<div class="notion-empty-state"><h3>위키 API 연결 대기</h3><p>${escapeHtml(payload.error || "서버 응답을 확인하세요.")}</p></div>`;
    return;
  }
  state.wikiPages = payload.pages;
  state.selectedAccountKeys.clear();
  state.selectedWikiPaths.clear();
  updateNotionStats();
  updateWikiFilterControls();
  renderNotionWikiContent();
}

async function refreshGraphMap() {
  const button = $("#refresh-graph-map");
  const status = $("#refresh-graph-map-status");
  if (button) button.disabled = true;
  if (status) status.textContent = "그래프맵 재생성 중";
  const result = await api("/api/wiki/graph/refresh", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (result.error || result.mock || result.status === "failed") {
    if (status) status.textContent = `실패: ${result.error || result.stderr || "API 연결 대기"}`;
    if (button) button.disabled = false;
    return;
  }
  await loadNotionWikiBrowser();
  await refreshStatus();
  if (status) status.textContent = "그래프맵 업데이트 완료";
  if (button) button.disabled = false;
}

async function openNotionWikiPage(path) {
  if (!path) return;
  state.activeWikiPath = path;
  const page = state.wikiPages.find((item) => item.path === path) || { title: path, path };
  $(".notion-details-panel")?.classList.add("notion-details-open");
  $("#notion-details-content").innerHTML = `<div class="notion-details-placeholder"><p>문서를 불러오는 중입니다.</p></div>`;
  $("#notion-doc-type").textContent = natureLabels[page.docKind] || page.docKind || "문서";
  $("#notion-doc-updated").textContent = page.updatedAt?.slice(0, 10) || "updated unknown";
  const payload = await api(`/api/wiki/page?path=${encodeURIComponent(path)}`);
  if (payload.error || payload.mock) {
    $("#notion-details-content").innerHTML = `<div class="notion-details-placeholder"><p>${escapeHtml(payload.error || "문서 API 연결 대기")}</p></div>`;
    return;
  }
  $("#notion-details-content").innerHTML = [
    `<div class="notion-doc-title">`,
    `<span>${escapeHtml(divisionLabels[page.division] || page.division || "Wiki")} / ${escapeHtml(page.projectLabel || page.section || "")}${page.statusManaged === false ? " / 상태관리 제외" : ` / ${escapeHtml(page.workflowStatusLabel || "미지정")}`}</span>`,
    `<h2>${escapeHtml(payload.title)}</h2>`,
    `<code>${escapeHtml(payload.path)}</code>`,
    page.workflowStatusHighlight ? `<p class="wiki-status-highlight">${escapeHtml(page.workflowStatusHighlight)}</p>` : "",
    `</div>`,
    page.statusManaged === false ? [
      `<section class="wiki-status-editor wiki-status-excluded">`,
      `<strong>상태관리 제외</strong>`,
      `<p>GLM 대화/지침/보조 메모리 문서는 업무 추진 상태가 아니므로 상태값을 관리하지 않습니다. 내용 수정은 아래 Markdown 편집만 사용하세요.</p>`,
      `<div class="wiki-editor-actions"><button class="command-button" id="wiki-edit-toggle" type="button">본문 수정</button><span id="wiki-edit-status">상태 저장 대상이 아닙니다.</span></div>`,
      `</section>`,
    ].join("") : [
      `<form class="wiki-status-editor" id="wiki-status-editor">`,
      `<label><span>상태</span><select name="status">${Object.entries(workflowStatusLabels).filter(([key]) => key !== "all").map(([key, label]) => `<option value="${escapeHtml(key)}" ${page.workflowStatus === key ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>`,
      `<label><span>사용자 멀티태그</span><input name="tags" value="${escapeHtml((page.workflowTags || []).join(", "))}" placeholder="고객대응, 이번주, 보고서" /></label>`,
      `<label><span>하이라이트</span><input name="highlight" value="${escapeHtml(page.workflowStatusHighlight || "")}" placeholder="전역에 표시할 운영 상태 한 줄" /></label>`,
      `<label><span>메모</span><input name="note" value="${escapeHtml(page.workflowNote || "")}" placeholder="사용자 상태 변경 이유" /></label>`,
      `<div class="wiki-editor-actions"><button class="command-button accent" type="submit">상태 저장</button><button class="command-button" id="wiki-edit-toggle" type="button">본문 수정</button><span id="wiki-edit-status">사용자 액션으로 상태를 관리합니다.</span></div>`,
      `</form>`,
    ].join(""),
    `<section class="wiki-page-editor" id="wiki-page-editor" hidden>`,
    `<textarea id="wiki-page-markdown">${escapeHtml(payload.markdown)}</textarea>`,
    `<div class="wiki-editor-actions"><button class="command-button accent" id="wiki-page-save" type="button">Markdown 저장</button><button class="command-button" id="wiki-page-cancel" type="button">닫기</button></div>`,
    `</section>`,
    renderMarkdownDocument(payload.markdown),
  ].join("");
  $("#wiki-status-editor")?.addEventListener("submit", (event) => saveWikiStatus(event, page));
  $("#wiki-edit-toggle")?.addEventListener("click", () => { $("#wiki-page-editor").hidden = false; });
  $("#wiki-page-cancel")?.addEventListener("click", () => { $("#wiki-page-editor").hidden = true; });
  $("#wiki-page-save")?.addEventListener("click", () => saveWikiPageMarkdown(payload.path));
  $("#notion-doc-type").textContent = natureLabels[page.docKind] || page.docKind || payload.frontmatter?.type || "문서";
  $("#notion-doc-updated").textContent = page.updatedAt?.slice(0, 10) || payload.frontmatter?.updated || "updated unknown";
  renderNotionWikiContent();
}

async function saveWikiStatus(event, page) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  $("#wiki-edit-status").textContent = "상태 저장 중";
  const result = await api("/api/wiki/status", {
    method: "POST",
    body: JSON.stringify({
      scope: page.isProjectHub || ["project", "account"].includes(page.division) ? "project" : "page",
      projectKey: page.projectKey,
      path: page.path,
      status: data.get("status"),
      tags: data.get("tags"),
      highlight: data.get("highlight"),
      note: data.get("note"),
    }),
  });
  if (result.error || result.mock) {
    $("#wiki-edit-status").textContent = `상태 저장 실패: ${result.error || "API 연결 대기"}`;
    return;
  }
  $("#wiki-edit-status").textContent = "상태 저장 완료";
  await loadNotionWikiBrowser();
  await openNotionWikiPage(page.path);
}

async function saveWikiPageMarkdown(path) {
  const markdown = $("#wiki-page-markdown")?.value || "";
  $("#wiki-edit-status").textContent = "Markdown 저장 중";
  const result = await api("/api/wiki/page", {
    method: "PUT",
    body: JSON.stringify({ path, markdown }),
  });
  if (result.error || result.mock) {
    $("#wiki-edit-status").textContent = `Markdown 저장 실패: ${result.error || "API 연결 대기"}`;
    return;
  }
  $("#wiki-edit-status").textContent = "Markdown 저장 완료";
  await loadNotionWikiBrowser();
  await openNotionWikiPage(result.path || path);
}

function renderWikiManagementCommand(entry) {
  const container = $("#wiki-command-result");
  if (!container) return;
  if (!entry) {
    container.textContent = "아직 실행된 관리 명령이 없습니다.";
    state.activeWikiManagementCommandId = "";
    $("#wiki-command-apply").disabled = true;
    return;
  }
  state.activeWikiManagementCommandId = entry.id || "";
  $("#wiki-command-apply").disabled = !entry.id;
  const plan = entry.plan || {};
  const targetPages = plan.targetPages || [];
  const operations = plan.operations || [];
  const renamePairs = entry.hints?.renamePairs || [];
  const keywords = entry.hints?.keywords || [];
  container.innerHTML = [
    `<article class="wiki-command-card">`,
    `<div class="wiki-command-meta">`,
    `<strong>${escapeHtml(entry.command)}</strong>`,
    `<small>${escapeHtml(entry.provider)} · ${escapeHtml(entry.status)} · ${escapeHtml(entry.createdAt || "")}</small>`,
    `</div>`,
    `<div class="markdown-preview">${renderMarkdownBullets(plan.summaryMarkdown || "- 계획 요약이 없습니다.")}</div>`,
    renamePairs.length ? `<h4>감지된 명칭 변경</h4><div class="wiki-command-hints">${renamePairs.map((pair) => `<span><strong>${escapeHtml(pair.from)}</strong> -> <strong>${escapeHtml(pair.to)}</strong></span>`).join("")}</div>` : "",
    keywords.length ? `<h4>검색/분류 키워드</h4><div class="wiki-command-hints">${keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}</div>` : "",
    operations.length ? `<h4>예상 작업</h4><ul>${operations.slice(0, 8).map((op) => `<li><strong>${escapeHtml(op.type || "operation")}</strong>: ${escapeHtml(op.rationale || op.applyMode || JSON.stringify(op.proposedChanges || op.pairs || ""))}</li>`).join("")}</ul>` : "",
    targetPages.length ? `<h4>대상 문서</h4><div class="wiki-command-targets">${targetPages.slice(0, 12).map((page) => `<button type="button" data-notion-path="${escapeHtml(page.path)}">${escapeHtml(page.title || page.path)}<small>${escapeHtml(page.path)}</small></button>`).join("")}</div>` : "",
    plan.risks?.length ? `<h4>위험/검증</h4><ul>${plan.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("")}</ul>` : "",
    plan.nextActions?.length ? `<h4>다음 액션</h4><ul>${plan.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>` : "",
    `<div class="wiki-command-apply-inline"><button class="command-button danger" data-wiki-command-apply="${escapeHtml(entry.id)}" type="button">이 계획 실행</button><span>자동 실행 범위: 로컬 Markdown 명칭 치환 + 프로젝트/고객사 허브 승격. 원본 Drive는 변경하지 않습니다.</span></div>`,
    entry.upstreamStatus ? `<p class="pipeline-note">GLM 상태: ${escapeHtml(entry.upstreamStatus)}</p>` : "",
    `</article>`,
  ].join("");
  container.querySelectorAll("[data-notion-path]").forEach((button) => {
    button.addEventListener("click", () => openNotionWikiPage(button.dataset.notionPath));
  });
  container.querySelector("[data-wiki-command-apply]")?.addEventListener("click", applyWikiManagementCommand);
}

async function loadWikiManagementCommands() {
  const payload = await api("/api/wiki/manage");
  if (payload.mock || !payload.commands) return;
  state.wikiManagementCommands = payload.commands;
  const latest = payload.commands[0];
  if (latest) {
    $("#wiki-command-status").textContent = `${latest.status || "planned"} · ${latest.createdAt?.slice(0, 10) || ""}`;
    $("#wiki-command-result").textContent = "이전 위키 관리 명령은 접힌 히스토리에 보관됩니다. 새 명령을 입력하면 계획이 여기에 표시됩니다.";
  }
}

async function runWikiManagementCommand() {
  const input = $("#wiki-command-input");
  const command = input.value.trim();
  if (!command) return;
  $("#wiki-command-status").textContent = "GLM/로컬 규칙으로 계획 생성 중";
  const result = await api("/api/wiki/manage", {
    method: "POST",
    body: JSON.stringify({ command }),
  });
  if (result.error || result.mock) {
    $("#wiki-command-status").textContent = `실패: ${result.error || "API 연결 대기"}`;
    return;
  }
  const targetCount = result.plan?.targetPages?.length || 0;
  const pairCount = result.hints?.renamePairs?.length || 0;
  $("#wiki-command-status").textContent = `${result.provider} 계획 완료 · 대상 ${targetCount}개 · 치환 ${pairCount}쌍`;
  state.wikiManagementCommands.unshift(result);
  renderWikiManagementCommand(result);
}

function renderWikiApplyResult(result) {
  const container = $("#wiki-command-result");
  if (!container) return;
  const changedFiles = result.changedFiles || [];
  const skippedOperations = result.skippedOperations || [];
  const summary = [
    `<article class="wiki-command-card">`,
    `<div class="wiki-command-meta">`,
    `<strong>실행 결과: ${escapeHtml(result.status || "unknown")}</strong>`,
    `<small>${escapeHtml(result.createdAt || "")} · local wiki only · Google Drive 원본 변경 없음</small>`,
    `</div>`,
    changedFiles.length ? `<h4>변경된 로컬 위키 파일</h4><div class="wiki-command-targets">${changedFiles.map((file) => {
      const detail = file.replacements?.length
        ? file.replacements.map((pair) => `${pair.from}->${pair.to} ${pair.count}회`).join(", ")
        : `${file.operation || "wiki_update"} · ${file.action || "updated"}`;
      return `<button type="button" data-notion-path="${escapeHtml(file.path)}">${escapeHtml(file.title || file.path)}<small>${escapeHtml(detail)}</small></button>`;
    }).join("")}</div>` : `<p class="pipeline-note">변경된 파일이 없습니다.</p>`,
    skippedOperations.length ? `<h4>자동 실행 제외</h4><ul>${skippedOperations.map((item) => `<li><strong>${escapeHtml(item.type || item.path || "skipped")}</strong>: ${escapeHtml(item.reason || "")}</li>`).join("")}</ul>` : "",
    `</article>`,
  ].join("");
  container.innerHTML = summary;
  container.querySelectorAll("[data-notion-path]").forEach((button) => {
    button.addEventListener("click", () => openNotionWikiPage(button.dataset.notionPath));
  });
}

async function applyWikiManagementCommand() {
  const commandId = state.activeWikiManagementCommandId;
  if (!commandId) {
    $("#wiki-command-status").textContent = "실행할 계획이 없습니다.";
    return;
  }
  const ok = window.confirm("검토한 계획을 로컬 위키 Markdown에 실행합니다. 원본 Google Drive는 절대 수정/삭제하지 않습니다. 계속할까요?");
  if (!ok) return;
  $("#wiki-command-status").textContent = "로컬 위키 실행 중";
  const result = await api("/api/wiki/manage/apply", {
    method: "POST",
    body: JSON.stringify({ commandId }),
  });
  if (result.error || result.mock) {
    $("#wiki-command-status").textContent = `실행 실패: ${result.error || "API 연결 대기"}`;
    return;
  }
  const changedCount = result.changedFiles?.length || 0;
  const skippedCount = result.skippedOperations?.length || 0;
  $("#wiki-command-status").textContent = `실행 완료 · 변경 ${changedCount}개 · 제외 ${skippedCount}개`;
  $("#wiki-command-result").innerHTML = [
    `<div class="wiki-command-complete">`,
    `<strong>실행 완료</strong>`,
    `<span>변경 ${changedCount}개 · 제외 ${skippedCount}개 · 로컬 위키만 변경됨</span>`,
    `</div>`,
  ].join("");
  $("#wiki-command-input").value = "";
  $("#wiki-command-apply").disabled = true;
  state.activeWikiManagementCommandId = "";
  await loadNotionWikiBrowser();
}

function fillWikiManagementExample() {
  const input = $("#wiki-command-input");
  if (!input) return;
  input.value = wikiManagementExampleCommand;
  input.focus();
  $("#wiki-command-status").textContent = "예시 명령 입력됨";
}

function initializeNotionWikiBrowser() {
  document.querySelectorAll(".notion-nav-content").forEach((section) => section.classList.add("notion-expanded"));
  document.querySelectorAll(".notion-chevron").forEach((chevron) => { chevron.textContent = "▲"; });
  loadNotionWikiBrowser();
  loadWikiManagementCommands();
}

function activeChatProject() {
  const projects = chatProjectsForSpace();
  return projects.find((project) => project.id === state.activeChatProjectId) || projects[0] || null;
}

function chatWikiProjectOptionsForSpace() {
  const workspace = wikiWorkspaceParam();
  return state.chatProjectWikiOptions.filter((item) => item.workspace === workspace);
}

function renderChatLinkedProjectOptions() {
  const select = $("#chat-linked-wiki-project");
  const meta = $("#chat-linked-project-meta");
  if (!select) return;
  const options = chatWikiProjectOptionsForSpace();
  const project = activeChatProject();
  const currentKey = project?.linkedWikiProject?.projectKey || "";
  select.innerHTML = [
    `<option value="">연결 안 함</option>`,
    ...options.map((item) => `<option value="${escapeHtml(item.projectKey)}">${escapeHtml(item.projectLabel)}</option>`),
  ].join("");
  select.value = currentKey;
  if (meta) {
    const active = options.find((item) => item.projectKey === currentKey);
    meta.textContent = active
      ? `${active.projectLabel} · ${active.path || active.projectKey}`
      : "위키 프로젝트를 연결하면 GLM 챗이 해당 프로젝트 문서를 우선 근거로 사용합니다.";
  }
}

function chatProjectsForSpace() {
  return state.chatProjects.filter((project) => (project.workspace || "work") === state.activeSpace);
}

function renderChatProjects() {
  const project = activeChatProject();
  const projects = chatProjectsForSpace();
  $("#chat-project-count").textContent = `${projects.length}개`;
  $("#chat-global-instructions").value = state.chatGlobal.instructions || "";
  $("#chat-auto-memory").checked = state.chatGlobal.autoMemory !== false;
  $("#chat-project-list").innerHTML = projects
    .map((item) => `<button class="chat-project-item ${item.id === state.activeChatProjectId ? "active" : ""}" data-chat-project="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.linkedWikiProject?.projectLabel || (item.instructions || "지침 없음").slice(0, 72))}</small></button>`)
    .join("") || `<article class="chat-project-empty">${workspaceLabel()} 프로젝트가 없습니다. 새 프로젝트를 만들면 이 공간에만 표시됩니다.</article>`;
  document.querySelectorAll("[data-chat-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeChatProjectId = button.dataset.chatProject;
      renderChatProjects();
    });
  });
  $("#chat-project-select").innerHTML = projects
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join("");
  if (project) {
    $("#chat-project-select").value = project.id;
    $("#chat-active-title").textContent = project.linkedWikiProject?.projectLabel
      ? `${project.name || "GLM 프로젝트"} · ${project.linkedWikiProject.projectLabel}`
      : (project.name || "GLM 프로젝트");
    $("#chat-project-name").value = project.name || "";
    $("#chat-project-instructions").value = project.instructions || "";
    $("#chat-log").innerHTML = "";
    (project.messages || []).forEach((message) => appendMessage(message.role, message.content, message.id));
  }
  renderChatLinkedProjectOptions();
  renderChatMemories();
  setChatPhase(state.chatPhase || "idle");
  syncAssistantUiFrame();
}

function renderChatMemories() {
  const project = activeChatProject();
  const memories = project?.memories || [];
  const rows = memories.map((memory) => ({
    command: memory.title,
    status: `${memory.source || "manual"} · ${memory.updatedAt || memory.createdAt}`,
    detail: `${escapeHtml(memory.content)} <button class="inline-delete" data-memory-delete="${escapeHtml(memory.id)}">삭제</button>`,
  }));
  renderEvents("#chat-memory-list", rows.length ? rows : [{ command: "메모리 없음", status: "대기", detail: "프로젝트별 지침과 별개로 계속 기억할 내용을 추가하세요." }]);
  document.querySelectorAll("[data-memory-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteChatMemory(button.dataset.memoryDelete));
  });
}

function setChatPhase(phase, detail = "") {
  state.chatPhase = phase;
  state.chatSending = ["sending", "thinking", "saving"].includes(phase);
  const labels = {
    idle: "대기",
    sending: "전송 중",
    thinking: "GLM 추론중",
    saving: "저장 중",
    failed: "실패",
  };
  const status = $("#chat-status");
  const statusDetail = $("#chat-status-detail");
  const sendButton = $("#chat-send");
  const stopButton = $("#chat-stop");
  const fileButton = $("#chat-file-button") || $("#chat-plus-attach") || $("#chat-plus-button");
  const chatInput = $("#chat-input");
  const projectSelect = $("#chat-project-select");
  if (status) {
    status.className = `chat-status ${phase}`;
    status.textContent = labels[phase] || phase;
  }
  if (statusDetail) statusDetail.textContent = detail || "GLM 응답 대기 중에는 다음 메시지를 잠급니다.";
  if (sendButton) sendButton.disabled = state.chatSending;
  if (stopButton) stopButton.disabled = !["sending", "thinking"].includes(phase);
  if (fileButton) fileButton.disabled = state.chatSending;
  if (chatInput) chatInput.disabled = state.chatSending;
  if (projectSelect) projectSelect.disabled = state.chatSending;
}

function formatChatFileSize(bytes = 0) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function availableChatSkillTags() {
  const skillMap = new Map((state.skills || []).map((skill) => [skill.id, skill]));
  return (state.paperclipTemplates || []).map((template) => {
    const skill = skillMap.get(template.id);
    return {
      id: template.id,
      name: skill?.name || template.title,
      type: "paperclip",
    };
  });
}

function toggleChatSkillTag(id) {
  if (!id) return;
  if (state.chatSelectedSkillTags.includes(id)) {
    state.chatSelectedSkillTags = state.chatSelectedSkillTags.filter((item) => item !== id);
  } else {
    state.chatSelectedSkillTags = [...state.chatSelectedSkillTags, id];
  }
  renderChatSkillTags();
}

function renderChatSelectedSkillPills() {
  const container = $("#chat-selected-skill-pills");
  if (!container) return;
  const tags = availableChatSkillTags().filter((skill) => state.chatSelectedSkillTags.includes(skill.id));
  container.hidden = !tags.length;
  if (!tags.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = tags.map((skill) => [
    `<span class="chat-selected-skill-pill">`,
    `<strong>@${escapeHtml(skill.id)}</strong>`,
    `<button type="button" data-remove-chat-skill="${escapeHtml(skill.id)}" aria-label="${escapeHtml(skill.id)} 제거">×</button>`,
    `</span>`,
  ].join("")).join("");
  container.querySelectorAll("[data-remove-chat-skill]").forEach((button) => {
    button.addEventListener("click", () => toggleChatSkillTag(button.dataset.removeChatSkill));
  });
}

function renderChatPlusMenu() {
  const list = $("#chat-plus-skill-quick-list");
  if (!list) return;
  const tags = availableChatSkillTags().slice(0, 6);
  list.innerHTML = tags.map((skill) => (
    `<button type="button" data-chat-skill-quick="${escapeHtml(skill.id)}">@${escapeHtml(skill.id)}</button>`
  )).join("");
  list.querySelectorAll("[data-chat-skill-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleChatSkillTag(button.dataset.chatSkillQuick);
      closeChatPlusMenu();
    });
  });
}

function chatPendingSummaryText() {
  const pendingFiles = state.chatPendingFiles.length;
  const uploadedFiles = state.chatAttachments.length;
  const tags = state.chatSelectedSkillTags.length;
  const parts = [];
  if (pendingFiles) parts.push(`업로드 대기 ${pendingFiles}개`);
  if (uploadedFiles) parts.push(`첨부 분석 ${uploadedFiles}개`);
  if (tags) parts.push(`스킬 태그 ${tags}개`);
  return parts.join(" · ") || "첨부/태그 없음";
}

function renderChatComposerMeta() {
  const node = $("#chat-pending-summary");
  if (node) node.textContent = chatPendingSummaryText();
}

function openChatPlusMenu() {
  const menu = $("#chat-plus-menu");
  const button = $("#chat-plus-button");
  if (!menu || !button) return;
  renderChatPlusMenu();
  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
}

function closeChatPlusMenu() {
  const menu = $("#chat-plus-menu");
  const button = $("#chat-plus-button");
  if (menu) menu.hidden = true;
  if (button) button.setAttribute("aria-expanded", "false");
}

function toggleChatPlusMenu() {
  const menu = $("#chat-plus-menu");
  if (!menu) return;
  if (menu.hidden) openChatPlusMenu();
  else closeChatPlusMenu();
}

function chatMentionMatch() {
  const input = $("#chat-input");
  if (!input) return null;
  const value = input.value || "";
  const cursor = input.selectionStart ?? value.length;
  const beforeCursor = value.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;
  const query = match[1] || "";
  const start = cursor - query.length - 1;
  const tags = availableChatSkillTags().filter((skill) => {
    const haystack = `${skill.id} ${skill.name} ${skill.type}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  return {
    query,
    start,
    end: cursor,
    tags,
  };
}

function closeChatMentionSuggestions() {
  const node = $("#chat-mention-suggestions");
  if (node) {
    node.hidden = true;
    node.innerHTML = "";
  }
  state.chatMentionActiveIndex = 0;
}

function applyChatMentionSkill(id) {
  const match = chatMentionMatch();
  const input = $("#chat-input");
  if (!match || !input) return;
  input.value = `${input.value.slice(0, match.start)}${input.value.slice(match.end)}`.replace(/\s{2,}/g, " ");
  input.selectionStart = input.selectionEnd = match.start;
  toggleChatSkillTag(id);
  closeChatMentionSuggestions();
  input.focus();
}

function renderChatMentionSuggestions() {
  const node = $("#chat-mention-suggestions");
  if (!node) return;
  const match = chatMentionMatch();
  if (!match || !match.tags.length) {
    closeChatMentionSuggestions();
    return;
  }
  state.chatMentionActiveIndex = Math.max(0, Math.min(state.chatMentionActiveIndex, match.tags.length - 1));
  node.hidden = false;
  node.innerHTML = match.tags.slice(0, 6).map((skill, index) => [
    `<button class="chat-mention-item ${index === state.chatMentionActiveIndex ? "active" : ""}" type="button" data-chat-mention-skill="${escapeHtml(skill.id)}">`,
    `<strong>@${escapeHtml(skill.id)}</strong>`,
    `<small>${escapeHtml(skill.name)} · ${escapeHtml(skill.type)}</small>`,
    `</button>`,
  ].join("")).join("");
  node.querySelectorAll("[data-chat-mention-skill]").forEach((button) => {
    button.addEventListener("click", () => applyChatMentionSkill(button.dataset.chatMentionSkill));
  });
}

function renderChatSkillTags() {
  const container = $("#chat-skill-tag-list");
  if (!container) return;
  const tags = availableChatSkillTags();
  $("#chat-skill-selected-count").textContent = `${state.chatSelectedSkillTags.length}개 선택`;
  if (!tags.length) {
    container.innerHTML = `<p class="spotlite-empty">사용 가능한 스킬 태그를 불러오는 중입니다.</p>`;
    return;
  }
  container.innerHTML = tags.map((skill) => [
    `<button class="chat-skill-tag ${state.chatSelectedSkillTags.includes(skill.id) ? "active" : ""}" data-chat-skill-tag="${escapeHtml(skill.id)}" type="button">`,
    `<strong>#${escapeHtml(skill.id)}</strong>`,
    `<small>${escapeHtml(skill.name)} · ${escapeHtml(skill.type)}</small>`,
    `</button>`,
  ].join("")).join("");
  container.querySelectorAll("[data-chat-skill-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleChatSkillTag(button.dataset.chatSkillTag);
    });
  });
  renderChatSelectedSkillPills();
  renderChatPlusMenu();
  renderChatComposerMeta();
  renderChatMentionSuggestions();
}

function renderChatAttachments() {
  const container = $("#chat-attachment-list");
  if (!container) return;
  const pendingCards = state.chatPendingFiles.map((item) => [
    `<article class="chat-attachment-card pending">`,
    `<div><strong>${escapeHtml(item.name)}</strong><small>업로드 대기 · ${escapeHtml(formatChatFileSize(item.size || 0))}</small></div>`,
    `<p>메시지를 전송하면 업로드와 파일 분석을 먼저 수행한 뒤, 같은 요청 맥락으로 GLM에 전달합니다.</p>`,
    "",
    `<button class="inline-delete" data-attachment-pending-remove="${escapeHtml(item.id)}" type="button">제거</button>`,
    `</article>`,
  ].join(""));
  const uploadedCards = state.chatAttachments.map((item) => [
    `<article class="chat-attachment-card">`,
    `<div><strong>${escapeHtml(item.fileName)}</strong><small>${escapeHtml(item.route)} · ${Math.round((item.size || 0) / 1024)}KB</small></div>`,
    `<p>${escapeHtml((item.analysis || "").replace(new RegExp("[#*_`>-]", "g"), "").slice(0, 220))}</p>`,
    item.analysisPath ? `<button class="inline-delete" data-attachment-open="${escapeHtml(item.analysisPath)}" type="button">분석 보기</button>` : "",
    `<button class="inline-delete" data-attachment-remove="${escapeHtml(item.id)}" type="button">제거</button>`,
    `</article>`,
  ].join("")).join("");
  container.hidden = !(pendingCards || uploadedCards);
  container.innerHTML = `${pendingCards}${uploadedCards}`;
  container.querySelectorAll("[data-attachment-pending-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state.chatPendingFiles = state.chatPendingFiles.filter((item) => item.id !== button.dataset.attachmentPendingRemove);
      renderChatAttachments();
    });
  });
  container.querySelectorAll("[data-attachment-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      state.chatAttachments = state.chatAttachments.filter((item) => item.id !== button.dataset.attachmentRemove);
      renderChatAttachments();
    });
  });
  container.querySelectorAll("[data-attachment-open]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("[data-view='wiki']")?.click();
      openNotionWikiPage(button.dataset.attachmentOpen);
    });
  });
  renderChatComposerMeta();
}

function chatAttachmentContext() {
  if (!state.chatAttachments.length) return "";
  return [
    "",
    "## 첨부 파일 분석 컨텍스트",
    "- 아래 내용은 사용자가 방금 업로드한 파일을 형식별 스킬/VLM 경로로 분석한 보조 컨텍스트다.",
    "- 파일 분석 결과도 확정 지식이 아니라, 원본 파일과 위키 근거 확인 전까지 보조 근거로만 사용한다.",
    "",
    ...state.chatAttachments.map((item, index) => [
      `### 첨부 ${index + 1}. ${item.fileName}`,
      `- route: ${item.route}`,
      `- saved_path: ${item.path}`,
      item.analysisPath ? `- analysis_md: ${item.analysisPath}` : "",
      "",
      item.analysis || "- 분석 결과 없음",
    ].filter(Boolean).join("\n")),
  ].join("\n");
}

function selectedSkillTagContext() {
  if (!state.chatSelectedSkillTags.length) return "";
  return [
    "## 사용자 선택 스킬 태그",
    `- ${state.chatSelectedSkillTags.map((tag) => `#${tag}`).join(", ")}`,
    "- 위 태그는 사용자가 이번 메시지에서 우선 사용하기 원하는 Paperclip/스킬 힌트다.",
  ].join("\n");
}

function queueChatFiles(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  const seen = new Set(state.chatPendingFiles.map((item) => `${item.name}:${item.size}:${item.lastModified}`));
  for (const file of files) {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    state.chatPendingFiles.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    });
  }
  renderChatAttachments();
  setChatPhase("idle", `파일 ${state.chatPendingFiles.length}개가 전송 대기 중입니다. 메시지를 보내면 함께 처리됩니다.`);
  event.target.value = "";
}

async function uploadQueuedChatFiles(note = "") {
  if (!state.chatPendingFiles.length) return;
  const pending = [...state.chatPendingFiles];
  setChatPhase("sending", `파일 ${pending.length}개를 업로드/분석 중입니다.`);
  try {
    for (const item of pending) {
      const form = new FormData();
      form.append("file", item.file);
      form.append("note", note || $("#chat-input")?.value || "");
      const response = await fetch("/api/chat/files", { method: "POST", body: form });
      const responseText = await response.text();
      let payload = {};
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { error: responseText || `HTTP ${response.status}` };
      }
      if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
      state.chatAttachments.push(...(payload.attachments || []));
    }
    state.chatPendingFiles = [];
    renderChatAttachments();
    setChatPhase("idle", "파일 분석 완료. 메시지 전송을 계속 진행합니다.");
  } catch (error) {
    const detail = String(error?.message || "알 수 없는 오류");
    setChatPhase("failed", `파일 업로드/분석 실패: ${detail}`);
    throw error;
  }
}

function appendThinkingMessage() {
  const message = document.createElement("article");
  message.className = "message assistant thinking";
  message.dataset.thinking = "true";
  message.innerHTML = [
    `<div class="thinking-dots"><span></span><span></span><span></span></div>`,
    `<p>GLM이 위키 근거, 프로젝트 메모리, 최근 대화를 검토 중입니다. 완료 전에는 다음 메시지를 막아둡니다.</p>`,
  ].join("");
  $("#chat-log").appendChild(message);
  $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
}

function removeThinkingMessage() {
  document.querySelectorAll("[data-thinking='true']").forEach((node) => node.remove());
}

async function loadChatProjects() {
  const payload = await api("/api/chat/projects");
  if (payload.mock || !payload.projects) return;
  const previous = state.activeChatProjectId;
  state.chatProjects = payload.projects;
  if (payload.global) state.chatGlobal = payload.global;
  const projects = chatProjectsForSpace();
  state.activeChatProjectId = projects.some((project) => project.id === previous)
    ? previous
    : projects[0]?.id || "";
  renderChatProjects();
}

async function loadChatProjectWikiOptions() {
  const payload = await api(`/api/wiki/index?workspace=${encodeURIComponent(wikiWorkspaceParam())}`);
  if (payload.mock || !payload.pages) return;
  const seen = new Map();
  for (const page of payload.pages) {
    if (!["project", "account"].includes(page.division)) continue;
    if (!page.projectKey) continue;
    const next = {
      workspace: wikiWorkspaceParam(),
      projectKey: page.projectKey,
      projectLabel: page.projectLabel || page.projectKey,
      path: page.path,
      isProjectHub: Boolean(page.isProjectHub),
    };
    const existing = seen.get(page.projectKey);
    if (!existing || (!existing.isProjectHub && next.isProjectHub)) {
      seen.set(page.projectKey, next);
    }
  }
  state.chatProjectWikiOptions = [
    ...state.chatProjectWikiOptions.filter((item) => item.workspace !== wikiWorkspaceParam()),
    ...[...seen.values()]
      .map(({ isProjectHub, ...item }) => item)
      .sort((a, b) => a.projectLabel.localeCompare(b.projectLabel)),
  ];
  renderChatLinkedProjectOptions();
}

async function saveChatGlobal() {
  const result = await api("/api/chat/global", {
    method: "POST",
    body: JSON.stringify({
      instructions: $("#chat-global-instructions").value.trim(),
      autoMemory: $("#chat-auto-memory").checked,
    }),
  });
  if (result.global) state.chatGlobal = result.global;
  renderChatProjects();
}

function latestRun() {
  return state.running[0] || state.runs[0] || null;
}

function renderAutomationState() {
  const latest = latestRun();
  const running = state.running[0];
  const progress = running?.progress || latest?.progress || {};
  const panel = $(".side-run-panel");
  const status = running ? "running" : latest?.status || "idle";
  panel.classList.remove("running", "failed", "stopped", "stopping");
  if (["running", "failed", "stopped", "stopping"].includes(status)) panel.classList.add(status);
  $("#side-run-status").textContent = running ? "자동화 실행 중" : latest ? `최근 상태: ${latest.status}` : "자동화 대기";
  $("#side-run-command").textContent = running?.command || latest?.command || "실행 중인 작업 없음";
  $("#side-run-detail").textContent = running
    ? [
        progress.percent != null ? `${progress.percent}%` : "",
        progress.transferred || "",
        progress.speed || "",
        progress.currentFile ? `현재: ${progress.currentFile}` : "",
        `시작: ${running.startedAt}`,
      ].filter(Boolean).join(" · ")
    : latest
      ? (progress.summary || latest.stderr || latest.stdout || latest.createdAt || "").slice(-500) || "세부 로그 없음"
      : "에러와 진행 로그가 여기에 표시됩니다.";
  $("#side-stop-run").disabled = !running;
  $("#stop-run").disabled = !running;
  $("#automation-live-status").textContent = running ? `${running.command} 실행 중` : "대기 중";
  renderRcloneLiveProgress(running || latest);
}

function renderRcloneLiveProgress(run) {
  const target = $("#rclone-live-progress");
  if (!target) return;
  const progress = run?.progress || {};
  if (!run || !String(run.command || "").includes("rclone-copy")) {
    target.innerHTML = `<strong>rclone 진행 신호 대기</strong><span>수집 실행 중 전송량, 속도, 현재 파일, 최근 로그가 표시됩니다.</span>`;
    return;
  }
  target.innerHTML = [
    `<strong>${run.status === "running" ? "rclone 수집 진행 중" : `rclone 최근 상태: ${escapeHtml(run.status || "unknown")}`}</strong>`,
    `<div class="rclone-progress-grid">`,
    `<span>진행률 <b>${progress.percent != null ? `${escapeHtml(String(progress.percent))}%` : "-"}</b></span>`,
    `<span>전송량 <b>${escapeHtml(progress.transferred || "-")}</b></span>`,
    `<span>속도 <b>${escapeHtml(progress.speed || "-")}</b></span>`,
    `<span>ETA <b>${escapeHtml(progress.eta || "-")}</b></span>`,
    `</div>`,
    progress.currentFile ? `<p><b>현재 파일</b> ${escapeHtml(progress.currentFile)}</p>` : "",
    progress.summary ? `<p><b>rclone stats</b> ${escapeHtml(progress.summary)}</p>` : "",
    progress.recentLines?.length ? `<pre>${escapeHtml(progress.recentLines.join("\n"))}</pre>` : "",
  ].join("");
}

function renderSchedules() {
  $("#schedule-count").textContent = `${state.schedules.length}건`;
  const rows = state.schedules.map((schedule) => ({
    command: schedule.name || schedule.command,
    status: `${schedule.enabled ? "활성" : "비활성"} · ${schedule.mode}`,
    detail: [
      `${schedule.command}${schedule.dryRun ? " --dry-run" : ""}`,
      schedule.nextRunAt ? `다음: ${new Date(schedule.nextRunAt).toLocaleString("ko-KR")}` : "다음 실행 없음",
      `<button class="inline-delete" data-schedule-delete="${escapeHtml(schedule.id)}">삭제</button>`,
    ].join(" · "),
  }));
  renderEvents("#schedule-list", rows.length ? rows : [{ command: "예약 없음", status: "대기", detail: "원하는 시간/간격을 정해 자동 실행을 예약하세요." }]);
  document.querySelectorAll("[data-schedule-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteSchedule(button.dataset.scheduleDelete));
  });
}

function renderSkills() {
  $("#skill-count").textContent = `${state.skills.length}개`;
  const executable = state.skills.filter((skill) => skill.status === "applied");
  const selected = $("#skill-select").value;
  $("#skill-select").innerHTML = executable
    .map((skill) => `<option value="${escapeHtml(skill.id)}">${escapeHtml(skill.name)}</option>`)
    .join("");
  if (selected && executable.some((skill) => skill.id === selected)) $("#skill-select").value = selected;

  $("#skill-list").innerHTML = state.skills
    .map((skill) => [
      `<article class="skill-card ${escapeHtml(skill.status)}">`,
      `<div><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.type)} · ${escapeHtml(skill.status)} · ${escapeHtml(skill.safety)}</small></div>`,
      `<p>${escapeHtml(skill.description)}</p>`,
      `<small>추천: ${escapeHtml((skill.bestFor || []).join(", "))}</small>`,
      `</article>`,
    ].join(""))
    .join("");
}

function renderPaperclip(status) {
  if (!status) return;
  const templates = status.templates || state.paperclipTemplates || [];
  const tasks = status.tasks || state.paperclipTasks || [];
  const events = status.events || state.paperclipEvents || [];
  state.paperclipTemplates = templates;
  state.paperclipTasks = tasks;
  state.paperclipEvents = events;
  renderChatSkillTags();

  $("#paperclip-status").textContent = status.status || "대기";
  $("#paperclip-url").textContent = status.url || "-";
  $("#paperclip-task-count").textContent = `${tasks.length}건`;
  $("#paperclip-event-count").textContent = `${events.length}건`;
  $("#paperclip-template-count").textContent = `${templates.length}개`;

  const selector = $("#paperclip-template");
  const selected = selector.value;
  selector.innerHTML = templates
    .map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.agent)} · ${escapeHtml(template.title)}</option>`)
    .join("");
  if (selected && templates.some((template) => template.id === selected)) selector.value = selected;

  $("#paperclip-templates").innerHTML = templates
    .map((template) => [
      `<article class="template-card">`,
      `<strong>${escapeHtml(template.agent)}</strong>`,
      `<small>${escapeHtml(template.id)} · ${escapeHtml(template.safety)}</small>`,
      `<p>${escapeHtml(template.description)}</p>`,
      template.inputHint ? `<small>입력: ${escapeHtml(template.inputHint)}</small>` : "",
      `</article>`,
    ].join(""))
    .join("");

  const taskEvents = tasks.map((task) => ({
    command: task.title,
    status: `${task.status} · ${task.agent}`,
    detail: [
      `${task.command}${task.dryRun ? " --dry-run" : ""}`,
      ["queued", "agent_suggested", "failed"].includes(task.status) ? `<button class="inline-delete" data-paperclip-run="${escapeHtml(task.id)}">승인 실행</button>` : "",
      task.result?.path ? `<button class="inline-delete" data-paperclip-open="${escapeHtml(task.result.path)}">결과 보기</button>` : "",
      task.result?.markdown ? `<button class="inline-delete" data-paperclip-download="${escapeHtml(task.id)}">MD 다운로드</button>` : "",
      task.result?.decisionQueueItemId ? `Decision Queue: ${escapeHtml(task.result.decisionQueueItemId)}` : "",
      task.createdAt,
    ].filter(Boolean).join(" · "),
  }));
  renderEvents("#paperclip-tasks", taskEvents.length ? taskEvents : [{ command: "작업 없음", status: "대기", detail: "템플릿에서 task를 생성하세요." }]);
  document.querySelectorAll("[data-paperclip-run]").forEach((button) => {
    button.addEventListener("click", () => triggerExistingPaperclipTask(button.dataset.paperclipRun));
  });
  document.querySelectorAll("[data-paperclip-open]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("[data-view='wiki']")?.click();
      openNotionWikiPage(button.dataset.paperclipOpen);
    });
  });
  document.querySelectorAll("[data-paperclip-download]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = tasks.find((item) => item.id === button.dataset.paperclipDownload);
      downloadText(`${task?.templateId || "paperclip-output"}.md`, task?.result?.markdown || "");
    });
  });

  const eventRows = events.map((event) => ({
    command: event.type,
    status: event.taskId || "paperclip",
    detail: `${event.message || ""} · ${event.createdAt || ""}`,
  }));
  renderEvents("#paperclip-events", eventRows.length ? eventRows : [{ command: "이벤트 없음", status: "대기", detail: "task 생성/실행 이벤트가 여기에 쌓입니다." }]);
}

async function api(path, options = {}) {
  try {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: text || `HTTP ${response.status}` };
    }
    if (!response.ok) {
      return { ...payload, error: payload.error || `HTTP ${response.status}` };
    }
    return payload;
  } catch (error) {
    return { error: error.message, mock: true };
  }
}

async function apiStream(path, payload, handlers = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let errorPayload = {};
    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = { error: `HTTP ${response.status}` };
    }
    handlers.error?.(errorPayload);
    return errorPayload;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (rawEvent) => {
    const lines = rawEvent.split("\n");
    const event = lines.find((line) => line.startsWith("event:"))?.replace(/^event:\s*/, "").trim() || "message";
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!dataLine) return;
    let data = {};
    try {
      data = JSON.parse(dataLine.replace(/^data:\s*/, ""));
    } catch {
      data = { raw: dataLine };
    }
    handlers[event]?.(data);
    handlers.message?.({ event, data });
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    events.filter(Boolean).forEach(dispatch);
  }
  if (buffer.trim()) dispatch(buffer);
  return { status: "stream_complete" };
}

async function refreshStatus() {
  const result = await api("/api/status");
  if (!result.mock && result.status) {
    state.status = result.status;
  }
  await refreshCoverage();
  const automation = await api("/api/automation/status");
  if (!automation.mock) {
    state.running = automation.running || [];
    state.schedules = automation.schedules || [];
    state.runs = (automation.runs || []).map((run) => ({
      ...run,
      command: run.command,
      status: run.status,
      detail: run.stderr || run.stdout || run.createdAt,
    }));
    renderEvents("#run-list", state.runs);
    $("#run-count").textContent = `${state.runs.length}건`;
    renderAutomationState();
    renderSchedules();
  }
  const paperclip = await api("/api/paperclip/status");
  if (!paperclip.mock) {
    state.paperclip = paperclip.recommendedAgents.map((agent) => ({
      command: agent,
      status: paperclip.available ? "브리지 연결됨" : "계획됨",
      detail: paperclip.url,
    }));
    renderPaperclip(paperclip);
  }
  if (!state.chatProjects.length) await loadChatProjects();
  const skills = await api("/api/skills/catalog");
  if (!skills.mock && skills.skills) {
    state.skills = skills.skills;
    renderSkills();
    renderChatSkillTags();
  }
  renderStatus();
  await loadSettings();
}

async function refreshCoverage() {
  const payload = await api("/api/coverage");
  if (payload.mock || payload.error) {
    $("#coverage-details").textContent = "커버리지 API 연결 대기";
    return;
  }
  state.coverage = payload;
  $("#coverage-label").textContent = payload.label;
  $("#coverage-percent").textContent = `${payload.progressPercent}%`;
  $("#coverage-fill").style.width = `${payload.progressPercent}%`;
  const statuses = payload.statuses || {};
  $("#coverage-details").textContent = [
    `Drive ${payload.drivesTracked}개`,
    `폴더 ${payload.totalFolders}개`,
    `expanded ${statuses.expanded || 0}`,
    `done ${statuses.done || 0}`,
    `queued ${statuses.queued || 0}`,
    `hold ${statuses.hold || 0}`,
    `retry ${statuses.retry || 0}`,
    `manifest ${payload.documentsInManifest}건`,
    `processed ${payload.processedDocuments}건`,
  ].join(" · ");
}

function renderDriveTargets(payload = {}) {
  const candidates = payload.candidates || state.driveTargets || [];
  state.driveTargets = candidates;
  const status = $("#target-analysis-status");
  if (status) {
    const summary = payload.summary;
    status.textContent = summary
      ? `후보 ${candidates.length}개 · Drive 폴더 ${summary.driveFolders}개 · 위키 프로젝트 ${summary.wikiProjects}개`
      : `후보 ${candidates.length}개`;
  }
  const list = $("#target-candidate-list");
  if (!list) return;
  if (!candidates.length) {
    list.innerHTML = `<p class="pipeline-note">표적 분석 후보가 아직 없습니다.</p>`;
    return;
  }
  list.innerHTML = candidates.slice(0, 8).map((candidate, index) => [
    `<article class="target-candidate ${escapeHtml(candidate.priority)}">`,
    `<div>`,
    `<strong>${index + 1}. ${escapeHtml(candidate.folder)}</strong>`,
    `<small>${escapeHtml(candidate.priority)} · score ${candidate.score} · ${escapeHtml(candidate.remotePath)}</small>`,
    `<p>${escapeHtml((candidate.reasons || []).join(" / "))}</p>`,
    `</div>`,
    `<div class="target-buttons">`,
    `<button class="command-button" data-target-copy="${escapeHtml(candidate.remotePath)}" data-dry-run="true" type="button">copy 미리보기</button>`,
    `<button class="command-button accent" data-target-copy="${escapeHtml(candidate.remotePath)}" data-dry-run="false" type="button">선택 수집</button>`,
    `</div>`,
    `</article>`,
  ].join("")).join("");
  document.querySelectorAll("[data-target-copy]").forEach((button) => {
    button.addEventListener("click", () => runTargetCopy(button));
  });
}

function renderDriveInstructionPlan(payload = {}) {
  const plan = payload.plan || {};
  const container = $("#drive-instruction-plan");
  if (!container) return;
  container.innerHTML = [
    `<article class="drive-plan-card">`,
    `<strong>${escapeHtml(plan.intent || "target_collect")} · ${escapeHtml(plan.provider || "local")}</strong>`,
    `<p>키워드: ${(plan.keywords || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("") || "<span>없음</span>"}</p>`,
    `<p>후보: ${escapeHtml(String(payload.candidates?.length || 0))}개 · 지시 매칭: ${escapeHtml(String(payload.summary?.instructionMatches || 0))}개</p>`,
    plan.upstreamStatus ? `<small>GLM 상태: ${escapeHtml(plan.upstreamStatus)}</small>` : "",
    `<small>안전 규칙: rclone copy만 생성합니다. 원본 Google Drive 삭제/수정은 금지됩니다.</small>`,
    `</article>`,
  ].join("");
}

async function analyzeDriveInstructionTargets() {
  const input = $("#drive-instruction-input");
  const instruction = input?.value.trim() || "";
  if (!instruction) return;
  $("#drive-instruction-status").textContent = "GLM/로컬 규칙으로 표적 계획 생성 중";
  $("#target-analysis-status").textContent = "지시 기반 표적 분석 중";
  const payload = await api("/api/drive/instruction-targets", {
    method: "POST",
    body: JSON.stringify({ instruction }),
  });
  if (payload.error || payload.mock) {
    $("#drive-instruction-status").textContent = `실패: ${payload.error || "API 연결 대기"}`;
    return;
  }
  $("#drive-instruction-status").textContent = `${payload.plan?.provider || "local"} 계획 완료 · 후보 ${payload.candidates?.length || 0}개`;
  renderDriveInstructionPlan(payload);
  renderDriveTargets(payload);
}

async function analyzeDriveTargets() {
  $("#target-analysis-status").textContent = "분석 중: 위키/manifest/coverage/rclone lsd를 대조합니다.";
  const payload = await api("/api/drive/targets", { method: "POST", body: JSON.stringify({}) });
  if (payload.error || payload.mock) {
    $("#target-analysis-status").textContent = `분석 실패: ${payload.error || "API 연결 대기"}`;
    return;
  }
  renderDriveTargets(payload);
}

async function runTargetCopy(button) {
  const remotePath = button.dataset.targetCopy;
  const dryRun = button.dataset.dryRun !== "false";
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = dryRun ? "미리보기 중..." : "수집 중...";
  const result = await api("/api/automation/target-rclone-copy", {
    method: "POST",
    body: JSON.stringify({ remotePath, dryRun }),
  }).finally(() => {
    button.disabled = false;
    button.textContent = originalLabel;
  });
  state.runs.unshift({
    command: dryRun ? `target rclone dry-run: ${remotePath}` : `target rclone copy: ${remotePath}`,
    status: result.status || "failed",
    detail: result.error || result.stdout || `Run id: ${result.runId}`,
  });
  renderEvents("#run-list", state.runs);
  $("#run-count").textContent = `${state.runs.length}건`;
  await refreshStatus();
}

async function loadSettings() {
  const payload = await api("/api/settings");
  if (payload.mock || !payload.settings) {
    $("#settings-status").textContent = "설정 API 연결 대기";
    return;
  }
  const form = $("#operation-settings");
  Object.entries(payload.settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field) field.value = value;
  });
  if (form.elements.DRIVE_DELETE_SOURCE) {
    form.elements.DRIVE_DELETE_SOURCE.value = payload.locked?.DRIVE_DELETE_SOURCE || "false";
  }
  if (payload.secrets?.GLM_API_KEY) {
    form.elements.GLM_API_KEY.placeholder = "저장된 키 있음";
  }
  if (payload.secrets?.OPENCLAW_API_KEY) {
    form.elements.OPENCLAW_API_KEY.placeholder = "저장된 키 있음";
  }
  if (payload.secrets?.PAPERCLIP_API_KEY) {
    form.elements.PAPERCLIP_API_KEY.placeholder = "저장된 키 있음";
  }
  if (form.elements.SPOTLITE_PERSONAL_PIN) {
    form.elements.SPOTLITE_PERSONAL_PIN.value = personalSpotlitePin();
  }
  syncChatRuntimeControls(payload.settings);
  $("#settings-status").textContent = "설정 불러옴";
}

function syncChatRuntimeControls(settings = {}) {
  const maxTokens = $("#chat-max-tokens");
  const contextMode = $("#chat-context-mode");
  const modelSelect = $("#chat-model-select");
  const activeModel = settings.GLM_MODEL || "glm-5.1";
  const modelList = (settings.GLM_AVAILABLE_MODELS || "glm-5.1,glm-4.5,glm-4.5-air,glm-4.5-flash,glm-4-flash")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const models = [...new Set([activeModel, ...modelList])];
  if (modelSelect) {
    modelSelect.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
    modelSelect.value = activeModel;
  }
  if (maxTokens) maxTokens.value = settings.GLM_CHAT_MAX_TOKENS || "10000";
  if (contextMode) contextMode.value = settings.GLM_CONTEXT_MODE || "standard";
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const settings = {};
  Object.keys(settingLabels).forEach((key) => {
    const field = form.elements[key];
    if (field) settings[key] = field.value.trim();
  });
  $("#settings-status").textContent = "저장 중";
  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify({ settings }),
  });
  if (result.error) {
    $("#settings-status").textContent = `저장 실패: ${result.error}`;
    return;
  }
  const pinField = form.elements.SPOTLITE_PERSONAL_PIN;
  if (pinField?.value.trim()) {
    const pin = pinField.value.trim();
    if (/^\d{4}$/.test(pin)) {
      localStorage.setItem("spotlite_personal_pin", pin);
    } else {
      $("#settings-status").textContent = "저장 완료 · 개인 PIN은 숫자 4자리만 허용";
      return;
    }
  }
  $("#settings-status").textContent = "저장 완료";
  syncChatRuntimeControls(result.settings || settings);
  await refreshStatus();
}

async function saveChatRuntimeSettings() {
  const maxTokens = $("#chat-max-tokens")?.value.trim() || "10000";
  const contextMode = $("#chat-context-mode")?.value || "standard";
  const model = $("#chat-model-select")?.value || "glm-5.1";
  const parsed = Number(maxTokens);
  if (!Number.isFinite(parsed) || parsed < 256) {
    setChatPhase("failed", "출력 토큰은 256 이상 숫자로 설정하세요.");
    return;
  }
  setChatPhase("saving", "챗 런타임 설정 저장 중");
  const result = await api("/api/settings", {
    method: "POST",
    body: JSON.stringify({
      settings: {
        GLM_MODEL: model,
        GLM_CHAT_MAX_TOKENS: String(Math.floor(parsed)),
        GLM_CONTEXT_MODE: contextMode,
      },
    }),
  });
  if (result.error) {
    setChatPhase("failed", `챗 설정 저장 실패: ${result.error}`);
    return;
  }
  syncChatRuntimeControls(result.settings || {});
  $("#chat-settings-modal")?.close?.();
  setChatPhase("idle", `챗 설정 저장 완료: ${model} · 출력 ${Math.floor(parsed)} tokens · ${contextMode}`);
}

function openChatSettingsModal() {
  const modal = $("#chat-settings-modal");
  if (!modal) return;
  if (typeof modal.showModal === "function") modal.showModal();
  else modal.setAttribute("open", "open");
}

function closeChatSettingsModal() {
  const modal = $("#chat-settings-modal");
  if (!modal) return;
  if (typeof modal.close === "function") modal.close();
  else modal.removeAttribute("open");
}

function openChatProjectSettingsModal() {
  const modal = $("#chat-project-settings-modal");
  if (!modal) return;
  loadChatProjectWikiOptions();
  if (typeof modal.showModal === "function") modal.showModal();
  else modal.setAttribute("open", "open");
}

function closeChatProjectSettingsModal() {
  const modal = $("#chat-project-settings-modal");
  if (!modal) return;
  if (typeof modal.close === "function") modal.close();
  else modal.removeAttribute("open");
}

function slugForDom(value) {
  return String(value || "section")
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "section";
}

function renderSectionAnchors(viewId = "operations") {
  const container = $("#section-anchors");
  const view = document.getElementById(viewId);
  if (!container || !view) return;
  let track = container.querySelector(".section-anchor-track");
  if (!track) {
    track = document.createElement("div");
    track.className = "section-anchor-track";
    container.appendChild(track);
  }
  const sections = [...view.querySelectorAll("[data-anchor]")];
  if (!sections.length) {
    track.innerHTML = "";
    container.hidden = true;
    return;
  }
  container.hidden = false;
  track.innerHTML = sections.map((section, index) => {
    const label = section.dataset.anchor;
    const id = section.id || `${viewId}-${slugForDom(label)}-${index}`;
    section.id = id;
    return `<button type="button" data-anchor-target="${escapeHtml(id)}" class="${index === 0 ? "active" : ""}"><span>${escapeHtml(label)}</span></button>`;
  }).join("");
  track.querySelectorAll("[data-anchor-target]").forEach((button) => {
    button.addEventListener("click", () => {
      track.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.anchorTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function workspaceLabel() {
  return state.activeSpace === "personal" ? "개인용" : "업무용(RTM)";
}

function resolveViewId(viewId) {
  if (viewId === "spotlite") return state.activeSpace === "personal" ? "spotlite-personal" : "mission";
  return viewId;
}

function logicalViewId(viewId) {
  if (viewId === "spotlite-personal") return "spotlite";
  return viewId;
}

function updateWorkspaceChrome() {
  const isPersonal = state.activeSpace === "personal";
  document.body.dataset.workspace = state.activeSpace;
  const selector = $("#wiki-space-select");
  if (selector) selector.value = state.activeSpace;
  $("#spotlite-nav-item").textContent = "개인 Spotlite";
  $("#spotlite-nav-item")?.classList.toggle("hidden", !isPersonal);
  $("#wiki-nav-item").textContent = isPersonal ? "개인 위키" : "업무 위키";
  $("#ingest-nav-item").textContent = isPersonal ? "개인 지식 주입" : "업무 지식 주입";
  $("#chat-nav-item").textContent = isPersonal ? "개인 GLM 챗" : "업무 GLM 챗";
  $("#decisions-nav-item").textContent = "정합성 대기";
  syncAssistantUiFrame();
}

function activateWorkspace(space) {
  state.activeSpace = space === "personal" ? "personal" : "work";
  localStorage.setItem("wiki_ops_active_space", state.activeSpace);
  state.wikiPages = [];
  state.activeWikiPath = "";
  state.activeProjectKey = "";
  updateWorkspaceChrome();
  loadChatProjects();
  loadChatProjectWikiOptions();
  const current = document.querySelector(".view.active")?.id || "mission";
  activateView(logicalViewId(current));
}

function activateView(viewId) {
  const logicalId = logicalViewId(viewId);
  const actualViewId = resolveViewId(logicalId);
  const assistantUiSurface = ASSISTANT_UI_TOP_LEVEL_VIEWS[actualViewId] || ASSISTANT_UI_TOP_LEVEL_VIEWS[logicalId];
  const legacyMode = new URLSearchParams(window.location.search).get("legacy") === "1";
  if (assistantUiSurface && !legacyMode) {
    window.location.replace(assistantUiTopLevelUrl(assistantUiSurface));
    return;
  }
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === logicalId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === actualViewId));
  $("#view-title").textContent = logicalId === "spotlite"
    ? "개인 Spotlite"
    : `${workspaceLabel()} · ${titles[actualViewId] || titles[logicalId] || actualViewId}`;
  updateWorkspaceChrome();
  renderSectionAnchors(actualViewId);
  if (actualViewId === "mission") {
    loadMissionControl();
    if (!state.spotlite.work) loadSpotlite("work");
    else renderSpotlite("work", state.spotlite.work);
  }
  if (actualViewId === "decisions") {
    if (state.decisionQueue.length) renderDecisionWorkbench();
    else loadMissionControl();
  }
  if (actualViewId === "spotlite-personal") renderPersonalLock();
  if (actualViewId === "spotlite-personal") renderSpotliteTemplates("personal");
  if (actualViewId === "pipeline") loadSlackRouting();
  if (actualViewId === "wiki") loadNotionWikiBrowser();
  history.replaceState(null, "", `#${logicalId}`);
  $(".workspace")?.scrollTo?.({ top: 0, behavior: "smooth" });
}

async function triggerCommand(button) {
  const command = button.dataset.command;
  const dryRun = button.dataset.dryRun === "true";
  const label = dryRun ? `${command} dry-run` : command;
  const originalLabel = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = originalLabel;
  button.disabled = true;
  button.textContent = dryRun ? "미리보기 실행 중..." : "실행 중...";
  const result = await api("/api/automation/trigger", {
    method: "POST",
    body: JSON.stringify({ command, dryRun }),
  }).finally(() => {
    button.disabled = false;
    button.textContent = originalLabel;
  });
  const status = result.mock ? "mock 대기" : result.status;
  state.runs.unshift({
    command: label,
    status,
    detail: result.error || (result.mock ? "Backend API 연결 대기" : `Run id: ${result.runId}`),
  });
  renderEvents("#run-list", state.runs);
  $("#run-count").textContent = `${state.runs.length}건`;
  await refreshStatus();
}

async function continueAfterCollection() {
  const button = $("#continue-after-collection");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "후속 단계 실행 중...";
  const result = await api("/api/automation/continue-after-collection", {
    method: "POST",
    body: JSON.stringify({}),
  }).finally(() => {
    button.disabled = false;
    button.textContent = originalLabel;
  });
  if (result.status === "blocked") {
    $("#automation-live-status").textContent = "수집 실행 중이라 후속 단계 대기";
  } else if (result.error) {
    $("#automation-live-status").textContent = `후속 단계 실패: ${result.error}`;
  } else {
    $("#automation-live-status").textContent = `후속 단계 ${result.status}`;
  }
  await refreshStatus();
}

async function triggerOpenClaw() {
  const button = $("#openclaw-trigger");
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "오픈클로 실행 중...";
  const result = await api("/api/openclaw/trigger", {
    method: "POST",
    body: JSON.stringify({ task: "drive_wikify_cycle", dryRun: true }),
  }).finally(() => {
    button.disabled = false;
    button.textContent = originalLabel;
  });
  state.runs.unshift({
    command: "openclaw-trigger",
    status: result.status || "대기",
    detail: result.error || result.stdout || "OpenClaw 로컬 자동화 트리거를 실행했습니다.",
  });
  renderEvents("#run-list", state.runs);
  $("#run-count").textContent = `${state.runs.length}건`;
  renderAutomationState();
}

async function stopCurrentRun() {
  const runId = state.running[0]?.runId || "";
  const result = await api("/api/automation/stop", {
    method: "POST",
    body: JSON.stringify({ runId }),
  });
  $("#automation-live-status").textContent = result.status === "stopping" ? "중지 요청됨" : "실행 중인 작업 없음";
  await refreshStatus();
}

async function createSchedule(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const body = {
    name: form.elements.name.value.trim(),
    command: form.elements.command.value,
    mode: form.elements.mode.value,
    timeOfDay: form.elements.timeOfDay.value,
    intervalMinutes: Number(form.elements.intervalMinutes.value || 60),
    runAt: form.elements.runAt.value ? new Date(form.elements.runAt.value).toISOString() : "",
    dryRun: form.elements.dryRun.checked,
  };
  const result = await api("/api/automation/schedules", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (result.error) {
    $("#automation-live-status").textContent = `예약 실패: ${result.error}`;
    return;
  }
  form.elements.name.value = "";
  await refreshStatus();
}

async function deleteSchedule(id) {
  await api(`/api/automation/schedules/${encodeURIComponent(id)}`, { method: "DELETE" });
  await refreshStatus();
}

async function saveChatProject() {
  const id = $("#chat-project-select").value || undefined;
  const linkedProjectKey = $("#chat-linked-wiki-project")?.value?.trim() || "";
  const linkedOption = chatWikiProjectOptionsForSpace().find((item) => item.projectKey === linkedProjectKey) || null;
  const result = await api("/api/chat/projects", {
    method: "POST",
    body: JSON.stringify({
      id,
      name: $("#chat-project-name").value.trim(),
      instructions: $("#chat-project-instructions").value.trim(),
      workspace: state.activeSpace,
      linkedWikiProject: linkedOption ? {
        workspace: linkedOption.workspace,
        projectKey: linkedOption.projectKey,
        projectLabel: linkedOption.projectLabel,
        path: linkedOption.path,
      } : null,
    }),
  });
  if (result.project) state.activeChatProjectId = result.project.id;
  await loadChatProjects();
}

async function createNewChatProject() {
  $("#chat-project-name").value = "새 GLM 프로젝트";
  $("#chat-project-instructions").value = "이 프로젝트에만 적용되는 고객/범위/산출물/금지 표현을 적는다.";
  const linkedProjectKey = $("#chat-linked-wiki-project")?.value?.trim() || "";
  const linkedOption = chatWikiProjectOptionsForSpace().find((item) => item.projectKey === linkedProjectKey) || null;
  const result = await api("/api/chat/projects", {
    method: "POST",
    body: JSON.stringify({
      name: $("#chat-project-name").value.trim() || "새 GLM 프로젝트",
      instructions: $("#chat-project-instructions").value.trim(),
      workspace: state.activeSpace,
      linkedWikiProject: linkedOption ? {
        workspace: linkedOption.workspace,
        projectKey: linkedOption.projectKey,
        projectLabel: linkedOption.projectLabel,
        path: linkedOption.path,
      } : null,
    }),
  });
  if (result.project) state.activeChatProjectId = result.project.id;
  await loadChatProjects();
}

async function ensureActiveChatProject() {
  if (activeChatProject()) return activeChatProject();
  const result = await api("/api/chat/projects", {
    method: "POST",
    body: JSON.stringify({
      name: state.activeSpace === "personal" ? "기본 개인 챗" : "기본 업무 챗",
      instructions: state.activeSpace === "personal"
        ? "개인용 위키와 개인 메모리 범위에서만 답한다."
        : "업무용 RTM 위키와 고객 프로젝트 운영 범위에서 답한다.",
      workspace: state.activeSpace,
    }),
  });
  if (result.project) state.activeChatProjectId = result.project.id;
  await loadChatProjects();
  return activeChatProject();
}

async function deleteChatProject() {
  const id = state.activeChatProjectId;
  if (!id) return;
  await api(`/api/chat/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadChatProjects();
}

async function addChatMemory() {
  if (!state.activeChatProjectId) return;
  const result = await api(`/api/chat/projects/${encodeURIComponent(state.activeChatProjectId)}/memories`, {
    method: "POST",
    body: JSON.stringify({
      title: $("#chat-memory-title").value.trim(),
      content: $("#chat-memory-content").value.trim(),
    }),
  });
  if (!result.error) {
    $("#chat-memory-title").value = "";
    $("#chat-memory-content").value = "";
  }
  await loadChatProjects();
}

async function deleteChatMemory(memoryId) {
  if (!state.activeChatProjectId || !memoryId) return;
  await api(`/api/chat/projects/${encodeURIComponent(state.activeChatProjectId)}/memories/${encodeURIComponent(memoryId)}`, { method: "DELETE" });
  await loadChatProjects();
}

async function createSkillDraft() {
  const result = await api("/api/skills/draft", {
    method: "POST",
    body: JSON.stringify({
      skillId: $("#skill-select").value,
      title: $("#skill-title").value.trim(),
      context: $("#skill-context").value.trim(),
    }),
  });
  if (result.error) {
    $("#skill-output").textContent = `생성 실패: ${result.error}`;
    return;
  }
  const fileName = (result.path || "wiki-ops-output.md").split("/").pop();
  $("#skill-output").innerHTML = [
    `<div class="output-actions"><div><strong>생성 완료</strong><small>${escapeHtml(result.path)}</small></div><button id="skill-download-button" class="command-button" type="button">MD 다운로드</button></div>`,
    renderMarkdownDocument(result.markdown),
  ].join("");
  $("#skill-download-button").addEventListener("click", () => downloadText(fileName, result.markdown));
}

async function refreshPaperclip() {
  const payload = await api("/api/paperclip/status");
  if (payload.mock || payload.error) {
    $("#paperclip-status").textContent = payload.error || "연결 대기";
    return;
  }
  renderPaperclip(payload);
}

function paperclipPayload() {
  const raw = $("#paperclip-payload").value.trim();
  return {
    templateId: $("#paperclip-template").value,
    title: $("#paperclip-title").value.trim(),
    payload: {
      note: raw,
      createdFrom: "wiki_frontend",
    },
  };
}

async function createPaperclipTask() {
  const result = await api("/api/paperclip/tasks", {
    method: "POST",
    body: JSON.stringify(paperclipPayload()),
  });
  if (result.error) {
    $("#paperclip-status").textContent = `task 생성 실패: ${result.error}`;
    return;
  }
  $("#paperclip-title").value = "";
  $("#paperclip-payload").value = "";
  await refreshPaperclip();
}

async function triggerPaperclipTask() {
  const result = await api("/api/paperclip/trigger", {
    method: "POST",
    body: JSON.stringify(paperclipPayload()),
  });
  if (result.error) {
    $("#paperclip-status").textContent = `task 실행 실패: ${result.error}`;
    return;
  }
  $("#paperclip-title").value = "";
  $("#paperclip-payload").value = "";
  await refreshPaperclip();
  await refreshStatus();
}

async function triggerExistingPaperclipTask(taskId) {
  if (!taskId) return;
  $("#paperclip-status").textContent = "선택한 Paperclip task 실행 중...";
  const result = await api(`/api/paperclip/tasks/${encodeURIComponent(taskId)}/trigger`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (result.error) {
    $("#paperclip-status").textContent = `task 실행 실패: ${result.error}`;
    return;
  }
  await refreshPaperclip();
  await refreshStatus();
}

async function searchWiki() {
  const query = $("#wiki-query").value.trim();
  const results = $("#search-results");
  results.innerHTML = "";
  state.searchResults = [];
  state.selectedSearchPaths = new Set();
  state.wikiFilters.query = query;
  const notionSearch = $("#notion-wiki-search");
  if (notionSearch) notionSearch.value = query;
  renderNotionWikiContent();
  $("#search-result-count").textContent = "0건";
  updateSelectedCount();
  $("#search-brief-provider").textContent = "사용자 선택 후 정리";
  $("#search-brief").textContent = "검색 결과에서 근거 Markdown을 선택한 뒤 GLM 정리를 실행하세요.";
  $("#search-doc-title").textContent = "선택 문서";
  $("#search-doc-path").textContent = "근거 문서를 선택";
  $("#search-doc-body").textContent = "검색 결과를 누르면 이 자리에서 Markdown을 읽기 좋게 보여주고, 아래 위키 브라우저의 문서 보기에도 함께 연결됩니다.";
  if (!query) return;

  $("#search-brief-provider").textContent = "검색 완료 대기";
  $("#search-brief").textContent = "검색은 빠르게 수행하고, GLM 정리는 선택 후 실행합니다.";
  const payload = await api(`/api/wiki/search?q=${encodeURIComponent(query)}&workspace=${encodeURIComponent(wikiWorkspaceParam())}`);
  const items = payload.mock
    ? [
        {
          title: "Drive Wikify Automation Loop",
          path: "obsidian/Wiki/Common/Drive_Wikify_Automation_Loop.md",
          snippet: "수집 -> 위키화 -> 로그 -> 검수 -> 재구조화 -> 대기",
        },
        {
          title: "Paperclip Wiki Control Plane Plan",
          path: "obsidian/Wiki/Common/Paperclip_Wiki_Control_Plane_Plan.md",
          snippet: "Paperclip은 agent control plane으로 둔다.",
        },
      ]
    : payload.results;
  state.searchResults = items || [];

  $("#search-result-count").textContent = `${items.length}건`;
  $("#search-brief-provider").textContent = "근거 선택 대기";
  $("#search-brief").textContent = `${items.length}개 결과를 찾았습니다. 문서는 오른쪽 위키 보기에서 열리고, 체크한 근거만 GLM 정리에 사용됩니다.`;

  items.forEach((item) => {
    const node = document.createElement("article");
    node.className = "result selectable-result";
    node.innerHTML = [
      `<label class="result-check">`,
      `<input type="checkbox" data-search-path="${escapeHtml(item.path)}" />`,
      `<span>GLM 정리 포함</span>`,
      `</label>`,
      `<button class="result-open" type="button">`,
      `<strong>${escapeHtml(item.title)}</strong>`,
      `<small>${escapeHtml(item.path)}</small>`,
      `<p>${escapeHtml(item.snippet)}</p>`,
      `</button>`,
    ].join("");
    node.querySelector(".result-open").addEventListener("click", () => openSearchResult(item));
    node.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) state.selectedSearchPaths.add(item.path);
      else state.selectedSearchPaths.delete(item.path);
      updateSelectedCount();
    });
    results.appendChild(node);
  });
  if (items[0]) await openSearchResult(items[0]);
}

async function summarizeSelectedResults() {
  const query = $("#wiki-query").value.trim();
  const paths = [...state.selectedSearchPaths];
  const mode = $("#wiki-search-mode")?.value || "standard";
  if (!query || !paths.length) return;
  $("#search-brief-provider").textContent = "GLM 정리 중";
  $("#search-brief").textContent = `${paths.length}개 선택 근거를 ${mode} 압축 카드로 정리하는 중입니다.`;
  const payload = await api("/api/wiki/search/brief", {
    method: "POST",
    body: JSON.stringify({ query, paths, mode, workspace: wikiWorkspaceParam() }),
  });
  if (payload.error) {
    $("#search-brief-provider").textContent = "정리 실패";
    $("#search-brief").textContent = payload.error;
    return;
  }
  renderSearchBrief(payload.brief);
}

async function openSearchResult(item) {
  if (!item?.path) return;
  state.activeWikiPath = item.path;
  $("#search-doc-title").textContent = item.title || "선택 문서";
  $("#search-doc-path").textContent = item.path;
  $("#search-doc-body").textContent = "문서를 불러오는 중입니다.";
  document.querySelectorAll(".selectable-result").forEach((node) => {
    node.classList.toggle("active", node.querySelector("[data-search-path]")?.dataset.searchPath === item.path);
  });
  const payload = await api(`/api/wiki/page?path=${encodeURIComponent(item.path)}`);
  if (payload.error || payload.mock) {
    $("#search-doc-body").textContent = payload.error || item.snippet || "문서 API 연결 대기";
  } else {
    $("#search-doc-title").textContent = payload.title || item.title || "선택 문서";
    $("#search-doc-path").textContent = payload.path || item.path;
    $("#search-doc-body").innerHTML = renderMarkdownDocument(payload.markdown);
  }
  await openNotionWikiPage(item.path);
}

async function loadPage(item) {
  if (!$("#reader-title")) {
    await openSearchResult(item);
    return;
  }
  const payload = await api(`/api/wiki/page?path=${encodeURIComponent(item.path)}`);
  $("#reader-title").textContent = item.title;
  $("#reader-path").textContent = item.path;
  $("#reader-body").textContent = payload.mock
    ? `# ${item.title}\n\n${item.snippet}\n\nBackend API 연결 후 실제 markdown을 보여준다.`
    : payload.markdown;
}

async function generateDigest() {
  const text = $("#knowledge-input").value.trim();
  const projectHint = $("#project-hint").value.trim();
  if (!text) return;
  $("#digest-output").textContent = "한국어 다이제스트를 생성하는 중입니다.";
  const payload = await api("/api/llm/digest", {
    method: "POST",
    body: JSON.stringify({ text, projectHint }),
  });
  $("#digest-output").textContent = formatDigestOutput(payload, projectHint);
}

function renderPromotionResult(target, result) {
  const container = typeof target === "string" ? $(target) : target;
  if (!container) return;
  if (result.error || result.mock) {
    container.innerHTML = `<div class="error">승격 실패: ${escapeHtml(result.error || "API 연결 대기")}</div>`;
    return;
  }
  const path = result.path || result.promotion?.path || "";
  container.innerHTML = [
    `<div class="success">승격 후보 저장 완료</div>`,
    `<p><strong>저장 위치</strong>: <code>${escapeHtml(path)}</code></p>`,
    `<div class="output-actions">`,
    `<button class="command-button" data-promotion-open="${escapeHtml(path)}" type="button">생성 Markdown 조회</button>`,
    `<button class="command-button" data-promotion-download type="button">MD 다운로드</button>`,
    `</div>`,
    result.markdown ? renderMarkdownDocument(result.markdown) : "",
  ].join("");
  container.querySelector("[data-promotion-open]")?.addEventListener("click", (event) => {
    const openPath = event.currentTarget.dataset.promotionOpen;
    if (openPath) {
      document.querySelector("[data-view='wiki']")?.click();
      openNotionWikiPage(openPath);
    }
  });
  container.querySelector("[data-promotion-download]")?.addEventListener("click", () => {
    downloadText((path || "knowledge-promotion.md").split("/").pop(), result.markdown || "");
  });
  if (result.paperclipAgent?.length) {
    container.insertAdjacentHTML("beforeend", `<p class="promotion-agent-note">Paperclip Agent가 검증/위키화 실행 후보 ${result.paperclipAgent.length}건을 백그라운드 큐에 추가했습니다. 실행 전 Paperclip Studio에서 승인하세요.</p>`);
  }
}

async function promoteKnowledgeFromIngest() {
  const content = $("#knowledge-input").value.trim();
  const projectHint = $("#project-hint").value.trim();
  if (!content) {
    $("#knowledge-promote-status").innerHTML = `<div class="error">승격할 내용이 비어 있습니다.</div>`;
    return;
  }
  $("#knowledge-promote-status").innerHTML = `<div class="loading">승격 후보 Markdown을 생성하고 로그화하는 중...</div>`;
  const result = await api("/api/knowledge/promote", {
    method: "POST",
    body: JSON.stringify({ content, projectHint, source: "ingest_tab", tool: "evidence" }),
  });
  renderPromotionResult("#knowledge-promote-status", result);
}

function formatDigestOutput(payload, projectHint = "") {
  if (payload.mock) {
    return [
      "# 한국어 지식 주입 다이제스트",
      "",
      `- 판정: 검토 보류`,
      `- 프로젝트 힌트: ${projectHint || "없음"}`,
      "- 출처 초안: 입력 원문 또는 파일 경로를 Sources.md 후보로 등록",
      "",
      "## 핵심 근거 후보",
      "- 핵심 문장과 수치를 추출 대기",
      "",
      "## 충돌 후보",
      "- 기존 프로젝트와 중복 가능성 확인 필요",
      "",
      "## 다음 액션",
      "- GLM 연결 후 프로젝트 분기/중복 판단을 재검토",
    ].join("\n");
  }
  if (payload.digest) {
    try {
      return formatDigestObject(JSON.parse(payload.digest), payload);
    } catch {
      return payload.digest;
    }
  }
  return formatDigestObject(payload, payload);
}

function formatDigestObject(data, meta = {}) {
  const lines = [
    "# 한국어 지식 주입 다이제스트",
    "",
    `- 제공자: ${meta.provider || data.provider || "local"}`,
    `- 판정: ${data.판정 || data.project_decision || "검토 필요"}`,
    `- 프로젝트 후보: ${data.프로젝트_후보 || data.프로젝트_힌트 || data.project_hint || "없음"}`,
    "",
    "## 출처 초안",
    data.출처_초안 || data.sources_draft || "- 입력 원문 또는 파일 경로 확인 필요",
    "",
    "## 핵심 근거 후보",
    ...[].concat(data.핵심_근거_후보 || data.evidence_candidates || []).map((item) => `- ${item}`),
    "",
    "## 수치 후보",
    ...[].concat(data.수치_후보 || data.number_candidates || []).map((item) => `- ${item}`),
    "",
    "## 충돌 후보",
    ...[].concat(data.충돌_후보 || data.conflict_candidates || []).map((item) => `- ${item}`),
    "",
    "## 위키 반영 초안",
    data.위키_반영_초안 || "- 승격 전 근거 확인 필요",
    "",
    "## 다음 액션",
    data.다음_액션 || data.next_action || "- 프로젝트 분기/중복 여부 검토",
  ];
  if (data.보류_이유) lines.push("", "## 보류 이유", data.보류_이유);
  if (meta.upstreamStatus) lines.push("", "## GLM 상태", meta.upstreamStatus);
  return lines.join("\n");
}

async function sendChat() {
  if (state.chatSending || state.chatComposing) return;
  await ensureActiveChatProject();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text && !state.chatPendingFiles.length && !state.chatAttachments.length && !state.chatSelectedSkillTags.length) return;
  if (state.chatPendingFiles.length) {
    try {
      await uploadQueuedChatFiles(text);
    } catch {
      return;
    }
  }
  const attachmentContext = chatAttachmentContext();
  const skillTagContext = selectedSkillTagContext();
  const fallbackText = state.chatAttachments.length
    ? "첨부 파일을 분석해 업무 관점으로 정리해줘."
    : "선택한 스킬 태그를 반영해 업무 관점으로 정리해줘.";
  const messageText = [text || fallbackText, skillTagContext, attachmentContext].filter(Boolean).join("\n\n");
  state.lastChatText = messageText;
  state.pendingUserMessageId = "";
  const sentAttachments = [...state.chatAttachments];
  closeChatPlusMenu();
  closeChatMentionSuggestions();
  setChatPhase("sending", "메시지를 저장하고 GLM 요청을 준비 중입니다.");
  appendMessage("user", messageText);
  input.value = "";
  state.chatAttachments = [];
  renderChatAttachments();
  renderChatMentionSuggestions();

  try {
    const streaming = appendStreamingAssistantMessage();
    setChatPhase("thinking", "GLM 스트리밍 thinking/reasoning 중입니다. 응답이 끝날 때까지 다음 메시지를 잠급니다.");
    let finalStatus = "completed";
    let failure = "";
    await apiStream("/api/chat/glm/stream", {
      message: messageText,
      projectId: state.activeChatProjectId,
      workspace: wikiWorkspaceParam(),
      skillTags: state.chatSelectedSkillTags,
    }, {
      status: (data) => {
        const thinkingBudget = data.thinking?.budget_tokens ? ` · thinking ${data.thinking.budget_tokens} tokens` : "";
        const contextMode = data.tokenBudget?.mode ? ` · context ${data.tokenBudget.mode}/${data.tokenBudget.maxCards} cards` : "";
        streaming.setStatus(`연결됨: ${data.endpoint || "glm"} · output ${data.maxTokens || "default"} tokens${thinkingBudget}${contextMode}`);
      },
      thinking: (data) => {
        streaming.appendThinking(data.content || "");
        setChatPhase("thinking", "GLM thinking 내용을 수신 중입니다.");
      },
      delta: (data) => {
        streaming.appendContent(data.content || "");
      },
      memory: (data) => {
        const label = data.remembered?.memory?.title || data.remembered?.title || "자동 메모리";
        streaming.setStatus(`자동 기억 반영: ${label}`);
      },
      paperclip: (data) => {
        const drafts = data.paperclip?.agentDrafts || [];
        const autoRuns = data.paperclip?.autoRuns || [];
        const recommended = data.paperclip?.recommendedTasks || [];
        const label = [
          drafts.length ? `agent draft ${drafts.length}` : "",
          autoRuns.length ? `read skill ${autoRuns.length}` : "",
          recommended.length ? `approval ${recommended.length}` : "",
        ].filter(Boolean).join(" · ") || "background ready";
        streaming.setStatus(`Paperclip Agent: ${label}`);
      },
      done: (data) => {
        finalStatus = data.status || "completed";
        streaming.finish(data.messages?.assistant?.id || "");
      },
      error: (data) => {
        failure = data.error || "GLM 스트리밍 실패";
        finalStatus = "failed";
        streaming.fail(failure);
      },
    });
    if (failure) {
      input.value = text;
      state.chatAttachments = sentAttachments;
      renderChatAttachments();
      setChatPhase("failed", "실패했습니다. 내용을 수정하거나 다시 전송할 수 있습니다.");
      return;
    }
    setChatPhase("saving", "대화와 보조 메모리를 저장 중입니다.");
    await loadChatProjects();
    setChatPhase(finalStatus === "stopped" ? "failed" : "idle", finalStatus === "stopped" ? "추론이 중지되었습니다." : "스트리밍 응답 저장 완료");
  } catch (error) {
    appendMessage("assistant error", `GLM 채팅 실패: ${error.message}`);
    input.value = text;
    state.chatAttachments = sentAttachments;
    renderChatAttachments();
    setChatPhase("failed", "실패했습니다. 내용을 수정하거나 다시 전송할 수 있습니다.");
  } finally {
    removeThinkingMessage();
    if (state.chatPhase !== "failed") setChatPhase("idle", $("#chat-status-detail").textContent);
    input.focus();
  }
}

function appendStreamingAssistantMessage() {
  const message = document.createElement("article");
  message.className = "message assistant streaming";
  const body = document.createElement("div");
  body.className = "message-body";
  const thinking = document.createElement("details");
  thinking.className = "message-thinking";
  thinking.open = true;
  thinking.innerHTML = `<summary>GLM thinking stream</summary><pre></pre>`;
  const status = document.createElement("small");
  status.className = "message-stream-status";
  status.textContent = "스트림 준비 중";
  let content = "";
  let thinkingContent = "";
  message.appendChild(status);
  message.appendChild(thinking);
  message.appendChild(body);
  $("#chat-log").appendChild(message);
  $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
  return {
    appendContent(chunk) {
      content += chunk;
      body.textContent = content;
      $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
    },
    appendThinking(chunk) {
      thinkingContent += chunk;
      thinking.querySelector("pre").textContent = thinkingContent;
      $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
    },
    setStatus(text) {
      status.textContent = text;
    },
    finish(id) {
      message.classList.remove("streaming");
      if (id) message.dataset.messageId = id;
      if (!thinkingContent.trim()) thinking.remove();
      body.innerHTML = renderMarkdownDocument(content || "응답 내용이 비어 있습니다.");
      status.textContent = "스트리밍 완료";
      attachMessageActions(message, "assistant", content, id);
    },
    fail(error) {
      message.className = "message assistant error";
      body.textContent = `GLM 채팅 실패: ${error}`;
      status.textContent = "스트리밍 실패";
    },
  };
}

async function stopChatReasoning() {
  if (!state.chatSending) return;
  $("#chat-status-detail").textContent = "추론 중지를 요청했습니다.";
  const payload = await api("/api/chat/stop", {
    method: "POST",
    body: JSON.stringify({ projectId: state.activeChatProjectId }),
  });
  removeThinkingMessage();
  setChatPhase("failed", payload.status === "stopping" ? "추론을 중지했습니다. 필요하면 이어서 다시 전송하세요." : "실행 중인 추론이 없습니다.");
}

async function deleteChatMessage(messageId) {
  if (!messageId) return;
  const payload = await api(`/api/chat/projects/${encodeURIComponent(state.activeChatProjectId)}/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
  if (payload.error || payload.mock) {
    $("#chat-status-detail").textContent = `메시지 삭제 실패: ${payload.error || "API 연결 대기"}`;
    return;
  }
  await loadChatProjects();
  const count = payload.retractedPromotionPaths?.length || 0;
  setChatPhase("idle", payload.deleted ? `메시지와 L1 보조 증적을 철회했습니다. 승격 후보 ${count}건 삭제.` : "삭제할 메시지를 찾지 못했습니다.");
}

function appendMessage(role, text, id = "") {
  const message = document.createElement("article");
  message.className = `message ${role}`;
  const messageId = id || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  message.dataset.messageId = messageId;
  const body = document.createElement("div");
  body.className = "message-body";
  if (role.includes("assistant")) {
    body.innerHTML = renderMarkdownDocument(text);
    message.appendChild(body);
    // Add knowledge promotion button to assistant messages
    const promotionButton = document.createElement("button");
    promotionButton.className = "knowledge-promotion-button";
    promotionButton.textContent = "지식승격";
    promotionButton.type = "button";
    promotionButton.dataset.messageContent = text;
    promotionButton.dataset.messageId = messageId;
    promotionButton.addEventListener("click", () => openKnowledgePromotionPanel(text, messageId));
    message.appendChild(promotionButton);
  } else {
    body.textContent = text;
    message.appendChild(body);
  }
  attachMessageActions(message, role, text, messageId);
  $("#chat-log").appendChild(message);
  $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
}

function attachMessageActions(message, role, text, messageId = "") {
  if (message.querySelector(".message-actions")) return;
  const actions = document.createElement("div");
  actions.className = "message-actions";
  const addAction = (label, title, handler) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.addEventListener("click", handler);
    actions.appendChild(button);
  };
  if (role === "user") {
    addAction("수정", "입력창에 이 메시지를 다시 올립니다.", () => {
      $("#chat-input").value = text;
      $("#chat-input").focus();
      setChatPhase("idle", "메시지를 수정한 뒤 전송하세요.");
    });
    addAction("재추론", "같은 내용으로 새 GLM 추론을 실행합니다.", () => {
      $("#chat-input").value = text;
      sendChat();
    });
  }
  if (role.includes("assistant")) {
    addAction("복사", "응답을 클립보드에 복사합니다.", async () => {
      await navigator.clipboard?.writeText(text);
      setChatPhase("idle", "응답을 복사했습니다.");
    });
  }
  if (messageId && !messageId.startsWith("local-")) {
    addAction("삭제", "대화내역, L1 보조 증적, 해당 지식승격 후보를 함께 철회합니다.", () => deleteChatMessage(messageId));
  }
  message.appendChild(actions);
}

function openKnowledgePromotionPanel(content, messageId) {
  const panel = $("#knowledge-promotion-panel");
  const textarea = $("#promotion-content");
  const resultDiv = $("#promotion-result");
  
  textarea.value = content;
  panel.dataset.sourceMessageId = messageId || "";
  panel.style.display = "grid";
  resultDiv.innerHTML = '<div class="loading">승격할 도구를 선택하고 실행하세요.</div>';
  
  // Scroll to panel
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeKnowledgePromotionPanel() {
  $("#knowledge-promotion-panel").style.display = "none";
  $("#promotion-content").value = "";
  $("#promotion-project-hint").value = "";
  $("#promotion-result").innerHTML = "";
  $("#knowledge-promotion-panel").dataset.sourceMessageId = "";
}

async function executeKnowledgePromotion() {
  const content = $("#promotion-content").value.trim();
  const projectHint = $("#promotion-project-hint").value.trim();
  const tool = $("#promotion-tool-select").value;
  const resultDiv = $("#promotion-result");
  
  if (!content) {
    resultDiv.innerHTML = '<div class="error">승격할 내용이 비어있습니다.</div>';
    return;
  }
  
  resultDiv.innerHTML = '<div class="loading">지식 승격 처리 중...</div>';
  
  try {
    let result;
    if (tool === "digest") {
      result = await api("/api/llm/digest", {
        method: "POST",
        body: JSON.stringify({ text: content, projectHint }),
      });
      resultDiv.innerHTML = `<div class="success">한국어 다이제스트 생성 완료</div><pre>${formatDigestOutput(result, projectHint)}</pre>`;
    } else if (tool === "evidence") {
      result = await api("/api/chat/evidence", {
        method: "POST",
        body: JSON.stringify({
          content,
          projectHint,
          sourceProjectId: state.activeChatProjectId,
          sourceMessageId: $("#knowledge-promotion-panel").dataset.sourceMessageId || "",
        }),
      });
      renderPromotionResult(resultDiv, result);
    } else if (tool === "memory") {
      if (!state.activeChatProjectId) {
        resultDiv.innerHTML = '<div class="error">프로젝트 메모리를 추가하려면 프로젝트를 선택해야 합니다.</div>';
        return;
      }
      result = await api(`/api/chat/projects/${encodeURIComponent(state.activeChatProjectId)}/memories`, {
        method: "POST",
        body: JSON.stringify({
          title: `지식승격 - ${new Date().toLocaleString("ko-KR")}`,
          content: content,
        }),
      });
      resultDiv.innerHTML = `<div class="success">프로젝트 메모리 추가 완료</div><p>${escapeHtml(result.memory?.title || "메모리")}</p><p>프로젝트 메모리와 L1 memory에 반영됐습니다.</p>`;
      await loadChatProjects();
    } else {
      resultDiv.innerHTML = '<div class="error">알 수 없는 도구 유형입니다.</div>';
    }
  } catch (error) {
    resultDiv.innerHTML = `<div class="error">승격 실패: ${escapeHtml(error.message)}</div>`;
  }
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => activateView(button.dataset.view));
});

$("#sidebar-toggle")?.addEventListener("click", toggleSidebar);

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => triggerCommand(button));
});

$("#refresh-status").addEventListener("click", refreshStatus);
$("#wiki-space-select")?.addEventListener("change", (event) => activateWorkspace(event.target.value));
$("#mission-refresh")?.addEventListener("click", loadMissionControl);
$("#mission-open-pipeline")?.addEventListener("click", () => document.querySelector("[data-view='pipeline']")?.click());
$("#mission-command-chat")?.addEventListener("click", missionCommandToChat);
$("#mission-command-collect")?.addEventListener("click", missionCommandToPipeline);
$("#mission-command-input")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  missionCommandToChat();
});
$("#decision-refresh")?.addEventListener("click", loadMissionControl);
$("#decision-open-mission")?.addEventListener("click", () => document.querySelector("[data-view='mission']")?.click());
$("#decision-prev")?.addEventListener("click", () => moveDecisionFocus(-1));
$("#decision-next")?.addEventListener("click", () => moveDecisionFocus(1));
$("#decision-hold")?.addEventListener("click", () => resolveActiveDecision("hold"));
$("#decision-approve")?.addEventListener("click", () => resolveActiveDecision("approve"));
$("#decision-evidence-close")?.addEventListener("click", closeDecisionEvidenceModal);
$("#decision-evidence-open-wiki")?.addEventListener("click", () => {
  if (!state.activeDecisionEvidencePath) return;
  closeDecisionEvidenceModal();
  document.querySelector("[data-view='wiki']")?.click();
  openNotionWikiPage(state.activeDecisionEvidencePath);
});
$("#decision-compare-close")?.addEventListener("click", closeDecisionCompareModal);
$("#decision-compare-open-source")?.addEventListener("click", () => {
  if (!state.decisionCompare.sourcePath) return;
  openDecisionEvidenceModal(state.decisionCompare.sourcePath);
});
$("#decision-compare-open-target")?.addEventListener("click", () => {
  if (!state.decisionCompare.targetPath) return;
  document.querySelector("[data-view='wiki']")?.click();
  openNotionWikiPage(state.decisionCompare.targetPath);
});
$("#decision-compare-target-editor")?.addEventListener("input", renderDecisionCompareTargetPreview);
$("#decision-compare-glm-merge")?.addEventListener("click", requestDecisionMergeSuggestion);
$("#decision-compare-copy-source")?.addEventListener("click", copyDecisionSourceToTarget);
$("#decision-compare-save-target")?.addEventListener("click", saveDecisionCompareTarget);
$("#decision-compare-apply-merge")?.addEventListener("click", applyDecisionMergeSuggestion);
$("#decision-compare-approve")?.addEventListener("click", async () => {
  if (state.decisionPending.busy || state.decisionInference.busy || !state.decisionCompare.itemId) return;
  const editorValue = $("#decision-compare-target-editor")?.value || "";
  if (editorValue !== state.decisionCompare.targetMarkdown) {
    const saved = await saveDecisionCompareTarget();
    if (!saved) return;
  }
  state.activeDecisionId = state.decisionCompare.itemId;
  await resolveActiveDecision("approve");
});
$("#spotlite-work-refresh")?.addEventListener("click", () => loadSpotlite("work"));
$("#spotlite-work-glm-refresh")?.addEventListener("click", () => refreshSpotliteGlm("work"));
$("#spotlite-personal-refresh")?.addEventListener("click", () => loadSpotlite("personal"));
$("#spotlite-personal-glm-refresh")?.addEventListener("click", () => refreshSpotliteGlm("personal"));
$("#personal-unlock-button")?.addEventListener("click", unlockPersonalSpotlite);
$("#personal-pin-input")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlockPersonalSpotlite();
});
$("#operation-settings").addEventListener("submit", saveSettings);
$("#openclaw-trigger").addEventListener("click", triggerOpenClaw);
$("#continue-after-collection")?.addEventListener("click", continueAfterCollection);
$("#stop-run").addEventListener("click", stopCurrentRun);
$("#side-stop-run").addEventListener("click", stopCurrentRun);
$("#slack-routing-refresh")?.addEventListener("click", loadSlackRouting);
$("#slack-channel-search")?.addEventListener("click", loadSlackRouting);
$("#slack-select-project")?.addEventListener("click", () => selectSlackChannelsByBucket("project"));
$("#slack-select-company")?.addEventListener("click", () => selectSlackChannelsByBucket("company_news"));
$("#slack-select-mixed")?.addEventListener("click", () => selectSlackChannelsByBucket("mixed"));
$("#slack-clear-selection")?.addEventListener("click", clearSlackChannelSelection);
$("#slack-collect-preview")?.addEventListener("click", () => runSlackCollection(true));
$("#slack-collect-run")?.addEventListener("click", () => runSlackCollection(false));
$("#target-analysis-button").addEventListener("click", analyzeDriveTargets);
$("#drive-instruction-analyze")?.addEventListener("click", analyzeDriveInstructionTargets);
$("#drive-instruction-example")?.addEventListener("click", () => {
  $("#drive-instruction-input").value = "쏘닉스 찾아 자료를 수집해서 위키화해.";
  $("#drive-instruction-input").focus();
});
$("#schedule-form").addEventListener("submit", createSchedule);
$("#skill-draft-button").addEventListener("click", createSkillDraft);
$("#chat-project-select").addEventListener("change", (event) => {
  state.activeChatProjectId = event.target.value;
  renderChatProjects();
});
$("#chat-project-new").addEventListener("click", createNewChatProject);
$("#chat-global-save").addEventListener("click", saveChatGlobal);
$("#chat-project-save").addEventListener("click", saveChatProject);
$("#chat-project-delete").addEventListener("click", deleteChatProject);
$("#chat-memory-add").addEventListener("click", addChatMemory);
$("#wiki-refresh").addEventListener("click", loadNotionWikiBrowser);
$("#refresh-graph-map")?.addEventListener("click", refreshGraphMap);
$("#wiki-command-run").addEventListener("click", runWikiManagementCommand);
$("#wiki-command-apply").addEventListener("click", applyWikiManagementCommand);
$("#wiki-command-example").addEventListener("click", fillWikiManagementExample);
$("#notion-wiki-search").addEventListener("input", () => {
  state.wikiFilters.query = $("#notion-wiki-search").value.trim();
  const wikiQuery = $("#wiki-query");
  if (wikiQuery) wikiQuery.value = state.wikiFilters.query;
  renderNotionWikiContent();
});
$("#notion-wiki-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const wikiQuery = $("#wiki-query");
    if (wikiQuery) wikiQuery.value = $("#notion-wiki-search").value.trim();
    searchWiki();
  }
});

// Notion Wiki Browser Events
document.querySelectorAll(".notion-nav-toggle").forEach((toggle) => {
  toggle.addEventListener("click", () => {
    const section = toggle.dataset.section;
    const content = document.querySelector(`.notion-nav-content[data-section="${section}"]`);
    const chevron = toggle.querySelector(".notion-chevron");
    
    content.classList.toggle("notion-expanded");
    chevron.textContent = content.classList.contains("notion-expanded") ? "▲" : "▼";
  });
});

document.querySelectorAll(".notion-nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    const category = item.dataset.category;
    state.notionCurrentCategory = category;
    state.activeProjectKey = "";
    state.wikiFilters.projectKey = "all";
    const projectFilter = $("#notion-project-filter");
    if (projectFilter) projectFilter.value = "all";
    if (category === "latest") {
      state.wikiFilters.sortBy = "updated";
      const sortSelect = $("#notion-sort-by");
      if (sortSelect) sortSelect.value = "updated";
    }
    renderNotionWikiContent();
    
    // Update breadcrumb
    $("#notion-current-category").textContent = item.textContent.trim();
    
    // Highlight active item
    document.querySelectorAll(".notion-nav-item").forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
  });
});

$("#notion-view-mode").addEventListener("change", renderNotionWikiContent);
$("#notion-sort-by").addEventListener("change", renderNotionWikiContent);
$("#notion-division-filter")?.addEventListener("change", (event) => {
  state.wikiFilters.division = event.target.value;
  renderNotionWikiContent();
});
$("#notion-nature-filter")?.addEventListener("change", (event) => {
  state.wikiFilters.nature = event.target.value;
  renderNotionWikiContent();
});
$("#notion-status-filter")?.addEventListener("change", (event) => {
  state.wikiFilters.status = event.target.value;
  renderNotionWikiContent();
});
$("#notion-tag-filter")?.addEventListener("change", (event) => {
  state.wikiFilters.tag = event.target.value;
  renderNotionWikiContent();
});
$("#notion-project-filter")?.addEventListener("change", (event) => {
  state.wikiFilters.projectKey = event.target.value;
  state.activeProjectKey = event.target.value === "all" ? "" : event.target.value;
  renderNotionWikiContent();
});
$("#notion-close-details").addEventListener("click", () => {
  document.querySelector(".notion-details-panel").classList.remove("notion-details-open");
});
$("#notion-details-content").addEventListener("click", (event) => {
  const link = event.target.closest(".wiki-internal-link");
  if (!link) return;
  event.preventDefault();
  const resolved = resolveWikiTarget(link.dataset.wikiTarget || "");
  if (resolved) openNotionWikiPage(resolved);
});
$("#notion-copy-link")?.addEventListener("click", async () => {
  if (!state.activeWikiPath) return;
  await navigator.clipboard?.writeText(state.activeWikiPath);
});
$("#notion-open-in-obsidian")?.addEventListener("click", () => {
  if (!state.activeWikiPath) return;
  openNotionWikiPage(state.activeWikiPath);
});
$("#paperclip-refresh").addEventListener("click", refreshPaperclip);
$("#paperclip-create-task").addEventListener("click", createPaperclipTask);
$("#paperclip-trigger-task").addEventListener("click", triggerPaperclipTask);
$("#wiki-search-button").addEventListener("click", searchWiki);
$("#summarize-selected").addEventListener("click", summarizeSelectedResults);
$("#digest-button").addEventListener("click", generateDigest);
$("#knowledge-promote-button").addEventListener("click", promoteKnowledgeFromIngest);
$("#chat-send").addEventListener("click", sendChat);
$("#chat-stop").addEventListener("click", stopChatReasoning);
$("#chat-file-button")?.addEventListener("click", () => $("#chat-file-input")?.click());
$("#chat-file-input")?.addEventListener("change", queueChatFiles);
$("#chat-settings-open").addEventListener("click", openChatSettingsModal);
$("#chat-settings-close").addEventListener("click", closeChatSettingsModal);
$("#chat-settings-cancel").addEventListener("click", closeChatSettingsModal);
$("#chat-runtime-save").addEventListener("click", saveChatRuntimeSettings);
$("#chat-project-settings-open")?.addEventListener("click", openChatProjectSettingsModal);
$("#chat-project-settings-close")?.addEventListener("click", closeChatProjectSettingsModal);
$("#chat-linked-wiki-project")?.addEventListener("change", renderChatLinkedProjectOptions);
$("#close-promotion-panel").addEventListener("click", closeKnowledgePromotionPanel);
$("#execute-promotion").addEventListener("click", executeKnowledgePromotion);
$("#decision-chat-directive")?.addEventListener("input", (event) => {
  setDecisionChatDirective(event.target.value);
});
$("#decision-chat-directive")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (event.isComposing) return;
  if (event.shiftKey) return;
  event.preventDefault();
  runDecisionInference();
});
$("#decision-chat-open")?.addEventListener("click", () => runDecisionInference());
$("#decision-chat-preset-approve")?.addEventListener("click", () => {
  setDecisionChatDirective("근거 충돌을 비교해 승인 가능 여부를 먼저 판단하고, Conflict_Register.md 반영 문구 초안과 남길 provenance를 정리해줘.");
});
$("#decision-chat-preset-hold")?.addEventListener("click", () => {
  setDecisionChatDirective("지금 병합하면 안 되는 이유를 우선 따지고, 보류 조건, 추가 확인 문서, 재검토 트리거를 정리해줘.");
});
$("#decision-chat-preset-investigate")?.addEventListener("click", () => {
  setDecisionChatDirective("근거 충돌과 누락 정보를 중심으로 추가 조사 계획을 만들고, 확인 대상 문서와 비교해야 할 값을 구체적으로 적어줘.");
});
$("#decision-chat-preset-plan")?.addEventListener("click", () => {
  setDecisionChatDirective("충돌난 문서들을 비교해 병합안, 선택 기준, Conflict_Register.md에 남길 최종 문구를 제안해줘.");
});
$("#wiki-query").addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchWiki();
});
$("#chat-plus-button")?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleChatPlusMenu();
});
$("#chat-plus-attach")?.addEventListener("click", () => {
  closeChatPlusMenu();
  $("#chat-file-input")?.click();
});
$("#chat-plus-skill-picker")?.addEventListener("click", () => {
  closeChatPlusMenu();
  const input = $("#chat-input");
  if (!input) return;
  const cursor = input.selectionStart ?? input.value.length;
  input.value = `${input.value.slice(0, cursor)}@${input.value.slice(cursor)}`;
  input.selectionStart = input.selectionEnd = cursor + 1;
  input.focus();
  renderChatMentionSuggestions();
});
$("#chat-skill-picker-button")?.addEventListener("click", () => {
  const input = $("#chat-input");
  if (!input) return;
  const cursor = input.selectionStart ?? input.value.length;
  input.value = `${input.value.slice(0, cursor)}@${input.value.slice(cursor)}`;
  input.selectionStart = input.selectionEnd = cursor + 1;
  input.focus();
  renderChatMentionSuggestions();
});
$("#chat-input").addEventListener("compositionstart", () => {
  state.chatComposing = true;
});
$("#chat-input").addEventListener("compositionend", () => {
  requestAnimationFrame(() => {
    state.chatComposing = false;
    renderChatMentionSuggestions();
  });
});
$("#chat-input").addEventListener("input", () => {
  renderChatMentionSuggestions();
});
$("#chat-input").addEventListener("keydown", (event) => {
  const mention = chatMentionMatch();
  if ((event.key === "ArrowDown" || event.key === "ArrowUp") && mention?.tags?.length) {
    event.preventDefault();
    const max = Math.min(mention.tags.length, 6);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    state.chatMentionActiveIndex = (state.chatMentionActiveIndex + delta + max) % max;
    renderChatMentionSuggestions();
    return;
  }
  if ((event.key === "Enter" || event.key === "Tab") && mention?.tags?.length && !event.shiftKey) {
    event.preventDefault();
    const skill = mention.tags[Math.min(state.chatMentionActiveIndex, mention.tags.length - 1)];
    if (skill) applyChatMentionSkill(skill.id);
    return;
  }
  if (event.key === "Escape") {
    closeChatMentionSuggestions();
    closeChatPlusMenu();
    return;
  }
  if (event.key === "Tab" && event.shiftKey) {
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = `${input.value.slice(0, start)}\n${input.value.slice(end)}`;
    input.selectionStart = input.selectionEnd = start + 1;
    return;
  }
  if (event.key !== "Enter") return;
  if (event.isComposing || state.chatComposing || event.keyCode === 229) return;
  if (event.shiftKey) return;
  event.preventDefault();
  sendChat();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".chat-composer-tools")) closeChatPlusMenu();
  if (!event.target.closest(".chat-composer-main")) closeChatMentionSuggestions();
});

document.addEventListener("keydown", (event) => {
  const activeView = document.querySelector(".view.active")?.id;
  const tag = document.activeElement?.tagName;
  if (activeView !== "decisions") return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (state.decisionPending.busy || state.decisionInference.busy) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    resolveActiveDecision("hold");
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    resolveActiveDecision("approve");
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveDecisionFocus(-1);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    moveDecisionFocus(1);
  }
});

renderStatus();
syncSidebarState();
updateWorkspaceChrome();
const hashView = location.hash?.slice(1);
const initialView = hashView && (titles[hashView] || hashView === "spotlite") ? hashView : "mission";
activateView(initialView);
renderEvents("#run-list", state.runs);
renderAutomationState();
renderSchedules();
renderSkills();
renderChatSkillTags();
renderPaperclip({
  status: "초기화 중",
  url: "-",
  templates: [],
  tasks: [],
  events: state.paperclip.map((item) => ({ type: item.command, taskId: item.status, message: item.detail })),
});
$("#run-count").textContent = `${state.runs.length}건`;
refreshStatus();
setInterval(refreshStatus, 5000);
loadSpotliteTemplates();

// Initialize Notion Wiki Browser
initializeNotionWikiBrowser();
