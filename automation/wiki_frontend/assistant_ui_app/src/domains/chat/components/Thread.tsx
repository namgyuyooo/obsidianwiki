import { ThreadPrimitive, useThread, useThreadRuntime } from "@assistant-ui/react";
import { useEffect, useMemo, useRef } from "react";
import type { SkillCatalogItem } from "../api/chatWorkspaceApi";
import type { ChatContext } from "../constants";
import type { ChatWorkspaceState } from "../hooks/useChatWorkspace";
import { Composer } from "./Composer";
import { MessageView } from "./Messages";
import { Welcome } from "./Welcome";

type ThreadProps = {
  chatContext: ChatContext;
  workspace: ChatWorkspaceState;
};

const FALLBACK_SKILLS: SkillCatalogItem[] = [
  { id: "paperclip", name: "Paperclip" },
  { id: "wiki-graph", name: "Wiki Graph" },
  { id: "evidence-log", name: "Evidence Log" },
  { id: "drive-files", name: "Drive Files" },
];

export function Thread({ chatContext, workspace }: ThreadProps) {
  const messageCount = useThread((state: any) => state.messages.length);
  const isEmpty = messageCount === 0;
  const skills = workspace.skills.length ? workspace.skills : FALLBACK_SKILLS;

  return (
    <ThreadPrimitive.Root className="aui-thread-root">
      <PersistedThreadHydrator workspace={workspace} />
      <ThreadPrimitive.Viewport className="aui-viewport" autoScroll>
        <div className="aui-viewport-inner">
          {isEmpty ? <Welcome /> : null}
          <div className="aui-message-stack">
            <ThreadPrimitive.Messages
              components={{
                Message: () => (
                  <MessageView
                    activeProject={workspace.activeProject}
                    onReloadProject={workspace.reload}
                  />
                ),
              }}
            />
          </div>
        </div>
      </ThreadPrimitive.Viewport>
      <div className="aui-footer aui-thread-composer">
        <Composer
          chatContext={chatContext}
          skills={skills}
          selectedSkillTags={workspace.selectedSkillTags}
          wikiProjectOptions={workspace.wikiProjectOptions}
          onSelectSkillTag={workspace.selectSkillTag}
          onRemoveSkillTag={workspace.removeSkillTag}
        />
      </div>
    </ThreadPrimitive.Root>
  );
}

function persistedMessagesSignature(workspace: ChatWorkspaceState) {
  const project = workspace.activeProject;
  if (!project) return `empty:${workspace.activeProjectId}`;
  return [
    project.id,
    ...(project.messages || []).map((message) => [
      message.id || "",
      message.role,
      message.createdAt || "",
      message.content,
    ].join(":")),
  ].join("|");
}

function PersistedThreadHydrator({ workspace }: { workspace: ChatWorkspaceState }) {
  const runtime = useThreadRuntime();
  const isRunning = useThread((state: any) => state.isRunning);
  const appliedSignatureRef = useRef("");
  const signature = useMemo(() => persistedMessagesSignature(workspace), [workspace]);
  const initialMessages = useMemo(() => {
    return (workspace.activeProject?.messages || []).map((message) => {
      const role = message.role === "assistant" ? "assistant" : "user";
      return {
        id: message.id,
        role,
        content: message.content,
        createdAt: message.createdAt ? new Date(message.createdAt) : undefined,
        ...(role === "assistant" ? { status: "complete" as const } : {}),
      };
    });
  }, [workspace.activeProject?.messages]);

  useEffect(() => {
    if (isRunning) return;
    if (appliedSignatureRef.current === signature) return;
    runtime.reset(initialMessages);
    appliedSignatureRef.current = signature;
  }, [initialMessages, isRunning, runtime, signature]);

  return null;
}
