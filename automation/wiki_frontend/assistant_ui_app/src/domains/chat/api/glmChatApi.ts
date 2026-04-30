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
  signal?: AbortSignal,
): AsyncGenerator<ChatModelRunResult, void> {
  const response = await fetch(CHAT_API_ENDPOINTS.stream, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      projectId: chatContext.projectId,
      workspace: chatContext.workspace,
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

      if (streamEvent.event === "done") {
        const finalText = streamEvent.payload.messages?.assistant?.content || accumulatedText || streamEvent.payload.message || "";
        yield { content: [{ type: "text" as const, text: finalText }] };
      }

      if (streamEvent.event === "error") {
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

export function createGlmChatModelAdapter(chatContext: ChatContext): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const message = lastUserPayload(messages as unknown as readonly AssistantMessage[]);
      for await (const update of streamGlmChat(message, chatContext, abortSignal)) {
        yield update;
      }
    },
  };
}
