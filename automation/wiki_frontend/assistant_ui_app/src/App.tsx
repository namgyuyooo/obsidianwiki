import { RuntimeProvider } from "./domains/chat/runtime/RuntimeProvider";
import { AssistantShell } from "./domains/chat/components/AssistantShell";
import { Thread } from "./domains/chat/components/Thread";
import { readChatContextFromUrl } from "./domains/chat/constants";
import { useChatWorkspace } from "./domains/chat/hooks/useChatWorkspace";
import { DecisionDeck } from "./domains/decisions/components/DecisionDeck";
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
import { useEffect, useRef, useState } from "react";
import type { ChatStreamEvent } from "./domains/chat/api/glmChatApi";

function readSurfaceFromUrl() {
  return normalizeSurfaceId(new URLSearchParams(window.location.search).get("surface") || "chat");
}

function nextSurfaceUrl(surface: SurfaceId) {
  const url = new URL(window.location.href);
  if (surface === "chat") {
    url.searchParams.delete("surface");
  } else {
    url.searchParams.set("surface", surface);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function ProductFrame({
  activeSurface,
  onPrimaryChange,
  onSurfaceChange,
  children,
}: {
  activeSurface: SurfaceId;
  onPrimaryChange: (surface: PrimarySurfaceId) => void;
  onSurfaceChange: (surface: SurfaceId) => void;
  children: ReactNode;
}) {
  const surfaceDefinition = getSurfaceDefinition(activeSurface);
  const primaryDefinition = getPrimarySurfaceDefinition(surfaceDefinition.primary);
  const activeSubSurfaces = getSurfacesByPrimary(surfaceDefinition.primary);
  const statusLabel = (status: "live" | "scaffold" | "fallback") => {
    if (status === "live") return "사용 가능";
    if (status === "scaffold") return "부분 구현";
    return "레거시 fallback";
  };

  return (
    <div className="aui-product-frame">
      <header className="aui-product-nav" aria-label="assistant-ui primary surfaces">
        <div className="aui-product-mainbar">
          <div className="aui-product-title">
            <strong>Wiki Ops</strong>
            <span>{primaryDefinition.label} · assistant-ui control plane</span>
          </div>
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
      <div className="aui-product-body">{children}</div>
    </div>
  );
}

export function App() {
  const [surface, setSurface] = useState<SurfaceId>(() => readSurfaceFromUrl());
  const [orchestration, setOrchestration] = useState<Record<string, any>>({});
  const lastReloadedDoneRef = useRef("");
  const initialChatContext = readChatContextFromUrl();
  const workspace = useChatWorkspace(initialChatContext);
  const chatContext = {
    ...initialChatContext,
    projectId: workspace.activeProjectId || initialChatContext.projectId,
    skillTags: workspace.selectedSkillTags,
  };

  useEffect(() => {
    const syncSurfaceFromHistory = () => setSurface(readSurfaceFromUrl());
    window.addEventListener("popstate", syncSurfaceFromHistory);
    return () => window.removeEventListener("popstate", syncSurfaceFromHistory);
  }, []);

  const selectSurface = (nextSurface: SurfaceId) => {
    window.history.pushState(null, "", nextSurfaceUrl(nextSurface));
    setSurface(nextSurface);
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
      if (event.type === "run-start") {
        return {
          ...current,
          query: event.message,
          status: { phase: "context_building" },
          retrieval: current.retrieval || null,
          validation: current.validation || null,
          paperclip: current.paperclip || null,
          projectBinding: current.projectBinding || null,
          done: null,
          error: null,
          updatedAt: Date.now(),
        };
      }
      if (event.type === "status") {
        return { ...current, status: event.payload, updatedAt: Date.now() };
      }
      if (event.type === "retrieval") {
        return { ...current, retrieval: event.payload, updatedAt: Date.now() };
      }
      if (event.type === "validation") {
        return { ...current, validation: event.payload, updatedAt: Date.now() };
      }
      if (event.type === "paperclip") {
        return { ...current, paperclip: event.payload, updatedAt: Date.now() };
      }
      if (event.type === "project_binding") {
        return { ...current, projectBinding: event.payload, updatedAt: Date.now() };
      }
      if (event.type === "done") {
        return {
          ...current,
          done: event.payload,
          status: { ...(current.status || {}), phase: event.payload.status || "completed" },
          updatedAt: Date.now(),
        };
      }
      if (event.type === "error") {
        return {
          ...current,
          error: event.payload,
          status: { ...(current.status || {}), phase: "error" },
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
    if (surface === "paperclip") return <PaperclipStudio chatContext={chatContext} />;
    if (surface === "wiki") return <WikiWorkspace chatContext={chatContext} />;
    if (surface !== "chat") return <SurfaceMigrationFallback surface={getSurfaceDefinition(surface)} />;
    return (
      <div className="aui-runtime-boundary" key={`${chatContext.workspace}:${chatContext.projectId}`}>
        <RuntimeProvider chatContext={chatContext} onStreamEvent={handleStreamEvent}>
          <AssistantShell chatContext={chatContext} workspace={workspace} orchestration={orchestration}>
            <Thread chatContext={chatContext} workspace={workspace} />
          </AssistantShell>
        </RuntimeProvider>
      </div>
    );
  })();

  return (
    <ProductFrame activeSurface={surface} onPrimaryChange={selectPrimarySurface} onSurfaceChange={selectSurface}>
      {content}
    </ProductFrame>
  );
}
