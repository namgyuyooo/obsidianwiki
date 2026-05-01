import type { ChatProject } from "../api/chatWorkspaceApi";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useThreadRuntime } from "@assistant-ui/react";
import { stopChatProjectRun } from "../api/chatWorkspaceApi";
import { fetchWikiPage, type WikiPagePayload } from "../../wiki/api/wikiApi";

type OrchestrationPanelProps = {
  data: Record<string, any>;
  activeProject: ChatProject | null;
  onOpenWikiPage: (path: string) => void;
};

const BROWSER_PATH_BLOCK_PATTERN = /\[파일브라우징 경로\]([\s\S]*?)\[\/파일브라우징 경로\]/;
const WIKI_PROJECT_MENTION_BLOCK_PATTERN = /\[위키프로젝트 멘션\]([\s\S]*?)\[\/위키프로젝트 멘션\]/g;
const RELATED_PAGE_LIMIT = 3;
const EVIDENCE_PREVIEW_LIMIT = 4;
const TASK_PREVIEW_LIMIT = 4;

type RelatedWikiPage = {
  title?: string;
  path: string;
  docKind?: string;
};

type PersistedDocumentWorkbench = {
  pinnedPages: RelatedWikiPage[];
  comparePages: RelatedWikiPage[];
};

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

function truncateText(value: string, limit = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}...`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function markdownPreview(markdown: string) {
  const lines = String(markdown || "").split("\n");
  const html: string[] = [];
  const paragraph: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let listMode: "ul" | "ol" | "" = "";

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };

  const closeList = () => {
    if (!listMode) return;
    html.push(`</${listMode}>`);
    listMode = "";
  };

  const openList = (mode: "ul" | "ol") => {
    if (listMode === mode) return;
    closeList();
    html.push(`<${mode}>`);
    listMode = mode;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flushParagraph();
      closeList();
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }
    if (!trimmed) {
      flushParagraph();
      closeList();
      return;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(3, heading[1].length);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      return;
    }
    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      openList("ul");
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      return;
    }
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      openList("ol");
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      return;
    }
    paragraph.push(trimmed);
  });

  if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  flushParagraph();
  closeList();
  return html.join("") || "<p>미리보기 내용이 없습니다.</p>";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightHtmlText(html: string, terms: string[]) {
  if (!terms.length) return html;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith("<") ? part : part.replace(pattern, "<mark>$1</mark>")))
    .join("");
}

function dedupePages(items: RelatedWikiPage[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item?.path || seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}

function documentWorkbenchStorageKey(scope: string) {
  return `assistant-ui:document-workbench:${scope}`;
}

function sanitizePersistedPages(items: unknown, limit: number) {
  if (!Array.isArray(items)) return [];
  return dedupePages(
    items
      .map((item) => ({
        title: typeof item?.title === "string" ? item.title : "",
        path: typeof item?.path === "string" ? item.path : "",
        docKind: typeof item?.docKind === "string" ? item.docKind : "",
      }))
      .filter((item) => item.path),
  ).slice(0, limit);
}

function readDocumentWorkbench(scope: string): PersistedDocumentWorkbench {
  if (!scope || typeof window === "undefined") return { pinnedPages: [], comparePages: [] };
  try {
    const raw = window.localStorage.getItem(documentWorkbenchStorageKey(scope));
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      pinnedPages: sanitizePersistedPages(parsed?.pinnedPages, 6),
      comparePages: sanitizePersistedPages(parsed?.comparePages, 2),
    };
  } catch {
    return { pinnedPages: [], comparePages: [] };
  }
}

function writeDocumentWorkbench(scope: string, value: PersistedDocumentWorkbench) {
  if (!scope || typeof window === "undefined") return;
  window.localStorage.setItem(documentWorkbenchStorageKey(scope), JSON.stringify({
    pinnedPages: sanitizePersistedPages(value.pinnedPages, 6),
    comparePages: sanitizePersistedPages(value.comparePages, 2),
  }));
}

function phaseLabel(phase: string) {
  if (!phase) return "대기";
  if (phase === "context_building") return "근거 조립 중";
  if (phase === "completed") return "응답 완료";
  if (phase === "stopped") return "중지됨";
  if (phase === "error") return "오류";
  return phase.replace(/_/g, " ");
}

function phaseSummary(phase: string) {
  if (phase === "context_building") return "질문에 맞는 프로젝트와 근거를 정리하고 있습니다.";
  if (phase === "completed") return "응답 생성이 끝났습니다. 필요하면 근거와 실행 로그를 확인할 수 있습니다.";
  if (phase === "stopped") return "실행이 중지되었습니다. 같은 요청을 다시 보낼 수 있습니다.";
  if (phase === "error") return "실행 중 오류가 발생했습니다. 디버그 영역에서 원인을 확인할 수 있습니다.";
  if (!phase) return "아직 실행 전입니다. 메시지를 보내면 필요한 근거를 묶어 답변합니다.";
  return `${phase.replace(/_/g, " ")} 단계입니다.`;
}

function guidanceSummary(input: {
  phase: string;
  evidenceCount: number;
  warningCount: number;
  conflictCount: number;
  taskCount: number;
}) {
  const { phase, evidenceCount, warningCount, conflictCount, taskCount } = input;
  if (phase === "completed" && !warningCount && !conflictCount) {
    return evidenceCount
      ? `핵심 근거 ${evidenceCount}건으로 응답을 마무리했습니다.`
      : "응답은 끝났지만 근거 채택 기록은 남지 않았습니다.";
  }
  if (warningCount || conflictCount) {
    return `확인할 이슈 ${warningCount + conflictCount}건이 있어 응답 전에 한 번 더 보는 편이 안전합니다.`;
  }
  if (phase === "context_building") {
    return taskCount
      ? `현재 작업 ${taskCount}건과 함께 근거를 조립하는 중입니다.`
      : "관련 근거를 모으는 중입니다.";
  }
  if (evidenceCount) return `현재까지 채택된 근거는 ${evidenceCount}건입니다.`;
  return "추가 확인 없이 바로 대화를 이어가면 됩니다.";
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

export function OrchestrationPanel({ data, activeProject, onOpenWikiPage }: OrchestrationPanelProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [executionOpen, setExecutionOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<RelatedWikiPage | null>(null);
  const [previewCollection, setPreviewCollection] = useState<RelatedWikiPage[]>([]);
  const [previewReasonMap, setPreviewReasonMap] = useState<Record<string, string>>({});
  const [previewPage, setPreviewPage] = useState<WikiPagePayload | null>(null);
  const [previewPhase, setPreviewPhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [previewMessage, setPreviewMessage] = useState("");
  const [pinnedPages, setPinnedPages] = useState<RelatedWikiPage[]>([]);
  const [comparePages, setComparePages] = useState<RelatedWikiPage[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePhase, setComparePhase] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [compareMessage, setCompareMessage] = useState("");
  const [comparePayloads, setComparePayloads] = useState<Record<string, WikiPagePayload | null>>({});
  const runtime = useThreadRuntime();
  const retrieval = data.retrieval || {};
  const validation = data.validation || {};
  const paperclip = data.paperclip || {};
  const projectBinding = data.projectBinding || {};
  const status = data.status || {};
  const events = data.events || [];
  const phase = String(status.phase || "");
  const activeBinding = projectBinding.linkedWikiProject
    || projectBinding.linkedProjectContext
    || projectBinding.mentionedProjectContexts?.[0]
    || activeProject?.linkedWikiProject
    || null;
  const persistenceScope = activeProject?.id || activeBinding?.projectKey || "";
  const mentionedProjectContexts = projectBinding.mentionedProjectContexts || [];
  const activeRelatedPages = useMemo(() => {
    const primaryRelatedPages = [
      ...(projectBinding.linkedProjectContext?.relatedPages || []),
      ...(mentionedProjectContexts[0]?.relatedPages || []),
    ];
    if (activeBinding?.path) {
      primaryRelatedPages.unshift({
        title: activeBinding.projectLabel || activeBinding.projectKey || activeBinding.path,
        path: activeBinding.path,
        docKind: "hub",
      });
    }
    return dedupePages(primaryRelatedPages).slice(0, RELATED_PAGE_LIMIT);
  }, [activeBinding?.path, activeBinding?.projectKey, activeBinding?.projectLabel, mentionedProjectContexts, projectBinding.linkedProjectContext?.relatedPages]);
  const displayQuery = summarizeQuery(data.query);
  const isRunning = Boolean(phase && !["completed", "error", "stopped"].includes(phase));
  const thinkingSteps = useMemo(() => buildThinkingSteps({
    status,
    retrieval,
    validation,
    paperclip,
    projectBinding,
    activeProject,
  }), [activeProject, paperclip, projectBinding, retrieval, status, validation]);
  const activeCheckpoint = paperclip.checkpoint || paperclip.triggeredTasks?.[0]?.checkpoint || paperclip.followupTask?.checkpoint || null;
  const actionableTasks = paperclip.triggeredTasks?.length ? paperclip.triggeredTasks : paperclip.recentProjectTasks;
  const evidencePreview = (retrieval.finalEvidence || []).slice(0, EVIDENCE_PREVIEW_LIMIT);
  const coverageWarnings = validation.coverageWarnings || [];
  const conflictHotspots = validation.conflictHotspots || [];
  const taskPreview = (actionableTasks || paperclip.autoRuns || paperclip.agentDrafts || []).slice(0, TASK_PREVIEW_LIMIT);
  const issueCount = coverageWarnings.length + conflictHotspots.length;
  const summaryItems = [
    { label: "연결 프로젝트", value: activeBinding?.projectLabel || "없음" },
    { label: "채택 근거", value: `${retrieval.finalEvidence?.length || 0}건` },
    { label: "확인 이슈", value: `${issueCount}건` },
  ];
  if (activeCheckpoint?.label || activeCheckpoint?.phase) {
    summaryItems.push({ label: "현재 체크포인트", value: activeCheckpoint.label || activeCheckpoint.phase || "-" });
  }
  const guideText = guidanceSummary({
    phase,
    evidenceCount: retrieval.finalEvidence?.length || 0,
    warningCount: coverageWarnings.length,
    conflictCount: conflictHotspots.length,
    taskCount: taskPreview.length,
  });
  const searchTerms = useMemo(() => (
    String(displayQuery || "")
      .replace(/\[[^\]]+\]/g, " ")
      .split(/[\s,./()]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
      .slice(0, 8)
  ), [displayQuery]);
  const previewHtml = useMemo(() => highlightHtmlText(markdownPreview(previewPage?.markdown || ""), searchTerms), [previewPage?.markdown, searchTerms]);
  const previewIndex = previewTarget ? previewCollection.findIndex((item) => item.path === previewTarget.path) : -1;
  const previewReason = previewTarget?.path ? previewReasonMap[previewTarget.path] || "" : "";
  const compareReady = comparePages.length === 2;
  const compareHtml = comparePages.map((page) => ({
    path: page.path,
    html: highlightHtmlText(markdownPreview(comparePayloads[page.path]?.markdown || ""), searchTerms),
  }));

  const reasonForPath = (path: string) => {
    const evidenceMatch = (retrieval.finalEvidence || []).find((item: any) => item?.path === path);
    if (evidenceMatch?.priorityReason) return String(evidenceMatch.priorityReason);
    if (evidenceMatch) return `${String(evidenceMatch.retrievalSource || "retrieval")} 근거로 채택된 문서입니다.`;
    if (activeRelatedPages.some((item) => item?.path === path)) return "연결 프로젝트 범위에서 직접 연결된 관련 문서입니다.";
    return "";
  };

  const reasonMapForPages = (items: RelatedWikiPage[]) => Object.fromEntries(
    items
      .filter((item) => item?.path)
      .map((item) => [item.path, reasonForPath(item.path)]),
  );

  const openRelatedPagePreview = async (page: RelatedWikiPage, collection?: RelatedWikiPage[]) => {
    if (!page?.path) return;
    const nextCollection = dedupePages(collection || [page]);
    setPreviewTarget(page);
    setPreviewCollection(nextCollection);
    setPreviewReasonMap(reasonMapForPages(nextCollection));
    setPreviewPage(null);
    setPreviewPhase("loading");
    setPreviewMessage("문서 내용을 불러오는 중입니다.");
    try {
      const nextPage = await fetchWikiPage(page.path);
      setPreviewPage(nextPage);
      setPreviewPhase("ready");
      setPreviewMessage(nextPage.title || page.path);
    } catch (error) {
      setPreviewPhase("error");
      setPreviewMessage(error instanceof Error ? error.message : "문서 내용을 불러오지 못했습니다.");
    }
  };

  const closePreview = () => {
    setPreviewTarget(null);
    setPreviewCollection([]);
    setPreviewReasonMap({});
    setPreviewPage(null);
    setPreviewPhase("idle");
    setPreviewMessage("");
  };

  useEffect(() => {
    const saved = readDocumentWorkbench(persistenceScope);
    setPinnedPages(saved.pinnedPages);
    setComparePages(saved.comparePages);
    setCompareOpen(false);
    setComparePayloads({});
    closePreview();
  }, [persistenceScope]);

  useEffect(() => {
    if (!persistenceScope) return;
    writeDocumentWorkbench(persistenceScope, { pinnedPages, comparePages });
  }, [comparePages, persistenceScope, pinnedPages]);

  useEffect(() => {
    if (comparePages.length === 2) return;
    setCompareOpen(false);
  }, [comparePages.length]);

  const previewNeighbor = (direction: -1 | 1) => {
    if (previewIndex === -1 || !previewCollection.length) return;
    const nextIndex = previewIndex + direction;
    if (nextIndex < 0 || nextIndex >= previewCollection.length) return;
    void openRelatedPagePreview(previewCollection[nextIndex], previewCollection);
  };

  const askFromPreview = () => {
    if (!previewTarget?.path) return;
    runtime.composer.setText(`[[${previewTarget.path}]] 문서를 기준으로 이어서 설명해줘.`);
  };

  const togglePinnedPage = (page: RelatedWikiPage) => {
    setPinnedPages((current) => current.some((item) => item.path === page.path)
      ? current.filter((item) => item.path !== page.path)
      : dedupePages([page, ...current]).slice(0, 6));
  };

  const toggleComparePage = (page: RelatedWikiPage) => {
    setComparePages((current) => {
      if (current.some((item) => item.path === page.path)) {
        return current.filter((item) => item.path !== page.path);
      }
      if (current.length >= 2) return [current[1], page];
      return [...current, page];
    });
  };

  const openComparePreview = async () => {
    if (comparePages.length < 2) return;
    setCompareOpen(true);
    setComparePhase("loading");
    setCompareMessage("비교 문서를 불러오는 중입니다.");
    try {
      const payloads = await Promise.all(comparePages.map((page) => fetchWikiPage(page.path)));
      setComparePayloads((current) => ({
        ...current,
        ...Object.fromEntries(payloads.map((page) => [page.path, page])),
      }));
      setComparePhase("ready");
      setCompareMessage("비교 문서 준비 완료");
    } catch (error) {
      setComparePhase("error");
      setCompareMessage(error instanceof Error ? error.message : "비교 문서를 불러오지 못했습니다.");
    }
  };

  const runCheckpointAction = async (action: Record<string, any>) => {
    if (!action) return;
    if (action.type === "prompt" && action.prompt) {
      runtime.composer.setText(String(action.prompt));
      runtime.composer.send();
      return;
    }
    if (action.type === "surface" && action.surface) {
      const url = new URL(window.location.href);
      url.searchParams.set("surface", String(action.surface));
      window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    if (action.id === "stop_chat" && activeProject?.id) {
      await stopChatProjectRun(activeProject.id).catch(() => null);
    }
  };

  return (
    <aside className="aui-chat-orchestration-panel" aria-label="chat guidance rail">
      <section className="aui-orch-card aui-orch-card-hero">
        <div className="aui-orch-heading">
          <span>현재 진행</span>
          <strong>{phaseLabel(phase)}</strong>
        </div>
        <div className={`aui-orch-phase ${isRunning ? "running" : "idle"}`}>
          <span className="aui-orch-phase-dot" />
          <strong>{phaseLabel(phase)}</strong>
        </div>
        <p className="aui-orch-note">{phaseSummary(phase)}</p>
        <p className="aui-orch-guide">{guideText}</p>
        {displayQuery && displayQuery !== "아직 실행 없음" ? (
          <article className="aui-orch-item compact">
            <strong>요청 요약</strong>
            <span>{truncateText(displayQuery)}</span>
          </article>
        ) : null}
        <div className="aui-orch-summary-grid">
          {summaryItems.map((item) => (
            <div className="aui-orch-summary-cell" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>바로 확인할 것</span>
          <strong>{issueCount ? `${issueCount}건` : "없음"}</strong>
        </div>
        {activeCheckpoint ? (
          <article className="aui-orch-item accent">
            <strong>{activeCheckpoint.label || activeCheckpoint.phase || "checkpoint"}</strong>
            <span>{activeCheckpoint.message || "다음 동작 선택 가능"}</span>
            {activeCheckpoint.availableActions?.length ? (
              <div className="aui-paperclip-result-actions">
                {activeCheckpoint.availableActions.map((action: Record<string, any>) => (
                  <button key={action.id || action.label} onClick={() => void runCheckpointAction(action)} type="button">
                    {action.label || action.id}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ) : null}
        {listOrFallback(
          coverageWarnings,
          (item, index) => (
            <article className="aui-orch-item warning" key={`warning-${index}`}>
              <strong>근거 범위 경고</strong>
              <span>{String(item)}</span>
            </article>
          ),
          activeCheckpoint ? "추가 경고 없음" : "지금 바로 확인할 이슈는 없습니다.",
        )}
        {conflictHotspots.slice(0, 3).map((item: any, index: number) => (
          <article className="aui-orch-item danger" key={`${item.path || index}`}>
            <strong>{item.title || item.path || "충돌 후보"}</strong>
            <span>{item.path || "-"}</span>
            {item.conflicts?.length ? <small>{item.conflicts.join(" / ")}</small> : null}
          </article>
        ))}
      </section>

      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>참조 범위</span>
          <strong>{activeBinding?.projectLabel || "연결 없음"}</strong>
        </div>
        <p className="aui-orch-note">{activeBinding?.path || "현재 챗이 우선 참조하는 위키 프로젝트 범위가 아직 명시되지 않았습니다."}</p>
        <div className="aui-orch-metrics">
          <span>관련 페이지 {activeRelatedPages.length}</span>
          <span>@Project {mentionedProjectContexts.length}</span>
        </div>
        {listOrFallback(
          activeRelatedPages,
          (page, index) => (
            <button
              className="aui-orch-item aui-orch-item-button"
              key={`${page.path || page.title}-${index}`}
              onClick={() => void openRelatedPagePreview(page, activeRelatedPages)}
              type="button"
            >
              <strong>{page.title || page.path}</strong>
              <span>{page.docKind || "page"} · {page.path || "-"}</span>
              <small>{reasonForPath(page.path || "") || "클릭해서 내용 보기"}</small>
            </button>
          ),
          "연결된 위키 페이지 정보가 아직 없습니다.",
        )}
        {mentionedProjectContexts.length ? (
          <article className="aui-orch-item compact">
            <strong>추가 멘션 프로젝트</strong>
            <span>{mentionedProjectContexts.map((item: any) => item.projectLabel || item.projectKey).slice(0, 3).join(", ")}</span>
          </article>
        ) : null}
      </section>

      <section className="aui-orch-card">
        <div className="aui-orch-heading">
          <span>고정 / 비교</span>
          <strong>{pinnedPages.length} pinned · {comparePages.length}/2 compare</strong>
        </div>
        {pinnedPages.length ? (
          <div className="aui-orch-list">
            {pinnedPages.map((page) => (
              <button className="aui-orch-item aui-orch-item-button" key={`pinned-${page.path}`} onClick={() => void openRelatedPagePreview(page, pinnedPages)} type="button">
                <strong>{page.title || page.path}</strong>
                <span>{page.docKind || "page"} · 고정됨</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="aui-orch-empty">문서를 고정하면 자주 보는 참조를 여기에 모을 수 있습니다.</p>
        )}
        {comparePages.length ? (
          <div className="aui-orch-list">
            {comparePages.map((page, index) => (
              <article className="aui-orch-item compact" key={`compare-${page.path}`}>
                <strong>비교 {index + 1}</strong>
                <span>{page.title || page.path}</span>
              </article>
            ))}
          </div>
        ) : null}
        <div className="aui-paperclip-result-actions">
          <button disabled={!compareReady} onClick={() => void openComparePreview()} type="button">비교 보기</button>
        </div>
      </section>

      <section className="aui-orch-card">
        <details className="aui-thinking-panel" open={evidenceOpen} onToggle={(event) => setEvidenceOpen((event.currentTarget as HTMLDetailsElement).open)}>
          <summary className="aui-thinking-summary">
            <span>근거 보기</span>
            <strong>{evidenceOpen ? "닫기" : "열기"}</strong>
          </summary>
          <div className="aui-thinking-list">
            <div className="aui-orch-metrics">
              <span>BM25 {retrieval.sparseHits?.length || 0}</span>
              <span>Graph {retrieval.graphExpandedHits?.length || 0}</span>
              <span>Final {retrieval.finalEvidence?.length || 0}</span>
            </div>
            {listOrFallback(
              evidencePreview,
              (item, index) => (
                <article className="aui-orch-item" key={`${item.path}-${index}`}>
                  <strong>{item.title || item.path}</strong>
                  <span>{item.retrievalSource || "retrieval"} · {item.docKind || "doc"}{item.graphHops ? ` · ${item.graphHops} hop` : ""}</span>
                  {item.priorityReason ? <small>{item.priorityReason}</small> : null}
                </article>
              ),
              "최종 채택 근거가 아직 없습니다.",
            )}
          </div>
        </details>
      </section>

      <section className="aui-orch-card">
        <details className="aui-thinking-panel" open={executionOpen} onToggle={(event) => setExecutionOpen((event.currentTarget as HTMLDetailsElement).open)}>
          <summary className="aui-thinking-summary">
            <span>실행 보기</span>
            <strong>{executionOpen ? "닫기" : "열기"}</strong>
          </summary>
          <div className="aui-thinking-list">
            <article className="aui-thinking-item">
              <strong>생각 흐름</strong>
              <p>{phaseSummary(phase)}</p>
            </article>
            {thinkingSteps.map((step) => (
              <article className="aui-thinking-item" key={step.title}>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </article>
            ))}
            <article className="aui-thinking-item">
              <strong>자동 작업</strong>
              <div className="aui-orch-metrics">
                <span>Mode {paperclip.route?.mode || paperclip.agentMode || "idle"}</span>
                <span>Task {taskPreview.length}</span>
                <span>Blocked {paperclip.blockedActions?.length || 0}</span>
              </div>
              {listOrFallback(
                taskPreview,
                (item, index) => (
                  <article className="aui-orch-item" key={`${item.id || item.templateId || index}`}>
                    <strong>{item.title || item.templateId || item.agent || "Paperclip task"}</strong>
                    <span>{item.agent || "-"} · {item.status || item.approval || "pending"}</span>
                    {item.phase ? <small>{item.phase}</small> : null}
                    {item.runPath ? <small>{item.runPath}</small> : null}
                  </article>
                ),
                "이번 턴에서 실행되거나 제안된 자동 작업이 없습니다.",
              )}
            </article>
          </div>
        </details>
      </section>

      <section className="aui-orch-card">
        <details className="aui-thinking-panel" open={debugOpen} onToggle={(event) => setDebugOpen((event.currentTarget as HTMLDetailsElement).open)}>
          <summary className="aui-thinking-summary">
            <span>디버그</span>
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

      {previewTarget ? (
        <div className="aui-orch-preview-overlay" role="dialog" aria-modal="true" aria-label="관련 문서 미리보기">
          <button className="aui-orch-preview-scrim" onClick={closePreview} type="button" aria-label="미리보기 닫기" />
          <aside className="aui-orch-preview-panel">
            <header className="aui-orch-preview-header">
              <div>
                <span>Referenced Wiki Page</span>
                <strong>{previewPage?.title || previewTarget.title || previewTarget.path}</strong>
                <small>{previewTarget.docKind || String(previewPage?.frontmatter?.docKind || "page")} · {previewTarget.path}</small>
              </div>
              <div className="aui-orch-preview-nav">
                <button disabled={previewIndex <= 0} onClick={() => previewNeighbor(-1)} type="button">이전</button>
                <button disabled={previewIndex === -1 || previewIndex >= previewCollection.length - 1} onClick={() => previewNeighbor(1)} type="button">다음</button>
                <button onClick={closePreview} type="button">닫기</button>
              </div>
            </header>
            <div className="aui-orch-preview-body">
              {previewCollection.length > 1 ? (
                <div className="aui-orch-preview-tablist">
                  {previewCollection.map((page) => (
                    <button
                      className={page.path === previewTarget.path ? "active" : ""}
                      key={`tab-${page.path}`}
                      onClick={() => void openRelatedPagePreview(page, previewCollection)}
                      type="button"
                    >
                      {page.title || page.path}
                    </button>
                  ))}
                </div>
              ) : null}
              {previewReason ? (
                <article className="aui-orch-item accent">
                  <strong>선택 이유</strong>
                  <span>{previewReason}</span>
                </article>
              ) : null}
              {previewPhase === "loading" ? <p className="aui-orch-note">{previewMessage}</p> : null}
              {previewPhase === "error" ? <p className="aui-inline-status error">{previewMessage}</p> : null}
              {previewPhase === "ready" ? (
                <div className="aui-orch-preview-markdown" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : null}
            </div>
            <footer className="aui-orch-preview-footer">
              <button onClick={askFromPreview} type="button">질문창으로</button>
              <button onClick={() => togglePinnedPage(previewTarget)} type="button">
                {pinnedPages.some((page) => page.path === previewTarget.path) ? "고정 해제" : "고정"}
              </button>
              <button onClick={() => toggleComparePage(previewTarget)} type="button">
                {comparePages.some((page) => page.path === previewTarget.path) ? "비교 해제" : "비교 추가"}
              </button>
              <button
                className="primary"
                onClick={() => {
                  onOpenWikiPage(previewTarget.path);
                  closePreview();
                }}
                type="button"
              >
                자세히 보기
              </button>
            </footer>
          </aside>
        </div>
      ) : null}

      {compareOpen ? (
        <div className="aui-orch-preview-overlay" role="dialog" aria-modal="true" aria-label="문서 비교">
          <button className="aui-orch-preview-scrim" onClick={() => setCompareOpen(false)} type="button" aria-label="비교 닫기" />
          <aside className="aui-orch-preview-panel aui-orch-compare-panel">
            <header className="aui-orch-preview-header">
              <div>
                <span>Compare Documents</span>
                <strong>{comparePages.map((page) => page.title || page.path).join(" vs ")}</strong>
                <small>고정/비교 작업함에서 선택한 문서 비교</small>
              </div>
              <button onClick={() => setCompareOpen(false)} type="button">닫기</button>
            </header>
            <div className="aui-orch-preview-body">
              {comparePhase === "loading" ? <p className="aui-orch-note">{compareMessage}</p> : null}
              {comparePhase === "error" ? <p className="aui-inline-status error">{compareMessage}</p> : null}
              {comparePhase === "ready" ? (
                <div className="aui-orch-compare-grid">
                  {comparePages.map((page) => (
                    <section key={`compare-view-${page.path}`}>
                      <article className="aui-orch-item accent">
                        <strong>{page.title || page.path}</strong>
                        <span>{reasonForPath(page.path) || page.docKind || "비교 문서"}</span>
                      </article>
                      <div
                        className="aui-orch-preview-markdown"
                        dangerouslySetInnerHTML={{ __html: compareHtml.find((item) => item.path === page.path)?.html || "<p>미리보기 내용이 없습니다.</p>" }}
                      />
                    </section>
                  ))}
                </div>
              ) : null}
            </div>
            <footer className="aui-orch-preview-footer">
              {comparePages.map((page) => (
                <button
                  key={`open-${page.path}`}
                  onClick={() => {
                    onOpenWikiPage(page.path);
                    setCompareOpen(false);
                  }}
                  type="button"
                >
                  {page.title || page.path} 열기
                </button>
              ))}
            </footer>
          </aside>
        </div>
      ) : null}
    </aside>
  );
}
