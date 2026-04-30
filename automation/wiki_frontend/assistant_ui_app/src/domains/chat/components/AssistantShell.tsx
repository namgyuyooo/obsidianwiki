import type { ReactNode } from "react";
import type { ChatContext } from "../constants";

type AssistantShellProps = {
  chatContext: ChatContext;
  children: ReactNode;
};

const SURFACE_STATS = [
  { label: "Runtime", value: "Local GLM" },
  { label: "Evidence", value: "Wiki + Files" },
  { label: "Mode", value: "Review First" },
] as const;

const SKILL_TAGS = [
  "Paperclip",
  "Wiki Graph",
  "Evidence Log",
  "Drive Files",
] as const;

const CONTEXT_STACK = [
  "sparse search",
  "graph expansion",
  "paperclip validation",
  "streaming response",
] as const;

export function AssistantShell({ chatContext, children }: AssistantShellProps) {
  return (
    <main className="aui-shell">
      <section className="aui-brand-panel" aria-label="assistant-ui workspace overview">
        <div className="aui-brand-card">
          <span className="aui-kicker">assistant-ui system</span>
          <h1>Decision Workspace</h1>
          <p>
            위키, 파일, 결정 지시를 한 화면 비율 안에서 다루는 업무형 assistant-ui
            shell입니다.
          </p>
        </div>

        <div className="aui-stat-grid" aria-label="assistant runtime summary">
          {SURFACE_STATS.map((stat) => (
            <article className="aui-stat-card" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>

        <section className="aui-panel-card">
          <div className="aui-panel-heading">
            <span>Skill Tags</span>
            <strong>빠른 컨텍스트</strong>
          </div>
          <div className="aui-skill-grid">
            {SKILL_TAGS.map((skillTag) => (
              <button className="aui-skill-token" key={skillTag} type="button">
                @{skillTag}
              </button>
            ))}
          </div>
        </section>
      </section>

      <section className="aui-chat-stage" aria-label="assistant-ui chat surface">
        {children}
      </section>

      <aside className="aui-context-panel" aria-label="workspace context">
        <section className="aui-panel-card">
          <div className="aui-panel-heading">
            <span>Workspace</span>
            <strong>{chatContext.workspace}</strong>
          </div>
          <dl className="aui-context-list">
            <div>
              <dt>Project</dt>
              <dd>{chatContext.projectId}</dd>
            </div>
            <div>
              <dt>Submit</dt>
              <dd>Enter</dd>
            </div>
            <div>
              <dt>Density</dt>
              <dd>Wide focus</dd>
            </div>
          </dl>
        </section>

        <section className="aui-panel-card">
          <div className="aui-panel-heading">
            <span>Context Path</span>
            <strong>검수 우선</strong>
          </div>
          <ol className="aui-context-steps">
            {CONTEXT_STACK.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </aside>
    </main>
  );
}
