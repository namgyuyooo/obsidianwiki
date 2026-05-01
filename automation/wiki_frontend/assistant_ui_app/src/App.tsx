import { RuntimeProvider } from "./domains/chat/runtime/RuntimeProvider";
import { AssistantShell } from "./domains/chat/components/AssistantShell";
import { Thread } from "./domains/chat/components/Thread";
import { CentralStatus } from "./components/surface/CentralStatus";
import { readChatContextFromUrl } from "./domains/chat/constants";
import { useChatWorkspace } from "./domains/chat/hooks/useChatWorkspace";
import { DecisionDeck } from "./domains/decisions/components/DecisionDeck";
import { IngestWorkbench } from "./domains/ingest/components/IngestWorkbench";
import { MissionControl } from "./domains/mission/components/MissionControl";
import { OperationsControlPlane } from "./domains/mission/components/OperationsControlPlane";
import { PipelineCockpit } from "./domains/mission/components/PipelineCockpit";
import { SpotliteBoard } from "./domains/mission/components/SpotliteBoard";
import { PaperclipStudio } from "./domains/paperclip/components/PaperclipStudio";
import { WikiWorkspace } from "./domains/wiki/components/WikiWorkspace";
import { SurfaceMigrationFallback } from "./surfaces/SurfaceMigrationFallback";
import {
  getPrimarySurfaceDefinition,
  getSurfaceDefinition,
  getSurfacesByPrimary,
  normalizeSurfaceId,
  PRIMARY_SURFACES,
  type PrimarySurfaceId,
  type SurfaceId,
} from "./surfaces/surfaceRegistry";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatStreamEvent } from "./domains/chat/api/glmChatApi";
import { queueChatSurfaceHandoff, surfaceScope } from "./shared/surfaceHandoff";

function readSurfaceFromUrl() {
  return normalizeSurfaceId(new URLSearchParams(window.location.search).get("surface") || "chat");
}

