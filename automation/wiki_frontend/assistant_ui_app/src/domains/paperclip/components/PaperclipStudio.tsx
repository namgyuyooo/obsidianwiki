import { useMemo, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import { promoteKnowledge } from "../../knowledge/api/knowledgeApi";
import type { PaperclipTask } from "../api/paperclipApi";
import { usePaperclipStudio } from "../hooks/usePaperclipStudio";

type PaperclipStudioProps = {
  chatContext: ChatContext;
};

type ResultActionState = {
  phase: "idle" | "promoting" | "success" | "error";
  message: string;
};

const RESULT_PREVIEW_LIMIT = 5200;

function shortDate(value = "") {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

function resultString(task: PaperclipTask, key: string) {
  const value = task.result?.[key];
  return typeof value === "string" ? value : "";
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
  const rawName = task.title || task.id || "paperclip-result";
  const safeName = rawName.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${safeName || "paperclip-result"}${resultString(task, "markdown") ? ".md" : ".json"}`;
}

function taskProjectHint(task: PaperclipTask) {
  const payload = task.payload || {};
  const candidate = payload.projectHint || payload.projectKey || payload.project || task.result?.projectHint;
  return typeof candidate === "string" ? candidate : "";
}

function downloadTaskResult(task: PaperclipTask) {
  const text = taskResultText(task);
  const type = resultString(task, "markdown") ? "text/markdown;charset=utf-8" : "application/json;charset=utf-8";
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = taskResultFileName(task);
  anchor.click();
  URL.revokeObjectURL(url);
}

function taskSafetyLabel(task: PaperclipTask) {
  const mode = task.safety?.mode || "";
  if (mode) return mode;
  return task.dryRun ? "테스트 기본" : "실행 기본";
}

function templateDefaultMode(dryRun?: boolean) {
  return dryRun ? "테스트 기본" : "실행 기본";
}

export function PaperclipStudio({ chatContext }: PaperclipStudioProps) {
  const studio = usePaperclipStudio();
  const [activeResultId, setActiveResultId] = useState("");
  const [resultAction, setResultAction] = useState<ResultActionState>({
    phase: "idle",
    message: "완료 결과를 검토한 뒤 다운로드하거나 지식 승격 후보로 넘길 수 있습니다.",
  });
  const { snapshot, activeTemplate } = studio;
  const queuedTasks = snapshot.tasks.filter((task) => !["completed", "failed"].includes(task.status || ""));
  const finishedTasks = snapshot.tasks.filter((task) => ["completed", "failed"].includes(task.status || ""));
  const activeResultTask = finishedTasks.find((task) => task.id === activeResultId) || finishedTasks[0] || null;
  const featuredTasks = queuedTasks.slice(0, 6);
  const recentEvents = snapshot.events.slice(0, 8);
  const suggestedFlow = useMemo(() => ([
    {
      step: "1. 읽기 요청",
      detail: activeTemplate ? `${activeTemplate.title}로 필요한 파일/문서를 읽게 합니다.` : "템플릿을 먼저 고릅니다.",
    },
    {
      step: "2. 검수",
      detail: "안전 모드와 이벤트 로그를 보고 잘못된 수집이나 과잉 실행을 막습니다.",
    },
    {
      step: "3. 채택",
      detail: "완료 결과를 열고, 쓸 만하면 다운로드하거나 지식 승격으로 넘깁니다.",
    },
  ]), [activeTemplate]);

  const promoteTaskResult = async (task: PaperclipTask) => {
    const content = taskResultText(task);
    if (!content.trim()) {
      setResultAction({ phase: "error", message: "승격할 Paperclip 결과 본문이 없습니다." });
      return;
    }

    setResultAction({ phase: "promoting", message: "Paperclip 결과를 지식 승격 후보로 변환하는 중입니다." });
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
    } catch (error) {
      setResultAction({
        phase: "error",
        message: error instanceof Error ? error.message : "Paperclip 결과 승격 실패",
      });
    }
  };

  return (
    <main className="aui-paperclip-studio aui-work-surface">
      <section className="aui-paperclip-hero aui-work-titlebar">
        <div>
          <span className="aui-kicker">Paperclip</span>
          <h1>읽기·검수 작업대</h1>
          <p>{chatContext.workspace.toUpperCase()} 증거 읽기 요청을 만들고, 실행 안전성을 확인하고, 결과를 채택합니다.</p>
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
          <span>bridge</span>
          <strong>{snapshot.available ? "reachable" : "blocked"}</strong>
          <small>{snapshot.available ? "Paperclip bridge 연결 가능" : "먼저 bridge 오류를 해결해야 합니다."}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>request</span>
          <strong>{activeTemplate?.title || "미선택"}</strong>
          <small>{activeTemplate?.command || "템플릿을 먼저 선택하세요."}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>queue</span>
          <strong>{queuedTasks.length}</strong>
          <small>{featuredTasks[0]?.title || "대기 작업 없음"}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>result</span>
          <strong>{finishedTasks.length}</strong>
          <small>{activeResultTask?.title || "아직 완료 결과 없음"}</small>
        </article>
      </section>

      <section className="aui-paperclip-shell">
        <section className="aui-paperclip-main">
          <article className="aui-paperclip-composer aui-paperclip-focus-card">
            <div className="aui-paperclip-section-head">
              <span>읽기 요청 만들기</span>
              <strong>{activeTemplate?.title || "작업 종류를 먼저 고르세요"}</strong>
            </div>
            {activeTemplate ? (
              <>
                <p>{activeTemplate.description}</p>
                <div className="aui-paperclip-template-meta">
                  <span>command: {activeTemplate.command}</span>
                  <span>{activeTemplate.dryRun ? "테스트 기본" : "실행 기본"}</span>
                  <span>{activeTemplate.output || "output path TBD"}</span>
                </div>
                <label className="aui-paperclip-field">
                  <span>요청 이름</span>
                  <input value={studio.title} onChange={(event) => studio.setTitle(event.target.value)} />
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
                  <button disabled={studio.phase === "saving"} onClick={studio.queueTask} type="button">요청만 저장</button>
                  <button disabled={studio.phase === "triggering"} onClick={studio.queueAndTrigger} type="button">바로 실행</button>
                </div>
                <p className={`aui-paperclip-status ${studio.phase}`}>{studio.message}</p>
              </>
            ) : (
              <p>등록된 Paperclip template이 없습니다.</p>
            )}
          </article>

          <article className="aui-paperclip-template-rail">
            <div className="aui-paperclip-section-head">
              <span>작업 종류</span>
              <strong>{snapshot.templates.length}개</strong>
            </div>
            <div className="aui-paperclip-template-list">
              {snapshot.templates.map((template) => (
                <button
                  className={template.id === studio.activeTemplateId ? "active" : ""}
                  key={template.id}
                  onClick={() => studio.setActiveTemplateId(template.id)}
                  type="button"
                >
                  <strong>{template.title}</strong>
                  <span>{template.agent}</span>
                  <small>{template.safety || template.command}</small>
                </button>
              ))}
            </div>
          </article>

          <article className="aui-ops-card aui-ops-card-span-2">
            <div className="aui-ops-card-head">
              <span>핵심 흐름</span>
              <strong>읽기 요청 → 검수 → 채택</strong>
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
              <strong>{snapshot.available ? "go" : "fix first"}</strong>
            </div>
            <div className="aui-ops-list">
              <article className={`aui-ops-log-card aui-ops-status-card ${snapshot.available ? "ready" : "hold"}`}>
                <strong>bridge</strong>
                <span>{snapshot.status}</span>
                <small>{snapshot.available ? "실행 요청을 보낼 수 있습니다." : "현재는 결과 조회나 실행 요청이 막혀 있습니다."}</small>
              </article>
              <article className={`aui-ops-log-card aui-ops-status-card ${activeTemplate ? "ready" : "hold"}`}>
                <strong>template</strong>
                <span>{activeTemplate?.title || "미선택"}</span>
                <small>{activeTemplate ? templateDefaultMode(activeTemplate.dryRun) : "작업 종류를 정해야 요청을 만들 수 있습니다."}</small>
              </article>
              <article className={`aui-ops-log-card aui-ops-status-card ${queuedTasks.length ? "ready" : "hold"}`}>
                <strong>queue pressure</strong>
                <span>{queuedTasks.length} active</span>
                <small>{queuedTasks.length ? "대기열이 있어 우선순위 확인이 필요합니다." : "지금은 바로 새 요청을 실행하기 좋은 상태입니다."}</small>
              </article>
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>지금 돌릴 작업</span>
              <strong>{featuredTasks.length}개</strong>
            </div>
            <div className="aui-paperclip-task-list">
              {featuredTasks.map((task) => (
                <article key={task.id}>
                  <div>
                    <strong>{task.title || task.id}</strong>
                    <span>{task.status || "queued"} · {task.command || task.templateId}</span>
                  </div>
                  <button onClick={() => studio.triggerTask(task)} type="button">실행</button>
                </article>
              ))}
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
        <article>
          <div className="aui-paperclip-section-head">
            <span>완료 결과</span>
            <strong>{finishedTasks.length}개</strong>
          </div>
          <div className="aui-paperclip-result-list">
            {finishedTasks.slice(0, 8).map((task) => (
              <article className={task.id === activeResultTask?.id ? "active" : ""} key={task.id}>
                <strong>{task.title || task.id}</strong>
                <span>{task.status} · {shortDate(task.finishedAt || task.updatedAt)}</span>
                {taskResultPath(task) ? <code>{taskResultPath(task)}</code> : null}
                <div className="aui-paperclip-result-actions">
                  <button onClick={() => setActiveResultId(task.id)} type="button">열기</button>
                  <button disabled={!taskResultText(task)} onClick={() => downloadTaskResult(task)} type="button">다운로드</button>
                  <button
                    disabled={!taskResultText(task) || resultAction.phase === "promoting"}
                    onClick={() => promoteTaskResult(task)}
                    type="button"
                  >
                    지식승격
                  </button>
                </div>
              </article>
            ))}
            {!finishedTasks.length ? <p>아직 완료된 Paperclip 결과가 없습니다.</p> : null}
          </div>
        </article>

        <article>
          <div className="aui-paperclip-section-head">
            <span>결과 본문</span>
            <strong>{activeResultTask?.title || "선택된 결과 없음"}</strong>
          </div>
          {activeResultTask ? (
            <section className="aui-paperclip-result-preview">
              <div>
                <span>검토 대상</span>
                <strong>{activeResultTask.title || activeResultTask.id}</strong>
              </div>
              {taskResultPath(activeResultTask) ? <code>{taskResultPath(activeResultTask)}</code> : null}
              <pre>{taskResultText(activeResultTask).slice(0, RESULT_PREVIEW_LIMIT) || "표시할 결과 본문이 없습니다."}</pre>
            </section>
          ) : (
            <p className="aui-ops-muted">완료된 결과를 하나 선택하면 여기서 바로 읽고 채택 여부를 판단할 수 있습니다.</p>
          )}
          <p className={`aui-paperclip-status ${resultAction.phase}`}>{resultAction.message}</p>
        </article>
      </section>
    </main>
  );
}
