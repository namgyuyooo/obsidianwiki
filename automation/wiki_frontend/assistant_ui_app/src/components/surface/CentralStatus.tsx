import { useEffect, useMemo, useState } from "react";
import { fetchActiveChatRuns, stopChatProjectRun, type ActiveChatRun } from "../../domains/chat/api/chatWorkspaceApi";
import { fetchPaperclipSnapshot, type PaperclipRun, type PaperclipTask } from "../../domains/paperclip/api/paperclipApi";

type CentralStatusProps = {
  projectId: string;
  projectName?: string;
  orchestration?: Record<string, any>;
  onOpenPaperclip: (taskId?: string, runId?: string) => void;
};

type StatusTask = {
  taskId: string;
  templateId: string;
  status: string;
  phase: string;
  createdAt: string;
  runId: string;
};

type CentralStatusSnapshot = {
  activeChat: ActiveChatRun | null;
  recentTasks: StatusTask[];
  latestTask: StatusTask | null;
  refreshedAt: number;
};

function taskCreatedAt(task: PaperclipTask) {
  return String(task.createdAt || task.updatedAt || task.finishedAt || "");
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

function mergeOrchestrationTasks(orchestration?: Record<string, any>) {
  return (orchestration?.paperclip?.triggeredTasks || orchestration?.paperclip?.recentProjectTasks || [])
    .map((task: any) => ({
      taskId: String(task.taskId || ""),
      templateId: String(task.templateId || ""),
      status: String(task.status || ""),
      phase: String(task.phase || task.checkpoint?.phase || ""),
      createdAt: String(task.createdAt || task.updatedAt || ""),
      runId: String(task.runId || ""),
    }))
    .filter((task: StatusTask) => task.taskId);
}

export function CentralStatus({ projectId, projectName, orchestration, onOpenPaperclip }: CentralStatusProps) {
  const [snapshot, setSnapshot] = useState<CentralStatusSnapshot>({
    activeChat: null,
    recentTasks: [],
    latestTask: null,
    refreshedAt: 0,
  });
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (!projectId) return;
      try {
        const [activeRuns, paperclip] = await Promise.all([
          fetchActiveChatRuns(),
          fetchPaperclipSnapshot(),
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
              runId: String(run?.runId || task.result?.runId || ""),
            };
          });
        setSnapshot({
          activeChat,
          recentTasks,
          latestTask: recentTasks[0] || null,
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

  const displayTasks = useMemo(() => {
    const live = mergeOrchestrationTasks(orchestration);
    const seen = new Set<string>();
    const merged = [...live, ...snapshot.recentTasks].filter((task) => {
      if (!task.taskId || seen.has(task.taskId)) return false;
      seen.add(task.taskId);
      return true;
    });
    return merged.slice(0, 3);
  }, [orchestration, snapshot.recentTasks]);

  const latestTask = displayTasks[0] || snapshot.latestTask;
  const runningCount = displayTasks.filter((task) => ["queued", "running"].includes(task.status) || /running/.test(task.phase)).length;
  const primaryLabel = snapshot.activeChat
    ? "채팅 응답 생성 중"
    : latestTask
      ? `${templateLabel(latestTask.templateId)} · ${phaseLabel(latestTask.phase, latestTask.status)}`
      : "백그라운드 작업 없음";

  const handleStop = async () => {
    if (!projectId || isStopping) return;
    setIsStopping(true);
    try {
      await stopChatProjectRun(projectId);
      setSnapshot((current) => ({ ...current, activeChat: null, refreshedAt: Date.now() }));
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <aside className="aui-central-status" aria-label="central status">
      <div className="aui-central-status-head">
        <span>Central Status</span>
        <small>{projectName || projectId || "project"}</small>
      </div>
      <strong>{primaryLabel}</strong>
      <div className="aui-central-status-meta">
        <span>{snapshot.activeChat ? `chat ${snapshot.activeChat.phase || snapshot.activeChat.status || "running"}` : "chat idle"}</span>
        <span>{runningCount ? `paperclip ${runningCount}건 진행` : "paperclip idle"}</span>
      </div>
      {displayTasks.length ? (
        <div className="aui-central-status-list">
          {displayTasks.map((task) => (
            <div className="aui-central-status-item" key={task.taskId}>
              <strong>{templateLabel(task.templateId)}</strong>
              <span>{phaseLabel(task.phase, task.status)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="aui-central-status-actions">
        <button onClick={() => onOpenPaperclip(latestTask?.taskId, latestTask?.runId)} type="button">Paperclip</button>
        <button disabled={!snapshot.activeChat || isStopping} onClick={handleStop} type="button">
          {isStopping ? "정리 중" : "중지"}
        </button>
      </div>
    </aside>
  );
}
