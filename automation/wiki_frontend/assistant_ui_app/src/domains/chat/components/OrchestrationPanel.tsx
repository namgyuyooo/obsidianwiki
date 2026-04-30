import type { ChatProject } from "../api/chatWorkspaceApi";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type OrchestrationPanelProps = {
  data: Record<string, any>;
  activeProject: ChatProject | null;
};

const BROWSER_PATH_BLOCK_PATTERN = /\[파일브라우징 경로\]([\s\S]*?)\[\/파일브라우징 경로\]/;
const WIKI_PROJECT_MENTION_BLOCK_PATTERN = /\[위키프로젝트 멘션\]([\s\S]*?)\[\/위키프로젝트 멘션\]/g;

function summarizeQuery(rawQuery: string | undefined) {
  const text = String(rawQuery || "").trim();
  if (!text) return "아직 실행 없음";
  const match = text.match(BROWSER_PATH_BLOCK_PATTERN);
  const wikiMentionMatches = [...text.matchAll(WIKI_PROJECT_MENTION_BLOCK_PATTERN)];
  if (!match && !wikiMentionMatches.length) return text;

  const block = match?.[1] || "";
  const files = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- file:"))
    .map((line) => line.replace(/^- file:\s*/, "").trim())
    .filter(Boolean);
  const visibleFiles = files.slice(0, 3).join(", ");
  const suffix = files.length > 3 ? ` 외 ${files.length - 3}건` : "";
  const fileSummary = match ? `파일브라우징 선택 ${files.length}건${visibleFiles ? `: ${visibleFiles}${suffix}` : ""}` : "";
  const mentionedProjects = wikiMentionMatches
    .flatMap((item) => String(item[1] || "").split("\n"))
    .map((line) => line.trim().match(/project_label:\s*(.+)/)?.[1]?.trim())
    .filter(Boolean);
  const projectSummary = mentionedProjects.length ? `@프로젝트 ${mentionedProjects.slice(0, 3).join(", ")}${mentionedProjects.length > 3 ? ` 외 ${mentionedProjects.length - 3}건` : ""}` : "";
  const promptOnly = text
    .replace(BROWSER_PATH_BLOCK_PATTERN, "")
    .replace(WIKI_PROJECT_MENTION_BLOCK_PATTERN, "")
    .trim();
  return [promptOnly, fileSummary, projectSummary].filter(Boolean).join("\n");
}

function sectionCount(label: string, count: number | undefined) {
  if (!count) return label;
  return `${label} ${count}건`;
}

