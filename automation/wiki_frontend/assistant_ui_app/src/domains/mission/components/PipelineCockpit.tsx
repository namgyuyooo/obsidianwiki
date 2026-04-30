import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import { fetchAutomationSnapshot, triggerAutomation, type AutomationRun, type AutomationSnapshot } from "../api/missionApi";
import {
  analyzeDriveInstruction,
  browseFilesystem,
  collectFilesystem,
  collectSlack,
  createSchedule,
  continueAfterCollection,
  fetchDriveAnalyses,
  fetchFilesystemRoots,
  importFilesystemFolder,
  fetchPipelineState,
  fetchSchedules,
  fetchSettings,
  fetchSlackChannels,
  fetchSlackStatus,
  savePipelineState,
  saveSettings,
  runTargetedRclone,
  stopAutomation,
  type AutomationSchedule,
  type DriveAnalysis,
  type DriveCandidate,
  type FilesystemBrowsePayload,
  type FilesystemRoot,
  type SettingsPayload,
  type SlackChannel,
  type SlackStatusSnapshot,
} from "../api/controlPlaneApi";

type PipelineCockpitProps = {
  chatContext: ChatContext;
};

type SourceKey = "slack" | "drive" | "filesystem";

type SourceSelection = Record<SourceKey, boolean>;

type ExecutionMode = "now" | "scheduled";
type CompletionMode = "timebox" | "objective";
type ConnectionPolicy = "stop" | "retry";
type ExistingMode = "skip-existing" | "overwrite";
type ScheduleDraft = {
  name: string;
  command: string;
  mode: string;
  runAt: string;
  timeOfDay: string;
  intervalMinutes: number;
};

type PipelinePersistedState = {
  selectedChannels?: string[];
  channelQuery?: string;
  slackSinceDate?: string;
  slackUntilDate?: string;
  oldestDays?: number;
  limitPerChannel?: number;
  slackTestKey?: string;
  objective?: string;
  sources?: Partial<SourceSelection>;
  filesystemPath?: string;
  continueAfterCollect?: boolean;
  refreshAfterCollect?: boolean;
  executionMode?: ExecutionMode;
  completionMode?: CompletionMode;
  connectionPolicy?: ConnectionPolicy;
  existingMode?: ExistingMode;
  retryAfterMinutes?: number;
  tested?: Partial<{ slack: boolean; drive: boolean; mirror: boolean }>;
  scheduleDraft?: Partial<ScheduleDraft>;
};

const SOURCE_LABELS: Array<{ key: SourceKey; label: string; detail: string }> = [
  { key: "slack", label: "Slack", detail: "대화와 의사결정 증거" },
  { key: "drive", label: "Google Drive", detail: "문서와 폴더 증거" },
  { key: "filesystem", label: "파일 브라우징", detail: "원본 경로 읽기 + 임시 작업공간" },
];

const SOURCE_PRESETS: Array<{ label: string; sources: SourceSelection }> = [
  { label: "전체", sources: { slack: true, drive: true, filesystem: true } },
  { label: "대화+문서", sources: { slack: true, drive: true, filesystem: false } },
  { label: "문서+파일", sources: { slack: false, drive: true, filesystem: true } },
  { label: "Slack만", sources: { slack: true, drive: false, filesystem: false } },
  { label: "파일만", sources: { slack: false, drive: false, filesystem: true } },
];

const CONSERVATIVE_RULE_FIELDS = [
  { key: "RCLONE_BWLIMIT", label: "대역폭 제한", fallback: "1M" },
  { key: "RCLONE_TPSLIMIT", label: "요청 속도 제한", fallback: "1" },
  { key: "RCLONE_CHECKERS", label: "동시 검사", fallback: "1" },
  { key: "RCLONE_TRANSFERS", label: "동시 전송", fallback: "1" },
  { key: "RCLONE_COPY_MAX_MINUTES", label: "수집 시간(분)", fallback: "30" },
  { key: "RCLONE_EXCLUDE_PATTERNS", label: "제외 패턴", fallback: ".git,node_modules,*.tmp" },
  { key: "SLACK_OLDEST_DAYS", label: "Slack 기본 수집 기간(일)", fallback: "2" },
  { key: "SLACK_HISTORY_LIMIT", label: "Slack 안전 상한(채널당)", fallback: "5000" },
  { key: "SLACK_API_MIN_INTERVAL_SECONDS", label: "Slack API 간격(초)", fallback: "1.5" },
  { key: "SLACK_HISTORY_PAGE_PAUSE_SECONDS", label: "Slack 페이지 대기(초)", fallback: "1.2" },
  { key: "SLACK_THREAD_PAUSE_SECONDS", label: "Slack thread 대기(초)", fallback: "1.2" },
  { key: "SLACK_CHANNEL_PAUSE_SECONDS", label: "Slack 채널 대기(초)", fallback: "3" },
  { key: "SLACK_RATE_LIMIT_COOLDOWN_SECONDS", label: "Slack rate-limit 쿨다운(초)", fallback: "30" },
  { key: "SLACK_COLLECT_MAX_MINUTES", label: "Slack 최대 수집시간(분)", fallback: "10" },
  { key: "FILESYSTEM_BROWSE_MAX_DEPTH", label: "파일 탐색 깊이", fallback: "8" },
  { key: "FILESYSTEM_BROWSE_MAX_FILES", label: "파일 최대 후보", fallback: "5000" },
  { key: "FILESYSTEM_BROWSE_MAX_ENTRIES", label: "폴더당 표시 항목", fallback: "300" },
];

const BATCH_COMMANDS = [
  { key: "slack-collect", label: "Slack 수집", source: "slack" },
  { key: "filesystem-import", label: "임시 작업공간 적재", source: "filesystem" },
  { key: "filesystem-collect", label: "파일별 수집 실행", source: "filesystem" },
  { key: "rclone-copy", label: "임시 작업공간 준비", source: "mirror" },
  { key: "build-manifest", label: "읽기 목록 생성", source: "mirror" },
  { key: "run", label: "스킬 분석 + 위키화", source: "mirror" },
  { key: "refresh-global", label: "검색/그래프 반영", source: "system" },
] as const;

const FILESYSTEM_RUNTIME_STAGES = [
  { title: "복사/경로 연결", detail: "Drive는 임시 작업공간으로 copy, 파일 브라우징은 원본 경로를 우선 사용" },
  { title: "읽기 목록 생성", detail: "확장자, 제외 패턴, 기수집 정책으로 manifest 구성" },
  { title: "파일별 스킬 분석", detail: "HWP/HWPX, PDF/Office, Sheet, 텍스트 스킬로 상세 조회" },
  { title: "위키화 수집", detail: "Sources/Evidence/Conflict/Change 후보로 반영" },
  { title: "임시 보관/정리", detail: "작업공간은 재시도와 감사용으로 보관 후 retention에서 정리" },
] as const;

const FILE_SKILL_ROUTES = [
  { label: "HWP/HWPX", exts: [".hwp", ".hwpx"], skill: "rhwp 기반 한글문서 해석", output: "본문/표/수치/결정 추출" },
  { label: "PDF", exts: [".pdf"], skill: "PDF 문서 조회", output: "pypdf/fallback으로 페이지 텍스트와 근거 추출" },
  { label: "PowerPoint", exts: [".pptx"], skill: "PowerPoint 슬라이드 조회", output: "슬라이드 텍스트/도형/표/노트 추출" },
  { label: "Word", exts: [".docx"], skill: "DOCX 문서 조회", output: "문단/표/제목 구조 추출" },
  { label: "XLSX/XLS/CSV", exts: [".xlsx", ".xls", ".csv"], skill: "엑셀 분석/통계", output: "시트 구조/숫자/결측 분석" },
  { label: "HTML/MD/TXT/JSON", exts: [".html", ".htm", ".md", ".txt", ".json"], skill: "파일시스템 Intake", output: "증거 후보/위키 반영 계획" },
] as const;

