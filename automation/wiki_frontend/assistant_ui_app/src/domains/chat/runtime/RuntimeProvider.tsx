import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import type { ReactNode } from "react";
import { createGlmChatModelAdapter } from "../api/glmChatApi";
import type { ChatContext } from "../constants";
import { WikiAttachmentAdapter } from "./WikiAttachmentAdapter";

type RuntimeProviderProps = {
  chatContext: ChatContext;
  children: ReactNode;
};

export function RuntimeProvider({ chatContext, children }: RuntimeProviderProps) {
  const runtime = useLocalRuntime(createGlmChatModelAdapter(chatContext), {
    adapters: {
      attachments: new WikiAttachmentAdapter(),
    },
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
