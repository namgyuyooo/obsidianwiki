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
  running: [],
  schedules: [],
  driveTargets: [],
  searchResults: [],
  selectedSearchPaths: new Set(),
  wikiPages: [],
  wikiGraph: { nodes: [], edges: [] },
  activeWikiPath: "",
  wikiManagementCommands: [],
  activeWikiManagementCommandId: "",
  activeProjectKey: "",
  wikiFilters: {
    division: "all",
    nature: "all",
    projectKey: "all",
    query: "",
    viewMode: "grid",
    sortBy: "name",
  },
  skills: [],
  chatProjects: [],
  chatGlobal: { instructions: "", autoMemory: true },
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
  "spotlite-work": "Spotlite Work",
  "spotlite-personal": "Spotlite Personal",
  operations: "운영",
  pipeline: "수집 파이프라인",
  wiki: "위키",
  ingest: "지식 주입",
  chat: "GLM 챗",
  paperclip: "Paperclip",
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
};

function personalSpotlitePin() {
  return localStorage.getItem("spotlite_personal_pin") || "0953";
}

function $(selector) {
  return document.querySelector(selector);
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
  const target = $(`#spotlite-${scope}-content`);
  if (!target) return;
  if (payload?.error || payload?.mock) {
    target.innerHTML = `<div class="spotlite-empty">Spotlite API 연결 실패: ${escapeHtml(payload.error || "mock")}</div>`;
    return;
  }
  const summary = payload.summary || {};
  target.innerHTML = [
    `<section class="spotlite-summary" data-anchor="주요 분석">`,
    `<article><span>오늘</span><strong>${summary.today || 0}</strong></article>`,
    `<article><span>이번주</span><strong>${summary.week || 0}</strong></article>`,
    `<article><span>리스크</span><strong>${summary.risks || 0}</strong></article>`,
    `<article><span>프로젝트</span><strong>${summary.projects || 0}</strong></article>`,
    `</section>`,
    `<section class="spotlite-analysis">`,
    `<h3>주요 분석</h3>`,
    `<ul>${(payload.analysis || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
    `<small>${escapeHtml(payload.workspace?.label || scope)} · ${escapeHtml(payload.generatedAt || "")}</small>`,
    `</section>`,
    `<div class="spotlite-grid">`,
    spotliteLane("오늘 할 일", payload.today || [], "오늘로 명시된 항목이 없습니다. 운영 메모에서 오늘 처리할 일을 보강하세요."),
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
  const target = $(`#spotlite-${scope}-content`);
  if (target) target.innerHTML = `<div class="spotlite-empty">Spotlite를 분석하는 중입니다.</div>`;
  const payload = await api(`/api/spotlite?scope=${encodeURIComponent(scope)}`);
  state.spotlite[scope] = payload;
  renderSpotlite(scope, payload);
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
  renderSpotliteTemplates("work");
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
    api("/api/wiki/index"),
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
  $("#notion-total-pages").textContent = `${total}`;
  $("#notion-total-categories").textContent = `${divisions.size}`;
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
  return state.wikiPages.filter((page) => {
    if (category !== "all") {
      if (category.startsWith("kind:") && page.docKind !== category.replace("kind:", "")) return false;
      if (!category.startsWith("kind:") && page.division !== category) return false;
    }
    if (state.wikiFilters.division !== "all" && page.division !== state.wikiFilters.division) return false;
    if (state.wikiFilters.nature !== "all" && page.docKind !== state.wikiFilters.nature) return false;
    if (state.wikiFilters.projectKey !== "all" && page.projectKey !== state.wikiFilters.projectKey) return false;
    if (!query) return true;
    return [
      page.title,
      page.path,
      page.projectLabel,
      page.division,
      page.docKind,
      page.frontmatter?.type,
      page.frontmatter?.source,
    ].filter(Boolean).join(" ").toLowerCase().includes(query);
  }).sort((a, b) => {
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
  return [
    `<article class="notion-project-card" data-project-key="${escapeHtml(group.key)}">`,
    `<button class="notion-card-main" data-project-drill="${escapeHtml(group.key)}" type="button">`,
    `<span class="notion-card-kicker">${escapeHtml(divisionLabels[group.division] || group.division)}</span>`,
    `<strong>${escapeHtml(group.label)}</strong>`,
    `<small>${group.pages.length} docs · ${escapeHtml(updated.slice(0, 10) || "updated unknown")}</small>`,
    `</button>`,
    `<div class="notion-shortcuts">`,
    shortcutPages.map((page) => `<button type="button" data-notion-path="${escapeHtml(page.path)}">${escapeHtml(natureLabels[page.docKind] || page.docKind)}</button>`).join(""),
    `</div>`,
    `</article>`,
  ].join("");
}

function renderPageCard(page) {
  return [
    `<article class="notion-page-card ${page.path === state.activeWikiPath ? "active" : ""}">`,
    `<button class="notion-card-main" data-notion-path="${escapeHtml(page.path)}" type="button">`,
    `<span class="notion-card-kicker">${escapeHtml(divisionLabels[page.division] || page.division)} · ${escapeHtml(natureLabels[page.docKind] || page.docKind)}</span>`,
    `<strong>${escapeHtml(page.title)}</strong>`,
    `<small>${escapeHtml(page.projectLabel || page.section)} · ${escapeHtml(page.path)}</small>`,
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
  const categoryLabel = divisionLabels[state.notionCurrentCategory] || natureLabels[state.notionCurrentCategory?.replace?.("kind:", "")] || "전체";
  $("#notion-current-category").textContent = state.activeProjectKey
    ? `${categoryLabel} / ${state.activeProjectKey}`
    : categoryLabel;

  if (!pages.length) {
    content.innerHTML = `<div class="notion-empty-state"><div class="notion-empty-icon">문서 없음</div><h3>조건에 맞는 문서가 없습니다</h3><p>검색어 또는 필터를 줄여보세요.</p></div>`;
    return;
  }

  if (viewMode === "tree") {
    const groups = pagesByProject().map((group) => ({ ...group, pages: group.pages.filter((page) => pages.includes(page)) })).filter((group) => group.pages.length);
    content.innerHTML = `<div class="notion-tree-list">${groups.map((group) => [
      `<section class="notion-tree-group">`,
      `<button class="notion-tree-heading" data-project-drill="${escapeHtml(group.key)}" type="button">${escapeHtml(group.label)} <span>${group.pages.length}</span></button>`,
      `<div class="notion-tree-pages">${group.pages.map(renderPageCard).join("")}</div>`,
      `</section>`,
    ].join("")).join("")}</div>`;
  } else if (viewMode === "list") {
    content.innerHTML = `<div class="notion-page-list">${pages.map(renderPageCard).join("")}</div>`;
  } else if (state.wikiFilters.projectKey === "all" && ["all", "project", "account"].includes(state.notionCurrentCategory)) {
    const groups = pagesByProject()
      .map((group) => ({ ...group, pages: group.pages.filter((page) => pages.includes(page)) }))
      .filter((group) => group.pages.length && ["project", "account"].includes(group.division));
    content.innerHTML = `<div class="notion-card-grid">${groups.map(renderProjectCard).join("")}</div>`;
  } else {
    content.innerHTML = `<div class="notion-card-grid">${pages.map(renderPageCard).join("")}</div>`;
  }

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

async function loadNotionWikiBrowser() {
  const payload = await api("/api/wiki/index");
  if (payload.mock || !payload.pages) {
    $("#notion-content-area").innerHTML = `<div class="notion-empty-state"><h3>위키 API 연결 대기</h3><p>${escapeHtml(payload.error || "서버 응답을 확인하세요.")}</p></div>`;
    return;
  }
  state.wikiPages = payload.pages;
  updateNotionStats();
  updateWikiFilterControls();
  renderNotionWikiContent();
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
    `<span>${escapeHtml(divisionLabels[page.division] || page.division || "Wiki")} / ${escapeHtml(page.projectLabel || page.section || "")}</span>`,
    `<h2>${escapeHtml(payload.title)}</h2>`,
    `<code>${escapeHtml(payload.path)}</code>`,
    `</div>`,
    renderMarkdownDocument(payload.markdown),
  ].join("");
  $("#notion-doc-type").textContent = natureLabels[page.docKind] || page.docKind || payload.frontmatter?.type || "문서";
  $("#notion-doc-updated").textContent = page.updatedAt?.slice(0, 10) || payload.frontmatter?.updated || "updated unknown";
  renderNotionWikiContent();
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
  return state.chatProjects.find((project) => project.id === state.activeChatProjectId) || state.chatProjects[0] || null;
}

function renderChatProjects() {
  const project = activeChatProject();
  $("#chat-project-count").textContent = `${state.chatProjects.length}개`;
  $("#chat-global-instructions").value = state.chatGlobal.instructions || "";
  $("#chat-auto-memory").checked = state.chatGlobal.autoMemory !== false;
  $("#chat-project-list").innerHTML = state.chatProjects
    .map((item) => `<button class="chat-project-item ${item.id === state.activeChatProjectId ? "active" : ""}" data-chat-project="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml((item.instructions || "지침 없음").slice(0, 72))}</small></button>`)
    .join("");
  document.querySelectorAll("[data-chat-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeChatProjectId = button.dataset.chatProject;
      renderChatProjects();
    });
  });
  $("#chat-project-select").innerHTML = state.chatProjects
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join("");
  if (project) {
    $("#chat-project-select").value = project.id;
    $("#chat-active-title").textContent = project.name || "GLM 프로젝트";
    $("#chat-project-name").value = project.name || "";
    $("#chat-project-instructions").value = project.instructions || "";
    $("#chat-log").innerHTML = "";
    (project.messages || []).forEach((message) => appendMessage(message.role, message.content, message.id));
  }
  renderChatMemories();
  setChatPhase(state.chatPhase || "idle");
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
  status.className = `chat-status ${phase}`;
  status.textContent = labels[phase] || phase;
  $("#chat-status-detail").textContent = detail || "GLM 응답 대기 중에는 다음 메시지를 잠급니다.";
  $("#chat-send").disabled = state.chatSending;
  $("#chat-stop").disabled = !["sending", "thinking"].includes(phase);
  $("#chat-input").disabled = state.chatSending;
  $("#chat-project-select").disabled = state.chatSending;
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
  state.activeChatProjectId = state.chatProjects.some((project) => project.id === previous)
    ? previous
    : state.chatProjects[0]?.id || "default";
  renderChatProjects();
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
  const panel = $(".side-run-panel");
  const status = running ? "running" : latest?.status || "idle";
  panel.classList.remove("running", "failed", "stopped", "stopping");
  if (["running", "failed", "stopped", "stopping"].includes(status)) panel.classList.add(status);
  $("#side-run-status").textContent = running ? "자동화 실행 중" : latest ? `최근 상태: ${latest.status}` : "자동화 대기";
  $("#side-run-command").textContent = running?.command || latest?.command || "실행 중인 작업 없음";
  $("#side-run-detail").textContent = running
    ? `시작: ${running.startedAt}`
    : latest
      ? (latest.stderr || latest.stdout || latest.createdAt || "").slice(-500) || "세부 로그 없음"
      : "에러와 진행 로그가 여기에 표시됩니다.";
  $("#side-stop-run").disabled = !running;
  $("#stop-run").disabled = !running;
  $("#automation-live-status").textContent = running ? `${running.command} 실행 중` : "대기 중";
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
      `</article>`,
    ].join(""))
    .join("");

  const taskEvents = tasks.map((task) => ({
    command: task.title,
    status: `${task.status} · ${task.agent}`,
    detail: `${task.command}${task.dryRun ? " --dry-run" : ""} · ${task.createdAt}`,
  }));
  renderEvents("#paperclip-tasks", taskEvents.length ? taskEvents : [{ command: "작업 없음", status: "대기", detail: "템플릿에서 task를 생성하세요." }]);

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
  const modelList = (settings.GLM_AVAILABLE_MODELS || "glm-5.1,glm-4.5,glm-4.5-air,glm-4-flash")
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
  const sections = [...view.querySelectorAll("[data-anchor]")];
  if (!sections.length) {
    container.innerHTML = "";
    container.hidden = true;
    return;
  }
  container.hidden = false;
  container.innerHTML = sections.map((section, index) => {
    const label = section.dataset.anchor;
    const id = section.id || `${viewId}-${slugForDom(label)}-${index}`;
    section.id = id;
    return `<button type="button" data-anchor-target="${escapeHtml(id)}" class="${index === 0 ? "active" : ""}">${escapeHtml(label)}</button>`;
  }).join("");
  container.querySelectorAll("[data-anchor-target]").forEach((button) => {
    button.addEventListener("click", () => {
      container.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.anchorTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function activateView(viewId) {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $("#view-title").textContent = titles[viewId] || viewId;
  const spaceSelect = $("#wiki-space-select");
  if (spaceSelect && ["spotlite-work", "spotlite-personal"].includes(viewId)) spaceSelect.value = viewId;
  renderSectionAnchors(viewId);
  if (viewId === "spotlite-work" && !state.spotlite.work) loadSpotlite("work");
  if (viewId === "spotlite-work") renderSpotliteTemplates("work");
  if (viewId === "spotlite-personal") renderPersonalLock();
  if (viewId === "spotlite-personal") renderSpotliteTemplates("personal");
  if (viewId === "wiki" && !state.wikiPages.length) loadNotionWikiBrowser();
  history.replaceState(null, "", `#${viewId}`);
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
  const result = await api("/api/chat/projects", {
    method: "POST",
    body: JSON.stringify({
      id,
      name: $("#chat-project-name").value.trim(),
      instructions: $("#chat-project-instructions").value.trim(),
    }),
  });
  if (result.project) state.activeChatProjectId = result.project.id;
  await loadChatProjects();
}

async function createNewChatProject() {
  $("#chat-project-name").value = "새 GLM 프로젝트";
  $("#chat-project-instructions").value = "이 프로젝트에만 적용되는 고객/범위/산출물/금지 표현을 적는다.";
  const result = await api("/api/chat/projects", {
    method: "POST",
    body: JSON.stringify({
      name: $("#chat-project-name").value.trim() || "새 GLM 프로젝트",
      instructions: $("#chat-project-instructions").value.trim(),
    }),
  });
  if (result.project) state.activeChatProjectId = result.project.id;
  await loadChatProjects();
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
  const payload = await api(`/api/wiki/search?q=${encodeURIComponent(query)}`);
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
    body: JSON.stringify({ query, paths, mode }),
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
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  state.lastChatText = text;
  state.pendingUserMessageId = "";
  setChatPhase("sending", "메시지를 저장하고 GLM 요청을 준비 중입니다.");
  appendMessage("user", text);
  input.value = "";

  try {
    const streaming = appendStreamingAssistantMessage();
    setChatPhase("thinking", "GLM 스트리밍 thinking/reasoning 중입니다. 응답이 끝날 때까지 다음 메시지를 잠급니다.");
    let finalStatus = "completed";
    let failure = "";
    await apiStream("/api/chat/glm/stream", { message: text, projectId: state.activeChatProjectId }, {
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
      setChatPhase("failed", "실패했습니다. 내용을 수정하거나 다시 전송할 수 있습니다.");
      return;
    }
    setChatPhase("saving", "대화와 보조 메모리를 저장 중입니다.");
    await loadChatProjects();
    setChatPhase(finalStatus === "stopped" ? "failed" : "idle", finalStatus === "stopped" ? "추론이 중지되었습니다." : "스트리밍 응답 저장 완료");
  } catch (error) {
    appendMessage("assistant error", `GLM 채팅 실패: ${error.message}`);
    input.value = text;
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
  setChatPhase("idle", payload.deleted ? "메시지를 삭제했습니다." : "삭제할 메시지를 찾지 못했습니다.");
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
    addAction("삭제", "이 메시지를 프로젝트 대화내역에서 삭제합니다.", () => deleteChatMessage(messageId));
  }
  message.appendChild(actions);
}

function openKnowledgePromotionPanel(content, messageId) {
  const panel = $("#knowledge-promotion-panel");
  const textarea = $("#promotion-content");
  const resultDiv = $("#promotion-result");
  
  textarea.value = content;
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
        body: JSON.stringify({ content, projectHint }),
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

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => triggerCommand(button));
});

$("#refresh-status").addEventListener("click", refreshStatus);
$("#wiki-space-select")?.addEventListener("change", (event) => activateView(event.target.value));
$("#spotlite-work-refresh")?.addEventListener("click", () => loadSpotlite("work"));
$("#spotlite-personal-refresh")?.addEventListener("click", () => loadSpotlite("personal"));
$("#personal-unlock-button")?.addEventListener("click", unlockPersonalSpotlite);
$("#personal-pin-input")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlockPersonalSpotlite();
});
$("#operation-settings").addEventListener("submit", saveSettings);
$("#openclaw-trigger").addEventListener("click", triggerOpenClaw);
$("#stop-run").addEventListener("click", stopCurrentRun);
$("#side-stop-run").addEventListener("click", stopCurrentRun);
$("#target-analysis-button").addEventListener("click", analyzeDriveTargets);
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
$("#chat-settings-open").addEventListener("click", openChatSettingsModal);
$("#chat-settings-close").addEventListener("click", closeChatSettingsModal);
$("#chat-settings-cancel").addEventListener("click", closeChatSettingsModal);
$("#chat-runtime-save").addEventListener("click", saveChatRuntimeSettings);
$("#close-promotion-panel").addEventListener("click", closeKnowledgePromotionPanel);
$("#execute-promotion").addEventListener("click", executeKnowledgePromotion);
$("#wiki-query").addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchWiki();
});
$("#chat-input").addEventListener("compositionstart", () => {
  state.chatComposing = true;
});
$("#chat-input").addEventListener("compositionend", () => {
  requestAnimationFrame(() => {
    state.chatComposing = false;
  });
});
$("#chat-input").addEventListener("keydown", (event) => {
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

renderStatus();
const initialView = location.hash?.slice(1) && titles[location.hash.slice(1)] ? location.hash.slice(1) : "spotlite-work";
activateView(initialView);
renderEvents("#run-list", state.runs);
renderAutomationState();
renderSchedules();
renderSkills();
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
