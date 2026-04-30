import { useEffect, useMemo, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import { fetchAutomationSnapshot, triggerAutomation, type AutomationRun } from "../api/missionApi";
import {
  cleanupMirror,
  createSchedule,
  deleteSchedule,
  fetchCoreDocuments,
  fetchCoverage,
  fetchLlmUsage,
  fetchLlmPolicy,
  fetchMirrorStatus,
  fetchSchedules,
  fetchSettings,
  fetchSystemStatus,
  saveMirrorRetention,
  saveSettings,
  type AutomationSchedule,
  type CoreDocumentRecord,
  type CoreDocumentsPayload,
  type CoveragePayload,
  type LlmUsageEntry,
  type LlmPolicyPayload,
  type MirrorCleanupPayload,
  type MirrorStatusPayload,
  type SettingsPayload,
  type SystemStatusPayload,
} from "../api/controlPlaneApi";
import { browseRemoteDrive, type RemoteBrowserPayload } from "../../wiki/api/wikiApi";

type OperationsControlPlaneProps = {
  chatContext: ChatContext;
};

type ScheduleDraft = {
  name: string;
  command: string;
  dryRun: boolean;
  mode: string;
  timeOfDay: string;
  intervalMinutes: number;
};

const EMPTY_DRAFT: ScheduleDraft = {
  name: "",
  command: "rclone-copy",
  dryRun: true,
  mode: "daily",
  timeOfDay: "03:00",
  intervalMinutes: 60,
};

const EMPTY_REMOTE_BROWSER: RemoteBrowserPayload = {
  remote: "",
  root: "",
  currentPath: "",
  parentPath: "",
  items: [],
};

const EMPTY_MIRROR_STATUS: MirrorStatusPayload = {
  roots: {},
  retention: {},
};

const EMPTY_MIRROR_CLEANUP: MirrorCleanupPayload = {
  scope: "uploads",
  dryRun: true,
  deleteAll: false,
  olderThanDays: 7,
  matchedFiles: 0,
  deletedFiles: 0,
  deletedDirectories: 0,
  freedBytes: 0,
  samplePaths: [],
};

const EMPTY_CORE_DOCUMENTS: CoreDocumentsPayload = {
  documents: [],
  summary: {},
};

function groupSettings(settings: Record<string, string>) {
  const groups: Record<string, Array<[string, string]>> = {
    Rclone: [],
    Slack: [],
    GLM: [],
    Paperclip: [],
    Other: [],
  };
  for (const entry of Object.entries(settings)) {
    const [key] = entry;
    if (key.startsWith("RCLONE_") || key.startsWith("DRIVE_")) groups.Rclone.push(entry);
    else if (key.startsWith("SLACK_")) groups.Slack.push(entry);
    else if (key.startsWith("GLM_") || key.startsWith("OPENCLAW_")) groups.GLM.push(entry);
    else if (key.startsWith("PAPERCLIP_")) groups.Paperclip.push(entry);
    else groups.Other.push(entry);
  }
  return groups;
}

function shortDate(value = "") {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

function normalizeDrivePath(value = "") {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}

function drivePathLabel(value = "") {
  const normalized = normalizeDrivePath(value);
  return normalized || "전체 Drive";
}

function formatBytes(value = 0) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(value || 0);
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 100 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function modifiedTimeLabel(value = "") {
  if (!value) return "-";
  if (/^\d+$/.test(String(value))) {
    const asDate = new Date(Number(value) * 1000);
    return Number.isNaN(asDate.getTime()) ? String(value) : shortDate(asDate.toISOString());
  }
  return shortDate(String(value));
}

export function OperationsControlPlane({ chatContext }: OperationsControlPlaneProps) {
  const { notify } = useToastCenter();
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("운영 콘솔을 불러오는 중입니다.");
  const [systemStatus, setSystemStatus] = useState<SystemStatusPayload>({ status: {} });
  const [settings, setSettings] = useState<SettingsPayload>({ settings: {}, locked: {} });
  const [draftSettings, setDraftSettings] = useState<Record<string, string>>({});
  const [coverage, setCoverage] = useState<CoveragePayload>({});
  const [llmPolicy, setLlmPolicy] = useState<LlmPolicyPayload>({});
  const [llmUsage, setLlmUsage] = useState<LlmUsageEntry[]>([]);
  const [mirrorStatus, setMirrorStatus] = useState<MirrorStatusPayload>(EMPTY_MIRROR_STATUS);
  const [mirrorCleanupResult, setMirrorCleanupResult] = useState<MirrorCleanupPayload>(EMPTY_MIRROR_CLEANUP);
  const [coreDocuments, setCoreDocuments] = useState<CoreDocumentsPayload>(EMPTY_CORE_DOCUMENTS);
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([]);
  const [schedules, setSchedules] = useState<AutomationSchedule[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(EMPTY_DRAFT);
  const [activeSettingsGroup, setActiveSettingsGroup] = useState("Rclone");
  const [remoteBrowser, setRemoteBrowser] = useState<RemoteBrowserPayload>(EMPTY_REMOTE_BROWSER);
  const [remoteBrowsePath, setRemoteBrowsePath] = useState("");
  const [remoteBrowsePhase, setRemoteBrowsePhase] = useState<"idle" | "loading" | "error">("idle");
  const [remoteBrowseMessage, setRemoteBrowseMessage] = useState("최상위 수집 경로를 탐색해서 `RCLONE_REMOTE_PATH`에 반영할 수 있습니다.");
  const [cleanupScope, setCleanupScope] = useState<"uploads" | "all">("uploads");
  const [cleanupOlderThanDays, setCleanupOlderThanDays] = useState(7);
  const [cleanupMode, setCleanupMode] = useState<"age" | "processed" | "processed_or_age">("age");
  const [cleanupDeleteAll, setCleanupDeleteAll] = useState(false);
  const [cleanupPhase, setCleanupPhase] = useState<"idle" | "loading" | "error">("idle");
  const [cleanupMessage, setCleanupMessage] = useState("mirror 정리 미리보기로 삭제 대상과 예상 절감 용량을 먼저 확인하세요.");
  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionDays, setRetentionDays] = useState(7);
  const [retentionScope, setRetentionScope] = useState<"uploads" | "all">("uploads");
  const [retentionCleanupMode, setRetentionCleanupMode] = useState<"age" | "processed" | "processed_or_age">("age");
  const [retentionMaxGb, setRetentionMaxGb] = useState(1);
  const [retentionTimeOfDay, setRetentionTimeOfDay] = useState("03:30");

  const reload = async () => {
    setPhase("loading");
    try {
      const [nextStatus, nextSettings, nextCoverage, nextPolicy, nextSchedules, nextMirrorStatus, nextCoreDocuments, nextLlmUsage, nextAutomation] = await Promise.all([
        fetchSystemStatus(),
        fetchSettings(),
        fetchCoverage(),
        fetchLlmPolicy(),
        fetchSchedules(),
        fetchMirrorStatus(),
        fetchCoreDocuments(chatContext.workspace),
        fetchLlmUsage(),
        fetchAutomationSnapshot(),
      ]);
      const initialBrowsePath = normalizeDrivePath(nextSettings.settings?.RCLONE_REMOTE_PATH || "");
      const nextRemoteBrowser = await browseRemoteDrive(initialBrowsePath).catch(() => EMPTY_REMOTE_BROWSER);
      setSystemStatus(nextStatus);
      setSettings(nextSettings);
      setDraftSettings(nextSettings.settings || {});
      setRemoteBrowsePath(initialBrowsePath);
      setRemoteBrowser(nextRemoteBrowser);
      setRemoteBrowseMessage(nextRemoteBrowser.error
        ? nextRemoteBrowser.error
        : `${nextRemoteBrowser.remote || nextSettings.settings?.RCLONE_REMOTE || "gdrive"} 기준 ${nextRemoteBrowser.items?.length || 0}개 항목을 확인했습니다.`);
      setCoverage(nextCoverage);
      setLlmPolicy(nextPolicy);
      setLlmUsage(nextLlmUsage.usage || []);
      setSchedules(nextSchedules.schedules || []);
      setMirrorStatus(nextMirrorStatus);
      setCoreDocuments(nextCoreDocuments);
      setAutomationRuns(nextAutomation.runs || []);
      setCleanupScope(nextMirrorStatus.retention?.scope === "all" ? "all" : "uploads");
      setCleanupOlderThanDays(Math.max(1, Number(nextMirrorStatus.retention?.days || 7)));
      setCleanupMode(nextMirrorStatus.retention?.cleanupMode === "processed" || nextMirrorStatus.retention?.cleanupMode === "processed_or_age" ? nextMirrorStatus.retention.cleanupMode : "age");
      setRetentionEnabled(Boolean(nextMirrorStatus.retention?.enabled));
      setRetentionDays(Math.max(1, Number(nextMirrorStatus.retention?.days || 7)));
      setRetentionScope(nextMirrorStatus.retention?.scope === "all" ? "all" : "uploads");
      setRetentionCleanupMode(nextMirrorStatus.retention?.cleanupMode === "processed" || nextMirrorStatus.retention?.cleanupMode === "processed_or_age" ? nextMirrorStatus.retention.cleanupMode : "age");
      setRetentionMaxGb(Math.max(0, Number(nextMirrorStatus.retention?.maxBytes || 0)) / (1024 ** 3) || 1);
      setRetentionTimeOfDay(String(nextMirrorStatus.retention?.timeOfDay || "03:30"));
      setPhase("ready");
      setMessage("운영 콘솔 동기화 완료.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "운영 콘솔 로드 실패");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const groupedSettings = useMemo(() => groupSettings(draftSettings), [draftSettings]);
  const currentSettingsEntries = groupedSettings[activeSettingsGroup] || [];
  const effectiveRemoteRoot = normalizeDrivePath(draftSettings.RCLONE_REMOTE_PATH || settings.settings?.RCLONE_REMOTE_PATH || "");
  const remoteDirectories = useMemo(
    () => remoteBrowser.items.filter((item) => item.type === "directory"),
    [remoteBrowser.items],
  );
  const activeCleanupRoot = cleanupScope === "all" ? mirrorStatus.roots?.all : mirrorStatus.roots?.uploads;
  const dirtySettings = useMemo(() => {
    const keys = new Set([...Object.keys(settings.settings || {}), ...Object.keys(draftSettings || {})]);
    return [...keys].some((key) => String(draftSettings[key] ?? "").trim() !== String(settings.settings?.[key] ?? "").trim());
  }, [draftSettings, settings.settings]);
  const activeRuns = useMemo(() => automationRuns.filter((run) => ["running", "stale"].includes(String(run.status || "").toLowerCase())), [automationRuns]);
  const recentRuns = useMemo(() => automationRuns.slice(0, 6), [automationRuns]);
  const focusedRuns = useMemo(() => {
    const seen = new Set<string>();
    const push = (run: AutomationRun) => {
      const key = run.runId || `${run.command}-${run.startedAt}-${run.createdAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    return [...activeRuns, ...recentRuns].filter(push).slice(0, 6);
  }, [activeRuns, recentRuns]);
  const highPriorityCoreDocs = useMemo(
    () => (coreDocuments.documents || []).filter((doc) => doc.priority === "high" || doc.status === "unreviewed").slice(0, 6),
    [coreDocuments.documents],
  );
  const recentLlmUsage = useMemo(() => llmUsage.slice(0, 6), [llmUsage]);
  const operationalGoals = useMemo(() => {
    const goals: Array<{ title: string; detail: string; emphasis?: string }> = [];
    if (!schedules.length) {
      goals.push({ title: "자동 스케줄 복구", detail: "수집 파이프라인이 수동 상태입니다. 최소 1개의 daily 스케줄을 추가해야 합니다.", emphasis: "high" });
    }
    const queuedRow = (coverage.rows || []).find((row) => ["queued", "expanded", "retry"].includes(String(row.status || "").toLowerCase()));
    if (queuedRow) {
      goals.push({ title: "다음 수집 대상 정리", detail: `${queuedRow.folderPath || "/"} · ${queuedRow.nextAction || "표적 수집 범위를 다시 결정하세요."}`, emphasis: "high" });
    }
    if (activeRuns.some((run) => String(run.command || "").includes("rclone-copy"))) {
      goals.push({ title: "실행 중 수집 감시", detail: "rclone 진행 상태와 최근 로그를 먼저 확인한 뒤 추가 명령을 넣어야 합니다.", emphasis: "medium" });
    }
    if (!effectiveRemoteRoot) {
      goals.push({ title: "Drive 최상위 범위 고정", detail: "RCLONE_REMOTE_PATH가 비어 있어 전체 Drive 기준입니다. 목표 폴더가 있으면 지금 고정해야 합니다.", emphasis: "medium" });
    }
    if ((activeCleanupRoot?.staleFileCount || 0) > 0) {
      goals.push({ title: "mirror 정리 후보 확인", detail: `${activeCleanupRoot?.staleFileCount || 0}개 오래된 파일이 남아 있습니다. 삭제 미리보기로 영향 범위를 확인하세요.`, emphasis: "medium" });
    }
    const unreviewedDoc = (coreDocuments.documents || []).find((doc) => doc.status === "unreviewed");
    if (unreviewedDoc) {
      goals.push({ title: "핵심 문서 검토", detail: `${unreviewedDoc.title || "core document"} 문서가 아직 미검토 상태입니다.`, emphasis: "medium" });
    }
    return goals.slice(0, 5);
  }, [activeCleanupRoot?.staleFileCount, activeRuns, coreDocuments.documents, coverage.rows, effectiveRemoteRoot, schedules.length]);

  const systemHealth = useMemo(() => {
    const values = Object.values(systemStatus.status || {});
    if (!values.length) return "unknown";
    return values.every((value) => String(value).toLowerCase().includes("ok")) ? "stable" : "check";
  }, [systemStatus.status]);

  const operationalAlerts = useMemo(() => {
    const alerts: string[] = [];
    if (!settings.settings?.SLACK_BOT_TOKEN && !settings.secrets?.SLACK_BOT_TOKEN) {
      alerts.push("Slack token이 비어 있어 채널 수집이 막혀 있을 수 있습니다.");
    }
    if (!settings.settings?.RCLONE_REMOTE && !settings.secrets?.RCLONE_REMOTE) {
      alerts.push("Rclone remote가 비어 있어 파일 수집 경로가 불명확합니다.");
    }
    if (systemStatus.safety?.sourceDriveProtected === false) {
      alerts.push("source drive 보호가 꺼져 있어 원본 삭제 위험이 있습니다.");
    }
    if (!schedules.length) {
      alerts.push("예약 스케줄이 없어 수집 파이프라인이 수동 운영 상태입니다.");
    }
    if (!llmPolicy.policies?.length) {
      alerts.push("LLM policy가 비어 있어 모델 라우팅 기준이 드러나지 않습니다.");
    }
    return alerts;
  }, [llmPolicy.policies, schedules.length, settings.secrets, settings.settings, systemStatus.safety?.sourceDriveProtected]);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setPhase("saving");
    notify("running", "운영 작업 시작", success, { durationMs: 2200 });
    try {
      await action();
      setPhase("ready");
      setMessage(success);
      await reload();
      notify("success", "운영 작업 완료", success);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "운영 작업 실패");
      notify("error", "운영 작업 실패", error instanceof Error ? error.message : "운영 작업 실패");
    }
  };

  const loadRemoteBrowser = async (path = remoteBrowsePath) => {
    setRemoteBrowsePhase("loading");
    const normalized = normalizeDrivePath(path);
    setRemoteBrowsePath(normalized);
    try {
      const result = await browseRemoteDrive(normalized);
      setRemoteBrowser(result);
      setRemoteBrowsePath(normalizeDrivePath(result.currentPath || normalized));
      setRemoteBrowsePhase(result.error ? "error" : "idle");
      setRemoteBrowseMessage(result.error
        ? result.error
        : `${result.remote || draftSettings.RCLONE_REMOTE || settings.settings?.RCLONE_REMOTE || "gdrive"} 기준 ${result.items.length}개 항목을 확인했습니다.`);
    } catch (error) {
      setRemoteBrowsePhase("error");
      setRemoteBrowseMessage(error instanceof Error ? error.message : "Drive 경로 탐색 실패");
    }
  };

  const applyRemoteRoot = (path = "") => {
    const normalized = normalizeDrivePath(path);
    setDraftSettings((current) => ({ ...current, RCLONE_REMOTE_PATH: normalized }));
    setRemoteBrowsePath(normalized);
    setMessage(`rclone 최상위 경로 초안을 ${drivePathLabel(normalized)}로 반영했습니다. 설정 저장을 누르면 유지됩니다.`);
    notify("success", "최상위 경로 반영", `${drivePathLabel(normalized)} 경로를 저장 초안에 반영했습니다.`);
  };

  const runMirrorCleanup = async (dryRun: boolean) => {
    setCleanupPhase("loading");
    setCleanupMessage(dryRun ? "mirror 정리 미리보기 실행 중입니다." : "mirror 파일 삭제를 실행 중입니다.");
    try {
      const result = await cleanupMirror({
        scope: cleanupScope,
        olderThanDays: cleanupDeleteAll ? 0 : Math.max(1, Number(cleanupOlderThanDays || 7)),
        dryRun,
        deleteAll: cleanupDeleteAll,
        cleanupMode,
      });
      setMirrorCleanupResult(result);
      await reload();
      setCleanupPhase("idle");
      setCleanupMessage(
        dryRun
          ? (result.skipped
            ? `미리보기 생략: 현재 ${formatBytes(result.currentBytes || 0)}로 임계치 ${formatBytes(result.thresholdBytes || 0)} 미만입니다.`
            : `미리보기 완료: ${result.matchedFiles || 0}개 파일, 예상 절감 ${formatBytes(result.freedBytes || 0)}`)
          : `삭제 완료: ${result.deletedFiles || 0}개 파일, ${result.deletedDirectories || 0}개 폴더 정리, 확보 ${formatBytes(result.freedBytes || 0)}`,
      );
      notify(
        "success",
        dryRun ? "mirror 정리 미리보기 완료" : "mirror 정리 완료",
        dryRun
          ? `${result.matchedFiles || 0}개 파일이 대상입니다.`
          : `${result.deletedFiles || 0}개 파일을 정리했습니다.`,
      );
    } catch (error) {
      setCleanupPhase("error");
      setCleanupMessage(error instanceof Error ? error.message : "mirror 정리 실패");
      notify("error", "mirror 정리 실패", error instanceof Error ? error.message : "mirror 정리 실패");
    }
  };

  const runProcessedMirrorCleanupNow = async () => {
    setCleanupDeleteAll(false);
    setCleanupMode("processed");
    setCleanupMessage("위키화 완료분 즉시 삭제를 준비 중입니다.");
    try {
      const result = await cleanupMirror({
        scope: cleanupScope,
        olderThanDays: 0,
        dryRun: false,
        deleteAll: false,
        cleanupMode: "processed",
      });
      setMirrorCleanupResult(result);
      await reload();
      setCleanupPhase("idle");
      setCleanupMessage(`위키화 완료분 삭제 완료: ${result.deletedFiles || 0}개 파일, 확보 ${formatBytes(result.freedBytes || 0)}`);
      notify("success", "위키화 완료분 삭제", `${result.deletedFiles || 0}개 파일을 정리했습니다.`);
    } catch (error) {
      setCleanupPhase("error");
      setCleanupMessage(error instanceof Error ? error.message : "위키화 완료분 삭제 실패");
      notify("error", "위키화 완료분 삭제 실패", error instanceof Error ? error.message : "위키화 완료분 삭제 실패");
    }
  };

  const saveMirrorRetentionPolicy = async () => {
    setPhase("saving");
    try {
      const result = await saveMirrorRetention({
        enabled: retentionEnabled,
        days: Math.max(1, Number(retentionDays || 7)),
        scope: retentionScope,
        cleanupMode: retentionCleanupMode,
        maxBytes: Math.max(0, Number(retentionMaxGb || 0)) * (1024 ** 3),
        timeOfDay: retentionTimeOfDay,
      });
      setMirrorStatus(result);
      setPhase("ready");
      setMessage(retentionEnabled ? "mirror 자동 보존정리 정책을 저장했습니다." : "mirror 자동 보존정리를 비활성화했습니다.");
      notify(
        "success",
        "mirror 보존정책 저장",
        retentionEnabled
          ? `${Math.max(1, Number(retentionDays || 7))}일 기준 자동정리를 저장했습니다.`
          + (retentionMaxGb > 0 ? ` · ${retentionMaxGb}GB 초과 시만 실행` : "")
          : "자동정리를 껐습니다.",
      );
      await reload();
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "mirror 보존정책 저장 실패");
      notify("error", "mirror 보존정책 저장 실패", error instanceof Error ? error.message : "mirror 보존정책 저장 실패");
    }
  };

  return (
    <main className="aui-ops-surface">
      <section className="aui-ops-hero">
        <div>
          <span className="aui-kicker">Operations</span>
          <h1>운영 콘솔</h1>
          <p>{chatContext.workspace.toUpperCase()} 수집 시스템의 설정, 보호 상태, 스케줄, 모델 정책을 한 번에 점검합니다.</p>
        </div>
        <aside className={`aui-ops-live ${phase}`}>
          <strong>{phase}</strong>
          <span>{dirtySettings ? `${message} · 저장되지 않은 변경 있음` : message}</span>
          <button onClick={reload} type="button">새로고침</button>
        </aside>
      </section>

      <section className="aui-ops-summary-grid">
        <article className="aui-ops-summary-card">
          <span>health</span>
          <strong>{systemHealth}</strong>
          <small>{Object.keys(systemStatus.status || {}).length} probes · protected {String(systemStatus.safety?.sourceDriveProtected ?? true)}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>coverage</span>
          <strong>{coverage.progressPercent || 0}%</strong>
          <small>{coverage.totalFolders || 0} tracked folders · processed {coverage.processedDocuments || 0}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>schedules</span>
          <strong>{schedules.length}</strong>
          <small>next {shortDate(schedules[0]?.nextRunAt)}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>alerts</span>
          <strong>{operationalAlerts.length}</strong>
          <small>{operationalAlerts[0] || "운영상 급한 경고 없음"}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>dirty</span>
          <strong>{dirtySettings ? "yes" : "no"}</strong>
          <small>{dirtySettings ? "설정 저장 필요" : "저장 상태 일치"}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>runs</span>
          <strong>{activeRuns.length}</strong>
          <small>{recentRuns[0]?.command || "최근 실행 없음"}</small>
        </article>
      </section>

      <section className="aui-ops-command-bar">
        <button onClick={reload} type="button">전체 새로고침</button>
        <button onClick={() => runAction(() => saveSettings(draftSettings), "설정을 저장했습니다.")} type="button">{dirtySettings ? "설정 저장 필요" : "설정 저장"}</button>
        <button
          onClick={() => runAction(
            () => createSchedule(scheduleDraft),
            "예약 스케줄을 생성했습니다.",
          )}
          type="button"
        >
          스케줄 추가
        </button>
        <button onClick={() => runAction(() => triggerAutomation("refresh-global"), "refresh-global 실행을 요청했습니다.")} type="button">그래프맵 업데이트</button>
      </section>

      <section className="aui-ops-workbench">
        <article className="aui-ops-card aui-ops-settings-card">
          <div className="aui-ops-card-head">
            <span>설정 편집</span>
            <strong>{activeSettingsGroup}</strong>
          </div>
          <div className="aui-ops-chipline">
            {Object.keys(groupedSettings).map((group) => (
              <button
                className={activeSettingsGroup === group ? "active" : ""}
                key={group}
                onClick={() => setActiveSettingsGroup(group)}
                type="button"
              >
                {group} {(groupedSettings[group] || []).length}
              </button>
            ))}
          </div>
          <p className="aui-ops-muted">지금 필요한 그룹만 열고 수정한 뒤 저장하는 방식으로 작업량을 줄였습니다.</p>
          {activeSettingsGroup === "Rclone" ? (
            <>
            <section className="aui-ops-drive-browser">
              <div className="aui-ops-card-head">
                <span>Rclone root picker</span>
                <strong>{drivePathLabel(effectiveRemoteRoot)}</strong>
              </div>
              <p className="aui-ops-muted">여기서 고른 폴더를 `RCLONE_REMOTE_PATH` 초안값으로 넣고, 상단의 설정 저장 버튼으로 고정할 수 있습니다.</p>
              <div className="aui-ops-chipline">
                <span>remote {draftSettings.RCLONE_REMOTE || settings.settings?.RCLONE_REMOTE || "gdrive"}</span>
                <span>저장 예정 {drivePathLabel(effectiveRemoteRoot)}</span>
                <span>탐색 위치 {drivePathLabel(remoteBrowsePath)}</span>
              </div>
              <div className="aui-ops-drive-browser-controls">
                <label className="aui-ops-field">
                  <span>탐색 경로</span>
                  <input
                    onChange={(event) => setRemoteBrowsePath(normalizeDrivePath(event.target.value))}
                    placeholder="비우면 remote 루트"
                    value={remoteBrowsePath}
                  />
                </label>
                <div className="aui-ops-actions">
                  <button disabled={remoteBrowsePhase === "loading"} onClick={() => loadRemoteBrowser(remoteBrowsePath)} type="button">탐색</button>
                  <button
                    disabled={remoteBrowsePhase === "loading" || !normalizeDrivePath(remoteBrowser.parentPath || remoteBrowsePath)}
                    onClick={() => loadRemoteBrowser(remoteBrowser.parentPath || "")}
                    type="button"
                  >
                    상위
                  </button>
                  <button disabled={remoteBrowsePhase === "loading"} onClick={() => loadRemoteBrowser("")} type="button">루트</button>
                  <button onClick={() => applyRemoteRoot(remoteBrowsePath)} type="button">현재 위치를 최상위로</button>
                  <button onClick={() => applyRemoteRoot("")} type="button">전체 Drive로 초기화</button>
                </div>
              </div>
              <p className="aui-ops-muted">{remoteBrowsePhase === "loading" ? "Drive 경로 탐색 중입니다." : remoteBrowseMessage}</p>
              <div className="aui-ops-list">
                {remoteDirectories.map((item) => (
                  <article className="aui-ops-log-card" key={item.remotePath}>
                    <strong>{item.name}</strong>
                    <span>{item.remotePath || "root"}{item.updatedAt ? ` · ${shortDate(item.updatedAt)}` : ""}</span>
                    <div className="aui-ops-actions">
                      <button onClick={() => loadRemoteBrowser(item.remotePath)} type="button">열기</button>
                      <button onClick={() => applyRemoteRoot(item.remotePath)} type="button">이 폴더를 최상위로</button>
                    </div>
                  </article>
                ))}
                {!remoteDirectories.length ? (
                  <p className="aui-ops-muted">표시할 폴더가 없습니다. 먼저 탐색을 눌러 remote 루트나 특정 경로를 불러오세요.</p>
                ) : null}
              </div>
            </section>
            
            <section className="aui-ops-drive-browser">
              <div className="aui-ops-card-head">
                <span>Mirror cleanup</span>
                <strong>{cleanupScope === "all" ? "전체 mirror" : "업로드 mirror"}</strong>
              </div>
              <p className="aui-ops-muted">원본 Google Drive 삭제는 구현되어 있지 않고, 여기서는 로컬 mirror 파일만 정리됩니다.</p>
              <div className="aui-ops-chipline">
                <span>대상 {activeCleanupRoot?.path || "-"}</span>
                <span>파일 {activeCleanupRoot?.fileCount || 0}</span>
                <span>용량 {formatBytes(activeCleanupRoot?.totalBytes || 0)}</span>
                <span>{cleanupDeleteAll ? "전체 삭제 모드" : cleanupMode === "processed" ? "위키화 완료분" : cleanupMode === "processed_or_age" ? "위키화 완료분 또는 오래된 파일" : `${cleanupOlderThanDays}일 경과 기준`}</span>
              </div>
              <div className="aui-ops-inline-fields">
                <label>
                  <span>정리 범위</span>
                  <select value={cleanupScope} onChange={(event) => setCleanupScope(event.target.value === "all" ? "all" : "uploads")}>
                    <option value="uploads">assistant_ui_uploads만</option>
                    <option value="all">전체 mirror</option>
                  </select>
                </label>
                <label>
                  <span>삭제 기준</span>
                  <select value={cleanupMode} onChange={(event) => setCleanupMode(event.target.value === "processed" || event.target.value === "processed_or_age" ? event.target.value : "age")}>
                    <option value="age">오래된 파일만</option>
                    <option value="processed">위키화 완료분만</option>
                    <option value="processed_or_age">위키화 완료분 또는 오래된 파일</option>
                  </select>
                </label>
                <label>
                  <span>경과 일수</span>
                  <input
                    disabled={cleanupDeleteAll || cleanupMode === "processed"}
                    min={1}
                    type="number"
                    value={cleanupOlderThanDays}
                    onChange={(event) => setCleanupOlderThanDays(Math.max(1, Number(event.target.value) || 7))}
                  />
                </label>
                <label className="aui-ops-checkcard">
                  <input checked={cleanupDeleteAll} onChange={(event) => setCleanupDeleteAll(event.target.checked)} type="checkbox" />
                  <div>
                    <strong>전체 삭제</strong>
                    <span>경과 일수 무시</span>
                  </div>
                </label>
              </div>
              <div className="aui-ops-actions">
                <button disabled={cleanupPhase === "loading"} onClick={() => runMirrorCleanup(true)} type="button">삭제 미리보기</button>
                <button disabled={cleanupPhase === "loading"} onClick={() => runMirrorCleanup(false)} type="button">로컬 mirror 삭제 실행</button>
                <button disabled={cleanupPhase === "loading"} onClick={runProcessedMirrorCleanupNow} type="button">위키화 완료분 지금 삭제</button>
              </div>
              <p className="aui-ops-muted">{cleanupPhase === "loading" ? "mirror 정리 실행 중입니다." : cleanupMessage}</p>
              <div className="aui-ops-list">
                <article className="aui-ops-log-card">
                  <strong>최근 정리 결과</strong>
                  <span>{mirrorCleanupResult.rootPath || activeCleanupRoot?.path || "-"}</span>
                  <small>
                    기준 {mirrorCleanupResult.cleanupMode || cleanupMode} · 대상 {mirrorCleanupResult.matchedFiles || 0}개 · 삭제 {mirrorCleanupResult.deletedFiles || 0}개 · 확보 {formatBytes(mirrorCleanupResult.freedBytes || 0)}
                  </small>
                </article>
                {(mirrorCleanupResult.samplePaths || []).slice(0, 8).map((item, index) => (
                  <article className="aui-ops-log-card" key={`${item.path || "sample"}-${index}`}>
                    <strong>{item.path || "-"}</strong>
                    <span>{formatBytes(item.size || 0)}</span>
                    <small>{shortDate(item.modifiedAt || "")}</small>
                  </article>
                ))}
                {!mirrorCleanupResult.samplePaths?.length ? <p className="aui-ops-muted">아직 정리 미리보기나 실행 이력이 없습니다.</p> : null}
              </div>
            </section>

            <section className="aui-ops-drive-browser">
              <div className="aui-ops-card-head">
                <span>Mirror retention</span>
                <strong>{retentionEnabled ? "자동정리 켜짐" : "자동정리 꺼짐"}</strong>
              </div>
              <p className="aui-ops-muted">매일 지정 시각에 `mirror-cleanup` 스케줄을 자동 관리합니다.</p>
              <div className="aui-ops-chipline">
                <span>다음 실행 {shortDate(mirrorStatus.retention?.nextRunAt || "")}</span>
                <span>schedule {mirrorStatus.retention?.scheduleId || "-"}</span>
                <span>범위 {mirrorStatus.retention?.scope || "uploads"}</span>
                <span>임계치 {mirrorStatus.retention?.maxBytes ? formatBytes(mirrorStatus.retention.maxBytes) : "없음"}</span>
              </div>
              <div className="aui-ops-inline-fields">
                <label className="aui-ops-checkcard">
                  <input checked={retentionEnabled} onChange={(event) => setRetentionEnabled(event.target.checked)} type="checkbox" />
                  <div>
                    <strong>자동정리 사용</strong>
                    <span>mirror-cleanup 스케줄 관리</span>
                  </div>
                </label>
                <label>
                  <span>보존 일수</span>
                  <input min={1} type="number" value={retentionDays} onChange={(event) => setRetentionDays(Math.max(1, Number(event.target.value) || 7))} />
                </label>
                <label>
                  <span>자동정리 기준</span>
                  <select value={retentionCleanupMode} onChange={(event) => setRetentionCleanupMode(event.target.value === "processed" || event.target.value === "processed_or_age" ? event.target.value : "age")}>
                    <option value="age">오래된 파일만</option>
                    <option value="processed">위키화 완료분만</option>
                    <option value="processed_or_age">위키화 완료분 또는 오래된 파일</option>
                  </select>
                </label>
                <label>
                  <span>실행 시각</span>
                  <input value={retentionTimeOfDay} onChange={(event) => setRetentionTimeOfDay(event.target.value)} />
                </label>
                <label>
                  <span>용량 임계치(GB)</span>
                  <input min={0} step="0.1" type="number" value={retentionMaxGb} onChange={(event) => setRetentionMaxGb(Math.max(0, Number(event.target.value) || 0))} />
                </label>
              </div>
              <div className="aui-ops-inline-fields">
                <label>
                  <span>자동정리 범위</span>
                  <select value={retentionScope} onChange={(event) => setRetentionScope(event.target.value === "all" ? "all" : "uploads")}>
                    <option value="uploads">assistant_ui_uploads만</option>
                    <option value="all">전체 mirror</option>
                  </select>
                </label>
              </div>
              <div className="aui-ops-actions">
                <button onClick={saveMirrorRetentionPolicy} type="button">자동정리 정책 저장</button>
              </div>
            </section>
            </>
          ) : null}
          <div className="aui-ops-settings-focus">
            {(currentSettingsEntries as Array<[string, string]>).slice(0, activeSettingsGroup === "Other" ? 18 : 24).map(([key, value]) => (
              <label className="aui-ops-field" key={key}>
                <span>{key}</span>
                <input
                  value={draftSettings[key] ?? value}
                  onChange={(event) => setDraftSettings((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder={settings.secrets?.[key] ? "configured secret remains hidden" : ""}
                />
              </label>
            ))}
            {!currentSettingsEntries.length ? <p className="aui-ops-muted">이 그룹에는 현재 표시할 설정이 없습니다.</p> : null}
          </div>
          <p className="aui-ops-muted">locked DRIVE_DELETE_SOURCE = {settings.locked?.DRIVE_DELETE_SOURCE || "false"}</p>
        </article>

        <div className="aui-ops-rail">
          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>핵심 목표</span>
              <strong>{operationalGoals.length ? "focus" : "stable"}</strong>
            </div>
            <div className="aui-ops-list">
              {(operationalGoals.length ? operationalGoals : [{ title: "현재 목표 안정", detail: "즉시 조치가 필요한 목표는 크지 않습니다. 설정과 coverage를 유지하면 됩니다." }]).map((item) => (
                <article className="aui-ops-log-card" key={`${item.title}-${item.detail}`}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </article>
              ))}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>System status</span>
              <strong>{systemHealth}</strong>
            </div>
            <div className="aui-ops-keyval">
              {Object.entries(systemStatus.status || {}).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>Coverage</span>
              <strong>{coverage.totalFolders || 0} tracked folders</strong>
            </div>
            <div className="aui-ops-chipline">
              {Object.entries(coverage.statuses || {}).map(([key, value]) => (
                <span key={key}>{key} {value}</span>
              ))}
            </div>
            <div className="aui-ops-list">
              {(coverage.rows || []).slice(0, 6).map((row, index) => (
                <article className="aui-ops-log-card" key={`${row.folderPath}-${index}`}>
                  <strong>{row.folderPath || "-"}</strong>
                  <span>{row.status || "-"} · {row.drive || "-"}</span>
                  <small>{row.nextAction || "-"}</small>
                </article>
              ))}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>Recent runs</span>
              <strong>{activeRuns.length ? `${activeRuns.length} active/stale` : "history"}</strong>
            </div>
            <div className="aui-ops-list">
              {focusedRuns.map((run) => (
                <article className="aui-ops-log-card" key={run.runId || `${run.command}-${run.startedAt}`}>
                  <strong>{run.command || "-"}</strong>
                  <span>{run.status || "-"} · {shortDate(run.startedAt || run.createdAt || "")}</span>
                  <small>{run.progress?.lastLogLine || run.progress?.summary || "-"}</small>
                </article>
              ))}
              {!focusedRuns.length ? <p className="aui-ops-muted">아직 실행 이력이 없습니다.</p> : null}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>Core documents</span>
              <strong>{coreDocuments.summary?.coreCandidates || 0} candidates</strong>
            </div>
            <div className="aui-ops-chipline">
              <span>manifest {coreDocuments.summary?.manifestDocuments || 0}</span>
              <span>high {coreDocuments.summary?.highPriority || 0}</span>
              <span>used {coreDocuments.summary?.used || 0}</span>
              <span>decision {coreDocuments.summary?.decisionEvidence || 0}</span>
            </div>
            <div className="aui-ops-list">
              {highPriorityCoreDocs.map((doc: CoreDocumentRecord) => (
                <article className="aui-ops-log-card" key={doc.key || doc.filePath}>
                  <strong>{doc.title || "-"}</strong>
                  <span>{doc.statusLabel || doc.status || "-"} · {doc.projectLabel || doc.folderPath || "-"}</span>
                  <small>{modifiedTimeLabel(doc.modifiedTime || "")} · {doc.priority || "normal"} · score {doc.score || 0}</small>
                </article>
              ))}
              {!highPriorityCoreDocs.length ? <p className="aui-ops-muted">표시할 core document 후보가 없습니다.</p> : null}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>Schedules</span>
              <strong>{schedules.length} rules</strong>
            </div>
            <div className="aui-ops-inline-fields">
              <label>
                <span>command</span>
                <select value={scheduleDraft.command} onChange={(event) => setScheduleDraft((current) => ({ ...current, command: event.target.value }))}>
                  <option value="rclone-copy">rclone-copy</option>
                  <option value="build-manifest">build-manifest</option>
                  <option value="run">run</option>
                  <option value="full-cycle">full-cycle</option>
                  <option value="slack-collect">slack-collect</option>
                </select>
              </label>
              <label>
                <span>mode</span>
                <select value={scheduleDraft.mode} onChange={(event) => setScheduleDraft((current) => ({ ...current, mode: event.target.value }))}>
                  <option value="daily">daily</option>
                  <option value="interval">interval</option>
                  <option value="once">once</option>
                </select>
              </label>
              <label>
                <span>time</span>
                <input value={scheduleDraft.timeOfDay} onChange={(event) => setScheduleDraft((current) => ({ ...current, timeOfDay: event.target.value }))} />
              </label>
            </div>
            <div className="aui-ops-inline-fields">
              <label>
                <span>name</span>
                <input value={scheduleDraft.name} onChange={(event) => setScheduleDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>interval</span>
                <input min={1} type="number" value={scheduleDraft.intervalMinutes} onChange={(event) => setScheduleDraft((current) => ({ ...current, intervalMinutes: Number(event.target.value) || 60 }))} />
              </label>
              <label className="aui-ops-checkcard">
                <input checked={scheduleDraft.dryRun} onChange={(event) => setScheduleDraft((current) => ({ ...current, dryRun: event.target.checked }))} type="checkbox" />
                <div>
                  <strong>dry-run</strong>
                  <span>safe mode</span>
                </div>
              </label>
            </div>
            <div className="aui-ops-list">
              {schedules.slice(0, 6).map((schedule) => (
                <article className="aui-ops-log-card" key={schedule.id}>
                  <strong>{schedule.name || schedule.command}</strong>
                  <span>{schedule.command} · {schedule.mode} · next {shortDate(schedule.nextRunAt)}</span>
                  <small>{schedule.dryRun ? "dry-run" : "live run"}</small>
                  <button onClick={() => runAction(() => deleteSchedule(schedule.id), `${schedule.name || schedule.id} 스케줄을 삭제했습니다.`)} type="button">삭제</button>
                </article>
              ))}
              {!schedules.length ? <p className="aui-ops-muted">아직 자동화 규칙이 없습니다. 최소 하나의 daily 스케줄을 권장합니다.</p> : null}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>LLM policy</span>
              <strong>{(llmPolicy.policies || []).length} rules</strong>
            </div>
            <div className="aui-ops-chipline">
              <span>usage {llmUsage.length}</span>
              <span>latest {recentLlmUsage[0]?.feature || "-"}</span>
            </div>
            <div className="aui-ops-list">
              {(llmPolicy.policies || []).slice(0, 8).map((policy, index) => (
                <article className="aui-ops-log-card" key={`${policy.id || policy.label}-${index}`}>
                  <strong>{policy.label || policy.id || "policy"}</strong>
                  <span>{policy.value || "-"}</span>
                  <small>{policy.note || policy.source || "-"}</small>
                </article>
              ))}
              {!llmPolicy.policies?.length ? <p className="aui-ops-muted">표시할 policy가 없습니다.</p> : null}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>LLM usage</span>
              <strong>{recentLlmUsage.length} recent</strong>
            </div>
            <div className="aui-ops-list">
              {recentLlmUsage.map((item) => (
                <article className="aui-ops-log-card" key={item.id || `${item.feature}-${item.createdAt}`}>
                  <strong>{item.feature || "-"}</strong>
                  <span>{item.provider || "-"} · {item.status || "-"} · {shortDate(item.createdAt || "")}</span>
                  <small>{item.model || item.reason || item.fallback || "-"}</small>
                </article>
              ))}
              {!recentLlmUsage.length ? <p className="aui-ops-muted">최근 LLM 사용 기록이 없습니다.</p> : null}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
