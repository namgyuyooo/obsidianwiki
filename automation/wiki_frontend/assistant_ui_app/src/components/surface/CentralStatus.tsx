import { useEffect, useMemo, useRef, useState } from "react";
import { useToastCenter } from "../../components/surface/ToastCenter";
import { fetchActiveChatRuns, stopChatProjectRun, type ActiveChatRun } from "../../domains/chat/api/chatWorkspaceApi";
import { fetchPaperclipSnapshot, type PaperclipRun, type PaperclipTask } from "../../domains/paperclip/api/paperclipApi";
import type { AutomationRun } from "../../domains/mission/api/missionApi";
import { fetchAutomationSnapshot, triggerAutomation } from "../../domains/mission/api/missionApi";
import { continueAfterCollection, fetchSystemStatus, stopAutomation, type SystemStatusPayload } from "../../domains/mission/api/controlPlaneApi";

type CentralStatusProps = {
  projectId: string;
  projectName?: string;
  orchestration?: Record<string, any>;
  onOpenPaperclip: (taskId?: string, runId?: string) => void;
  onOpenMission: () => void;
};

type StatusTask = {
  taskId: string;
  templateId: string;
  status: string;
  phase: string;
  createdAt: string;
  updatedAt: string;
  runId: string;
  chunkCount: number;
  stale: boolean;
};

type CentralStatusSnapshot = {
  activeChat: ActiveChatRun | null;
  recentTasks: StatusTask[];
  latestTask: StatusTask | null;
  runningAutomation: AutomationRun | null;
  recentAutomation: AutomationRun[];
  systemStatus: SystemStatusPayload | null;
  refreshedAt: number;
};

type StatusAction = {
  key: string;
  label: string;
  onClick: () => Promise<void> | void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
};

type StatusSection = {
  key: string;
  title: string;
  label: string;
  detail: string;
  meta?: string;
  percent?: number | null;
  tone?: "active" | "complete" | "stale" | "failed" | "idle";
};

const PAPERCLIP_STALE_MS = 15 * 60 * 1000;

function taskCreatedAt(task: PaperclipTask) {
  return String(task.createdAt || task.updatedAt || task.finishedAt || "");
}

function taskUpdatedAt(task: PaperclipTask) {
  return String(task.updatedAt || task.finishedAt || task.createdAt || "");
}

function isPaperclipActiveLike(phase = "", status = "") {
  return ["queued", "running"].includes(status) || /running/.test(phase);
}

function isPaperclipTerminal(phase = "", status = "") {
  return ["completed", "partial_completed", "failed"].includes(phase) || ["completed", "failed"].includes(status);
}

function isStaleTimestamp(value = "", staleMs = PAPERCLIP_STALE_MS) {
  const ts = Date.parse(String(value || ""));
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts > staleMs;
}

