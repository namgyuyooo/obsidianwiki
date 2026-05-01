import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import { promoteKnowledge } from "../../knowledge/api/knowledgeApi";
import {
  fetchPaperclipRunArtifact,
  type PaperclipRun,
  type PaperclipTask,
  type PaperclipTemplate,
} from "../api/paperclipApi";
import { usePaperclipStudio } from "../hooks/usePaperclipStudio";

type PaperclipStudioProps = {
  chatContext: ChatContext;
};

type ResultActionState = {
  phase: "idle" | "promoting" | "success" | "error";
  message: string;
};

type RunArtifactState = {
  phase: "idle" | "loading" | "ready" | "error";
  message: string;
  artifactName: string;
  content: string;
  rawContent: string;
};

type IntentId = "read" | "validate" | "review" | "promote";
type ResultReviewTone = "review" | "go" | "danger";

type PaperclipResultItem =
  | {
    kind: "run";
    id: string;
    run: PaperclipRun;
    task: PaperclipTask | null;
  }
  | {
    kind: "task";
    id: string;
    task: PaperclipTask;
  };

type ResultReviewState = {
  label: string;
  detail: string;
  tone: ResultReviewTone;
};

type NextAction = {
  title: string;
  detail: string;
  cta: string;
  target: "bridge" | "queue" | "result" | "composer";
  resultId?: string;
};

const RESULT_PREVIEW_LIMIT = 5200;

const INTENT_DEFINITIONS: Array<{
  id: IntentId;
  label: string;
  shortLabel: string;
  description: string;
  help: string;
}> = [
  {
    id: "read",
    label: "문서 읽기 요청",
    shortLabel: "읽기",
    description: "근거 문서, 로그, 산출물을 읽어 핵심 사실을 확보합니다.",
    help: "새 근거를 가져오거나 긴 문서를 먼저 읽히고 싶을 때 사용합니다.",
  },
  {
    id: "validate",
    label: "검수 · 검증 요청",
    shortLabel: "검증",
    description: "충돌, 누락, 구조 문제, 안전 조건을 점검합니다.",
    help: "실행 전후 검증이나 validator 성격의 작업을 우선 묶습니다.",
  },
  {
    id: "review",
    label: "기존 결과 재검토",
    shortLabel: "재검토",
    description: "이미 나온 결과를 다시 열어 판단하거나 재실행을 준비합니다.",
    help: "같은 흐름을 다시 열어 판단해야 할 때 쓰기 좋습니다.",
  },
  {
    id: "promote",
    label: "승격 후보 만들기",
    shortLabel: "승격",
    description: "읽은 결과를 위키 승격 후보나 초안으로 넘기는 흐름입니다.",
    help: "ingest, draft, memory, register 성격의 작업을 우선 묶습니다.",
  },
];