const SLACK_PERIOD_PRESETS = [
  { label: "오늘", days: 1 },
  { label: "최근 3일", days: 3 },
  { label: "최근 7일", days: 7 },
  { label: "최근 30일", days: 30 },
] as const;

function shortDate(value = "") {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace("T", " ");
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(/\\.\\s?/g, "-").replace(/-$/, "") + " KST";
}

function currentDriveAnalysis(analyses: DriveAnalysis[]) {
  return analyses[0] || { candidates: [] };
}

function pickConservativeRules(settings: Record<string, string> = {}) {
  return Object.fromEntries(
    CONSERVATIVE_RULE_FIELDS.map((field) => [field.key, settings[field.key] || field.fallback]),
  ) as Record<string, string>;
}

function isPrecollected(candidate: DriveCandidate) {
  return Boolean((candidate.tracked && candidate.manifested) || (candidate.manifested && !(candidate.missingKinds || []).length));
}

function browserRelativePath(file: File) {
  return String((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name || "").replace(/\\/g, "/");
}

function browserAbsolutePath(file: File) {
  return String((file as File & { path?: string }).path || "").replace(/\\/g, "/");
}

function dirnamePath(path = "") {
  const normalized = path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : normalized;
}

function selectedFolderPathFromFiles(files: File[]) {
  const firstWithPath = files.find((file) => browserAbsolutePath(file));
  if (!firstWithPath) return "";
  const absolutePath = browserAbsolutePath(firstWithPath);
  const relativePath = browserRelativePath(firstWithPath);
  if (relativePath && absolutePath.endsWith(relativePath)) {
    const selectedRootName = relativePath.split("/").filter(Boolean)[0] || "";
    const parentPath = absolutePath.slice(0, absolutePath.length - relativePath.length).replace(/\/$/, "");
    return selectedRootName ? `${parentPath}/${selectedRootName}`.replace(/\/+/g, "/") : parentPath;
  }
  const directories = files.map(browserAbsolutePath).filter(Boolean).map(dirnamePath);
  if (!directories.length) return "";
  const commonParts = directories[0].split("/");
  for (const directory of directories.slice(1)) {
    const parts = directory.split("/");
    let index = 0;
    while (index < commonParts.length && commonParts[index] === parts[index]) index += 1;
    commonParts.length = index;
  }
  return commonParts.join("/") || directories[0];
}

function extensionOf(path = "") {
  const name = path.split("/").pop() || path;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function commandKey(command = "") {
  return command.replace(/\s+--dry-run/g, "").trim();
}

function slackScopeKey(channels: string[], sinceDate: string, untilDate: string, limit: number) {
  return JSON.stringify({
    channels: [...channels].sort(),
    sinceDate,
    untilDate,
    limitPerChannel: Number(limit) || 0,
  });
}

function conservativeNumber(settings: Record<string, string>, key: string, fallback: number) {
  const value = Number(settings[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function elapsedLabel(startedAt = "", now = Date.now()) {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return "-";
  const totalSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}분 ${String(seconds).padStart(2, "0")}초`;
}

function kstDateInputValue(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

function inclusiveDaysBetween(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);
}

function asPersistedState(value: unknown): PipelinePersistedState {
  return value && typeof value === "object" ? value as PipelinePersistedState : {};
}

function isSourceSelection(value: unknown): value is Partial<SourceSelection> {
  return Boolean(value && typeof value === "object");
}

export function PipelineCockpit({ chatContext }: PipelineCockpitProps) {
  const { notify } = useToastCenter();
  const hydratedRef = useRef(false);
  const lastPersistedJsonRef = useRef("");
  const filesystemDirectoryInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("수집 화면을 불러오는 중입니다.");
  const [activeAction, setActiveAction] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const [slackStatus, setSlackStatus] = useState<SlackStatusSnapshot>({});
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelQuery, setChannelQuery] = useState("");
  const [oldestDays, setOldestDays] = useState(2);
  const [slackSinceDate, setSlackSinceDate] = useState(kstDateInputValue(-1));
  const [slackUntilDate, setSlackUntilDate] = useState(kstDateInputValue(0));
  const [limitPerChannel, setLimitPerChannel] = useState(80);
  const [slackTestKey, setSlackTestKey] = useState("");
  const [objective, setObjective] = useState("쏘닉스 같은 신규 고객/프로젝트 후보를 찾아 안전하게 수집 계획을 세워줘.");
  const [sources, setSources] = useState<SourceSelection>({ slack: true, drive: true, filesystem: true });
  const [filesystemPath, setFilesystemPath] = useState("automation/drive_wikify/runtime/mirror");
  const [continueAfterCollect, setContinueAfterCollect] = useState(true);
  const [refreshAfterCollect, setRefreshAfterCollect] = useState(true);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("now");
  const [completionMode, setCompletionMode] = useState<CompletionMode>("objective");
  const [connectionPolicy, setConnectionPolicy] = useState<ConnectionPolicy>("retry");
  const [existingMode, setExistingMode] = useState<ExistingMode>("skip-existing");
  const [retryAfterMinutes, setRetryAfterMinutes] = useState(10);
  const [settings, setSettings] = useState<SettingsPayload>({ settings: {}, locked: {} });
  const [ruleDraft, setRuleDraft] = useState<Record<string, string>>(pickConservativeRules());
  const [schedules, setSchedules] = useState<AutomationSchedule[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>({
    name: "증거 수집 전체 사이클",
    command: "full-cycle",
    mode: "daily",
    runAt: "",
    timeOfDay: "03:00",
    intervalMinutes: 60,
  });
  const [tested, setTested] = useState({ slack: false, drive: false, mirror: false });
  const [driveAnalyses, setDriveAnalyses] = useState<DriveAnalysis[]>([]);
  const [automation, setAutomation] = useState<AutomationSnapshot>({ running: [], runs: [] });
  const [filesystemBrowse, setFilesystemBrowse] = useState<FilesystemBrowsePayload>({ files: [], directories: [], blocked: [], entries: [] });
  const [filesystemRoots, setFilesystemRoots] = useState<FilesystemRoot[]>([]);

  const activeAnalysis = currentDriveAnalysis(driveAnalyses);
  const candidates = activeAnalysis.candidates || [];
  const topCandidate = candidates[0];
  const runningJob = automation.running[0];
  const runVisibleForSources = (run: AutomationRun) => {
    const key = commandKey(run.command);
    if (key === "slack-collect") return sources.slack;
    if (["rclone-copy", "target-rclone-copy", "build-manifest", "run"].includes(key)) return sources.drive || sources.filesystem;
    return true;
  };
  const recentRuns = [...automation.running, ...automation.runs.filter((run) => !automation.running.some((live) => live.runId === run.runId))]
    .filter(runVisibleForSources)
    .slice(0, 6);
  const progressRun = runningJob || recentRuns[0];
  const progressPercent = typeof progressRun?.progress?.percent === "number" ? Math.max(0, Math.min(100, progressRun.progress.percent)) : null;
  const progressLines = progressRun?.progress?.recentLines?.length
    ? progressRun.progress.recentLines
    : [progressRun?.progress?.summary || progressRun?.progress?.lastLogLine || (runningJob ? "로그 수신 대기 중입니다. 작업은 실행 중입니다." : "최근 실행 로그가 없습니다.")];
  const actionBusy = Boolean(activeAction || runningJob);
  const latestRunsByCommand = new Map<string, AutomationRun>();
  [...automation.running, ...automation.runs].forEach((run) => {
    const key = commandKey(run.command);
    if (key && !latestRunsByCommand.has(key)) latestRunsByCommand.set(key, run);
  });
  const currentSlackScopeKey = slackScopeKey(selectedChannels, slackSinceDate, slackUntilDate, limitPerChannel);
  const hasCompletedSlackDryRun = automation.runs.some((run) => (
    run.command === "slack-collect --dry-run"
    && run.status === "completed"
    && run.slackScopeKey === currentSlackScopeKey
  ));
  const slackTestReady = Boolean(selectedChannels.length && ((tested.slack && slackTestKey === currentSlackScopeKey) || hasCompletedSlackDryRun));
  const activeSourceNames = SOURCE_LABELS.filter((source) => sources[source.key]).map((source) => source.label);
  const driveReady = Boolean(activeTopCandidate?.remotePath && tested.drive);
  const filesystemReady = Boolean(filesystemPath && tested.mirror);
  const filesystemExtCounts = (filesystemBrowse.files || []).reduce<Record<string, number>>((acc, path) => {
    const ext = extensionOf(path) || "(no ext)";
    acc[ext] = (acc[ext] || 0) + 1;
    return acc;
  }, {});
  const activeSkillRoutes = FILE_SKILL_ROUTES.map((route) => ({
    ...route,
    count: route.exts.reduce((sum, ext) => sum + (filesystemExtCounts[ext] || 0), 0),
  }));
  const nextStepHint = !activeSourceNames.length
    ? "먼저 증거원을 하나 이상 선택하세요."
    : sources.slack && !selectedChannels.length
      ? "Slack 채널과 기간을 먼저 고르세요."
      : sources.slack && !slackTestReady
        ? "Slack은 테스트로 기간/권한을 확인해야 실제 수집이 열립니다."
        : sources.drive && !activeTopCandidate?.remotePath
          ? "Drive는 목표 기반 표적 후보를 먼저 생성하세요."
          : sources.drive && !driveReady
            ? "Drive는 최우선 표적 테스트를 먼저 실행하세요."
            : sources.filesystem && !filesystemPath
              ? "파일 브라우징은 상위폴더를 먼저 선택하세요."
              : sources.filesystem && !filesystemReady
                ? "파일 브라우징은 현재 경로 확인 또는 파일별 수집 점검을 먼저 실행하세요."
                : "실제 수집을 실행할 준비가 됐습니다.";

  const refreshCollectionState = async () => {
    const [nextSlackStatus, analysisPayload, automationPayload, schedulePayload] = await Promise.all([
      fetchSlackStatus(),
      fetchDriveAnalyses(),
      fetchAutomationSnapshot(),
      fetchSchedules(),
    ]);
    setSlackStatus(nextSlackStatus);
    setDriveAnalyses(analysisPayload.analyses || []);
    setAutomation(automationPayload);
    setSchedules(schedulePayload.schedules || []);
  };

  const loadAll = async (query = channelQuery) => {
    setPhase("loading");
    try {
      const [nextSlackStatus, channelPayload, analysisPayload, automationPayload, settingsPayload, schedulePayload, pipelinePayload, filesystemRootPayload] = await Promise.all([
        fetchSlackStatus(),
        fetchSlackChannels(query),
        fetchDriveAnalyses(),
        fetchAutomationSnapshot(),
        fetchSettings(),
        fetchSchedules(),
        fetchPipelineState(),
        fetchFilesystemRoots(),
      ]);
      const persisted = asPersistedState(pipelinePayload.state);
      setSlackStatus(nextSlackStatus);
      setSlackChannels(channelPayload.channels || []);
      setDriveAnalyses(analysisPayload.analyses || []);
      setAutomation(automationPayload);
      setFilesystemRoots(filesystemRootPayload.roots || []);
      setSettings(settingsPayload);
      setRuleDraft(pickConservativeRules(settingsPayload.settings));
      const nextOldestDays = Number(persisted.oldestDays) || conservativeNumber(settingsPayload.settings, "SLACK_OLDEST_DAYS", 2);
      setOldestDays(nextOldestDays);
      setSlackSinceDate(persisted.slackSinceDate || kstDateInputValue(-(nextOldestDays - 1)));
      setSlackUntilDate(persisted.slackUntilDate || kstDateInputValue(0));
      setLimitPerChannel(Number(persisted.limitPerChannel) || conservativeNumber(settingsPayload.settings, "SLACK_HISTORY_LIMIT", 5000));
      if (Array.isArray(persisted.selectedChannels)) setSelectedChannels(persisted.selectedChannels);
      if (typeof persisted.channelQuery === "string") setChannelQuery(persisted.channelQuery);
      if (typeof persisted.objective === "string") setObjective(persisted.objective);
      if (isSourceSelection(persisted.sources)) setSources((current) => ({ ...current, ...persisted.sources }));
      if (typeof persisted.filesystemPath === "string") {
        setFilesystemPath(persisted.filesystemPath);
      } else if (filesystemRootPayload.roots?.[0]?.path) {
        setFilesystemPath(filesystemRootPayload.roots[0].path);
      }
      if (typeof persisted.continueAfterCollect === "boolean") setContinueAfterCollect(persisted.continueAfterCollect);
      if (typeof persisted.refreshAfterCollect === "boolean") setRefreshAfterCollect(persisted.refreshAfterCollect);
      if (persisted.executionMode) setExecutionMode(persisted.executionMode);
      if (persisted.completionMode) setCompletionMode(persisted.completionMode);
      if (persisted.connectionPolicy) setConnectionPolicy(persisted.connectionPolicy);
      if (persisted.existingMode) setExistingMode(persisted.existingMode);
      if (Number(persisted.retryAfterMinutes)) setRetryAfterMinutes(Number(persisted.retryAfterMinutes));
      if (persisted.tested) setTested((current) => ({ ...current, ...persisted.tested }));
      if (typeof persisted.slackTestKey === "string") setSlackTestKey(persisted.slackTestKey);
      if (persisted.scheduleDraft) setScheduleDraft((current) => ({ ...current, ...persisted.scheduleDraft }));
      setSchedules(schedulePayload.schedules || []);
      hydratedRef.current = true;
      setPhase("ready");
      setMessage("전역 수집 상태 동기화 완료. 10초마다 자동 갱신됩니다.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "수집 화면 로드 실패");
    }
  };

  useEffect(() => {
    loadAll("");
  }, []);

  const visibleChannels = useMemo(() => {
    const query = channelQuery.trim().toLowerCase();
    return slackChannels.filter((channel) => {
      if (!query) return true;
      return `${channel.name} ${channel.type || ""}`.toLowerCase().includes(query);
    });
  }, [channelQuery, slackChannels]);

  const suggestedChannels = visibleChannels.slice(0, 4).map((channel) => channel.name).filter(Boolean);
  const selectedChannelLabel = selectedChannels.length ? selectedChannels.slice(0, 3).join(", ") : "선택 없음";
  const selectedSourceCount = Object.values(sources).filter(Boolean).length;
  const activeSchedules = schedules.filter((schedule) => schedule.enabled !== false).slice(0, 4);
  const precollectedCandidates = candidates.filter(isPrecollected);
  const actionableCandidates = existingMode === "skip-existing" ? candidates.filter((candidate) => !isPrecollected(candidate)) : candidates;
  const visibleCandidates = existingMode === "skip-existing" ? actionableCandidates : candidates;
  const activeTopCandidate = visibleCandidates[0];
  const batchStatusCards = BATCH_COMMANDS.filter((item) => {
    if (item.source === "system") return true;
    if (item.source === "mirror") return sources.drive || sources.filesystem;
    return sources[item.source as SourceKey];
  }).map((item) => {
    const run = latestRunsByCommand.get(item.key);
    return { ...item, run };
  });

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        await refreshCollectionState();
        setNowTick(Date.now());
      } catch {
        // Keep the visible run state stable if a transient poll fails.
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return undefined;
    const nextState: PipelinePersistedState = {
      selectedChannels,
      channelQuery,
      slackSinceDate,
      slackUntilDate,
      oldestDays,
      limitPerChannel,
      slackTestKey,
      objective,
      sources,
      filesystemPath,
      continueAfterCollect,
      refreshAfterCollect,
      executionMode,
      completionMode,
      connectionPolicy,
      existingMode,
      retryAfterMinutes,
      tested,
      scheduleDraft,
    };
    const nextJson = JSON.stringify(nextState);
    if (nextJson === lastPersistedJsonRef.current) return undefined;
    const timer = window.setTimeout(() => {
      lastPersistedJsonRef.current = nextJson;
      savePipelineState(nextState as Record<string, unknown>).catch(() => {});
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    selectedChannels,
    channelQuery,
    slackSinceDate,
    slackUntilDate,
    oldestDays,
    limitPerChannel,
    slackTestKey,
    objective,
    sources,
    filesystemPath,
    continueAfterCollect,
    refreshAfterCollect,
    executionMode,
    completionMode,
    connectionPolicy,
    existingMode,
    retryAfterMinutes,
    tested,
    scheduleDraft,
  ]);

  useEffect(() => {
    if (!automation.running.length) return undefined;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [automation.running.length]);

  const runAction = async (action: () => Promise<unknown>, success: string, runningLabel = "작업") => {
    setPhase("running");
    setActiveAction(runningLabel);
    setMessage(`${runningLabel} 시작. 오른쪽 배치 명령 상태와 현재 실행에서 진행률을 확인하세요.`);
    notify("running", `${runningLabel} 시작`, "작업을 접수했습니다. 현재 실행과 배치 명령 상태가 자동 갱신됩니다.");
    try {
      await action();
      setPhase("ready");
      setMessage(success);
      notify("success", `${runningLabel} 완료`, success);
      await loadAll(channelQuery);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Pipeline 작업 실패";
      setPhase("error");
      setMessage(errorMessage);
      notify("error", `${runningLabel} 실패`, errorMessage);
    } finally {
      setActiveAction("");
    }
  };

  const toggleChannel = (name: string) => {
    setSelectedChannels((current) => (
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    ));
    setTested((current) => ({ ...current, slack: false }));
    setSlackTestKey("");
  };

  const toggleSource = (key: SourceKey) => {
    setSources((current) => ({ ...current, [key]: !current[key] }));
  };

  const applyPreset = (nextSources: SourceSelection) => {
    setSources(nextSources);
    setTested({ slack: false, drive: false, mirror: false });
  };

  const selectSuggestedChannels = () => {
    setSelectedChannels((current) => Array.from(new Set([...current, ...suggestedChannels])));
    setMessage(suggestedChannels.length ? `추천 채널 ${suggestedChannels.length}개를 선택했습니다.` : "선택할 추천 채널이 없습니다.");
  };

  const applySlackPeriod = (days: number) => {
    const safeDays = Math.max(1, days);
    setOldestDays(safeDays);
    setSlackSinceDate(kstDateInputValue(-(safeDays - 1)));
    setSlackUntilDate(kstDateInputValue(0));
    setRuleDraft((current) => ({ ...current, SLACK_OLDEST_DAYS: String(safeDays) }));
    setTested((current) => ({ ...current, slack: false }));
    setSlackTestKey("");
  };

  const updateSlackPeriodDate = (field: "since" | "until", value: string) => {
    const nextSince = field === "since" ? value : slackSinceDate;
    const nextUntil = field === "until" ? value : slackUntilDate;
    setSlackSinceDate(nextSince);
    setSlackUntilDate(nextUntil);
    const nextDays = inclusiveDaysBetween(nextSince, nextUntil);
    setOldestDays(nextDays);
    setRuleDraft((current) => ({ ...current, SLACK_OLDEST_DAYS: String(nextDays) }));
    setTested((current) => ({ ...current, slack: false }));
    setSlackTestKey("");
  };

  const runSlackCollect = (testOnly: boolean) => runAction(
    async () => {
      await collectSlack({
        channels: selectedChannels,
        oldestDays,
        sinceDate: slackSinceDate,
        untilDate: slackUntilDate,
        limitPerChannel,
        dryRun: testOnly,
      });
      if (testOnly) {
        const nextTested = { ...tested, slack: true };
        const nextSlackTestKey = slackScopeKey(selectedChannels, slackSinceDate, slackUntilDate, limitPerChannel);
        setTested(nextTested);
        setSlackTestKey(nextSlackTestKey);
        await savePipelineState({ tested: nextTested, slackTestKey: nextSlackTestKey });
      }
    },
    testOnly ? "Slack 테스트를 실행했습니다." : "Slack 실제 수집을 실행했습니다.",
    testOnly ? "Slack 테스트" : "Slack 실제 수집",
  );

  const runPostCollection = async () => {
    if (continueAfterCollect) {
      await continueAfterCollection();
      return;
    }
    if (refreshAfterCollect) await triggerAutomation("refresh-global");
  };

  const runSlackPostCollection = async () => {
    if (refreshAfterCollect) await triggerAutomation("refresh-global");
  };

  const saveConservativeRules = () => runAction(async () => {
    await saveSettings({
      ...(settings.settings || {}),
      ...ruleDraft,
      SLACK_OLDEST_DAYS: String(oldestDays),
      SLACK_HISTORY_LIMIT: String(limitPerChannel),
    });
  }, "공통 보수 룰을 저장했습니다.", "보수 룰 저장");

  const scheduleCollection = () => runAction(async () => {
    await createSchedule({
      ...scheduleDraft,
      name: scheduleDraft.name || "증거 수집 예약",
      dryRun: false,
      completionMode,
      connectionPolicy,
      retryAfterMinutes,
    });
  }, "실제 수집 예약을 생성했습니다.", "수집 예약 생성");

  const runSlackCollectWithAutomation = (testOnly: boolean) => runAction(async () => {
    await collectSlack({
      channels: selectedChannels,
      oldestDays,
      sinceDate: slackSinceDate,
      untilDate: slackUntilDate,
      limitPerChannel,
      dryRun: testOnly,
    });
    if (testOnly) {
      const nextTested = { ...tested, slack: true };
      const nextSlackTestKey = slackScopeKey(selectedChannels, slackSinceDate, slackUntilDate, limitPerChannel);
      setTested(nextTested);
      setSlackTestKey(nextSlackTestKey);
      await savePipelineState({ tested: nextTested, slackTestKey: nextSlackTestKey });
    }
    if (!testOnly) await runSlackPostCollection();
  }, testOnly ? "Slack 테스트를 실행했습니다." : "Slack 실제 수집과 검색/그래프 반영을 실행했습니다.", testOnly ? "Slack 테스트" : "Slack 실제 수집");

  const runDrivePlanner = () => runAction(async () => {
    const result = await analyzeDriveInstruction(objective.trim());
    setDriveAnalyses((current) => [result, ...current].slice(0, 8));
  }, "표적 후보를 갱신했습니다.", "표적 후보 생성");

  const runTarget = (candidate: DriveCandidate, testOnly: boolean) => runAction(async () => {
    await runTargetedRclone(candidate.remotePath, testOnly, { existingMode });
    if (testOnly) setTested((current) => ({ ...current, drive: true }));
  }, testOnly ? `${candidate.remotePath} 테스트를 실행했습니다.` : `${candidate.remotePath} 실제 수집을 실행했습니다.`, testOnly ? "표적 테스트" : "표적 실제 수집");

  const runTargetWithAutomation = (candidate: DriveCandidate, testOnly: boolean) => runAction(async () => {
    await runTargetedRclone(candidate.remotePath, testOnly, { existingMode });
    if (testOnly) setTested((current) => ({ ...current, drive: true }));
    if (!testOnly) await runPostCollection();
  }, testOnly ? `${candidate.remotePath} 테스트를 실행했습니다.` : `${candidate.remotePath} 실제 수집과 후속 자동화를 실행했습니다.`, testOnly ? "표적 테스트" : "표적 실제 수집");

  const runMirrorTest = () => runAction(async () => {
    await triggerAutomation("rclone-copy", true);
    setTested((current) => ({ ...current, mirror: true }));
  }, "임시 작업공간 준비 테스트를 실행했습니다.", "임시 작업공간 테스트");

  const requestSlackActualCollect = () => {
    if (!selectedChannels.length) {
      setPhase("error");
      setMessage("Slack 실제 수집 전 채널을 먼저 선택하세요.");
      notify("error", "Slack 실제 수집 보류", "채널을 먼저 선택해야 실제 수집을 시작할 수 있습니다.");
      return;
    }
    if (!slackTestReady) {
      setPhase("error");
      setMessage("Slack 실제 수집 전 `Slack 테스트`를 먼저 눌러 범위와 권한을 확인하세요.");
      notify("error", "Slack 실제 수집 보류", "먼저 Slack 테스트를 눌러 범위와 권한을 확인하세요.");
      return;
    }
    runSlackCollectWithAutomation(false);
  };

  const requestDriveActualCollect = () => {
    if (!activeTopCandidate?.remotePath) {
      setPhase("error");
      setMessage("Drive 실제 수집 전 표적 후보를 먼저 만들거나 기수집 제외 옵션을 확인하세요.");
      notify("error", "Drive 실제 수집 보류", "표적 후보를 먼저 만들거나 기수집 제외 옵션을 확인하세요.");
      return;
    }
    if (!tested.drive) {
      setPhase("error");
      setMessage("Drive 실제 수집 전 `최우선 표적 테스트`를 먼저 눌러 대상과 임시 작업공간 경로를 확인하세요.");
      notify("error", "Drive 실제 수집 보류", "먼저 최우선 표적 테스트로 대상과 임시 작업공간 경로를 확인하세요.");
      return;
    }
    runTargetWithAutomation(activeTopCandidate, false);
  };

  const filesystemBrowseOptions = () => ({
    maxDepth: conservativeNumber(ruleDraft, "FILESYSTEM_BROWSE_MAX_DEPTH", 8),
    maxFiles: conservativeNumber(ruleDraft, "FILESYSTEM_BROWSE_MAX_FILES", 5000),
    maxEntriesPerDirectory: conservativeNumber(ruleDraft, "FILESYSTEM_BROWSE_MAX_ENTRIES", 300),
  });

  const setFilesystemStartPath = (path = "", browseNow = false) => {
    if (!path) return;
    setFilesystemPath(path);
    setTested((current) => ({ ...current, mirror: false }));
    setMessage(`파일 브라우징 시작 경로를 ${path}로 설정했습니다.`);
    if (browseNow) {
      window.setTimeout(() => {
        browseFilesystem({ path, ...filesystemBrowseOptions() })
          .then((result) => {
            setFilesystemBrowse(result);
            const nextTested = { ...tested, mirror: true };
            setTested(nextTested);
            savePipelineState({ filesystemPath: path, tested: nextTested }).catch(() => {});
            setMessage(`파일 시스템 경로 확인 완료: ${path}`);
          })
          .catch((error) => setMessage(error instanceof Error ? error.message : "파일 시스템 경로 확인 실패"));
      }, 0);
    }
  };

  const runFilesystemBrowse = () => runAction(async () => {
    const result = await browseFilesystem({ path: filesystemPath, ...filesystemBrowseOptions() });
    setFilesystemBrowse(result);
    setTested((current) => ({ ...current, mirror: true }));
    await savePipelineState({ filesystemPath, tested: { ...tested, mirror: true } });
  }, "파일 브라우징 테스트를 완료했습니다.", "파일 브라우징 테스트");

  const importExplorerFolder = (files: File[]) => runAction(async () => {
    const selectedFiles = files.slice(0, conservativeNumber(ruleDraft, "FILESYSTEM_BROWSE_MAX_FILES", 5000));
    const form = new FormData();
    const manifest = selectedFiles.map((file, index) => {
      const fieldName = `file_${index}`;
      form.append(fieldName, file);
      return {
        fieldName,
        originalPath: browserRelativePath(file),
        relativePath: browserRelativePath(file),
        kind: "directory",
      };
    });
    form.append("workspace", chatContext.workspace);
    form.append("projectId", chatContext.projectId);
    form.append("source", "pipeline_filesystem_explorer");
    form.append("batchId", `${Date.now()}-pipeline-filesystem`);
    form.append("browser_manifest", JSON.stringify(manifest));
    form.append("maxFiles", String(conservativeNumber(ruleDraft, "FILESYSTEM_BROWSE_MAX_FILES", 5000)));
    form.append("maxDepth", String(conservativeNumber(ruleDraft, "FILESYSTEM_BROWSE_MAX_DEPTH", 8)));
    form.append("maxEntriesPerDirectory", String(conservativeNumber(ruleDraft, "FILESYSTEM_BROWSE_MAX_ENTRIES", 300)));
    const result = await importFilesystemFolder(form);
    if (result.mirrorBatchPath) setFilesystemPath(result.mirrorBatchPath);
    if (result.browse) setFilesystemBrowse(result.browse);
    const nextTested = { ...tested, mirror: true };
    setTested(nextTested);
    await savePipelineState({ filesystemPath: result.mirrorBatchPath || filesystemPath, tested: nextTested });
  }, `${files.length}개 파일을 임시 작업공간에 적재하고 수집 시작 경로로 설정했습니다.`, "파일 익스플로러 폴더 가져오기");

  const handleFilesystemDirectoryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const selectedPath = selectedFolderPathFromFiles(files);
    if (selectedPath) {
      setFilesystemStartPath(selectedPath, true);
      notify("success", "파일 경로 추출 완료", selectedPath);
      return;
    }
    notify("running", "절대경로 미제공", "브라우저가 원본 경로를 숨겨 임시 작업공간 fallback으로 적재합니다.");
    void importExplorerFolder(files);
  };

  const runFilesystemCollect = (dryRun: boolean) => runAction(async () => {
    const result = await collectFilesystem({
      path: filesystemPath,
      dryRun,
      continueAfter: continueAfterCollect,
      refreshAfter: refreshAfterCollect,
      ...filesystemBrowseOptions(),
    });
    if (result.browse) setFilesystemBrowse(result.browse);
    if (dryRun) {
      const nextTested = { ...tested, mirror: true };
      setTested(nextTested);
      await savePipelineState({ filesystemPath, tested: nextTested });
    }
  }, dryRun ? "파일별 읽기/분석 대상 점검을 완료했습니다." : "파일별 읽기, 스킬 분석, 위키화 수집을 실행했습니다.", dryRun ? "파일 수집 점검" : "파일 위키화 수집");

  return (
    <main className="aui-ops-surface aui-work-surface">
      <section className="aui-ops-hero aui-work-titlebar">
        <div>
          <span className="aui-kicker">수집</span>
          <h1>수집 파이프라인</h1>
          <p>{chatContext.workspace.toUpperCase()} 증거 수집을 선택, 테스트, 실제 수집, 후속 반영 순서로 실행합니다.</p>
          <div className="aui-work-metrics">
            <span>{selectedChannels.length} 채널 선택</span>
            <span>{selectedSourceCount} 증거원</span>
            <span>{actionableCandidates.length}/{candidates.length} 수집 대상</span>
            <span>{runningJob?.status || "idle"}</span>
            <span>{recentRuns.length} 실행 이력</span>
          </div>
        </div>
        <aside className={`aui-ops-live ${phase}`}>
          <strong>{phase}</strong>
          {activeAction ? <em>{activeAction}</em> : null}
          <span>{message}</span>
          <button onClick={() => loadAll(channelQuery)} type="button">새로고침</button>
        </aside>
      </section>

      <section className={`aui-pipeline-progress ${runningJob ? "running" : "idle"}`} aria-live="polite">
        <div className="aui-pipeline-progress-head">
          <div>
            <span>고정 상태바 · {runningJob ? "진행 중" : "대기/최근 진행"}</span>
            <strong>{progressRun?.command || "대기 중"}</strong>
          </div>
          <div>
            <b>{progressRun?.status || "idle"}</b>
            <small>{progressRun ? shortDate(progressRun.updatedAt || progressRun.startedAt || progressRun.createdAt) : "-"}</small>
          </div>
        </div>
        <div className="aui-pipeline-progress-brief">
          <div>
            <span>지금 해야 할 일</span>
            <strong>{nextStepHint}</strong>
          </div>
          <div>
            <span>선택한 증거원</span>
            <strong>{activeSourceNames.join(" + ") || "없음"}</strong>
          </div>
          <div>
            <span>파일 스킬</span>
            <strong>{sources.filesystem ? "확장자별 자동 라우팅" : "파일 미선택"}</strong>
          </div>
        </div>
        <div className="aui-pipeline-progress-bar" data-empty={progressPercent === null ? "true" : "false"}>
          <i style={{ width: `${progressPercent ?? (runningJob ? 42 : 0)}%` }} />
        </div>
        <details className="aui-pipeline-progress-details">
          <summary>실행 세부 보기</summary>
          <div className="aui-pipeline-progress-grid">
            <div><span>실행 ID</span><strong>{progressRun?.runId || "-"}</strong></div>
            <div><span>시작</span><strong>{shortDate(progressRun?.startedAt || progressRun?.createdAt)}</strong></div>
            <div><span>경과</span><strong>{runningJob ? elapsedLabel(progressRun?.startedAt || progressRun?.createdAt, nowTick) : "-"}</strong></div>
            <div><span>진행률</span><strong>{progressPercent === null ? (runningJob ? "측정 대기" : "-") : `${progressPercent}%`}</strong></div>
            <div><span>현재 파일</span><strong>{progressRun?.progress?.currentFile || "-"}</strong></div>
            <div><span>속도/ETA</span><strong>{[progressRun?.progress?.speed, progressRun?.progress?.eta ? `ETA ${progressRun.progress.eta}` : ""].filter(Boolean).join(" · ") || "-"}</strong></div>
          </div>
          <div className="aui-pipeline-progress-log">
            <span>최근 로그</span>
            {progressLines.slice(-5).map((line, index) => <code key={`${line}-${index}`}>{line || "로그 수신 대기 중"}</code>)}
          </div>
        </details>
      </section>

      <section className="aui-pipeline-command-grid">
        <article className="aui-pipeline-panel aui-pipeline-panel-intent">
          <header>
            <span>1</span>
            <div>
              <strong>목표</strong>
              <small>{activeSourceNames.join(", ") || "증거원 선택 필요"}</small>
            </div>
          </header>
          <label className="aui-ops-field">
            <span>무엇을 수집할까?</span>
            <textarea
              rows={3}
              value={objective}
              onChange={(event) => {
                setObjective(event.target.value);
                setTested((current) => ({ ...current, drive: false }));
              }}
              placeholder="예: 최근 1주 Slack과 지정 폴더 문서를 읽어 신규 고객/프로젝트 후보를 위키화"
            />
          </label>
          <div className="aui-pipeline-source-grid compact">
            {SOURCE_LABELS.map((source) => (
              <label className={sources[source.key] ? "active" : ""} key={source.key}>
                <input checked={sources[source.key]} onChange={() => toggleSource(source.key)} type="checkbox" />
                <strong>{source.label}</strong>
                <span>{source.detail}</span>
              </label>
            ))}
          </div>
          <div className="aui-pipeline-preset-row">
            {SOURCE_PRESETS.map((preset) => (
              <button key={preset.label} onClick={() => applyPreset(preset.sources)} type="button">{preset.label}</button>
            ))}
          </div>
          <div className="aui-pipeline-next-card">
            <span>다음 행동</span>
            <strong>{nextStepHint}</strong>
          </div>
        </article>

        <article className="aui-pipeline-panel aui-pipeline-panel-scope">
          <header>
            <span>2</span>
            <div>
              <strong>범위</strong>
              <small>선택한 증거원만 설정</small>
            </div>
          </header>
          <div className="aui-pipeline-scope-grid">
            {sources.slack ? (
              <section className="aui-pipeline-scope-card">
                <div className="aui-pipeline-scope-head">
                  <strong>Slack</strong>
                  <span>{selectedChannels.length ? `${selectedChannels.length}개 채널` : "채널 미선택"}</span>
                </div>
                <div className="aui-pipeline-preset-row">
                  {SLACK_PERIOD_PRESETS.map((preset) => (
                    <button key={preset.label} onClick={() => applySlackPeriod(preset.days)} type="button">{preset.label}</button>
                  ))}
                </div>
                <div className="aui-ops-inline-fields">
                  <label>
                    <span>채널 검색</span>
                    <input value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="sales, pjt, 고객명" />
                  </label>
                  <label>
                    <span>시작일(KST)</span>
                    <input type="date" value={slackSinceDate} onChange={(event) => updateSlackPeriodDate("since", event.target.value)} />
                  </label>
                  <label>
                    <span>종료일(KST)</span>
                    <input min={slackSinceDate} type="date" value={slackUntilDate} onChange={(event) => updateSlackPeriodDate("until", event.target.value)} />
                  </label>
                  <label>
                    <span>상한/채널</span>
                    <input
                      min={1}
                      type="number"
                      value={limitPerChannel}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value) || 5000;
                        setLimitPerChannel(nextValue);
                        setRuleDraft((current) => ({ ...current, SLACK_HISTORY_LIMIT: String(nextValue) }));
                        setTested((current) => ({ ...current, slack: false }));
                        setSlackTestKey("");
                      }}
                    />
                  </label>
                </div>
                <p className="aui-ops-muted">{slackSinceDate} ~ {slackUntilDate} KST · {oldestDays}일 · 최신순 수집</p>
                <div className="aui-pipeline-choice-list slim">
                  {visibleChannels.slice(0, 8).map((channel) => {
                    const checked = selectedChannels.includes(channel.name);
                    return (
                      <label className={checked ? "active" : ""} key={channel.id || channel.name}>
                        <input checked={checked} onChange={() => toggleChannel(channel.name)} type="checkbox" />
                        <span>{channel.name}</span>
                        <small>{channel.routing?.channel_profile?.channel_bucket || channel.type || "channel"}</small>
                      </label>
                    );
                  })}
                  {!visibleChannels.length ? <p className="aui-ops-muted">선택 가능한 채널이 없습니다.</p> : null}
                </div>
                <div className="aui-pipeline-actions">
                  <button disabled={!suggestedChannels.length} onClick={selectSuggestedChannels} type="button">추천 선택</button>
                  <button disabled={!selectedChannels.length} onClick={() => setSelectedChannels([])} type="button">초기화</button>
                </div>
              </section>
            ) : null}

            {sources.drive ? (
              <section className="aui-pipeline-scope-card">
                <div className="aui-pipeline-scope-head">
                  <strong>Google Drive</strong>
                  <span>{activeTopCandidate?.folder || activeTopCandidate?.remotePath || "표적 후보 필요"}</span>
                </div>
                <div className="aui-pipeline-actions">
                  <button className="primary" disabled={!objective.trim() || actionBusy} onClick={runDrivePlanner} type="button">목표로 표적 찾기</button>
                  <button onClick={() => loadAll(channelQuery)} type="button">후보 다시 읽기</button>
                </div>
                <div className="aui-pipeline-existing-mode compact">
                  <div>
                    <strong>기수집 처리</strong>
                    <span>{precollectedCandidates.length}개 후보 제외 가능</span>
                  </div>
                  <label className={existingMode === "skip-existing" ? "active" : ""}>
                    <input checked={existingMode === "skip-existing"} onChange={() => setExistingMode("skip-existing")} type="radio" />
                    <span>제외</span>
                  </label>
                  <label className={existingMode === "overwrite" ? "active" : ""}>
                    <input checked={existingMode === "overwrite"} onChange={() => setExistingMode("overwrite")} type="radio" />
                    <span>덮어쓰기</span>
                  </label>
                </div>
                <div className="aui-pipeline-target-list compact">
                  {visibleCandidates.slice(0, 4).map((candidate) => (
                    <article key={`${candidate.remotePath}-${candidate.score || 0}`}>
                      <div>
                        <strong>{candidate.folder || candidate.remotePath}</strong>
                        <span>{candidate.matchedProjectLabel || "프로젝트 미확정"} · {candidate.priority || "priority"} · {candidate.score || 0}</span>
                        <small>{isPrecollected(candidate) ? "기수집/manifest 확인됨" : (candidate.reasons || []).slice(0, 2).join(" · ") || "추천 근거 없음"}</small>
                      </div>
                      <div>
                        <button disabled={actionBusy} onClick={() => runTarget(candidate, true)} type="button">테스트</button>
                        <button disabled={actionBusy || !tested.drive} onClick={() => runTargetWithAutomation(candidate, false)} type="button">실행</button>
                      </div>
                    </article>
                  ))}
                  {!candidates.length ? <p className="aui-ops-muted">목표를 입력하고 표적 후보를 만드세요.</p> : null}
                  {candidates.length && !visibleCandidates.length ? <p className="aui-ops-muted">모든 후보가 기수집 상태입니다. 필요하면 덮어쓰기를 선택하세요.</p> : null}
                </div>
              </section>
            ) : null}

            {sources.filesystem ? (
              <section className="aui-pipeline-scope-card">
                <input
                  className="aui-hidden-input"
                  multiple
                  onChange={handleFilesystemDirectoryChange}
                  ref={filesystemDirectoryInputRef}
                  type="file"
                  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                />
                <div className="aui-pipeline-scope-head">
                  <strong>파일 브라우징</strong>
                  <span>{filesystemBrowse.files?.length || 0} 파일 · {filesystemBrowse.directories?.length || 0} 폴더</span>
                </div>
                <label className="aui-ops-field">
                  <span>시작 경로</span>
                  <input
                    value={filesystemPath}
                    onChange={(event) => {
                      setFilesystemPath(event.target.value);
                      setTested((current) => ({ ...current, mirror: false }));
                    }}
                  />
                </label>
                <div className="aui-pipeline-filesystem-primary">
                  <button className="primary" disabled={actionBusy} onClick={() => filesystemDirectoryInputRef.current?.click()} type="button">상위폴더 선택</button>
                  <button disabled={actionBusy} onClick={runFilesystemBrowse} type="button">경로 확인</button>
                </div>
                <p className="aui-ops-muted">가능하면 원본 절대경로만 사용합니다. 경로가 숨겨질 때만 임시 작업공간으로 대체합니다.</p>
                <div className="aui-pipeline-filesystem-roots">
                  <strong>빠른 시작점</strong>
                  <div>
                    {filesystemRoots.map((root) => (
                      <button
                        className={filesystemPath === root.path ? "active" : ""}
                        disabled={!root.exists || actionBusy}
                        key={root.key || root.path}
                        onClick={() => setFilesystemStartPath(root.path, true)}
                        type="button"
                      >
                        {root.label || root.path}
                      </button>
                    ))}
                    {!filesystemRoots.length ? <span className="aui-ops-muted">시작점 로딩 중</span> : null}
                  </div>
                </div>
                <div className="aui-pipeline-filesystem-tree">
                  <strong>하위 폴더</strong>
                  {(filesystemBrowse.entries || [])
                    .flatMap((entry) => entry.tree || [])
                    .filter((item) => item.type === "directory")
                    .slice(0, 48)
                    .map((item) => (
                      <button
                        className={filesystemPath === item.path ? "active" : ""}
                        key={item.path}
                        onClick={() => setFilesystemStartPath(item.path, true)}
                        style={{ paddingLeft: `${10 + Math.min(Number(item.depth || 0), 6) * 12}px` }}
                        type="button"
                      >
                        {item.path}
                      </button>
                    ))}
                  {!(filesystemBrowse.entries || []).some((entry) => entry.tree?.some((item) => item.type === "directory")) ? (
                    <span className="aui-ops-muted">경로 확인 후 하위 폴더가 표시됩니다.</span>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        </article>

        <article className="aui-pipeline-panel aui-pipeline-panel-execute">
          <header>
            <span>3</span>
            <div>
              <strong>실행</strong>
              <small>{nextStepHint}</small>
            </div>
          </header>
          <div className="aui-pipeline-readiness">
            {sources.slack ? <span className={slackTestReady ? "ready" : "hold"}>Slack {slackTestReady ? "준비됨" : "테스트 필요"}</span> : null}
            {sources.drive ? <span className={driveReady ? "ready" : "hold"}>Drive {driveReady ? "준비됨" : "표적 테스트 필요"}</span> : null}
            {sources.filesystem ? <span className={filesystemReady ? "ready" : "hold"}>파일 {filesystemReady ? "준비됨" : "경로 확인 필요"}</span> : null}
          </div>
          {(sources.drive || sources.filesystem) ? (
            <div className="aui-pipeline-runtime-stages">
              {FILESYSTEM_RUNTIME_STAGES.map((stage, index) => (
                <article key={stage.title}>
                  <span>{index + 1}</span>
                  <strong>{stage.title}</strong>
                  <small>{stage.detail}</small>
                </article>
              ))}
            </div>
          ) : null}
          {(sources.drive || sources.filesystem) ? (
            <div className="aui-pipeline-skill-routes">
              <div>
                <strong>파일 양식별 조회 스킬</strong>
                <span>실제 수집 시 manifest의 확장자별로 추출기와 분석 스킬이 개입합니다.</span>
              </div>
              <div>
                {activeSkillRoutes.map((route) => (
                  <article className={route.count ? "active" : ""} key={route.label}>
                    <b>{route.label}</b>
                    <span>{route.skill}</span>
                    <small>{route.count ? `${route.count}개 후보 · ` : ""}{route.output}</small>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          <div className="aui-pipeline-execute-grid">
            {sources.slack ? (
              <section>
                <strong>Slack</strong>
                <button disabled={actionBusy || !selectedChannels.length} onClick={() => runSlackCollect(true)} type="button">테스트</button>
                <button className="primary" disabled={actionBusy || !slackTestReady} onClick={requestSlackActualCollect} type="button">실제 수집</button>
              </section>
            ) : null}
            {sources.drive ? (
              <section>
                <strong>Drive</strong>
                <button disabled={actionBusy || !activeTopCandidate?.remotePath} onClick={() => activeTopCandidate && runTarget(activeTopCandidate, true)} type="button">표적 테스트</button>
                <button className="primary" disabled={actionBusy || !driveReady} onClick={requestDriveActualCollect} type="button">표적 수집</button>
              </section>
            ) : null}
            {sources.filesystem ? (
              <section>
                <strong>파일</strong>
                <button disabled={actionBusy} onClick={() => runFilesystemCollect(true)} type="button">점검</button>
                <button className="primary" disabled={actionBusy || !filesystemReady} onClick={() => runFilesystemCollect(false)} type="button">스킬 분석+위키화</button>
              </section>
            ) : null}
            <section>
              <strong>후속</strong>
              <button disabled={actionBusy} onClick={() => runAction(() => continueAfterCollection(), "후속 반영을 실행했습니다.", "후속 반영")} type="button">후속 반영</button>
              <button disabled={actionBusy} onClick={() => runAction(() => triggerAutomation("refresh-global"), "그래프맵 업데이트를 요청했습니다.", "그래프맵 업데이트")} type="button">그래프맵 업데이트</button>
              <button disabled={!runningJob?.runId} onClick={() => runAction(() => stopAutomation(runningJob?.runId || ""), "실행 중인 작업에 중지를 요청했습니다.", "작업 중지")} type="button">작업 중지</button>
            </section>
          </div>

          <details className="aui-pipeline-advanced">
            <summary>실행 옵션과 보수 룰</summary>
            <div className="aui-pipeline-automation-options">
              <label>
                <input checked={continueAfterCollect} onChange={(event) => setContinueAfterCollect(event.target.checked)} type="checkbox" />
                <span>복사/읽기 후 파일별 스킬 분석과 위키화까지 실행</span>
              </label>
              <label>
                <input checked={refreshAfterCollect} onChange={(event) => setRefreshAfterCollect(event.target.checked)} type="checkbox" />
                <span>끝나면 검색/그래프에 반영</span>
              </label>
            </div>
            <div className="aui-pipeline-policy-grid">
              <label>
                <span>실행 방식</span>
                <select value={executionMode} onChange={(event) => setExecutionMode(event.target.value as ExecutionMode)}>
                  <option value="now">즉시 실행</option>
                  <option value="scheduled">예약 실행</option>
                </select>
              </label>
              <label>
                <span>종료 조건</span>
                <select value={completionMode} onChange={(event) => setCompletionMode(event.target.value as CompletionMode)}>
                  <option value="objective">목적 완료 시 종료</option>
                  <option value="timebox">설정 시간까지만 수집</option>
                </select>
              </label>
              <label>
                <span>연결 유실</span>
                <select value={connectionPolicy} onChange={(event) => setConnectionPolicy(event.target.value as ConnectionPolicy)}>
                  <option value="retry">설정 시간 이후 재시도</option>
                  <option value="stop">즉시 종료</option>
                </select>
              </label>
              {connectionPolicy === "retry" ? (
                <label>
                  <span>재시도 대기(분)</span>
                  <input min={1} type="number" value={retryAfterMinutes} onChange={(event) => setRetryAfterMinutes(Number(event.target.value) || 10)} />
                </label>
              ) : null}
            </div>
            {executionMode === "scheduled" ? (
              <div className="aui-pipeline-schedule-panel">
                <strong>예약 만들기</strong>
                <div className="aui-pipeline-policy-grid">
                  <label>
                    <span>예약 이름</span>
                    <input value={scheduleDraft.name} onChange={(event) => setScheduleDraft((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label>
                    <span>실행 명령</span>
                    <select value={scheduleDraft.command} onChange={(event) => setScheduleDraft((current) => ({ ...current, command: event.target.value }))}>
                      <option value="full-cycle">전체 수집+반영</option>
                      <option value="rclone-copy">임시 작업공간 준비</option>
                      <option value="slack-collect">Slack 수집</option>
                      <option value="build-manifest">읽기 목록 생성</option>
                      <option value="run">스킬 분석+위키화</option>
                    </select>
                  </label>
                  <label>
                    <span>반복 방식</span>
                    <select value={scheduleDraft.mode} onChange={(event) => setScheduleDraft((current) => ({ ...current, mode: event.target.value }))}>
                      <option value="daily">매일</option>
                      <option value="interval">간격 반복</option>
                      <option value="once">한 번만</option>
                    </select>
                  </label>
                  {scheduleDraft.mode === "interval" ? (
                    <label>
                      <span>반복 간격(분)</span>
                      <input min={5} type="number" value={scheduleDraft.intervalMinutes} onChange={(event) => setScheduleDraft((current) => ({ ...current, intervalMinutes: Number(event.target.value) || 60 }))} />
                    </label>
                  ) : scheduleDraft.mode === "once" ? (
                    <label>
                      <span>실행 일시</span>
                      <input type="datetime-local" value={scheduleDraft.runAt} onChange={(event) => setScheduleDraft((current) => ({ ...current, runAt: event.target.value }))} />
                    </label>
                  ) : (
                    <label>
                      <span>실행 시각</span>
                      <input type="time" value={scheduleDraft.timeOfDay} onChange={(event) => setScheduleDraft((current) => ({ ...current, timeOfDay: event.target.value }))} />
                    </label>
                  )}
                </div>
                <div className="aui-pipeline-actions">
                  <button className="primary" onClick={scheduleCollection} type="button">예약 생성</button>
                </div>
              </div>
            ) : null}
            <div className="aui-pipeline-rule-panel">
              <div>
                <strong>공통 보수 룰</strong>
                <span>대역폭, 요청량, 동시성, 최대 수집 시간을 제한합니다.</span>
              </div>
              <div className="aui-pipeline-rule-grid">
                {CONSERVATIVE_RULE_FIELDS.map((field) => (
                  <label key={field.key}>
                    <span>{field.label}</span>
                    <input
                      value={ruleDraft[field.key] || ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setRuleDraft((current) => ({ ...current, [field.key]: nextValue }));
                        if (field.key === "SLACK_OLDEST_DAYS") applySlackPeriod(Number(nextValue) || 2);
                        if (field.key === "SLACK_HISTORY_LIMIT") {
                          setLimitPerChannel(Number(nextValue) || 5000);
                          setTested((current) => ({ ...current, slack: false }));
                          setSlackTestKey("");
                        }
                      }}
                    />
                    <small>{field.key}</small>
                  </label>
                ))}
              </div>
              <div className="aui-pipeline-actions">
                <button onClick={saveConservativeRules} type="button">보수 설정 저장</button>
              </div>
            </div>
          </details>
        </article>

        <article className="aui-pipeline-panel aui-pipeline-panel-status">
          <header>
            <span>4</span>
            <div>
              <strong>상태</strong>
              <small>10초마다 전역 실행 상태 갱신</small>
            </div>
          </header>
          <div className="aui-pipeline-status-grid">
            <section>
              <strong>배치 명령</strong>
              <div className="aui-pipeline-batch-status">
                {batchStatusCards.map((item) => (
                  <div className={item.run?.status || "idle"} key={item.key}>
                    <b>{item.label}</b>
                    <span>{item.run?.status || "대기"} · {item.run ? shortDate(item.run.updatedAt || item.run.createdAt) : "미실행"}</span>
                    <small>{item.run?.progress?.summary || item.run?.progress?.lastLogLine || item.key}</small>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <strong>예약</strong>
              <div className="aui-pipeline-schedule-list">
                {activeSchedules.map((schedule) => (
                  <div key={schedule.id}>
                    <b>{schedule.name || schedule.command}</b>
                    <span>{schedule.command || "-"} · {schedule.mode || "-"} · 다음 {shortDate(schedule.nextRunAt || schedule.runAt)}</span>
                  </div>
                ))}
                {!activeSchedules.length ? <p className="aui-ops-muted">활성 예약이 없습니다.</p> : null}
              </div>
            </section>
            <section>
              <strong>최근 실행</strong>
              <div className="aui-ops-list">
                {recentRuns.map((run: AutomationRun) => (
                  <div className="aui-ops-log-card" key={run.runId || `${run.command}-${run.createdAt}`}>
                    <strong>{run.command || "command"}</strong>
                    <span>{run.status || "-"} · {shortDate(run.updatedAt || run.createdAt)}</span>
                    <small>{run.progress?.summary || run.progress?.lastLogLine || "-"}</small>
                  </div>
                ))}
                {!recentRuns.length ? <p className="aui-ops-muted">아직 실행 이력이 없습니다.</p> : null}
              </div>
            </section>
          </div>
        </article>
      </section>
    </main>
  );
}