function nextSurfaceUrl(surface: SurfaceId, options?: { paperclipTaskId?: string; paperclipRunId?: string; wikiPath?: string }) {
  const url = new URL(window.location.href);
  if (surface === "chat") {
    url.searchParams.delete("surface");
  } else {
    url.searchParams.set("surface", surface);
  }
  if (surface === "paperclip") {
    if (options?.paperclipTaskId) url.searchParams.set("paperclipTaskId", options.paperclipTaskId);
    else url.searchParams.delete("paperclipTaskId");
    if (options?.paperclipRunId) url.searchParams.set("paperclipRunId", options.paperclipRunId);
    else url.searchParams.delete("paperclipRunId");
  } else {
    url.searchParams.delete("paperclipTaskId");
    url.searchParams.delete("paperclipRunId");
  }
  if (surface === "wiki" && options?.wikiPath) {
    url.searchParams.set("wikiPath", options.wikiPath);
  } else if (surface !== "wiki") {
    url.searchParams.delete("wikiPath");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function eventRunId(event: ChatStreamEvent) {
  if (!("payload" in event) || !event.payload || typeof event.payload !== "object") return "";
  return String((event.payload as Record<string, unknown>).runId || "");
}

function ProductFrame({
  activeSurface,
  onPrimaryChange,
  onSurfaceChange,
  workspaceLabel,
  projectId,
  projectName,
  orchestration,
  onOpenPaperclip,
  onOpenMission,
  children,
}: {
  activeSurface: SurfaceId;
  onPrimaryChange: (surface: PrimarySurfaceId) => void;
  onSurfaceChange: (surface: SurfaceId) => void;
  workspaceLabel: string;
  projectId: string;
  projectName?: string;
  orchestration?: Record<string, any>;
  onOpenPaperclip: (taskId?: string, runId?: string) => void;
  onOpenMission: () => void;
  children: ReactNode;
}) {
  const surfaceDefinition = getSurfaceDefinition(activeSurface);
  const primaryDefinition = getPrimarySurfaceDefinition(surfaceDefinition.primary);
  const activeSubSurfaces = getSurfacesByPrimary(surfaceDefinition.primary);
  const surfaceCounts = activeSubSurfaces.reduce((counts, surface) => ({
    ...counts,
    [surface.status]: counts[surface.status] + 1,
  }), { live: 0, scaffold: 0, fallback: 0 });
  const statusLabel = (status: "live" | "scaffold" | "fallback") => {
    if (status === "live") return "사용 가능";
    if (status === "scaffold") return "부분 구현";
    return "레거시 fallback";
  };

  return (
    <div className="aui-product-frame">
      <header className="aui-product-nav" aria-label="workspace primary surfaces">
        <div className="aui-product-systembar" aria-label="workspace context">
          <div className="aui-product-suite-id">
            <span>WORKSPACE</span>
            <strong>{workspaceLabel.toUpperCase()}</strong>
            <small className="aui-product-suite-meta">{primaryDefinition.label} / {surfaceDefinition.label}</small>
          </div>
        </div>
        <div className="aui-product-mainbar">
          <nav className="aui-product-tabs">
            {PRIMARY_SURFACES.map((tab) => (
              <button
                className={`aui-product-tab ${tab.id === surfaceDefinition.primary ? "active" : ""}`}
                key={tab.id}
                onClick={() => onPrimaryChange(tab.id)}
                type="button"
              >
                <strong>{tab.label}</strong>
                <span>{tab.description}</span>
              </button>
            ))}
          </nav>
        </div>
        <nav className="aui-product-subtabs" aria-label={`${primaryDefinition.label} sub-surfaces`}>
          {activeSubSurfaces.map((surface) => (
            <button
              className={`aui-product-subtab ${surface.id === activeSurface ? "active" : ""} ${surface.status}`}
              key={surface.id}
              onClick={() => onSurfaceChange(surface.id)}
              type="button"
              title={`${surface.label} · ${statusLabel(surface.status)}`}
            >
              <strong>{surface.shortLabel}</strong>
              <span>{statusLabel(surface.status)}</span>
            </button>
          ))}
        </nav>
      </header>
      <CentralStatus
        onOpenMission={onOpenMission}
        onOpenPaperclip={onOpenPaperclip}
        orchestration={orchestration}
        projectId={projectId}
        projectName={projectName}
      />
      <div className="aui-product-body">{children}</div>
    </div>
  );
}

export function App() {
  const [surface, setSurface] = useState<SurfaceId>(() => readSurfaceFromUrl());
  const [orchestration, setOrchestration] = useState<Record<string, any>>({});
  const lastReloadedDoneRef = useRef("");
  const initialChatContext = useMemo(() => readChatContextFromUrl(), []);
  const workspace = useChatWorkspace(initialChatContext);
  const chatContext = useMemo(() => ({
    ...initialChatContext,
    projectId: workspace.activeProjectId || initialChatContext.projectId,
    skillTags: workspace.selectedSkillTags,
  }), [initialChatContext, workspace.activeProjectId, workspace.selectedSkillTags]);

  useEffect(() => {
    const syncSurfaceFromHistory = () => setSurface(readSurfaceFromUrl());
    window.addEventListener("popstate", syncSurfaceFromHistory);
    return () => window.removeEventListener("popstate", syncSurfaceFromHistory);
  }, []);

  const selectSurface = (nextSurface: SurfaceId) => {
    window.history.pushState(null, "", nextSurfaceUrl(nextSurface));
    setSurface(nextSurface);
  };

  const openPaperclipWithFocus = (taskId?: string, runId?: string) => {
    window.history.pushState(null, "", nextSurfaceUrl("paperclip", { paperclipTaskId: taskId, paperclipRunId: runId }));
    setSurface("paperclip");
  };

  const openWikiWithFocus = (path: string) => {
    if (!path) return;
    window.history.pushState(null, "", nextSurfaceUrl("wiki", { wikiPath: path }));
    setSurface("wiki");
  };

  const openChatSurface = () => {
    window.history.pushState(null, "", nextSurfaceUrl("chat"));
    setSurface("chat");
  };

  const openChatWithDraft = (text: string) => {
    if (!text.trim()) return;
    queueChatSurfaceHandoff(surfaceScope(chatContext.projectId, chatContext.workspace), {
      text,
      mode: "replace",
    });
    openChatSurface();
  };

  const selectPrimarySurface = (primary: PrimarySurfaceId) => {
    selectSurface(getPrimarySurfaceDefinition(primary).defaultSurfaceId);
  };

  useEffect(() => {
    setOrchestration({});
  }, [chatContext.projectId, chatContext.workspace]);

  useEffect(() => {
    const doneKey = JSON.stringify(orchestration.done || null);
    if (!orchestration.done || !chatContext.projectId || lastReloadedDoneRef.current === doneKey) return;
    lastReloadedDoneRef.current = doneKey;
    void workspace.reload(chatContext.projectId);
  }, [chatContext.projectId, orchestration.done, workspace.reload]);

  const handleStreamEvent = (event: ChatStreamEvent) => {
    setOrchestration((current) => {
      const nextEvents = [
        ...(current.events || []),
        {
          type: event.type,
          payload: "payload" in event ? event.payload : { message: event.message },
          createdAt: new Date().toISOString(),
        },
      ].slice(-80);
      const nextRunId = eventRunId(event) || current.runId || null;
      if (event.type === "run-start") {
        return {
          ...current,
          query: event.message,
          runId: null,
          status: { phase: "context_building" },
          retrieval: current.retrieval || null,
          validation: current.validation || null,
          paperclip: current.paperclip || null,
          projectBinding: current.projectBinding || null,
          done: null,
          error: null,
          events: [{
            type: event.type,
            payload: { message: event.message },
            createdAt: new Date().toISOString(),
          }],
          updatedAt: Date.now(),
        };
      }
      if (event.type === "status") {
        return { ...current, runId: nextRunId, status: event.payload, events: nextEvents, updatedAt: Date.now() };
      }
      if (event.type === "retrieval") {
        return { ...current, runId: nextRunId, retrieval: event.payload, events: nextEvents, updatedAt: Date.now() };
      }
      if (event.type === "validation") {
        return { ...current, runId: nextRunId, validation: event.payload, events: nextEvents, updatedAt: Date.now() };
      }
      if (event.type === "paperclip") {
        return { ...current, runId: nextRunId, paperclip: event.payload, events: nextEvents, updatedAt: Date.now() };
      }
      if (event.type === "project_binding") {
        return { ...current, runId: nextRunId, projectBinding: event.payload, events: nextEvents, updatedAt: Date.now() };
      }
      if (event.type === "done") {
        return {
          ...current,
          runId: nextRunId,
          done: event.payload,
          status: { ...(current.status || {}), phase: event.payload.status || "completed" },
          events: nextEvents,
          updatedAt: Date.now(),
        };
      }
      if (event.type === "error") {
        return {
          ...current,
          runId: nextRunId,
          error: event.payload,
          status: { ...(current.status || {}), phase: "error" },
          events: nextEvents,
          updatedAt: Date.now(),
        };
      }
      return current;
    });
  };

  const content = (() => {
    if (surface === "mission") return <MissionControl chatContext={chatContext} />;
    if (surface === "pipeline") return <PipelineCockpit chatContext={chatContext} />;
    if (surface === "operations") return <OperationsControlPlane chatContext={chatContext} />;
    if (surface === "spotlite") return <SpotliteBoard chatContext={chatContext} />;
    if (surface === "decisions") return <DecisionDeck chatContext={chatContext} />;
    if (surface === "ingest") return <IngestWorkbench chatContext={chatContext} />;
    if (surface === "paperclip") return <PaperclipStudio chatContext={chatContext} />;
    if (surface === "wiki") return <WikiWorkspace chatContext={chatContext} onOpenChatWithDraft={openChatWithDraft} onReturnToChat={openChatSurface} />;
    if (surface !== "chat") return <SurfaceMigrationFallback surface={getSurfaceDefinition(surface)} />;
    return (
      <div className="aui-runtime-boundary" key={`${chatContext.workspace}:${chatContext.projectId}`}>
        <RuntimeProvider chatContext={chatContext} onStreamEvent={handleStreamEvent}>
          <AssistantShell chatContext={chatContext} workspace={workspace} orchestration={orchestration} onOpenWikiPage={openWikiWithFocus}>
            <Thread
              chatContext={chatContext}
              onOpenWikiPage={openWikiWithFocus}
              orchestration={orchestration}
              workspace={workspace}
            />
          </AssistantShell>
        </RuntimeProvider>
      </div>
    );
  })();

  return (
    <ProductFrame
      activeSurface={surface}
      onPrimaryChange={selectPrimarySurface}
      onSurfaceChange={selectSurface}
      workspaceLabel={chatContext.workspace}
      projectId={chatContext.projectId}
      projectName={workspace.activeProject?.name || workspace.activeProject?.linkedWikiProject?.projectLabel || ""}
      orchestration={orchestration}
      onOpenMission={() => selectSurface("mission")}
      onOpenPaperclip={openPaperclipWithFocus}
    >
      {content}
    </ProductFrame>
  );
}
