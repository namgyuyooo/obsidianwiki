import {
  ActionBarPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  useMessage,
  useThreadRuntime,
} from "@assistant-ui/react";
import { useState } from "react";
import { CHAT_API_ENDPOINTS } from "../constants";
import { deleteChatProjectMessage, type ChatProject } from "../api/chatWorkspaceApi";

type MessageViewProps = {
  activeProject: ChatProject | null;
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

export function MessageView({ activeProject, onReloadProject }: MessageViewProps) {
  const role = useMessage((state: any) => state.role);
  return role === "user"
    ? <UserMessage activeProject={activeProject} onReloadProject={onReloadProject} />
    : <AssistantMessage activeProject={activeProject} onReloadProject={onReloadProject} />;
}

function UserMessage({
  activeProject,
  onReloadProject,
}: {
  activeProject: ChatProject | null;
  onReloadProject: (nextActiveProjectId?: string) => Promise<void>;
}) {
  const messageId = useMessage((state: any) => state.id || "");
  const content = useMessage((state: any) => state.content);
  const runtime = useThreadRuntime();
  const [status, setStatus] = useState<PromotionResult>({ status: "idle", message: "" });
  const text = textFromContent(content);
  const canDelete = Boolean(activeProject?.id && messageId && activeProject.messages?.some((message) => message.id === messageId));

  const handleEdit = () => {
    runtime.composer.setText(text);
    setStatus({ status: "success", message: "입력창에 기존 질문을 불러왔습니다." });
  };

  const handleReplay = () => {
    runtime.composer.setText(text);
    runtime.composer.send();
    setStatus({ status: "success", message: "같은 질문으로 다시 실행했습니다." });
  };

  const handleDelete = async () => {
    if (!activeProject?.id || !messageId) return;
    setStatus({ status: "saving", message: "메시지를 삭제하는 중입니다." });
    try {
      await deleteChatProjectMessage(activeProject.id, messageId);
      await onReloadProject(activeProject.id);
      setStatus({ status: "success", message: "메시지를 삭제했습니다." });
    } catch (error) {
      setStatus({ status: "error", message: `삭제 실패: ${String((error as Error)?.message || error)}` });
    }
  };

  return (
    <MessagePrimitive.Root className="aui-message user">
      <div className="aui-message-label">나</div>
      <div className="aui-bubble user">
        <MessagePrimitive.Parts />
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
  onReloadProject,
}: {
  activeProject: ChatProject | null;
  onReloadProject: (nextActiveProjectId?: string) => Promise<void>;
}) {
  const messageId = useMessage((state: any) => state.id || "");
  const content = useMessage((state: any) => state.content);
  const runtime = useThreadRuntime();
  const [promotionState, setPromotionState] = useState<PromotionResult>({
    status: "idle",
    message: "",
  });
  const canDelete = Boolean(activeProject?.id && messageId && activeProject.messages?.some((message) => message.id === messageId));

  const promoteKnowledge = async () => {
    const text = textFromContent(content);
    if (!text) {
      setPromotionState({ status: "error", message: "승격할 텍스트를 찾지 못했습니다." });
      return;
    }
    setPromotionState({ status: "saving", message: "지식승격 후보를 생성하는 중입니다." });
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
    } catch (error) {
      setPromotionState({
        status: "error",
        message: `지식승격 실패: ${String((error as Error)?.message || error)}`,
      });
    }
  };

  const rerunFromAnswer = () => {
    const text = textFromContent(content);
    if (!text) {
      setPromotionState({ status: "error", message: "재실행할 응답 텍스트를 찾지 못했습니다." });
      return;
    }
    runtime.composer.setText(text);
    setPromotionState({ status: "success", message: "응답 텍스트를 입력창으로 보냈습니다." });
  };

  const deleteMessage = async () => {
    if (!activeProject?.id || !messageId) return;
    setPromotionState({ status: "saving", message: "응답을 삭제하는 중입니다." });
    try {
      await deleteChatProjectMessage(activeProject.id, messageId);
      await onReloadProject(activeProject.id);
      setPromotionState({ status: "success", message: "응답을 삭제했습니다." });
    } catch (error) {
      setPromotionState({
        status: "error",
        message: `삭제 실패: ${String((error as Error)?.message || error)}`,
      });
    }
  };

  return (
    <MessagePrimitive.Root className="aui-message assistant">
      <div className="aui-message-label">GLM</div>
      <div className="aui-bubble assistant">
        <MessagePrimitive.Parts />
        <MessagePrimitive.Error>
          <ErrorPrimitive.Root className="aui-error">
            <ErrorPrimitive.Message />
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
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
    </MessagePrimitive.Root>
  );
}
