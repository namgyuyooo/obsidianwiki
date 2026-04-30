import type { ChatProject } from "../api/chatWorkspaceApi";
import type { ReactNode } from "react";

type OrchestrationPanelProps = {
  data: Record<string, any>;
  activeProject: ChatProject | null;
};

function sectionCount(label: string, count: number | undefined) {
  if (!count) return label;
  return `${label} ${count}건`;
}

function listOrFallback(items: readonly any[] | undefined, renderItem: (item: any, index: number) => ReactNode, empty: string) {
  if (!items?.length) return <p className="aui-orch-empty">{empty}</p>;
  return <div className="aui-orch-list">{items.map(renderItem)}</div>;
}

export function OrchestrationPanel({ data, activeProject }: OrchestrationPanelProps) {
  const retrieval = data.retrieval || {};
  const validation = data.validation || {};
  const paperclip = data.paperclip || {};
  const projectBinding = data.projectBinding || {};
  const status = data.status || {};
  const activeBinding = projectBinding.linkedWikiProject
    || projectBinding.linkedProjectContext
    || activeProject?.linkedWikiProject
    || null;
  const activeRelatedPages = projectBinding.linkedProjectContext?.relatedPages || [];

  return (
    <aside className="aui-chat-orchestration-panel" aria-label="chat orchestration rail">
      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>Run Status</span>
          <strong>{status.phase || "대기"}</strong>
        </div>
        <div className="aui-orch-kv">
          <div>
            <span>질문</span>
            <strong>{data.query || "아직 실행 없음"}</strong>
          </div>
          <div>
            <span>모델</span>
            <strong>{status.model || data.done?.model || "-"}</strong>
          </div>
          <div>
            <span>엔드포인트</span>
            <strong>{status.endpoint || data.done?.endpoint || "-"}</strong>
          </div>
          <div>
            <span>컨텍스트 모드</span>
            <strong>{retrieval.mode || status.profile || "-"}</strong>
          </div>
        </div>
      </section>

      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>Project Binding</span>
          <strong>{activeBinding?.projectLabel || activeBinding?.projectKey || "연결 없음"}</strong>
        </div>
        <p className="aui-orch-note">{activeBinding?.path || "현재 챗이 우선 참조하는 위키 프로젝트 범위가 아직 명시되지 않았습니다."}</p>
        {listOrFallback(
          activeRelatedPages,
          (page, index) => (
            <article className="aui-orch-item" key={`${page.path || page.title}-${index}`}>
              <strong>{page.title || page.path}</strong>
              <span>{page.docKind || "page"} · {page.path || "-"}</span>
            </article>
          ),
          "연결된 위키 페이지 정보가 아직 없습니다.",
        )}
      </section>

      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>Retrieval</span>
          <strong>{sectionCount("근거", retrieval.finalEvidence?.length)}</strong>
        </div>
        <div className="aui-orch-metrics">
          <span>BM25 {retrieval.sparseHits?.length || 0}</span>
          <span>Graph {retrieval.graphExpandedHits?.length || 0}</span>
          <span>Final {retrieval.finalEvidence?.length || 0}</span>
        </div>
        {listOrFallback(
          retrieval.finalEvidence,
          (item, index) => (
            <article className="aui-orch-item" key={`${item.path}-${index}`}>
              <strong>{item.title || item.path}</strong>
              <span>{item.retrievalSource || "retrieval"} · {item.docKind || "doc"}{item.graphHops ? ` · ${item.graphHops} hop` : ""}</span>
              {item.priorityReason ? <small>{item.priorityReason}</small> : null}
            </article>
          ),
          "최종 채택 근거가 아직 없습니다.",
        )}
      </section>

      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>Validation</span>
          <strong>{(validation.coverageWarnings?.length || 0) + (validation.conflictHotspots?.length || 0)}건</strong>
        </div>
        {listOrFallback(
          validation.coverageWarnings,
          (item, index) => (
            <article className="aui-orch-item warning" key={`warning-${index}`}>
              <strong>근거 범위 경고</strong>
              <span>{String(item)}</span>
            </article>
          ),
          "근거 범위 경고 없음",
        )}
        {listOrFallback(
          validation.conflictHotspots,
          (item, index) => (
            <article className="aui-orch-item danger" key={`${item.path || index}`}>
              <strong>{item.title || item.path || "충돌 후보"}</strong>
              <span>{item.path || "-"}</span>
              {item.conflicts?.length ? <small>{item.conflicts.join(" / ")}</small> : null}
            </article>
          ),
          "충돌 hotspot 없음",
        )}
      </section>

      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>Paperclip</span>
          <strong>{paperclip.route?.mode || paperclip.agentMode || "idle"}</strong>
        </div>
        <div className="aui-orch-metrics">
          <span>Auto run {paperclip.autoRuns?.length || 0}</span>
          <span>Draft {paperclip.agentDrafts?.length || 0}</span>
          <span>Blocked {paperclip.blockedActions?.length || 0}</span>
        </div>
        {listOrFallback(
          paperclip.autoRuns?.length ? paperclip.autoRuns : paperclip.agentDrafts,
          (item, index) => (
            <article className="aui-orch-item" key={`${item.id || item.templateId || index}`}>
              <strong>{item.title || item.templateId || item.agent || "Paperclip task"}</strong>
              <span>{item.agent || "-"} · {item.status || item.approval || "pending"}</span>
            </article>
          ),
          "이번 턴에서 실행되거나 제안된 Paperclip 작업이 없습니다.",
        )}
      </section>
    </aside>
  );
}
