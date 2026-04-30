import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import type { ReactNode } from "react";
import { createGlmChatModelAdapter, type ChatStreamEvent } from "../api/glmChatApi";
import type { ChatContext } from "../constants";
import { WikiAttachmentAdapter } from "./WikiAttachmentAdapter";

type RuntimeProviderProps = {
  chatContext: ChatContext;
  onStreamEvent?: (event: ChatStreamEvent) => void;
  children: ReactNode;
};

export function RuntimeProvider({ chatContext, onStreamEvent, children }: RuntimeProviderProps) {
  const runtime = useLocalRuntime(createGlmChatModelAdapter(chatContext, { onEvent: onStreamEvent }), {
    adapters: {
      attachments: new WikiAttachmentAdapter(),
    },
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
