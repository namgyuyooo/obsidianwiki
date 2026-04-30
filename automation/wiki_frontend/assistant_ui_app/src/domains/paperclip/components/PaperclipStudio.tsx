import type { ChatContext } from "../../chat/constants";
import type { PaperclipTask } from "../api/paperclipApi";
import { usePaperclipStudio } from "../hooks/usePaperclipStudio";

type PaperclipStudioProps = {
  chatContext: ChatContext;
};

function shortDate(value = "") {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

function taskResultPath(task: PaperclipTask) {
  const result = task.result || {};
  const path = typeof result.path === "string" ? result.path : "";
  if (path) return path;
  const decisionQueueItemId = typeof result.decisionQueueItemId === "string" ? result.decisionQueueItemId : "";
  return decisionQueueItemId ? `Decision Queue: ${decisionQueueItemId}` : "";
}

export function PaperclipStudio({ chatContext }: PaperclipStudioProps) {
  const studio = usePaperclipStudio();
  const { snapshot, activeTemplate } = studio;
  const queuedTasks = snapshot.tasks.filter((task) => !["completed", "failed"].includes(task.status || ""));
  const finishedTasks = snapshot.tasks.filter((task) => ["completed", "failed"].includes(task.status || ""));

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
              <div key={task.id}>
                <strong>{task.title || task.id}</strong>
                <span>{task.status} · {shortDate(task.finishedAt || task.updatedAt)}</span>
                {taskResultPath(task) ? <code>{taskResultPath(task)}</code> : null}
              </div>
            ))}
            {!finishedTasks.length ? <p>아직 완료된 Paperclip 결과가 없습니다.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
