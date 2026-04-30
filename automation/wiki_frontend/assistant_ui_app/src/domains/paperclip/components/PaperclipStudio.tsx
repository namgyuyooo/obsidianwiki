import { useState } from "react";
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

export function PaperclipStudio({ chatContext }: PaperclipStudioProps) {
  const studio = usePaperclipStudio();
  const [activeResultId, setActiveResultId] = useState("");
  const [resultAction, setResultAction] = useState<ResultActionState>({
    phase: "idle",
    message: "완료 결과를 열거나 다운로드하고, 검토된 결과는 지식 승격 후보로 보낼 수 있습니다.",
  });
  const { snapshot, activeTemplate } = studio;
  const queuedTasks = snapshot.tasks.filter((task) => !["completed", "failed"].includes(task.status || ""));
  const finishedTasks = snapshot.tasks.filter((task) => ["completed", "failed"].includes(task.status || ""));
  const activeResultTask = finishedTasks.find((task) => task.id === activeResultId) || finishedTasks[0] || null;

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
    <main className="aui-paperclip-studio">
      <section className="aui-paperclip-hero">
        <div>
          <span className="aui-kicker">wiki related / skill operations bench</span>
          <h1>Paperclip Studio</h1>
          <p>
            {chatContext.workspace.toUpperCase()} workspace에서 스킬 템플릿, task queue,
            실행 이벤트, 결과 검토를 새 프론트 기준으로 관리합니다.
          </p>
        </div>
        <aside className={`aui-paperclip-bridge ${snapshot.available ? "ready" : "offline"}`}>
          <span>{snapshot.available ? "READY" : "OFFLINE"}</span>
          <strong>{snapshot.status}</strong>
          <small>{snapshot.url || "PAPERCLIP_URL 미설정"}</small>
          <button onClick={studio.reload} type="button">새로고침</button>
        </aside>
      </section>

      <section className="aui-paperclip-layout">
        <aside className="aui-paperclip-template-rail">
          <div className="aui-paperclip-section-head">
            <span>Templates</span>
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
        </aside>

        <section className="aui-paperclip-composer">
          <div className="aui-paperclip-section-head">
            <span>Task Composer</span>
            <strong>{activeTemplate?.title || "템플릿 없음"}</strong>
          </div>
          {activeTemplate ? (
            <>
              <p>{activeTemplate.description}</p>
              <div className="aui-paperclip-template-meta">
                <span>command: {activeTemplate.command}</span>
                <span>{activeTemplate.dryRun ? "dry-run 기본" : "실행 기본"}</span>
                <span>{activeTemplate.output || "output path TBD"}</span>
              </div>
              <label className="aui-paperclip-field">
                <span>Task title</span>
                <input value={studio.title} onChange={(event) => studio.setTitle(event.target.value)} />
              </label>
              <label className="aui-paperclip-field">
                <span>Payload / 지시</span>
                <textarea
                  placeholder={activeTemplate.inputHint || "JSON 또는 자연어 지시를 입력하세요."}
                  rows={8}
                  value={studio.payloadText}
                  onChange={(event) => studio.setPayloadText(event.target.value)}
                />
              </label>
              <div className="aui-paperclip-actions">
                <button disabled={studio.phase === "saving"} onClick={studio.queueTask} type="button">큐에 추가</button>
                <button disabled={studio.phase === "triggering"} onClick={studio.queueAndTrigger} type="button">생성 후 실행</button>
              </div>
              <p className={`aui-paperclip-status ${studio.phase}`}>{studio.message}</p>
            </>
          ) : (
            <p>등록된 Paperclip template이 없습니다.</p>
          )}
        </section>

        <aside className="aui-paperclip-queue">
          <div className="aui-paperclip-section-head">
            <span>Queue</span>
            <strong>{queuedTasks.length} active</strong>
          </div>
          <div className="aui-paperclip-task-list">
            {queuedTasks.map((task) => (
              <article key={task.id}>
                <div>
                  <strong>{task.title || task.id}</strong>
                  <span>{task.status || "queued"} · {task.command || task.templateId}</span>
                </div>
                <button onClick={() => studio.triggerTask(task)} type="button">실행</button>
              </article>
            ))}
            {!queuedTasks.length ? <p>실행 대기 task가 없습니다.</p> : null}
          </div>
        </aside>
      </section>

      <section className="aui-paperclip-bottom">
        <article>
          <div className="aui-paperclip-section-head">
            <span>Events</span>
            <strong>{snapshot.events.length} logs</strong>
          </div>
          <div className="aui-paperclip-event-list">
            {snapshot.events.slice(0, 12).map((event, index) => (
              <div key={`${event.taskId || "event"}-${event.createdAt || index}`}>
                <strong>{event.type || event.resultStatus || "event"}</strong>
                <span>{event.message || event.taskId || "-"}</span>
                <small>{shortDate(event.createdAt)}</small>
              </div>
            ))}
          </div>
        </article>

        <article>
          <div className="aui-paperclip-section-head">
            <span>Results</span>
            <strong>{finishedTasks.length} finished</strong>
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
          {activeResultTask ? (
            <section className="aui-paperclip-result-preview">
              <div>
                <span>Live Result Preview</span>
                <strong>{activeResultTask.title || activeResultTask.id}</strong>
              </div>
              {taskResultPath(activeResultTask) ? <code>{taskResultPath(activeResultTask)}</code> : null}
              <pre>{taskResultText(activeResultTask).slice(0, RESULT_PREVIEW_LIMIT) || "표시할 결과 본문이 없습니다."}</pre>
            </section>
          ) : null}
          <p className={`aui-paperclip-status ${resultAction.phase}`}>{resultAction.message}</p>
        </article>
      </section>
    </main>
  );
}
