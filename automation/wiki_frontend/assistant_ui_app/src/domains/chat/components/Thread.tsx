import { ThreadPrimitive, useThread, useThreadRuntime } from "@assistant-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SkillCatalogItem } from "../api/chatWorkspaceApi";
import type { ChatContext } from "../constants";
import type { ChatWorkspaceState } from "../hooks/useChatWorkspace";
import { Composer } from "./Composer";
import { MessageView, type AssistantEvidenceRecord } from "./Messages";
import { Welcome } from "./Welcome";

type ThreadProps = {
  chatContext: ChatContext;
  workspace: ChatWorkspaceState;
  orchestration: Record<string, any>;
  onOpenWikiPage: (path: string) => void;
};

const FALLBACK_SKILLS: SkillCatalogItem[] = [
  { id: "paperclip", name: "Paperclip" },
  { id: "wiki-graph", name: "Wiki Graph" },
  { id: "evidence-log", name: "Evidence Log" },
  { id: "drive-files", name: "Drive Files" },
];

type RetrievedEvidenceItem = {
  title?: string;
  path?: string;
  docKind?: string;
  priorityReason?: string;
  retrievalSource?: string;
  graphHops?: number;
};

function evidenceStorageKey(projectId: string) {
  return `assistant-ui:evidence-map:${projectId}`;
}

function sanitizeEvidenceRecord(value: unknown): AssistantEvidenceRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? record.items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const evidenceItem = item as Record<string, unknown>;
        const path = typeof evidenceItem.path === "string" ? evidenceItem.path : "";
        if (!path) return null;
        return {
          title: typeof evidenceItem.title === "string" ? evidenceItem.title : path,
          path,
          docKind: typeof evidenceItem.docKind === "string" ? evidenceItem.docKind : "",
          priorityReason: typeof evidenceItem.priorityReason === "string" ? evidenceItem.priorityReason : "",
          retrievalSource: typeof evidenceItem.retrievalSource === "string" ? evidenceItem.retrievalSource : "",
          graphHops: typeof evidenceItem.graphHops === "number" ? evidenceItem.graphHops : undefined,
        };
      })
      .filter(Boolean)
    : [];
  if (!items.length) return null;
  return {
    runId: typeof record.runId === "string" ? record.runId : "",
    query: typeof record.query === "string" ? record.query : "",
    items: items as AssistantEvidenceRecord["items"],
    savedAt: typeof record.savedAt === "string" ? record.savedAt : "",
  };
}

function readEvidenceMap(projectId: string) {
  if (!projectId || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(evidenceStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([messageId, value]) => [messageId, sanitizeEvidenceRecord(value)])
        .filter((entry): entry is [string, AssistantEvidenceRecord] => Boolean(entry[1])),
    );
  } catch {
    return {};
  }
}

function writeEvidenceMap(projectId: string, value: Record<string, AssistantEvidenceRecord>) {
  if (!projectId || typeof window === "undefined") return;
  window.localStorage.setItem(evidenceStorageKey(projectId), JSON.stringify(value));
}

export function Thread({ chatContext, workspace, orchestration, onOpenWikiPage }: ThreadProps) {
  const messageCount = useThread((state: any) => state.messages.length);
  const isEmpty = messageCount === 0;
  const skills = workspace.skills.length ? workspace.skills : FALLBACK_SKILLS;
  const [evidenceMap, setEvidenceMap] = useState<Record<string, AssistantEvidenceRecord>>({});

  useEffect(() => {
    setEvidenceMap(readEvidenceMap(workspace.activeProjectId));
  }, [workspace.activeProjectId]);

  useEffect(() => {
    const projectId = workspace.activeProject?.id || workspace.activeProjectId;
    const assistantIds = new Set(
      (workspace.activeProject?.messages || [])
        .filter((message) => message.role === "assistant" && message.id)
        .map((message) => String(message.id)),
    );
    if (!projectId) return;
    setEvidenceMap((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([messageId]) => assistantIds.has(messageId)),
      );
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      writeEvidenceMap(projectId, next);
      return next;
    });
  }, [workspace.activeProject?.id, workspace.activeProject?.messages, workspace.activeProjectId]);

  useEffect(() => {
    const projectId = workspace.activeProject?.id || workspace.activeProjectId;
    const assistantMessageId = String(orchestration.done?.messages?.assistant?.id || "");
    const runId = String(orchestration.done?.runId || orchestration.runId || "");
    const evidenceItems = ((orchestration.retrieval?.finalEvidence || []) as RetrievedEvidenceItem[])
      .filter((item) => item?.path)
      .slice(0, 6)
      .map((item) => ({
        title: item.title || item.path || "",
        path: item.path || "",
        docKind: item.docKind || "",
        priorityReason: item.priorityReason || "",
        retrievalSource: item.retrievalSource || "",
        graphHops: item.graphHops,
      }));
    if (!projectId || !assistantMessageId || !runId || !evidenceItems.length) return;
    const nextRecord: AssistantEvidenceRecord = {
      runId,
      query: String(orchestration.query || ""),
      items: evidenceItems,
      savedAt: new Date().toISOString(),
    };
    const nextSerialized = JSON.stringify(nextRecord);
    setEvidenceMap((current) => {
      if (JSON.stringify(current[assistantMessageId] || null) === nextSerialized) return current;
      const next = { ...current, [assistantMessageId]: nextRecord };
      writeEvidenceMap(projectId, next);
      return next;
    });
  }, [
    orchestration.done?.messages?.assistant?.id,
    orchestration.done?.runId,
    orchestration.done,
    orchestration.query,
    orchestration.runId,
    orchestration.retrieval?.finalEvidence,
    workspace.activeProjectId,
    workspace.activeProject?.id,
  ]);

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
                    evidenceRecord={evidenceMap}
                    onOpenWikiPage={onOpenWikiPage}
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