function shortDate(value = "") {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

function normalizeText(value = "") {
  return value.trim().toLowerCase();
}

function taskUpdatedAt(task?: PaperclipTask | null) {
  return task?.finishedAt || task?.updatedAt || task?.createdAt || "";
}

function runUpdatedAt(run?: PaperclipRun | null) {
  return run?.updatedAt || "";
}

function resultString(task: PaperclipTask, key: string) {
  const value = task.result?.[key];
  return typeof value === "string" ? value : "";
}

function safeDownloadName(value = "", fallback = "paperclip-result") {
  return value.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;
}

function taskResultPath(task: PaperclipTask) {
  const result = task.result || {};
  const path = typeof result.path === "string" ? result.path : "";
  if (path) return path;
  const decisionQueueItemId = typeof result.decisionQueueItemId === "string" ? result.decisionQueueItemId : "";
  return decisionQueueItemId ? `Decision Queue: ${decisionQueueItemId}` : "";
}

function taskResultText(task: PaperclipTask) {
  const markdown = resultString(task, "markdown");
  if (markdown) return markdown;
  const summary = resultString(task, "summary");
  if (summary) return summary;
  const error = resultString(task, "error");
  if (error) return error;
  const result = task.result || {};
  return Object.keys(result).length ? JSON.stringify(result, null, 2) : "";
}

function taskResultFileName(task: PaperclipTask) {
  return `${safeDownloadName(task.title || task.id || "paperclip-result")}${resultString(task, "markdown") ? ".md" : ".json"}`;
}

function taskProjectHint(task?: PaperclipTask | null) {
  const payload = task?.payload || {};
  const candidate = payload.projectHint || payload.projectKey || payload.project || task?.result?.projectHint;
  return typeof candidate === "string" ? candidate : "";
}

function downloadTextFile(fileName: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadTaskResult(task: PaperclipTask) {
  downloadTextFile(
    taskResultFileName(task),
    taskResultText(task),
    resultString(task, "markdown") ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8",
  );
}

function artifactPreviewText(content = "", artifactName = "") {
  if (artifactName.endsWith(".json")) {
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  }
  return content;
}

function artifactMimeType(artifactName = "") {
  if (artifactName.endsWith(".json")) return "application/json;charset=utf-8";
  if (artifactName.endsWith(".md")) return "text/markdown;charset=utf-8";
  return "text/plain;charset=utf-8";
}

function artifactPromotable(artifactName = "") {
  return artifactName.endsWith(".md") || artifactName.endsWith(".txt");
}

function downloadRunArtifact(run: PaperclipRun, artifactName: string, content: string) {
  downloadTextFile(
    `${safeDownloadName(run.title || run.runId || "paperclip-run")}_${artifactName}`,
    content,
    artifactMimeType(artifactName),
  );
}

function taskSafetyLabel(task: PaperclipTask) {
  const mode = task.safety?.mode || "";
  if (mode) return mode;
  return task.dryRun ? "테스트 기본" : "실행 기본";
}

function templateDefaultMode(dryRun?: boolean) {
  return dryRun ? "테스트 기본" : "실행 기본";
}

function humanTaskStatus(status = "") {
  const value = normalizeText(status);
  if (!value) return "대기";
  if (value.includes("queue")) return "대기";
  if (value.includes("run")) return "실행중";
  if (value.includes("process")) return "실행중";
  if (value.includes("complete")) return "완료";
  if (value.includes("success")) return "완료";
  if (value.includes("fail")) return "실패";
  if (value.includes("error")) return "실패";
  if (value.includes("hold")) return "보류";
  return status;
}

function humanRunPhase(phase = "") {
  const value = normalizeText(phase);
  if (!value) return "run";
  if (value.includes("complete")) return "완료";
  if (value.includes("success")) return "완료";
  if (value.includes("fail")) return "실패";
  if (value.includes("error")) return "실패";
  if (value.includes("queue")) return "대기";
  if (value.includes("plan")) return "계획";
  if (value.includes("run")) return "실행중";
  return phase;
}

function classifyTemplate(template: PaperclipTemplate): IntentId {
  const haystack = normalizeText(
    `${template.id} ${template.title} ${template.description} ${template.command} ${template.agent} ${template.output || ""}`,
  );
  if (/(validate|validator|lint|check|conflict|guard|review|audit|verify)/.test(haystack)) return "validate";
  if (/(promote|ingest|register|memory|draft|change[_ -]?log|status update)/.test(haystack)) return "promote";
  if (/(rerun|retry|artifact|result|approve|digest review)/.test(haystack)) return "review";
  return "read";
}

function queueActionHint(task: PaperclipTask) {
  const status = normalizeText(task.status || "");
  if (status.includes("fail") || status.includes("error")) return "실패 원인 확인 후 재실행 여부 판단";
  if (status.includes("run") || status.includes("process")) return "결과가 나오면 바로 검토 큐로 넘길 준비";
  return "중복 요청 여부를 확인한 뒤 실행";
}

function duplicateRisk(task: PaperclipTask, tasks: PaperclipTask[]) {
  const currentProject = taskProjectHint(task);
  return tasks.filter((candidate) => {
    if (candidate.id === task.id) return false;
    if (["completed", "failed"].includes(normalizeText(candidate.status || ""))) return false;
    if (candidate.templateId !== task.templateId) return false;
    if (!currentProject) return true;
    return taskProjectHint(candidate) === currentProject;
  }).length;
}

function resultReviewState(item: PaperclipResultItem): ResultReviewState {
  const task = item.kind === "task" ? item.task : item.task;
  const run = item.kind === "run" ? item.run : null;
  const taskError = task ? resultString(task, "error") : "";
  const failed = normalizeText(task?.status || "").includes("fail")
    || normalizeText(run?.phase || "").includes("fail")
    || normalizeText(taskError).includes("error");
  if (failed) {
    return {
      label: "실패 원인 확인",
      detail: "로그와 산출물을 보고 재실행 필요 여부를 판단합니다.",
      tone: "danger",
    };
  }
  const promotable = run
    ? run.artifacts.some((artifact) => artifactPromotable(artifact.name))
    : !!(task && resultString(task, "markdown"));
  if (promotable) {
    return {
      label: "승격 검토",
      detail: "검토 후 위키 승격 후보로 넘기기 좋은 상태입니다.",
      tone: "go",
    };
  }
  return {
    label: "검토 필요",
    detail: "결과를 열어 사실성과 다음 액션을 먼저 판단합니다.",
    tone: "review",
  };
}

function scrollToRef(target: { current: HTMLElement | null }) {
  target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function PaperclipStudio({ chatContext }: PaperclipStudioProps) {
  const { notify } = useToastCenter();
  const studio = usePaperclipStudio();
  const [activeResultId, setActiveResultId] = useState("");
  const [resultAction, setResultAction] = useState<ResultActionState>({
    phase: "idle",
    message: "완료 결과를 검토한 뒤 다운로드하거나 지식 승격 후보로 넘길 수 있습니다.",
  });
  const [runArtifact, setRunArtifact] = useState<RunArtifactState>({
    phase: "idle",
    message: "Run 산출물을 선택하면 여기서 바로 검토할 수 있습니다.",
    artifactName: "",
    content: "",
    rawContent: "",
  });
  const composerRef = useRef<HTMLElement | null>(null);
  const queueRef = useRef<HTMLElement | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const { snapshot, activeTemplate } = studio;

  useEffect(() => {
    if (!studio.projectHint && chatContext.projectId) studio.setProjectHint(chatContext.projectId);
  }, [chatContext.projectId, studio.projectHint, studio.setProjectHint]);

  const queuedTasks = useMemo(
    () => snapshot.tasks
      .filter((task) => !["completed", "failed"].includes(normalizeText(task.status || "")))
      .sort((left, right) => taskUpdatedAt(right).localeCompare(taskUpdatedAt(left))),
    [snapshot.tasks],
  );

  const finishedTasks = useMemo(
    () => snapshot.tasks
      .filter((task) => ["completed", "failed"].includes(normalizeText(task.status || "")))
      .sort((left, right) => taskUpdatedAt(right).localeCompare(taskUpdatedAt(left))),
    [snapshot.tasks],
  );

  const featuredTasks = queuedTasks.slice(0, 6);
  const recentEvents = snapshot.events
    .slice()
    .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""))
    .slice(0, 8);

  const resultItems = useMemo<PaperclipResultItem[]>(() => {
    const runTaskIds = new Set(snapshot.runs.map((run) => run.taskId).filter(Boolean));
    const runItems = snapshot.runs.map((run) => ({
      kind: "run" as const,
      id: `run:${run.runId}`,
      run,
      task: finishedTasks.find((task) => task.id === run.taskId) || null,
    }));
    const taskItems = finishedTasks
      .filter((task) => !runTaskIds.has(task.id))
      .map((task) => ({
        kind: "task" as const,
        id: `task:${task.id}`,
        task,
      }));
    return [...runItems, ...taskItems].sort((left, right) => {
      const leftTime = left.kind === "run" ? runUpdatedAt(left.run) : taskUpdatedAt(left.task);
      const rightTime = right.kind === "run" ? runUpdatedAt(right.run) : taskUpdatedAt(right.task);
      return rightTime.localeCompare(leftTime);
    });
  }, [finishedTasks, snapshot.runs]);

  const activeResultItem = resultItems.find((item) => item.id === activeResultId) || resultItems[0] || null;
  const activeRun = activeResultItem?.kind === "run" ? activeResultItem.run : null;
  const activeResultTask = activeResultItem?.kind === "task" ? activeResultItem.task : activeResultItem?.task || null;
  const activeArtifactName = activeRun && activeRun.artifacts.some((artifact) => artifact.name === runArtifact.artifactName)
    ? runArtifact.artifactName
    : (activeRun?.preferredArtifactName || activeRun?.artifacts[0]?.name || "");

  const intentGroups = useMemo(() => INTENT_DEFINITIONS.map((definition) => ({
    ...definition,
    templates: snapshot.templates.filter((template) => classifyTemplate(template) === definition.id),
  })), [snapshot.templates]);

  const activeIntentId = activeTemplate ? classifyTemplate(activeTemplate) : (intentGroups.find((group) => group.templates.length)?.id || "read");
  const activeIntent = intentGroups.find((group) => group.id === activeIntentId) || intentGroups[0];

  const resultReviewStates = useMemo(() => {
    const next = new Map<string, ResultReviewState>();
    resultItems.forEach((item) => next.set(item.id, resultReviewState(item)));
    return next;
  }, [resultItems]);

  const suggestedFlow = useMemo(() => ([
    {
      step: "1. 필요한 문제 선택",
      detail: activeIntent?.help || "먼저 어떤 종류의 작업이 필요한지 고릅니다.",
    },
    {
      step: "2. 안전하게 요청 만들기",
      detail: "프로젝트 힌트와 안전 모드를 확인한 뒤 대기열에 넣거나 실행 요청합니다.",
    },
    {
      step: "3. 결과 판정",
      detail: "완료 결과를 검토해 위키 승격, 보류, 재실행 판단으로 닫습니다.",
    },
  ]), [activeIntent]);

  const nextAction = useMemo<NextAction>(() => {
    if (!snapshot.available) {
      return {
        title: "Bridge 복구가 먼저 필요합니다.",
        detail: "현재는 Paperclip 연결이 막혀 있어 실행보다 상태 복구가 우선입니다.",
        cta: "상태 새로고침",
        target: "bridge",
      };
    }
    const failedResult = resultItems.find((item) => resultReviewStates.get(item.id)?.tone === "danger");
    if (failedResult) {
      return {
        title: "실패 결과부터 확인하세요.",
        detail: "새 요청보다 최근 실패 원인을 먼저 확인해야 중복 실행을 줄일 수 있습니다.",
        cta: "실패 결과 열기",
        target: "result",
        resultId: failedResult.id,
      };
    }
    const promotableResult = resultItems.find((item) => resultReviewStates.get(item.id)?.tone === "go");
    if (promotableResult) {
      return {
        title: "승격 가능한 결과가 있습니다.",
        detail: "이미 나온 결과를 검토해 위키 승격 후보로 넘길지 먼저 판단하세요.",
        cta: "결과 검토",
        target: "result",
        resultId: promotableResult.id,
      };
    }
    if (queuedTasks.length >= 3) {
      return {
        title: "대기열 정리가 우선입니다.",
        detail: "진행 중 작업이 많아 새 요청보다 기존 queue의 중복과 우선순위를 먼저 보세요.",
        cta: "대기열 보기",
        target: "queue",
      };
    }
    return {
      title: "새 읽기 요청을 만들기 좋은 상태입니다.",
      detail: activeTemplate
        ? `${activeTemplate.title} 기준으로 필요한 문서 읽기나 검수 요청을 만들 수 있습니다.`
        : "작업 의도를 고른 뒤 요청을 작성하세요.",
      cta: "요청 작성으로 이동",
      target: "composer",
    };
  }, [activeTemplate, queuedTasks.length, resultItems, resultReviewStates, snapshot.available]);

  useEffect(() => {
    if (resultItems.some((item) => item.id === activeResultId)) return;
    setActiveResultId(resultItems[0]?.id || "");
  }, [activeResultId, resultItems]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const runId = params.get("paperclipRunId") || "";
    const taskId = params.get("paperclipTaskId") || "";
    if (!runId && !taskId) return;
    const nextItem = resultItems.find((item) => (
      (runId && item.kind === "run" && item.run.runId === runId)
      || (taskId && ((item.kind === "run" && item.run.taskId === taskId) || (item.kind === "task" && item.task.id === taskId)))
    ));
    if (nextItem && nextItem.id !== activeResultId) setActiveResultId(nextItem.id);
  }, [activeResultId, resultItems]);

  useEffect(() => {
    if (!activeRun || !activeArtifactName) {
      setRunArtifact((current) => ({
        ...current,
        phase: "idle",
        message: activeRun ? "표시할 run 아티팩트가 없습니다." : "Run 산출물을 선택하면 여기서 바로 검토할 수 있습니다.",
        content: "",
        rawContent: "",
      }));
      return undefined;
    }
    let cancelled = false;
    setRunArtifact((current) => ({
      ...current,
      phase: "loading",
      message: `${activeArtifactName} 불러오는 중입니다.`,
      artifactName: activeArtifactName,
      content: "",
      rawContent: "",
    }));
    fetchPaperclipRunArtifact(activeRun.runId, activeArtifactName)
      .then((payload) => {
        if (cancelled) return;
        setRunArtifact({
          phase: "ready",
          message: `${activeArtifactName} 표시 중`,
          artifactName: activeArtifactName,
          content: artifactPreviewText(payload.content, activeArtifactName),
          rawContent: payload.content,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setRunArtifact({
          phase: "error",
          message: error instanceof Error ? error.message : "Run 아티팩트 조회 실패",
          artifactName: activeArtifactName,
          content: "",
          rawContent: "",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [activeArtifactName, activeRun]);

  const openNextAction = () => {
    if (nextAction.target === "bridge") {
      void studio.reload();
      return;
    }
    if (nextAction.target === "queue") {
      scrollToRef(queueRef);
      return;
    }
    if (nextAction.target === "result") {
      if (nextAction.resultId) setActiveResultId(nextAction.resultId);
      scrollToRef(resultRef);
      return;
    }
    scrollToRef(composerRef);
  };

  const promoteTaskResult = async (task: PaperclipTask, content: string) => {
    if (!content.trim()) {
      setResultAction({ phase: "error", message: "승격할 Paperclip 결과 본문이 없습니다." });
      notify("error", "Paperclip 결과 승격 실패", "승격할 Paperclip 결과 본문이 없습니다.");
      return;
    }

    setResultAction({ phase: "promoting", message: "Paperclip 결과를 지식 승격 후보로 변환하는 중입니다." });
    notify("running", "Paperclip 결과 승격 시작", task.title || task.id, { durationMs: 2200 });
    try {
      const result = await promoteKnowledge({
        content,
        projectHint: taskProjectHint(task),
        source: "assistant_ui_paperclip_result",
        sourceProjectId: chatContext.projectId,
        tool: task.command || task.templateId,
      });
      const path = result.path || result.promotion?.path || "path 없음";
      setResultAction({ phase: "success", message: `지식 승격 후보 생성 완료: ${path}` });
      notify("success", "Paperclip 결과 승격 완료", path);
    } catch (error) {
      setResultAction({
        phase: "error",
        message: error instanceof Error ? error.message : "Paperclip 결과 승격 실패",
      });
      notify("error", "Paperclip 결과 승격 실패", error instanceof Error ? error.message : "Paperclip 결과 승격 실패");
    }
  };

  const selectIntentGroup = (intentId: IntentId) => {
    const group = intentGroups.find((candidate) => candidate.id === intentId);
    const template = group?.templates[0];
    if (template) studio.setActiveTemplateId(template.id);
  };

  return (
    <main className="aui-paperclip-studio aui-work-surface">
      <section className="aui-paperclip-hero aui-work-titlebar">
        <div>
          <span className="aui-kicker">Paperclip</span>
          <h1>의도 중심 작업대</h1>
          <p>{chatContext.workspace.toUpperCase()} 문서 읽기, 검수, 결과 채택을 한 화면 안에서 판단하는 control plane입니다. 템플릿을 돌리는 곳이 아니라 지금 어떤 작업이 필요한지 결정하는 곳에 가깝습니다.</p>
          <div className="aui-work-metrics">
            <span>{snapshot.templates.length} 작업 종류</span>
            <span>{queuedTasks.length} 진행중/대기</span>
            <span>{finishedTasks.length} 완료 결과</span>
            <span>{snapshot.events.length} 감사 로그</span>
          </div>
        </div>
        <aside className={`aui-paperclip-bridge ${snapshot.available ? "ready" : "offline"}`}>
          <span>{snapshot.available ? "READY" : "OFFLINE"}</span>
          <strong>{snapshot.status}</strong>
          <small>{snapshot.url || "PAPERCLIP_URL 미설정"}</small>
          <button onClick={studio.reload} type="button">새로고침</button>
        </aside>
      </section>

      <section className="aui-ops-summary-grid">
        <article className="aui-ops-summary-card">
          <span>연결 상태</span>
          <strong>{snapshot.available ? "실행 가능" : "복구 필요"}</strong>
          <small>{snapshot.available ? "Paperclip bridge 연결 가능" : "먼저 bridge 오류를 해결해야 합니다."}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>현재 선택</span>
          <strong>{activeIntent?.label || "미선택"}</strong>
          <small>{activeTemplate?.title || "작업 의도를 먼저 선택하세요."}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>대기열 상태</span>
          <strong>{queuedTasks.length}</strong>
          <small>{featuredTasks[0]?.title || "대기 작업 없음"}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>검토할 결과</span>
          <strong>{resultItems.length}</strong>
          <small>{activeResultTask?.title || activeRun?.title || "아직 완료 결과 없음"}</small>
        </article>
      </section>

      <section className={`aui-paperclip-next-action ${nextAction.target}`}>
        <div className="aui-paperclip-next-action-copy">
          <span>추천 다음 행동</span>
          <strong>{nextAction.title}</strong>
          <p>{nextAction.detail}</p>
        </div>
        <button onClick={openNextAction} type="button">{nextAction.cta}</button>
      </section>

      <section className="aui-paperclip-shell">
        <section className="aui-paperclip-main">
          <article className="aui-paperclip-template-rail">
            <div className="aui-paperclip-section-head">
              <span>작업 의도</span>
              <strong>{intentGroups.filter((group) => group.templates.length).length}개 그룹</strong>
            </div>
            <div className="aui-paperclip-intent-list">
              {intentGroups.map((group) => (
                <button
                  className={group.id === activeIntentId ? "active" : ""}
                  disabled={!group.templates.length}
                  key={group.id}
                  onClick={() => selectIntentGroup(group.id)}
                  type="button"
                >
                  <div>
                    <strong>{group.label}</strong>
                    <span>{group.templates.length}개 템플릿</span>
                  </div>
                  <p>{group.description}</p>
                  <small>{group.help}</small>
                </button>
              ))}
            </div>

            <div className="aui-paperclip-template-shelf">
              <div className="aui-paperclip-section-head">
                <span>선택 가능한 작업</span>
                <strong>{activeIntent?.templates.length || 0}개</strong>
              </div>
              <div className="aui-paperclip-template-list">
                {(activeIntent?.templates || []).map((template) => (
                  <button
                    className={template.id === studio.activeTemplateId ? "active" : ""}
                    key={template.id}
                    onClick={() => studio.setActiveTemplateId(template.id)}
                    type="button"
                  >
                    <strong>{template.title}</strong>
                    <span>{template.description}</span>
                    <small>{template.safety || template.command}</small>
                  </button>
                ))}
                {!activeIntent?.templates.length ? <p className="aui-ops-muted">이 의도 그룹에 연결된 템플릿이 없습니다.</p> : null}
              </div>
            </div>
          </article>

          <article className="aui-paperclip-composer aui-paperclip-focus-card" ref={composerRef}>
            <div className="aui-paperclip-section-head">
              <span>지금 필요한 작업 만들기</span>
              <strong>{activeTemplate?.title || "작업 의도를 먼저 고르세요"}</strong>
            </div>
            {activeTemplate ? (
              <>
                <p>{activeTemplate.description}</p>
                <div className="aui-paperclip-template-meta">
                  <span>{activeIntent?.shortLabel || "읽기"} 의도</span>
                  <span>{templateDefaultMode(activeTemplate.dryRun)}</span>
                  <span>{activeTemplate.command}</span>
                  <span>{activeTemplate.output || "output path TBD"}</span>
                </div>
                <div className="aui-paperclip-guidance">
                  <article>
                    <strong>이 작업으로 해결하는 문제</strong>
                    <p>{activeIntent?.help || "필요한 문서 읽기나 검수 작업을 안전하게 요청합니다."}</p>
                  </article>
                  <article>
                    <strong>실행 전 체크</strong>
                    <p>{snapshot.available ? "현재 bridge 연결 가능. 프로젝트 힌트와 중복 queue 여부만 확인하면 됩니다." : "현재 bridge가 막혀 있으므로 실행보다 복구가 우선입니다."}</p>
                  </article>
                </div>
                <label className="aui-paperclip-field">
                  <span>요청 이름</span>
                  <input value={studio.title} onChange={(event) => studio.setTitle(event.target.value)} />
                </label>
                <label className="aui-paperclip-field">
                  <span>프로젝트 힌트</span>
                  <input
                    placeholder="예: Sawnics_ManufacturingAI_Project"
                    value={studio.projectHint}
                    onChange={(event) => studio.setProjectHint(event.target.value)}
                  />
                </label>
                <label className="aui-paperclip-field">
                  <span>읽기 지시</span>
                  <textarea
                    placeholder={activeTemplate.inputHint || "JSON 또는 자연어 지시를 입력하세요."}
                    rows={7}
                    value={studio.payloadText}
                    onChange={(event) => studio.setPayloadText(event.target.value)}
                  />
                </label>
                <div className="aui-paperclip-actions">
                  <button disabled={studio.phase === "saving"} onClick={studio.queueTask} type="button">대기열에 넣기</button>
                  <button disabled={studio.phase === "triggering"} onClick={studio.queueAndTrigger} type="button">검토 후 실행 요청</button>
                </div>
                <p className={`aui-paperclip-status ${studio.phase}`}>{studio.message}</p>
              </>
            ) : (
              <p>등록된 Paperclip template이 없습니다.</p>
            )}
          </article>

          <article className="aui-ops-card aui-ops-card-span-2">
            <div className="aui-ops-card-head">
              <span>핵심 흐름</span>
              <strong>의도 선택 → 안전하게 요청 → 결과 판정</strong>
            </div>
            <div className="aui-ops-sequence-grid">
              {suggestedFlow.map((item) => (
                <article className="aui-ops-sequence-step ready" key={item.step}>
                  <strong>{item.step}</strong>
                  <span>focus</span>
                  <small>{item.detail}</small>
                </article>
              ))}
            </div>
          </article>
        </section>

        <aside className="aui-paperclip-side">
          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>안전 + 실행성</span>
              <strong>{snapshot.available ? "진행 가능" : "복구 우선"}</strong>
            </div>
            <div className="aui-ops-list">
              <article className={`aui-ops-log-card aui-ops-status-card ${snapshot.available ? "ready" : "hold"}`}>
                <strong>연결 상태</strong>
                <span>{snapshot.status}</span>
                <small>{snapshot.available ? "실행 요청을 보낼 수 있습니다." : "현재는 결과 조회나 실행 요청이 막혀 있습니다."}</small>
              </article>
              <article className={`aui-ops-log-card aui-ops-status-card ${activeTemplate ? "ready" : "hold"}`}>
                <strong>선택 작업</strong>
                <span>{activeTemplate?.title || "미선택"}</span>
                <small>{activeTemplate ? templateDefaultMode(activeTemplate.dryRun) : "작업 의도를 정해야 요청을 만들 수 있습니다."}</small>
              </article>
              <article className={`aui-ops-log-card aui-ops-status-card ${queuedTasks.length ? "hold" : "ready"}`}>
                <strong>대기열 부담</strong>
                <span>{queuedTasks.length} active</span>
                <small>{queuedTasks.length ? "기존 요청을 먼저 검토하는 편이 안전합니다." : "지금은 바로 새 요청을 실행하기 좋은 상태입니다."}</small>
              </article>
            </div>
          </article>

          <article className="aui-ops-card" ref={queueRef}>
            <div className="aui-ops-card-head">
              <span>지금 돌고 있는 작업</span>
              <strong>{featuredTasks.length}개</strong>
            </div>
            <div className="aui-paperclip-task-list">
              {featuredTasks.map((task) => {
                const sameStreamCount = duplicateRisk(task, queuedTasks);
                return (
                  <article key={task.id}>
                    <div className="aui-paperclip-task-copy">
                      <strong>{task.title || task.id}</strong>
                      <span>{humanTaskStatus(task.status)} · {task.command || task.templateId}</span>
                      <small>{taskProjectHint(task) || "프로젝트 힌트 없음"} · {taskSafetyLabel(task)}</small>
                      <small>{queueActionHint(task)}</small>
                      {sameStreamCount ? <small className="danger">유사 queue {sameStreamCount}건 더 있음</small> : null}
                    </div>
                    <button onClick={() => studio.triggerTask(task)} type="button">실행</button>
                  </article>
                );
              })}
              {!featuredTasks.length ? <p>지금 바로 돌릴 Paperclip 작업이 없습니다.</p> : null}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>최근 감사 로그</span>
              <strong>{recentEvents.length}개</strong>
            </div>
            <div className="aui-paperclip-event-list">
              {recentEvents.map((event, index) => (
                <div key={`${event.taskId || "event"}-${event.createdAt || index}`}>
                  <strong>{event.type || event.resultStatus || "event"}</strong>
                  <span>{event.message || event.taskId || "-"}</span>
                  <small>{shortDate(event.createdAt)}</small>
                </div>
              ))}
              {!recentEvents.length ? <p>표시할 이벤트가 없습니다.</p> : null}
            </div>
          </article>
        </aside>
      </section>

      <section className="aui-paperclip-bottom">
        <article ref={resultRef}>
          <div className="aui-paperclip-section-head">
            <span>검토할 결과</span>
            <strong>{resultItems.length}개</strong>
          </div>
          <div className="aui-paperclip-result-list">
            {resultItems.slice(0, 8).map((item) => {
              const review = resultReviewStates.get(item.id) || resultReviewState(item);
              const retryTask = item.kind === "task" ? item.task : item.task;
              return (
                <article className={item.id === activeResultItem?.id ? "active" : ""} key={item.id}>
                  <strong>{item.kind === "run" ? (item.task?.title || item.run.title || item.run.runId) : (item.task.title || item.task.id)}</strong>
                  <span>
                    {item.kind === "run"
                      ? `${humanRunPhase(item.run.phase)} · ${shortDate(item.run.updatedAt)}`
                      : `${humanTaskStatus(item.task.status)} · ${shortDate(item.task.finishedAt || item.task.updatedAt)}`}
                  </span>
                  <div className={`aui-paperclip-review-badge ${review.tone}`}>
                    <strong>{review.label}</strong>
                    <small>{review.detail}</small>
                  </div>
                  {item.kind === "run"
                    ? (item.run.runPath ? <code>{item.run.runPath}</code> : null)
                    : (taskResultPath(item.task) ? <code>{taskResultPath(item.task)}</code> : null)}
                  <div className="aui-paperclip-result-actions">
                    <button onClick={() => setActiveResultId(item.id)} type="button">열기</button>
                    <button disabled={!retryTask} onClick={() => retryTask && studio.triggerTask(retryTask)} type="button">재실행</button>
                  </div>
                </article>
              );
            })}
            {!resultItems.length ? <p>아직 완료된 Paperclip 결과가 없습니다.</p> : null}
          </div>
        </article>

        <article>
          <div className="aui-paperclip-section-head">
            <span>결과 본문</span>
            <strong>{activeResultTask?.title || activeRun?.title || "선택된 결과 없음"}</strong>
          </div>
          {activeResultItem ? (
            <section className="aui-paperclip-result-preview">
              <div>
                <span>검토 대상</span>
                <strong>{activeResultTask?.title || activeRun?.title || activeRun?.runId || "선택된 결과 없음"}</strong>
              </div>
              {activeRun ? (
                <>
                  {activeRun.runPath ? <code>{activeRun.runPath}</code> : null}
                  <div className="aui-paperclip-result-actions">
                    {activeRun.artifacts.map((artifact) => (
                      <button
                        key={artifact.name}
                        onClick={() => setRunArtifact((current) => ({ ...current, artifactName: artifact.name }))}
                        type="button"
                      >
                        {artifact.name}
                      </button>
                    ))}
                  </div>
                  <div className="aui-paperclip-result-actions">
                    <button
                      disabled={!runArtifact.rawContent}
                      onClick={() => downloadRunArtifact(activeRun, activeArtifactName, runArtifact.rawContent)}
                      type="button"
                    >
                      다운로드
                    </button>
                    <button
                      disabled={!activeResultTask || !runArtifact.rawContent || !artifactPromotable(activeArtifactName) || resultAction.phase === "promoting"}
                      onClick={() => activeResultTask && promoteTaskResult(activeResultTask, runArtifact.rawContent)}
                      type="button"
                    >
                      위키 승격 후보 만들기
                    </button>
                  </div>
                  <pre>{runArtifact.content.slice(0, RESULT_PREVIEW_LIMIT) || "표시할 결과 본문이 없습니다."}</pre>
                </>
              ) : (
                <>
                  {activeResultTask && taskResultPath(activeResultTask) ? <code>{taskResultPath(activeResultTask)}</code> : null}
                  <div className="aui-paperclip-result-actions">
                    <button disabled={!activeResultTask || !taskResultText(activeResultTask)} onClick={() => activeResultTask && downloadTaskResult(activeResultTask)} type="button">다운로드</button>
                    <button
                      disabled={!activeResultTask || !taskResultText(activeResultTask) || resultAction.phase === "promoting"}
                      onClick={() => activeResultTask && promoteTaskResult(activeResultTask, taskResultText(activeResultTask))}
                      type="button"
                    >
                      위키 승격 후보 만들기
                    </button>
                    <button disabled={!activeResultTask} onClick={() => activeResultTask && studio.triggerTask(activeResultTask)} type="button">재실행</button>
                  </div>
                  <pre>{activeResultTask ? taskResultText(activeResultTask).slice(0, RESULT_PREVIEW_LIMIT) : "표시할 결과 본문이 없습니다."}</pre>
                </>
              )}
            </section>
          ) : (
            <p className="aui-ops-muted">완료된 결과를 하나 선택하면 여기서 바로 읽고 채택 여부를 판단할 수 있습니다.</p>
          )}
          {activeRun ? <p className={`aui-paperclip-status ${runArtifact.phase}`}>{runArtifact.message}</p> : null}
          <p className={`aui-paperclip-status ${resultAction.phase}`}>{resultAction.message}</p>
        </article>
      </section>
    </main>
  );
}
