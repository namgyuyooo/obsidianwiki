import {
  ActionBarPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  useMessage,
  useThreadRuntime,
} from "@assistant-ui/react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import { fetchWikiPage, type WikiPagePayload } from "../../wiki/api/wikiApi";
import { CHAT_API_ENDPOINTS } from "../constants";
import { deleteChatProjectMessage, type ChatProject } from "../api/chatWorkspaceApi";

type MessageViewProps = {
  activeProject: ChatProject | null;
  evidenceRecord: Record<string, AssistantEvidenceRecord>;
  onOpenWikiPage: (path: string) => void;
  onReloadProject: (nextActiveProjectId?: string) => Promise<void>;
};

type MessagePart = {
  type?: string;
  text?: string;
};

type PromotionResult = {
  status: "idle" | "saving" | "success" | "error";
  message: string;
};

type AssistantEvidenceItem = {
  title: string;
  path: string;
  docKind?: string;
  priorityReason?: string;
  retrievalSource?: string;
  graphHops?: number;
};

export type AssistantEvidenceRecord = {
  runId: string;
  query: string;
  items: AssistantEvidenceItem[];
  savedAt: string;
};

function textFromContent(content: string | readonly MessagePart[] | undefined) {
  if (typeof content === "string") return content.trim();
  return (content || [])
    .filter((part) => part?.type === "text")
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

async function promoteAssistantKnowledge(input: {
  content: string;
  projectHint: string;
  sourceProjectId: string;
  sourceMessageId: string;
}) {
  const response = await fetch(CHAT_API_ENDPOINTS.evidence, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function wikiSurfaceHref(path: string) {
  if (typeof window === "undefined") return "#";
  const url = new URL(window.location.href);
  url.searchParams.set("surface", "wiki");
  url.searchParams.set("wikiPath", path);
  return `${url.pathname}${url.search}${url.hash}`;
}

function inlineMarkdown(value: string) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, (_, code: string) => `<code>${escapeHtml(code)}</code>`);
  text = text.replace(/\[\[([^[\]]+)\]\]/g, (_, path: string) => (
    `<a class="aui-inline-wikilink" data-wiki-path="${escapeAttribute(path)}" href="${escapeAttribute(wikiSurfaceHref(path))}">[[${escapeHtml(path)}]]</a>`
  ));
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => (
    `<a href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
  ));
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return text;
}

function markdownPreview(markdown: string) {
  const lines = String(markdown || "").split("\n");
  const html: string[] = [];
  const paragraph: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let listMode: "ul" | "ol" | "" = "";

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };

  const closeList = () => {
    if (!listMode) return;
    html.push(`</${listMode}>`);
    listMode = "";
  };

  const openList = (mode: "ul" | "ol") => {
    if (listMode === mode) return;
    closeList();
    html.push(`<${mode}>`);
    listMode = mode;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flushParagraph();
      closeList();
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }
    if (!trimmed) {
      flushParagraph();
      closeList();
      return;
    }
    if (/^---+$/.test(trimmed) || /^___+$/.test(trimmed)) {
      flushParagraph();
      closeList();
      html.push("<hr />");
      return;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(4, heading[1].length);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      return;
    }
    const blockquote = trimmed.match(/^>\s+(.+)$/);
    if (blockquote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote><p>${inlineMarkdown(blockquote[1])}</p></blockquote>`);
      return;
    }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      openList("ul");
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      return;
    }
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      openList("ol");
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      return;
    }
    paragraph.push(trimmed);
  });

  if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  flushParagraph();
  closeList();
  return html.join("") || "<p>내용이 없습니다.</p>";
}