function taskSortScore(task: StatusTask) {
  if (isPaperclipActiveLike(task.phase, task.status) && !task.stale) return 4;
  if (task.phase === "completed" || task.status === "completed") return 3;
  if (task.phase === "partial_completed") return 2;
  if (task.stale) return 1;
  return 0;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function paperclipProgressPercent(task: Pick<StatusTask, "phase" | "status" | "stale">) {
  if (task.stale) return 0;
  if (task.phase === "completed" || task.status === "completed") return 100;
  if (task.phase === "partial_completed") return 96;
  if (task.phase === "failed" || task.status === "failed") return 100;
  if (task.phase === "final_synthesis_running") return 88;
  if (task.phase === "chunk_analysis_running") return 62;
  if (task.phase === "extraction_completed") return 28;
  if (task.status === "running") return 14;
  if (task.status === "queued") return 6;
  return 0;
}

function paperclipProgressDetail(task: Pick<StatusTask, "phase" | "status" | "chunkCount" | "stale">) {
  if (task.stale) return "오래된 상태";
  if (task.chunkCount > 1 && /running|completed|partial_completed/.test(`${task.phase} ${task.status}`)) {
    return `${task.chunkCount} chunks`;
  }
  if (task.chunkCount === 1 && /running|completed|partial_completed/.test(`${task.phase} ${task.status}`)) {
    return "single pass";
  }
  if (task.status === "queued") return "queue";
  return "";
}

function phaseLabel(phase = "", status = "") {
  if (phase === "completed" || status === "completed") return "완료";
  if (phase === "partial_completed") return "부분 완료";
  if (phase === "final_synthesis_running") return "최종 정리 중";
  if (phase === "chunk_analysis_running") return "청크 분석 중";
  if (phase === "extraction_completed") return "본문 추출 완료";
  if (phase === "failed" || status === "failed") return "실패";
  if (status === "queued") return "대기";
  if (status === "running") return "실행 중";
  return phase || status || "대기";
}

function templateLabel(templateId = "") {
  if (templateId === "rhwp-hwp-reader") return "HWP";
  if (templateId === "grant-rfp-strategy") return "RFP";
  if (templateId === "spreadsheet-stat-analyzer") return "XLSX";
  if (templateId === "pdf-document-reader") return "PDF";
  if (templateId === "pptx-slide-reader") return "PPTX";
  if (templateId === "filesystem-wiki-intake") return "Intake";
  return templateId || "Task";
}

function commandLabel(command = "") {
  if (!command) return "자동화";
  if (command.includes("refresh-global")) return "그래프 갱신";
  if (command.includes("slack-collect")) return "Slack 수집";
  if (command.includes("target-rclone-copy")) return "타겟 수집";
  if (command.includes("rclone-copy")) return command.includes("--dry-run") ? "수집 미리보기" : "문서 수집";
  if (command.includes("build-manifest")) return "매니페스트 생성";
  if (command.includes("full-cycle")) return "전체 수집";
  if (command.includes("run")) return "위키 반영";
  return command;
}

function automationStatusLabel(run: AutomationRun | null) {
  if (!run) return "대기";
  if (run.status === "completed") return "완료";
  if (run.status === "failed") return "실패";
  if (run.status === "running") return "실행 중";
  if (run.status === "queued") return "대기";
  return run.status || "대기";
}

function chatStatusLabel(activeChat: ActiveChatRun | null) {
  if (!activeChat) return "유휴";
  if (activeChat.phase === "streaming") return "응답 작성 중";
  if (activeChat.phase === "paperclip") return "도구 실행 대기";
  if (activeChat.phase === "retrieval") return "컨텍스트 조회 중";
  if (activeChat.phase === "validation") return "검증 중";
  if (activeChat.phase === "project_binding") return "프로젝트 바인딩 중";
  if (activeChat.status === "running") return "실행 중";
  return activeChat.phase || activeChat.status || "실행 중";
}

function automationDetail(run: AutomationRun | null) {
  if (!run) return "";
  return run.progress?.summary || run.progress?.currentFile || run.progress?.lastLogLine || "";
}

function isCollectionPreview(run: AutomationRun | null) {
  return Boolean(run?.command?.includes("rclone-copy") && run.command.includes("--dry-run"));
}

function isCollectionRun(run: AutomationRun | null) {
  return Boolean(run?.command && /rclone-copy|target-rclone-copy|slack-collect|full-cycle|build-manifest|refresh-global|run/.test(run.command));
}

function mergeOrchestrationTasks(orchestration?: Record<string, any>) {
  return (orchestration?.paperclip?.triggeredTasks || orchestration?.paperclip?.recentProjectTasks || [])
    .map((task: any) => ({
      taskId: String(task.taskId || ""),
      templateId: String(task.templateId || ""),
      status: String(task.status || ""),
      phase: String(task.phase || task.checkpoint?.phase || ""),
      createdAt: String(task.createdAt || task.updatedAt || ""),
      updatedAt: String(task.updatedAt || task.createdAt || ""),
      runId: String(task.runId || ""),
      chunkCount: Number(task.chunkCount || task.checkpoint?.chunkCount || 0),
      stale: isPaperclipActiveLike(String(task.phase || task.checkpoint?.phase || ""), String(task.status || ""))
        && isStaleTimestamp(String(task.updatedAt || task.createdAt || "")),
    }))
    .filter((task: StatusTask) => task.taskId);
}

export function CentralStatus({ projectId, projectName, orchestration, onOpenPaperclip, onOpenMission }: CentralStatusProps) {
  const { notify } = useToastCenter();
  const [snapshot, setSnapshot] = useState<CentralStatusSnapshot>({
    activeChat: null,
    recentTasks: [],
    latestTask: null,
    runningAutomation: null,
    recentAutomation: [],
    systemStatus: null,
    refreshedAt: 0,
  });
  const [isStopping, setIsStopping] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (!projectId) return;
      try {
        const [activeRuns, paperclip, automation, systemStatus] = await Promise.all([
          fetchActiveChatRuns(),
          fetchPaperclipSnapshot(),
          fetchAutomationSnapshot(),
          fetchSystemStatus(),
        ]);
        if (cancelled) return;
        const activeChat = activeRuns.find((item) => item.projectId === projectId) || null;
        const runByTaskId = new Map<string, PaperclipRun>();
        for (const run of paperclip.runs || []) {
          if (run.taskId) runByTaskId.set(run.taskId, run);
        }
        const recentTasks = (paperclip.tasks || [])
          .filter((task) => task.payload?.sourceProjectId === projectId && task.payload?.autoRun === true)
          .sort((left, right) => taskCreatedAt(right).localeCompare(taskCreatedAt(left)))
          .slice(0, 8)
          .map((task) => {
            const run = runByTaskId.get(task.id);
            return {
              taskId: task.id,
              templateId: String(task.templateId || ""),
              status: String(task.status || ""),
              phase: String(run?.phase || ""),
              createdAt: taskCreatedAt(task),
              updatedAt: String(run?.updatedAt || taskUpdatedAt(task)),
              runId: String(run?.runId || task.result?.runId || ""),
              chunkCount: Number(run?.chunkCount || 0),
              stale: isPaperclipActiveLike(String(run?.phase || ""), String(task.status || ""))
                && isStaleTimestamp(String(run?.updatedAt || taskUpdatedAt(task))),
            };
          });
        setSnapshot({
          activeChat,
          recentTasks,
          latestTask: recentTasks[0] || null,
          runningAutomation: (automation.running || [])[0] || null,
          recentAutomation: (automation.runs || []).slice(0, 8),
          systemStatus,
          refreshedAt: Date.now(),
        });
      } catch {
        if (cancelled) return;
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId]);

  useEffect(() => {
    if (!expanded) {
      setMenuOpen(false);
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setExpanded(false);
        setMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [expanded]);

  const displayTasks = useMemo(() => {
    const live = mergeOrchestrationTasks(orchestration);
    const seen = new Set<string>();
    const merged = [...live, ...snapshot.recentTasks].filter((task) => {
      if (!task.taskId || seen.has(task.taskId)) return false;
      seen.add(task.taskId);
      return true;
    });
    return merged
      .sort((left, right) => {
        const scoreDiff = taskSortScore(right) - taskSortScore(left);
        if (scoreDiff !== 0) return scoreDiff;
        return String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""));
      })
      .slice(0, 4);
  }, [orchestration, snapshot.recentTasks]);

  const latestTask = displayTasks[0] || snapshot.latestTask;
  const activePaperclipTask = displayTasks.find((task) => isPaperclipActiveLike(task.phase, task.status) && !task.stale) || null;
  const stalePaperclipTask = displayTasks.find((task) => task.stale) || null;
  const completedPaperclipTask = displayTasks.find((task) => isPaperclipTerminal(task.phase, task.status) && !task.stale) || null;
  const latestAutomation = snapshot.recentAutomation[0] || null;
  const latestCollectionRun = snapshot.recentAutomation.find((run) => isCollectionRun(run)) || null;
  const runningCount = displayTasks.filter((task) => isPaperclipActiveLike(task.phase, task.status) && !task.stale).length;
  const completedCount = displayTasks.filter((task) => task.phase === "completed" || task.status === "completed").length;
  const staleCount = displayTasks.filter((task) => task.stale).length;
  const activePaperclipProgress = activePaperclipTask ? paperclipProgressPercent(activePaperclipTask) : 0;
  const automationProgress = clampPercent(Number(snapshot.runningAutomation?.progress?.percent || 0));
  const collectionReady = Boolean(
    latestCollectionRun
    && latestCollectionRun.status === "completed"
    && !isCollectionPreview(latestCollectionRun)
    && /rclone-copy|target-rclone-copy/.test(String(latestCollectionRun.command || "")),
  );
  const primaryLabel = snapshot.runningAutomation
    ? `${commandLabel(snapshot.runningAutomation.command || "")} 실행 중`
    : activePaperclipTask
      ? `${templateLabel(activePaperclipTask.templateId)} · ${phaseLabel(activePaperclipTask.phase, activePaperclipTask.status)}`
      : snapshot.activeChat
        ? "채팅 응답 생성 중"
        : latestAutomation?.status === "failed"
          ? `${commandLabel(latestAutomation.command || "")} 실패`
          : collectionReady
            ? "수집 완료 · 후속 반영 대기"
            : completedPaperclipTask
              ? `${templateLabel(completedPaperclipTask.templateId)} · ${phaseLabel(completedPaperclipTask.phase, completedPaperclipTask.status)}`
              : stalePaperclipTask
                ? `${templateLabel(stalePaperclipTask.templateId)} · 점검 필요`
      : "백그라운드 작업 없음";
  const secondaryLabel = snapshot.runningAutomation
    ? automationDetail(snapshot.runningAutomation) || "수집 파이프라인이 실행 중입니다."
    : activePaperclipTask
      ? `${runningCount ? `paperclip ${runningCount}건 진행` : "paperclip 결과 대기"}`
      : latestAutomation?.status === "failed"
        ? (latestAutomation.progress?.lastLogLine || "최근 자동화가 실패했습니다.")
        : collectionReady
          ? "매니페스트/위키 반영을 이어서 실행할 수 있습니다."
          : completedPaperclipTask
            ? "최근 Paperclip 결과가 준비되어 있습니다."
            : stalePaperclipTask
              ? "오래된 Paperclip 실행 흔적이 남아 있습니다. 결과 화면에서 확인하거나 재실행하세요."
          : snapshot.systemStatus?.status?.manifest || "대기 중";
  const systemSummary = snapshot.systemStatus
    ? [snapshot.systemStatus.status?.lastRun, snapshot.systemStatus.status?.cleanup].filter(Boolean).join(" · ")
    : "";
  const taskSummary = [
    runningCount ? `${runningCount}건 진행` : "",
    completedCount ? `${completedCount}건 완료` : "",
    staleCount ? `${staleCount}건 점검 필요` : "",
  ].filter(Boolean).join(" · ");
  const progressModel = snapshot.runningAutomation
    ? {
        label: commandLabel(snapshot.runningAutomation.command || ""),
        percent: automationProgress,
        detail: [
          snapshot.runningAutomation.progress?.transferred,
          snapshot.runningAutomation.progress?.speed,
          snapshot.runningAutomation.progress?.eta ? `ETA ${snapshot.runningAutomation.progress.eta}` : "",
        ].filter(Boolean).join(" · "),
        tone: latestAutomation?.status === "failed" ? "failed" : "active",
      }
    : activePaperclipTask
      ? {
          label: `${templateLabel(activePaperclipTask.templateId)} ${phaseLabel(activePaperclipTask.phase, activePaperclipTask.status)}`,
          percent: activePaperclipProgress,
          detail: paperclipProgressDetail(activePaperclipTask),
          tone: "active",
        }
      : stalePaperclipTask
        ? {
            label: `${templateLabel(stalePaperclipTask.templateId)} 상태 점검`,
            percent: 0,
            detail: "최근 업데이트가 없어 실제 실행 중으로 보지 않습니다.",
            tone: "stale",
          }
        : completedPaperclipTask
          ? {
              label: `${templateLabel(completedPaperclipTask.templateId)} 결과 준비`,
              percent: 100,
              detail: paperclipProgressDetail(completedPaperclipTask),
              tone: "complete",
            }
          : null;
  const statusSections: StatusSection[] = [
    {
      key: "chat",
      title: "Chat",
      label: chatStatusLabel(snapshot.activeChat),
      detail: snapshot.activeChat
        ? "현재 프로젝트 응답 파이프라인이 열려 있습니다."
        : "대기 중",
      meta: snapshot.activeChat?.startedAt ? `started ${snapshot.activeChat.startedAt}` : undefined,
      percent: snapshot.activeChat ? null : 0,
      tone: snapshot.activeChat ? "active" : "idle",
    },
    {
      key: "paperclip",
      title: "Paperclip",
      label: activePaperclipTask
        ? `${templateLabel(activePaperclipTask.templateId)} ${phaseLabel(activePaperclipTask.phase, activePaperclipTask.status)}`
        : stalePaperclipTask
          ? `${templateLabel(stalePaperclipTask.templateId)} 점검 필요`
          : completedPaperclipTask
            ? `${templateLabel(completedPaperclipTask.templateId)} 결과 준비`
            : "대기 중",
      detail: activePaperclipTask
        ? paperclipProgressDetail(activePaperclipTask) || "분석이 진행 중입니다."
        : stalePaperclipTask
          ? "최근 업데이트가 없어 stale 상태로 분류했습니다."
          : completedPaperclipTask
            ? "최근 결과를 바로 열어볼 수 있습니다."
            : "실행된 문서 분석이 없습니다.",
      meta: taskSummary || undefined,
      percent: activePaperclipTask
        ? activePaperclipProgress
        : stalePaperclipTask
          ? 0
          : completedPaperclipTask
            ? 100
            : 0,
      tone: activePaperclipTask
        ? "active"
        : stalePaperclipTask
          ? "stale"
          : completedPaperclipTask
            ? "complete"
            : "idle",
    },
    {
      key: "automation",
      title: "Automation",
      label: snapshot.runningAutomation
        ? `${commandLabel(snapshot.runningAutomation.command || "")} ${automationStatusLabel(snapshot.runningAutomation)}`
        : collectionReady
          ? "후속 반영 대기"
          : latestAutomation?.status === "failed"
            ? `${commandLabel(latestAutomation.command || "")} 실패`
            : "대기 중",
      detail: snapshot.runningAutomation
        ? automationDetail(snapshot.runningAutomation) || "수집 파이프라인이 실행 중입니다."
        : collectionReady
          ? "build-manifest · run · refresh-global 순서로 이어갈 수 있습니다."
          : latestAutomation?.progress?.lastLogLine || "자동화 파이프라인이 유휴 상태입니다.",
      meta: systemSummary || undefined,
      percent: snapshot.runningAutomation
        ? automationProgress
        : collectionReady
          ? 100
          : latestAutomation?.status === "failed"
            ? 100
            : 0,
      tone: snapshot.runningAutomation
        ? "active"
        : collectionReady
          ? "complete"
          : latestAutomation?.status === "failed"
            ? "failed"
            : "idle",
    },
  ];

  const handleStop = async () => {
    if (!projectId || isStopping) return;
    setIsStopping(true);
    try {
      await stopChatProjectRun(projectId);
      setSnapshot((current) => ({ ...current, activeChat: null, refreshedAt: Date.now() }));
      notify("success", "채팅 실행 중지", projectName || projectId || "active project");
    } finally {
      setIsStopping(false);
    }
  };

  const runAction = async (
    label: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    if (isActing) return;
    setIsActing(true);
    notify("running", label, successMessage, { durationMs: 2200 });
    try {
      await action();
      notify("success", label, successMessage);
      const [activeRuns, paperclip, automation, systemStatus] = await Promise.all([
        fetchActiveChatRuns(),
        fetchPaperclipSnapshot(),
        fetchAutomationSnapshot(),
        fetchSystemStatus(),
      ]);
      const activeChat = activeRuns.find((item) => item.projectId === projectId) || null;
      const runByTaskId = new Map<string, PaperclipRun>();
      for (const run of paperclip.runs || []) {
        if (run.taskId) runByTaskId.set(run.taskId, run);
      }
      const recentTasks = (paperclip.tasks || [])
        .filter((task) => task.payload?.sourceProjectId === projectId && task.payload?.autoRun === true)
        .sort((left, right) => taskCreatedAt(right).localeCompare(taskCreatedAt(left)))
        .slice(0, 8)
        .map((task) => {
          const run = runByTaskId.get(task.id);
          return {
            taskId: task.id,
            templateId: String(task.templateId || ""),
            status: String(task.status || ""),
            phase: String(run?.phase || ""),
            createdAt: taskCreatedAt(task),
            updatedAt: String(run?.updatedAt || taskUpdatedAt(task)),
            runId: String(run?.runId || task.result?.runId || ""),
            chunkCount: Number(run?.chunkCount || 0),
            stale: isPaperclipActiveLike(String(run?.phase || ""), String(task.status || ""))
              && isStaleTimestamp(String(run?.updatedAt || taskUpdatedAt(task))),
          };
        });
      setSnapshot({
        activeChat,
        recentTasks,
        latestTask: recentTasks[0] || null,
        runningAutomation: (automation.running || [])[0] || null,
        recentAutomation: (automation.runs || []).slice(0, 8),
        systemStatus,
        refreshedAt: Date.now(),
      });
    } catch (error) {
      notify("error", label, String((error as Error)?.message || error));
    } finally {
      setIsActing(false);
    }
  };

  const actions = useMemo<StatusAction[]>(() => {
    const list: StatusAction[] = [];
    if (snapshot.runningAutomation) {
      list.push({
        key: "mission",
        label: "Mission",
        onClick: onOpenMission,
        disabled: isActing,
      });
      list.push({
        key: "stop-automation",
        label: isActing ? "정리 중" : "중지",
        onClick: () => runAction(
          "자동화 중지",
          () => stopAutomation(snapshot.runningAutomation?.runId || ""),
          commandLabel(snapshot.runningAutomation?.command || ""),
        ),
        disabled: isActing,
        variant: "danger",
      });
      return list;
    }
    if (activePaperclipTask) {
      list.push({
        key: "paperclip",
        label: "Paperclip",
        onClick: () => onOpenPaperclip(activePaperclipTask.taskId, activePaperclipTask.runId),
        disabled: isActing,
        variant: "primary",
      });
      if (snapshot.activeChat) {
        list.push({
          key: "stop-chat",
          label: isStopping ? "정리 중" : "채팅 중지",
          onClick: handleStop,
          disabled: isStopping || isActing,
        });
      }
      list.push({
        key: "mission",
        label: "Mission",
        onClick: onOpenMission,
        disabled: isActing,
      });
      return list;
    }
    if (stalePaperclipTask) {
      list.push({
        key: "paperclip-stale",
        label: "Paperclip 확인",
        onClick: () => onOpenPaperclip(stalePaperclipTask.taskId, stalePaperclipTask.runId),
        disabled: isActing,
        variant: "primary",
      });
      list.push({
        key: "mission",
        label: "Mission",
        onClick: onOpenMission,
        disabled: isActing,
      });
      return list;
    }
    if (collectionReady) {
      list.push({
        key: "continue",
        label: "계속 실행",
        onClick: () => runAction("후속 반영 실행", () => continueAfterCollection(), "build-manifest · run · refresh-global"),
        disabled: isActing,
        variant: "primary",
      });
      list.push({
        key: "mission",
        label: "Mission",
        onClick: onOpenMission,
        disabled: isActing,
      });
      list.push({
        key: "refresh",
        label: "그래프 갱신",
        onClick: () => runAction("그래프 갱신", () => triggerAutomation("refresh-global", false), "refresh-global"),
        disabled: isActing,
      });
      return list;
    }
    list.push({
      key: "preview",
      label: "수집 미리보기",
      onClick: () => runAction("수집 미리보기", () => triggerAutomation("rclone-copy", true), "rclone-copy --dry-run"),
      disabled: isActing,
      variant: "primary",
    });
    list.push({
      key: "refresh",
      label: "그래프 갱신",
      onClick: () => runAction("그래프 갱신", () => triggerAutomation("refresh-global", false), "refresh-global"),
      disabled: isActing,
    });
    list.push({
      key: "mission",
      label: "Mission",
      onClick: onOpenMission,
      disabled: isActing,
    });
    return list;
  }, [
    collectionReady,
    handleStop,
    isActing,
    isStopping,
    activePaperclipTask,
    onOpenMission,
    onOpenPaperclip,
    snapshot.activeChat,
    snapshot.runningAutomation,
    stalePaperclipTask,
  ]);
  const primaryAction = actions[0] || null;
  const secondaryActions = actions.slice(1);
  const fabTone = snapshot.runningAutomation
    ? "active"
    : activePaperclipTask
      ? "active"
      : stalePaperclipTask
        ? "stale"
        : completedPaperclipTask
          ? "complete"
          : "idle";
  const fabLabel = snapshot.runningAutomation
    ? commandLabel(snapshot.runningAutomation.command || "")
    : activePaperclipTask
      ? templateLabel(activePaperclipTask.templateId)
      : stalePaperclipTask
        ? "점검"
        : completedPaperclipTask
          ? templateLabel(completedPaperclipTask.templateId)
          : "상태";

  return (
    <aside
      aria-label="central status"
      className={`aui-central-status ${expanded ? "expanded" : "collapsed"} ${fabTone}`}
      ref={rootRef}
    >
      <button
        aria-expanded={expanded}
        className={`aui-central-status-fab ${fabTone}`}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className="aui-central-status-fab-dot" />
        <span>{fabLabel}</span>
      </button>
      {expanded ? (
        <div className="aui-central-status-panel">
          <div className="aui-central-status-main">
            <div className="aui-central-status-head">
              <span>Central Status</span>
              <small>{projectName || projectId || "project"}</small>
            </div>
            <div className="aui-central-status-copy">
              <strong>{primaryLabel}</strong>
              <div className="aui-central-status-meta">
                <span>{secondaryLabel}</span>
                {systemSummary ? <span>{systemSummary}</span> : null}
              </div>
              {progressModel ? (
                <div className={`aui-central-status-progress ${progressModel.tone}`}>
                  <div className="aui-central-status-progress-copy">
                    <span>{progressModel.label}</span>
                    <span>{progressModel.percent}%</span>
                  </div>
                  <div className="aui-central-status-progress-track" aria-hidden="true">
                    <span
                      className="aui-central-status-progress-fill"
                      style={{ width: `${progressModel.percent}%` }}
                    />
                  </div>
                  {progressModel.detail ? (
                    <div className="aui-central-status-progress-meta">{progressModel.detail}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="aui-central-status-sections">
              {statusSections.map((section) => (
                <section className={`aui-central-status-section ${section.tone || "idle"}`} key={section.key}>
                  <div className="aui-central-status-section-head">
                    <span>{section.title}</span>
                    {section.percent != null ? <strong>{section.percent}%</strong> : <strong>live</strong>}
                  </div>
                  <div className="aui-central-status-section-copy">
                    <b>{section.label}</b>
                    <p>{section.detail}</p>
                    {section.meta ? <small>{section.meta}</small> : null}
                  </div>
                  {section.percent != null ? (
                    <div className={`aui-central-status-progress ${section.tone || "idle"}`}>
                      <div className="aui-central-status-progress-track" aria-hidden="true">
                        <span
                          className="aui-central-status-progress-fill"
                          style={{ width: `${section.percent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
          <div className="aui-central-status-footer">
            {displayTasks.length ? (
              <div className="aui-central-status-task-board">
                <div className="aui-central-status-task-board-head">
                  <span>Recent Tasks</span>
                  <small>{displayTasks.length}건</small>
                </div>
                {displayTasks.map((task) => (
                  <div className={`aui-central-status-task ${task.stale ? "stale" : ""}`} key={task.taskId}>
                    <div className="aui-central-status-task-copy">
                      <strong>{templateLabel(task.templateId)}</strong>
                      <span>{phaseLabel(task.phase, task.status)}</span>
                    </div>
                    <div className="aui-central-status-progress-copy">
                      <span>{paperclipProgressDetail(task) || "status tracked"}</span>
                      <span>{paperclipProgressPercent(task)}%</span>
                    </div>
                    <div className={`aui-central-status-progress ${task.stale ? "stale" : task.phase === "completed" || task.status === "completed" ? "complete" : task.phase === "failed" || task.status === "failed" ? "failed" : "active"}`}>
                      <div className="aui-central-status-progress-track" aria-hidden="true">
                        <span
                          className="aui-central-status-progress-fill"
                          style={{ width: `${paperclipProgressPercent(task)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="aui-central-status-actions">
              {primaryAction ? (
                <button
                  className={primaryAction.variant === "primary" ? "primary" : primaryAction.variant === "danger" ? "danger" : ""}
                  disabled={primaryAction.disabled}
                  onClick={() => { void primaryAction.onClick(); }}
                  type="button"
                >
                  {primaryAction.label}
                </button>
              ) : null}
              {secondaryActions.length ? (
                <div className="aui-central-status-menu">
                  <button
                    aria-expanded={menuOpen}
                    className="aui-central-status-menu-trigger"
                    onClick={() => setMenuOpen((current) => !current)}
                    type="button"
                  >
                    ⋯
                  </button>
                  {menuOpen ? (
                    <div className="aui-central-status-menu-popover">
                      {secondaryActions.map((action) => (
                        <button
                          className={action.variant === "danger" ? "danger" : ""}
                          disabled={action.disabled}
                          key={action.key}
                          onClick={() => {
                            setMenuOpen(false);
                            void action.onClick();
                          }}
                          type="button"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