function listOrFallback(items: readonly any[] | undefined, renderItem: (item: any, index: number) => ReactNode, empty: string) {
  if (!items?.length) return <p className="aui-orch-empty">{empty}</p>;
  return <div className="aui-orch-list">{items.map(renderItem)}</div>;
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildThinkingSteps(input: {
  status: Record<string, any>;
  retrieval: Record<string, any>;
  validation: Record<string, any>;
  paperclip: Record<string, any>;
  projectBinding: Record<string, any>;
  activeProject: ChatProject | null;
}) {
  const { status, retrieval, validation, paperclip, projectBinding, activeProject } = input;
  const steps = [];
  const activeBinding = projectBinding.linkedWikiProject
    || projectBinding.linkedProjectContext
    || projectBinding.mentionedProjectContexts?.[0]
    || activeProject?.linkedWikiProject
    || null;

  steps.push({
    title: "질문 해석",
    body: status.phase === "context_building"
      ? "질문 의도를 해석하고 필요한 컨텍스트 범위를 정하는 중입니다."
      : "질문 의도 파악 단계가 완료되었거나 대기 중입니다.",
  });

  steps.push({
    title: "프로젝트 바인딩",
    body: activeBinding?.projectLabel
      ? `${activeBinding.projectLabel} 범위를 우선 참조 대상으로 사용합니다.`
      : "아직 연결된 우선 프로젝트 범위가 명시되지 않았습니다.",
  });

  if (retrieval.sparseHits?.length || retrieval.graphExpandedHits?.length || retrieval.finalEvidence?.length) {
    steps.push({
      title: "근거 검색과 압축",
      body: `BM25 ${retrieval.sparseHits?.length || 0}건, Graph ${retrieval.graphExpandedHits?.length || 0}건, 최종 채택 ${retrieval.finalEvidence?.length || 0}건으로 정리되었습니다.`,
    });
  }

  if (paperclip.route?.mode || paperclip.agentMode || paperclip.autoRuns?.length || paperclip.agentDrafts?.length) {
    steps.push({
      title: "스킬 오케스트레이션",
      body: `Paperclip 모드 ${paperclip.route?.mode || paperclip.agentMode || "idle"} 기준으로 자동 실행 ${paperclip.autoRuns?.length || 0}건, 초안 ${paperclip.agentDrafts?.length || 0}건을 판단했습니다.`,
    });
  }

  if (validation.coverageWarnings?.length || validation.conflictHotspots?.length) {
    steps.push({
      title: "검수와 충돌 확인",
      body: `근거 범위 경고 ${validation.coverageWarnings?.length || 0}건, 충돌 hotspot ${validation.conflictHotspots?.length || 0}건을 확인했습니다.`,
    });
  }

  steps.push({
    title: "응답 생성",
    body: ["completed", "stopped", "error"].includes(String(status.phase || ""))
      ? `현재 상태는 ${String(status.phase || "대기")}입니다.`
      : "근거를 조립한 뒤 최종 응답을 생성하는 중입니다.",
  });

  return steps;
}

export function OrchestrationPanel({ data, activeProject }: OrchestrationPanelProps) {
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [debugOpen, setDebugOpen] = useState(true);
  const retrieval = data.retrieval || {};
  const validation = data.validation || {};
  const paperclip = data.paperclip || {};
  const projectBinding = data.projectBinding || {};
  const status = data.status || {};
  const events = data.events || [];
  const activeBinding = projectBinding.linkedWikiProject
    || projectBinding.linkedProjectContext
    || projectBinding.mentionedProjectContexts?.[0]
    || activeProject?.linkedWikiProject
    || null;
  const mentionedProjectContexts = projectBinding.mentionedProjectContexts || [];
  const activeRelatedPages = projectBinding.linkedProjectContext?.relatedPages || mentionedProjectContexts[0]?.relatedPages || [];
  const displayQuery = summarizeQuery(data.query);
  const isRunning = Boolean(status.phase && !["completed", "error", "stopped"].includes(String(status.phase)));
  const thinkingSteps = useMemo(() => buildThinkingSteps({
    status,
    retrieval,
    validation,
    paperclip,
    projectBinding,
    activeProject,
  }), [activeProject, paperclip, projectBinding, retrieval, status, validation]);

  return (
    <aside className="aui-chat-orchestration-panel" aria-label="chat orchestration rail">
      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>Project Binding</span>
          <strong>{activeBinding?.projectLabel || activeBinding?.projectKey || "연결 없음"}</strong>
        </div>
        <p className="aui-orch-note">{activeBinding?.path || "현재 챗이 우선 참조하는 위키 프로젝트 범위가 아직 명시되지 않았습니다."}</p>
        {mentionedProjectContexts.length ? (
          <div className="aui-orch-metrics">
            <span>@Project {mentionedProjectContexts.length}</span>
            <span>{mentionedProjectContexts.map((item: any) => item.projectLabel || item.projectKey).slice(0, 2).join(", ")}</span>
          </div>
        ) : null}
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

      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>Thinking</span>
          <strong>{status.phase || "대기"}</strong>
        </div>
        <div className={`aui-orch-phase ${isRunning ? "running" : "idle"}`}>
          <span className="aui-orch-phase-dot" />
          <strong>{isRunning ? "추론 진행 중" : "대기 또는 종료"}</strong>
        </div>
        <details className="aui-thinking-panel" open={thinkingOpen} onToggle={(event) => setThinkingOpen((event.currentTarget as HTMLDetailsElement).open)}>
          <summary className="aui-thinking-summary">
            <span>Thinking steps</span>
            <strong>{thinkingOpen ? "닫기" : "열기"}</strong>
          </summary>
          <div className="aui-thinking-list">
            {thinkingSteps.map((step) => (
              <article className="aui-thinking-item" key={step.title}>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </details>
        <details className="aui-thinking-panel" open={debugOpen} onToggle={(event) => setDebugOpen((event.currentTarget as HTMLDetailsElement).open)}>
          <summary className="aui-thinking-summary">
            <span>Orchestration Debug</span>
            <strong>{debugOpen ? "닫기" : "열기"}</strong>
          </summary>
          <div className="aui-thinking-list">
            <article className="aui-thinking-item">
              <strong>이벤트 타임라인</strong>
              <div className="aui-orch-debug-list">
                {(events.length ? events : [{ type: "idle", createdAt: "", payload: "아직 이벤트 없음" }]).map((item: any, index: number) => (
                  <div className="aui-orch-debug-item" key={`${item.type}-${item.createdAt || index}`}>
                    <span>{item.type}</span>
                    <small>{item.createdAt ? item.createdAt.replace("T", " ").slice(0, 19) : "-"}</small>
                    <pre>{prettyJson(item.payload)}</pre>
                  </div>
                ))}
              </div>
            </article>
            <article className="aui-thinking-item">
              <strong>질문 / 모델 컨텍스트</strong>
              <pre className="aui-orch-raw">{prettyJson({
                query: displayQuery,
                model: status.model || data.done?.model || "-",
                endpoint: status.endpoint || data.done?.endpoint || "-",
                context_mode: retrieval.mode || status.profile || "-",
              })}</pre>
            </article>
            {[
              ["status", status],
              ["project_binding", projectBinding],
              ["retrieval", retrieval],
              ["validation", validation],
              ["paperclip", paperclip],
              ["done", data.done || null],
              ["error", data.error || null],
            ].map(([label, value]) => (
              <article className="aui-thinking-item" key={label}>
                <strong>{label}</strong>
                <pre className="aui-orch-raw">{prettyJson(value)}</pre>
              </article>
            ))}
          </div>
        </details>
      </section>
    </aside>
  );
}