function RichMessageBody({
  text,
  onOpenWikiPage,
}: {
  text: string;
  onOpenWikiPage: (path: string) => void;
}) {
  const html = useMemo(() => markdownPreview(text), [text]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    const anchor = target instanceof Element
      ? target.closest("a")
      : target instanceof Node
        ? target.parentElement?.closest("a") || null
        : null;
    if (!anchor) return;
    const wikiPath = anchor.getAttribute("data-wiki-path");
    if (wikiPath) {
      event.preventDefault();
      onOpenWikiPage(wikiPath);
      return;
    }
    const href = anchor.getAttribute("href") || "";
    if (/^(https?:|mailto:|tel:)/.test(href)) {
      event.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  return <div className="aui-rich-message" dangerouslySetInnerHTML={{ __html: html }} onClick={handleClick} />;
}

function previewReason(item: AssistantEvidenceItem | null) {
  if (!item) return "";
  if (item.priorityReason) return item.priorityReason;
  if (item.retrievalSource) return `${item.retrievalSource} 근거로 채택된 문서입니다.`;
  return "";
}

function shortRunLabel(runId: string | undefined) {
  const value = String(runId || "").trim();
  return value ? value.slice(0, 12) : "legacy";
}

function EvidencePreview({
  initialPath,
  items,
  onClose,
  onOpenWikiPage,
}: {
  initialPath?: string;
  items: AssistantEvidenceItem[];
  onClose: () => void;
  onOpenWikiPage: (path: string) => void;
}) {
  const runtime = useThreadRuntime();
  const [activePath, setActivePath] = useState(initialPath || items[0]?.path || "");
  const [previewPage, setPreviewPage] = useState<WikiPagePayload | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");
  const activeIndex = items.findIndex((item) => item.path === activePath);
  const activeItem = activeIndex >= 0 ? items[activeIndex] : items[0] || null;

  const loadPage = async (path: string) => {
    if (!path) return;
    setPreviewPage(null);
    setPhase("loading");
    setMessage("문서 내용을 불러오는 중입니다.");
    try {
      const payload = await fetchWikiPage(path);
      setPreviewPage(payload);
      setPhase("ready");
      setMessage(payload.title || path);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "문서 내용을 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    setActivePath(initialPath || items[0]?.path || "");
  }, [initialPath, items]);

  useEffect(() => {
    if (!activePath) return;
    void loadPage(activePath);
  }, [activePath]);

  const move = (direction: -1 | 1) => {
    if (activeIndex === -1) return;
    const nextIndex = activeIndex + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setActivePath(items[nextIndex].path);
  };

  const askFromPreview = () => {
    if (!activeItem?.path) return;
    runtime.composer.setText(`[[${activeItem.path}]] 문서를 기준으로 이어서 설명해줘.`);
  };

  return (
    <div className="aui-orch-preview-overlay" role="dialog" aria-modal="true" aria-label="근거 문서 미리보기">
      <button className="aui-orch-preview-scrim" onClick={onClose} type="button" aria-label="미리보기 닫기" />
      <aside className="aui-orch-preview-panel">
        <header className="aui-orch-preview-header">
          <div>
            <span>Evidence Preview</span>
            <strong>{previewPage?.title || activeItem?.title || activeItem?.path}</strong>
            <small>{activeItem?.docKind || String(previewPage?.frontmatter?.docKind || "page")} · {activeItem?.path || "-"}</small>
          </div>
          <div className="aui-orch-preview-nav">
            <button disabled={activeIndex <= 0} onClick={() => move(-1)} type="button">이전</button>
            <button disabled={activeIndex === -1 || activeIndex >= items.length - 1} onClick={() => move(1)} type="button">다음</button>
            <button onClick={onClose} type="button">닫기</button>
          </div>
        </header>
        <div className="aui-orch-preview-body">
          {items.length > 1 ? (
            <div className="aui-orch-preview-tablist">
              {items.map((item) => (
                <button
                  className={item.path === activeItem?.path ? "active" : ""}
                  key={item.path}
                  onClick={() => setActivePath(item.path)}
                  type="button"
                >
                  {item.title || item.path}
                </button>
              ))}
            </div>
          ) : null}
          {previewReason(activeItem) ? (
            <article className="aui-orch-item accent">
              <strong>선택 이유</strong>
              <span>{previewReason(activeItem)}</span>
            </article>
          ) : null}
          {phase === "loading" ? <p className="aui-orch-note">{message}</p> : null}
          {phase === "error" ? <p className="aui-inline-status error">{message}</p> : null}
          {phase === "ready" ? (
            <div className="aui-orch-preview-markdown" dangerouslySetInnerHTML={{ __html: markdownPreview(previewPage?.markdown || "") }} />
          ) : null}
        </div>
        <footer className="aui-orch-preview-footer">
          <button onClick={askFromPreview} type="button">질문창으로</button>
          <button
            className="primary"
            onClick={() => {
              if (activeItem?.path) onOpenWikiPage(activeItem.path);
              onClose();
            }}
            type="button"
          >
            자세히 보기
          </button>
        </footer>
      </aside>
    </div>
  );
}

export function MessageView({ activeProject, evidenceRecord, onOpenWikiPage, onReloadProject }: MessageViewProps) {
  const role = useMessage((state: any) => state.role);
  return role === "user"
    ? <UserMessage activeProject={activeProject} onOpenWikiPage={onOpenWikiPage} onReloadProject={onReloadProject} />
    : (
      <AssistantMessage
        activeProject={activeProject}
        evidenceRecord={evidenceRecord}
        onOpenWikiPage={onOpenWikiPage}
        onReloadProject={onReloadProject}
      />
    );
}

function UserMessage({
  activeProject,
  onOpenWikiPage,
  onReloadProject,
}: {
  activeProject: ChatProject | null;
  onOpenWikiPage: (path: string) => void;
  onReloadProject: (nextActiveProjectId?: string) => Promise<void>;
}) {
  const { notify } = useToastCenter();
  const messageId = useMessage((state: any) => state.id || "");
  const content = useMessage((state: any) => state.content);
  const runtime = useThreadRuntime();
  const [status, setStatus] = useState<PromotionResult>({ status: "idle", message: "" });
  const text = textFromContent(content);
  const canDelete = Boolean(activeProject?.id && messageId && activeProject.messages?.some((message) => message.id === messageId));

  const handleEdit = () => {
    runtime.composer.setText(text);
    setStatus({ status: "success", message: "입력창에 기존 질문을 불러왔습니다." });
    notify("success", "질문 불러오기 완료", "입력창에 기존 질문을 가져왔습니다.");
  };

  const handleReplay = () => {
    runtime.composer.setText(text);
    runtime.composer.send();
    setStatus({ status: "success", message: "같은 질문으로 다시 실행했습니다." });
    notify("success", "질문 재실행 시작", "같은 질문으로 다시 실행했습니다.");
  };

  const handleDelete = async () => {
    if (!activeProject?.id || !messageId) return;
    setStatus({ status: "saving", message: "메시지를 삭제하는 중입니다." });
    notify("running", "메시지 삭제 시작", messageId, { durationMs: 2200 });
    try {
      await deleteChatProjectMessage(activeProject.id, messageId);
      await onReloadProject(activeProject.id);
      setStatus({ status: "success", message: "메시지를 삭제했습니다." });
      notify("success", "메시지 삭제 완료", messageId);
    } catch (error) {
      setStatus({ status: "error", message: `삭제 실패: ${String((error as Error)?.message || error)}` });
      notify("error", "메시지 삭제 실패", String((error as Error)?.message || error));
    }
  };

  return (
    <MessagePrimitive.Root className="aui-message user">
      <div className="aui-message-label">나</div>
      <div className="aui-bubble user">
        <RichMessageBody onOpenWikiPage={onOpenWikiPage} text={text} />
      </div>
      <div className="aui-actionbar">
        <button type="button" className="aui-action-pill" onClick={handleEdit}>수정</button>
        <button type="button" className="aui-action-pill" onClick={handleReplay}>재실행</button>
        {canDelete ? (
          <button type="button" className="aui-action-pill" onClick={handleDelete}>
            {status.status === "saving" ? "삭제중..." : "삭제"}
          </button>
        ) : null}
      </div>
      {status.status !== "idle" ? (
        <p className={`aui-inline-status ${status.status}`}>{status.message}</p>
      ) : null}
    </MessagePrimitive.Root>
  );
}

function AssistantMessage({
  activeProject,
  evidenceRecord,
  onOpenWikiPage,
  onReloadProject,
}: {
  activeProject: ChatProject | null;
  evidenceRecord: Record<string, AssistantEvidenceRecord>;
  onOpenWikiPage: (path: string) => void;
  onReloadProject: (nextActiveProjectId?: string) => Promise<void>;
}) {
  const { notify } = useToastCenter();
  const messageId = useMessage((state: any) => state.id || "");
  const content = useMessage((state: any) => state.content);
  const runtime = useThreadRuntime();
  const [promotionState, setPromotionState] = useState<PromotionResult>({
    status: "idle",
    message: "",
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPath, setPreviewPath] = useState("");
  const evidence = evidenceRecord[messageId];
  const text = textFromContent(content);
  const canDelete = Boolean(activeProject?.id && messageId && activeProject.messages?.some((message) => message.id === messageId));

  const promoteKnowledge = async () => {
    if (!text) {
      setPromotionState({ status: "error", message: "승격할 텍스트를 찾지 못했습니다." });
      notify("error", "지식승격 실패", "승격할 텍스트를 찾지 못했습니다.");
      return;
    }
    setPromotionState({ status: "saving", message: "지식승격 후보를 생성하는 중입니다." });
    notify("running", "지식승격 시작", messageId || "assistant message", { durationMs: 2200 });
    try {
      const result = await promoteAssistantKnowledge({
        content: text,
        projectHint: activeProject?.linkedWikiProject?.projectLabel || activeProject?.name || "미지정 프로젝트",
        sourceProjectId: activeProject?.id || "",
        sourceMessageId: messageId,
      });
      setPromotionState({
        status: "success",
        message: result.path ? `지식승격 후보 생성 완료: ${result.path}` : "지식승격 후보 생성 완료",
      });
      notify("success", "지식승격 완료", result.path ? `후보 생성: ${result.path}` : "지식승격 후보 생성 완료");
    } catch (error) {
      setPromotionState({
        status: "error",
        message: `지식승격 실패: ${String((error as Error)?.message || error)}`,
      });
      notify("error", "지식승격 실패", String((error as Error)?.message || error));
    }
  };

  const rerunFromAnswer = () => {
    if (!text) {
      setPromotionState({ status: "error", message: "재실행할 응답 텍스트를 찾지 못했습니다." });
      notify("error", "응답 재사용 실패", "재실행할 응답 텍스트를 찾지 못했습니다.");
      return;
    }
    runtime.composer.setText(text);
    setPromotionState({ status: "success", message: "응답 텍스트를 입력창으로 보냈습니다." });
    notify("success", "응답 재사용 준비 완료", "응답 텍스트를 입력창으로 보냈습니다.");
  };

  const deleteMessage = async () => {
    if (!activeProject?.id || !messageId) return;
    setPromotionState({ status: "saving", message: "응답을 삭제하는 중입니다." });
    notify("running", "응답 삭제 시작", messageId, { durationMs: 2200 });
    try {
      await deleteChatProjectMessage(activeProject.id, messageId);
      await onReloadProject(activeProject.id);
      setPromotionState({ status: "success", message: "응답을 삭제했습니다." });
      notify("success", "응답 삭제 완료", messageId);
    } catch (error) {
      setPromotionState({
        status: "error",
        message: `삭제 실패: ${String((error as Error)?.message || error)}`,
      });
      notify("error", "응답 삭제 실패", String((error as Error)?.message || error));
    }
  };

  return (
    <MessagePrimitive.Root className="aui-message assistant">
      <div className="aui-message-label">GLM</div>
      <div className="aui-bubble assistant">
        <RichMessageBody onOpenWikiPage={onOpenWikiPage} text={text} />
        <MessagePrimitive.Error>
          <ErrorPrimitive.Root className="aui-error">
            <ErrorPrimitive.Message />
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
        {evidence?.items?.length ? (
          <section className="aui-evidence-strip" aria-label="assistant evidence">
            <div className="aui-evidence-strip-head">
              <span>근거 문서</span>
              <small>{evidence.items.length}건 · run {shortRunLabel(evidence.runId)}</small>
            </div>
            <div className="aui-evidence-chip-list">
              {evidence.items.map((item) => (
                <button
                  className="aui-evidence-chip"
                  key={`${messageId}:${item.path}`}
                  onClick={() => {
                    setPreviewPath(item.path);
                    setPreviewOpen(true);
                  }}
                  type="button"
                >
                  <strong>{item.title || item.path}</strong>
                  <span>{item.docKind || "page"} · {item.priorityReason || item.retrievalSource || item.path}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <ActionBarPrimitive.Root hideWhenRunning className="aui-actionbar">
        <ActionBarPrimitive.Copy asChild>
          <button type="button" className="aui-action-pill">복사</button>
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload asChild>
          <button type="button" className="aui-action-pill">재생성</button>
        </ActionBarPrimitive.Reload>
        <button type="button" className="aui-action-pill" onClick={rerunFromAnswer}>재사용</button>
        {canDelete ? (
          <button type="button" className="aui-action-pill" onClick={deleteMessage}>
            {promotionState.status === "saving" ? "삭제중..." : "삭제"}
          </button>
        ) : null}
        <button type="button" className="aui-action-pill accent" onClick={promoteKnowledge}>
          {promotionState.status === "saving" ? "승격중..." : "지식승격"}
        </button>
      </ActionBarPrimitive.Root>
      {promotionState.status !== "idle" ? (
        <p className={`aui-inline-status ${promotionState.status}`}>{promotionState.message}</p>
      ) : null}
      {previewOpen && evidence?.items?.length ? (
        <EvidencePreview
          initialPath={previewPath}
          items={evidence.items}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewPath("");
          }}
          onOpenWikiPage={onOpenWikiPage}
        />
      ) : null}
    </MessagePrimitive.Root>
  );
}
