import type { ChatProject } from "../api/chatWorkspaceApi";

const RECENT_MESSAGE_LIMIT = 24;
const MESSAGE_PREVIEW_EMPTY_TEXT = "내용 없음";

type ProjectHistoryProps = {
  project: ChatProject | null;
};

function messageAuthorLabel(role = "") {
  if (role === "assistant") return "GLM";
  if (role === "user") return "USER";
  return role || "MESSAGE";
}

function messageDateLabel(createdAt = "") {
  if (!createdAt) return "시간 없음";
  return createdAt.replace("T", " ").slice(0, 16);
}

export function ProjectHistory({ project }: ProjectHistoryProps) {
  const messages = project?.messages || [];
  const recentMessages = messages.slice(-RECENT_MESSAGE_LIMIT);

  if (!recentMessages.length) {
    return (
      <section className="aui-history-panel empty" aria-label="project chat history">
        <span className="aui-kicker">project history</span>
        <strong>아직 저장된 대화가 없습니다.</strong>
        <p>첫 메시지를 보내면 GLM 응답과 함께 프로젝트 히스토리에 저장됩니다.</p>
      </section>
    );
  }

  return (
    <section className="aui-history-panel" aria-label="project chat history">
      <div className="aui-history-head">
        <div>
          <span className="aui-kicker">project history</span>
          <strong>최근 대화 {recentMessages.length}개</strong>
        </div>
        <span>{project?.name || "GLM 프로젝트"}</span>
      </div>
      <div className="aui-history-list">
        {recentMessages.map((message, index) => (
          <article className={`aui-history-message ${message.role}`} key={message.id || `${message.role}-${index}`}>
            <div className="aui-history-meta">
              <span>{messageAuthorLabel(message.role)}</span>
              <time>{messageDateLabel(message.createdAt)}</time>
            </div>
            <p>{message.content || MESSAGE_PREVIEW_EMPTY_TEXT}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
