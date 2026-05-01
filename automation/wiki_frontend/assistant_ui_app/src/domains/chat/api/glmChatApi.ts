import type { ChatModelAdapter, ChatModelRunResult } from "@assistant-ui/react";
import { CHAT_API_ENDPOINTS, type ChatContext } from "../constants";

type AssistantMessagePart = {
  type?: string;
  text?: string;
};

type AssistantMessage = {
  role?: string;
  content?: readonly AssistantMessagePart[];
};

export type ChatStreamEvent =
  | { type: "run-start"; message: string }
  | { type: "status"; payload: Record<string, unknown> }
  | { type: "retrieval"; payload: Record<string, unknown> | null }
  | { type: "validation"; payload: Record<string, unknown> | null }
  | { type: "paperclip"; payload: Record<string, unknown> | null }
  | { type: "project_binding"; payload: Record<string, unknown> | null }
  | { type: "done"; payload: Record<string, unknown> }
  | { type: "error"; payload: Record<string, unknown> };

type StreamObserver = {
  onEvent?: (event: ChatStreamEvent) => void;
};

function textFromParts(parts: readonly AssistantMessagePart[] = []) {
  return parts
    .filter((part) => part?.type === "text")
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function lastUserPayload(messages: readonly AssistantMessage[] = []) {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser) return "";
  return textFromParts(lastUser.content || []);
}

async function* streamGlmChat(
  message: string,
  chatContext: ChatContext,
  observer?: StreamObserver,
  signal?: AbortSignal,
): AsyncGenerator<ChatModelRunResult, void> {
  observer?.onEvent?.({ type: "run-start", message });
  const response = await fetch(CHAT_API_ENDPOINTS.stream, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      projectId: chatContext.projectId,
      workspace: chatContext.workspace,
      skillTags: chatContext.skillTags,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let accumulatedText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const streamEvent = parseServerSentEvent(chunk);
      if (!streamEvent) continue;

      if (streamEvent.event === "delta" && streamEvent.payload.content) {
        accumulatedText += streamEvent.payload.content;
        yield { content: [{ type: "text" as const, text: accumulatedText }] };
      }

      if (streamEvent.event === "status") {
        observer?.onEvent?.({ type: "status", payload: streamEvent.payload });
      }

      if (streamEvent.event === "retrieval") {
        observer?.onEvent?.({
          type: "retrieval",
          payload: streamEvent.payload.retrieval
            ? {
              ...streamEvent.payload.retrieval,
              retrievalMeta: streamEvent.payload.retrievalMeta || null,
              runId: streamEvent.payload.runId || "",
            }
            : null,
        });
      }

      if (streamEvent.event === "validation") {
        observer?.onEvent?.({
          type: "validation",
          payload: streamEvent.payload.validation
            ? { ...streamEvent.payload.validation, runId: streamEvent.payload.runId || "" }
            : null,
        });
      }

      if (streamEvent.event === "paperclip") {
        observer?.onEvent?.({
          type: "paperclip",
          payload: streamEvent.payload.paperclip
            ? { ...streamEvent.payload.paperclip, runId: streamEvent.payload.runId || "" }
            : null,
        });
      }

      if (streamEvent.event === "project_binding") {
        observer?.onEvent?.({
          type: "project_binding",
          payload: streamEvent.payload.projectBinding
            ? { ...streamEvent.payload.projectBinding, runId: streamEvent.payload.runId || "" }
            : null,
        });
      }

      if (streamEvent.event === "done") {
        observer?.onEvent?.({ type: "done", payload: streamEvent.payload });
        const finalText = streamEvent.payload.messages?.assistant?.content || accumulatedText || streamEvent.payload.message || "";
        yield { content: [{ type: "text" as const, text: finalText }] };
      }

      if (streamEvent.event === "error") {
        observer?.onEvent?.({ type: "error", payload: streamEvent.payload });
        throw new Error(streamEvent.payload.error || "GLM 스트리밍 실패");
      }
    }
  }
}

function parseServerSentEvent(chunk: string) {
  const lines = chunk.split("\n");
  let event = "";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  if (!dataLines.length) return null;

  return {
    event,
    payload: JSON.parse(dataLines.join("\n")),
  };
}

export function createGlmChatModelAdapter(chatContext: ChatContext, observer?: StreamObserver): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const message = lastUserPayload(messages as unknown as readonly AssistantMessage[]);
      for await (const update of streamGlmChat(message, chatContext, observer, abortSignal)) {
        yield update;
      }
    },
  };
}
