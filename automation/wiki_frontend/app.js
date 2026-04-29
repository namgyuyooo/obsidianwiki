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
  searchResults: [],
  selectedSearchPaths: new Set(),
};

const titles = {
  operations: "운영",
  search: "위키 검색",
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
  GLM_API_URL: "GLM API URL",
  GLM_API_KEY: "GLM API Key",
  GLM_MODEL: "GLM 모델",
  OPENCLAW_WEBHOOK_URL: "OpenClaw Webhook",
  OPENCLAW_API_KEY: "OpenClaw API Key",
  PAPERCLIP_URL: "Paperclip URL",
  PAPERCLIP_API_KEY: "Paperclip API Key",
};

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
    const payload = await response.json();
    if (!response.ok) {
      return { ...payload, error: payload.error || `HTTP ${response.status}` };
    }
    return payload;
  } catch (error) {
    return { error: error.message, mock: true };
  }
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
  $("#settings-status").textContent = "설정 불러옴";
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
  $("#settings-status").textContent = "저장 완료";
  await refreshStatus();
}

async function triggerCommand(button) {
  const command = button.dataset.command;
  const dryRun = button.dataset.dryRun === "true";
  const result = await api("/api/automation/trigger", {
    method: "POST",
    body: JSON.stringify({ command, dryRun }),
  });
  const status = result.mock ? "mock 대기" : result.status;
  state.runs.unshift({
    command: dryRun ? `${command} dry-run` : command,
    status,
    detail: result.error || (result.mock ? "Backend API 연결 대기" : `Run id: ${result.runId}`),
  });
  renderEvents("#run-list", state.runs);
  $("#run-count").textContent = `${state.runs.length}건`;
  await refreshStatus();
}

async function triggerOpenClaw() {
  const result = await api("/api/openclaw/trigger", {
    method: "POST",
    body: JSON.stringify({ task: "drive_wikify_cycle" }),
  });
  state.runs.unshift({
    command: "openclaw-trigger",
    status: result.status || "대기",
    detail: result.error || result.stdout || "OpenClaw 호출 요청을 보냈습니다.",
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
  $("#search-result-count").textContent = "0건";
  updateSelectedCount();
  $("#search-brief-provider").textContent = "사용자 선택 후 정리";
  $("#search-brief").textContent = "검색 결과에서 근거 Markdown을 선택한 뒤 GLM 정리를 실행하세요.";
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
  $("#search-brief").textContent = `${items.length}개 결과를 찾았습니다. 정리할 근거를 체크하고 선택 근거 GLM 정리를 누르세요.`;

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
    node.querySelector(".result-open").addEventListener("click", () => loadPage(item));
    node.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) state.selectedSearchPaths.add(item.path);
      else state.selectedSearchPaths.delete(item.path);
      updateSelectedCount();
    });
    results.appendChild(node);
  });
  if (items[0]) await loadPage(items[0]);
}

async function summarizeSelectedResults() {
  const query = $("#wiki-query").value.trim();
  const paths = [...state.selectedSearchPaths];
  if (!query || !paths.length) return;
  $("#search-brief-provider").textContent = "GLM 정리 중";
  $("#search-brief").textContent = `${paths.length}개 선택 근거를 GLM으로 정리하는 중입니다.`;
  const payload = await api("/api/wiki/search/brief", {
    method: "POST",
    body: JSON.stringify({ query, paths }),
  });
  if (payload.error) {
    $("#search-brief-provider").textContent = "정리 실패";
    $("#search-brief").textContent = payload.error;
    return;
  }
  renderSearchBrief(payload.brief);
}

async function loadPage(item) {
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
  const payload = await api("/api/llm/digest", {
    method: "POST",
    body: JSON.stringify({ text, projectHint }),
  });
  $("#digest-output").textContent = payload.mock
    ? [
        "project_decision: hold_for_review",
        `project_hint: ${projectHint || "none"}`,
        "sources_draft: 입력 원문 또는 파일 경로를 Sources.md 후보로 등록",
        "evidence_candidates:",
        "- 핵심 문장과 수치를 추출 대기",
        "conflict_candidates:",
        "- 기존 프로젝트와 중복 가능성 확인 필요",
      ].join("\n")
    : JSON.stringify(payload, null, 2);
}

async function sendChat() {
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  appendMessage("user", text);
  input.value = "";

  const payload = await api("/api/chat/glm", {
    method: "POST",
    body: JSON.stringify({ message: text }),
  });
  appendMessage(
    "assistant",
    payload.mock
      ? "GLM API가 연결되면 여기서 위키 검색 결과와 함께 답합니다."
      : payload.message,
  );
}

function appendMessage(role, text) {
  const message = document.createElement("article");
  message.className = `message ${role}`;
  message.textContent = text;
  $("#chat-log").appendChild(message);
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    $(`#${button.dataset.view}`).classList.add("active");
    $("#view-title").textContent = titles[button.dataset.view];
  });
});

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => triggerCommand(button));
});

$("#refresh-status").addEventListener("click", refreshStatus);
$("#operation-settings").addEventListener("submit", saveSettings);
$("#openclaw-trigger").addEventListener("click", triggerOpenClaw);
$("#stop-run").addEventListener("click", stopCurrentRun);
$("#side-stop-run").addEventListener("click", stopCurrentRun);
$("#schedule-form").addEventListener("submit", createSchedule);
$("#paperclip-refresh").addEventListener("click", refreshPaperclip);
$("#paperclip-create-task").addEventListener("click", createPaperclipTask);
$("#paperclip-trigger-task").addEventListener("click", triggerPaperclipTask);
$("#wiki-search-button").addEventListener("click", searchWiki);
$("#summarize-selected").addEventListener("click", summarizeSelectedResults);
$("#digest-button").addEventListener("click", generateDigest);
$("#chat-send").addEventListener("click", sendChat);
$("#wiki-query").addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchWiki();
});
$("#chat-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendChat();
});

renderStatus();
renderEvents("#run-list", state.runs);
renderAutomationState();
renderSchedules();
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
