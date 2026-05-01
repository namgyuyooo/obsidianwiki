import { useEffect, useState } from "react";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import { fetchWikiPage, saveWikiPage } from "../../wiki/api/wikiApi";
import {
  enqueueDecisionMergeCandidate,
  enqueueWikiIntegrationDecisionCandidate,
  fetchDecisionQueue,
  inferDecisionItem,
  resolveDecisionItem,
  scanAndEnqueueDecisionMergeCandidates,
  scanAndEnqueueWikiIntegrationCandidates,
  scanDecisionMergeCandidates,
  scanWikiIntegrationCandidates,
  summarizeDecisionQueue,
  suggestDecisionMerge,
  type DecisionMergeCandidate,
  type DecisionMergeCandidateScan,
  type DecisionItem,
  type DecisionMergeSuggestion,
  type WikiIntegrationCandidate,
  type WikiIntegrationCandidateScan,
} from "../api/decisionApi";

type DecisionDeckStatus =
  | { phase: "loading"; message: string }
  | { phase: "ready"; message: string }
  | { phase: "saving"; message: string }
  | { phase: "thinking"; message: string }
  | { phase: "failed"; message: string };

type DecisionCompareState = {
  phase: "idle" | "loading" | "ready" | "merging" | "saving" | "failed";
  message: string;
  itemId: string;
  sourcePath: string;
  targetPath: string;
  sourceMarkdown: string;
  targetMarkdown: string;
  suggestion: DecisionMergeSuggestion | null;
};

type DecisionMergeScanState = {
  phase: "idle" | "scanning" | "ready" | "enqueuing" | "failed";
  message: string;
  snapshot: DecisionMergeCandidateScan | null;
};

type WikiIntegrationScanState = {
  phase: "idle" | "scanning" | "ready" | "enqueuing" | "failed";
  message: string;
  snapshot: WikiIntegrationCandidateScan | null;
};

const EMPTY_COMPARE: DecisionCompareState = {
  phase: "idle",
  message: "근거 비교를 열면 intake 문서와 대표 반영 문서를 나란히 확인합니다.",
  itemId: "",
  sourcePath: "",
  targetPath: "",
  sourceMarkdown: "",
  targetMarkdown: "",
  suggestion: null,
};

const EMPTY_MERGE_SCAN: DecisionMergeScanState = {
  phase: "idle",
  message: "전체 위키의 태그, 키워드, 그래프 연결을 스캔해 중복 intake와 병합 후보를 찾을 수 있습니다.",
  snapshot: null,
};

const EMPTY_INTEGRATION_SCAN: WikiIntegrationScanState = {
  phase: "idle",
  message: "프로젝트/계정/Slack 성격을 스캔해 대표 공간 선정용 통합 후보를 찾을 수 있습니다.",
  snapshot: null,
};

function isDeletionDecision(item: DecisionItem | null) {
  if (!item) return false;
  return /deletion_candidate/i.test(`${item.kind || ""}`) || /wiki_deletion/i.test(`${item.sourceType || ""}`);
}

function decisionTargetPath(item: DecisionItem | null, workspace: string) {
  if (!item) return "";
  if (item.kind === "wiki_integration" || item.sourceType === "wiki_integration_scan") return item.path || "";
  if (isDeletionDecision(item)) return item.path || "";
  if (item.path && /(^|\/)obsidian\/Wiki\//.test(item.path)) {
    return item.path.replace(/[^/]+\.md$/i, "Conflict_Register.md");
  }
  if (!item.projectKey) return "";
  const root = workspace === "personal" ? "../obsidianwiki-personal/obsidian/Wiki" : "obsidian/Wiki";
  return `${root}/${item.projectKey}/Conflict_Register.md`;
}

function decisionContentItems(content = "") {
  return String(content || "")
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 6);
}

function isConflictDecision(item: DecisionItem | null) {
  if (!item) return false;
  return /conflict|충돌|불일치|상이|상충|미확정|정합성/i.test(`${item.kind || ""} ${item.title || ""} ${item.content || ""}`);
}

function isIntegrationDecision(item: DecisionItem | null) {
  if (!item) return false;
  return item.kind === "wiki_integration" || item.sourceType === "wiki_integration_scan";
}

function recommendedActionFromInference(content = "") {
  const text = content.toLowerCase();
  const firstSignal = text.split("\n").find((line) => /판정|권장|recommend|decision/.test(line)) || text.slice(0, 240);
  if (/investigate|추가\s*조사|조사/.test(firstSignal)) return "investigate";
  if (/approve|승인|반영/.test(firstSignal)) return "approve";
  return "hold";
}

export function useDecisionDeck(workspace: string) {
  const { notify } = useToastCenter();
  const [items, setItems] = useState<DecisionItem[]>([]);
  const [activeItemId, setActiveItemId] = useState("");
  const [directive, setDirective] = useState("승인 전 근거 충돌과 보류 조건을 먼저 따져줘.");
  const [inference, setInference] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [compare, setCompare] = useState<DecisionCompareState>(EMPTY_COMPARE);
  const [mergeScan, setMergeScan] = useState<DecisionMergeScanState>(EMPTY_MERGE_SCAN);
  const [integrationScan, setIntegrationScan] = useState<WikiIntegrationScanState>(EMPTY_INTEGRATION_SCAN);
  const [status, setStatus] = useState<DecisionDeckStatus>({
    phase: "loading",
    message: "통합 검토 큐를 불러오는 중입니다.",
  });

  const pendingItems = items.filter((item) => item.status === "pending");
  const resolvedItems = items.filter((item) => item.status && item.status !== "pending");
  const activeItem = pendingItems.find((item) => item.id === activeItemId) || pendingItems[0] || null;
  const activeIndex = activeItem ? pendingItems.findIndex((item) => item.id === activeItem.id) : -1;
  const summary = summarizeDecisionQueue(items);
  const activeContentItems = decisionContentItems(activeItem?.content || "");
  const activeTargetPath = decisionTargetPath(activeItem, workspace);
  const activeIsConflict = isConflictDecision(activeItem);
  const activeIsDeletion = isDeletionDecision(activeItem);
  const activeIsIntegration = isIntegrationDecision(activeItem);

  async function reload(preferredItemId = activeItemId) {
    setStatus({ phase: "loading", message: "통합 검토 큐를 동기화하는 중입니다." });
    try {
      const snapshot = await fetchDecisionQueue(workspace);
      const nextItems = snapshot.items || [];
      const nextPending = nextItems.filter((item) => item.status === "pending");
      const nextActive = nextPending.some((item) => item.id === preferredItemId)
        ? preferredItemId
        : nextPending[0]?.id || "";
      setItems(nextItems);
      setActiveItemId(nextActive);
      setStatus({ phase: "ready", message: `${nextPending.length}건의 통합 검토 카드가 있습니다.` });
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "통합 검토 큐 동기화 실패" });
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchDecisionQueue(workspace)
      .then((snapshot) => {
        if (cancelled) return;
        const nextItems = snapshot.items || [];
        const nextPending = nextItems.filter((item) => item.status === "pending");
        setItems(nextItems);
        setActiveItemId(nextPending[0]?.id || "");
        setStatus({ phase: "ready", message: `${nextPending.length}건의 통합 검토 카드가 있습니다.` });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({ phase: "failed", message: String((error as Error)?.message || error) });
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const move = (direction: -1 | 1) => {
    if (!pendingItems.length) return;
    const nextIndex = Math.min(Math.max(activeIndex + direction, 0), pendingItems.length - 1);
    setActiveItemId(pendingItems[nextIndex]?.id || "");
    setInference("");
    setResolutionNote("");
    setCompare({ ...EMPTY_COMPARE });
  };

  const focusItem = (itemId: string) => {
    setActiveItemId(itemId);
    setInference("");
    setResolutionNote("");
    setCompare({ ...EMPTY_COMPARE });
  };

  const resolveActive = async (action: "approve" | "hold" | "investigate", noteOverride = "") => {
    if (!activeItem) return;
    setStatus({ phase: "saving", message: `${activeItem.title || "카드"}를 ${action} 처리 중입니다.` });
    notify("running", "Decision 처리 시작", `${activeItem.title || "카드"} · ${action}`, { durationMs: 2200 });
    try {
      const note = noteOverride || resolutionNote || inference || directive;
      await resolveDecisionItem(activeItem.id, action, note, workspace);
      setInference("");
      setResolutionNote("");
      setCompare({ ...EMPTY_COMPARE });
      await reload("");
      notify("success", "Decision 처리 완료", `${activeItem.title || "카드"}를 ${action} 처리했습니다.`);
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "Decision 처리 실패" });
      notify("error", "Decision 처리 실패", error instanceof Error ? error.message : "Decision 처리 실패");
    }
  };

  const runInference = async () => {
    if (!activeItem) return;
    setStatus({ phase: "thinking", message: "GLM이 현재 통합 검토 카드를 검토 중입니다." });
    notify("running", "Decision 판정 보조 시작", activeItem.title || "카드", { durationMs: 2200 });
    try {
      const result = await inferDecisionItem(activeItem, directive, workspace);
      setInference(result);
      setStatus({ phase: "ready", message: "GLM 판정 보조가 완료되었습니다." });
      notify("success", "Decision 판정 보조 완료", `${activeItem.title || "카드"}에 대한 권장안을 생성했습니다.`);
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "GLM 판정 실패" });
      notify("error", "Decision 판정 보조 실패", error instanceof Error ? error.message : "GLM 판정 실패");
    }
  };

  const fetchComparisonPayload = async (item: DecisionItem) => {
    const sourcePath = item.path || "";
    const targetPath = decisionTargetPath(item, workspace);
    const [source, target] = await Promise.all([
      sourcePath ? fetchWikiPage(sourcePath).catch((error) => ({ markdown: `근거 문서 로드 실패: ${String(error)}` })) : Promise.resolve({ markdown: "" }),
      targetPath ? fetchWikiPage(targetPath).catch(() => ({ markdown: "" })) : Promise.resolve({ markdown: "" }),
    ]);
    return {
      itemId: item.id,
      sourcePath,
      targetPath,
      sourceMarkdown: source.markdown || "",
      targetMarkdown: target.markdown || "",
    };
  };

  const loadComparison = async () => {
    if (!activeItem) return null;
    setCompare({
      ...EMPTY_COMPARE,
      phase: "loading",
      message: "근거 문서와 반영 대상 문서를 불러오는 중입니다.",
      itemId: activeItem.id,
      sourcePath: activeItem.path || "",
      targetPath: decisionTargetPath(activeItem, workspace),
    });
    try {
      const payload = await fetchComparisonPayload(activeItem);
      const nextCompare = {
        ...payload,
        phase: "ready" as const,
        message: payload.targetMarkdown ? "근거 비교가 준비되었습니다." : "대상 문서가 없거나 비어 있습니다. 우측 편집기에서 새로 작성할 수 있습니다.",
        suggestion: null,
      };
      setCompare(nextCompare);
      return nextCompare;
    } catch (error) {
      setCompare((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "근거 비교 로드 실패",
      }));
      return null;
    }
  };

  const requestMergeSuggestion = async () => {
    if (!activeItem) return;
    const readyCompare = compare.itemId === activeItem.id && compare.phase !== "idle"
      ? compare
      : await loadComparison();
    if (!readyCompare) return;
    setCompare((current) => ({ ...current, phase: "merging", message: "GLM 병합안을 생성하는 중입니다." }));
    notify("running", "근거 병합안 생성 시작", activeItem.title || "카드", { durationMs: 2200 });
    try {
      const suggestion = await suggestDecisionMerge({
        id: activeItem.id,
        title: activeItem.title,
        content: activeItem.content,
        projectKey: activeItem.projectKey,
        projectLabel: activeItem.projectLabel,
        sourcePath: readyCompare.sourcePath,
        targetPath: readyCompare.targetPath,
        sourceMarkdown: readyCompare.sourceMarkdown,
        targetMarkdown: readyCompare.targetMarkdown,
        workspace,
      });
      setCompare((current) => ({
        ...current,
        phase: "ready",
        message: "GLM 병합안이 준비되었습니다.",
        suggestion,
      }));
      notify("success", "근거 병합안 생성 완료", `${activeItem.title || "카드"} 병합안을 준비했습니다.`);
    } catch (error) {
      setCompare((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "GLM 병합안 생성 실패",
      }));
      notify("error", "근거 병합안 생성 실패", error instanceof Error ? error.message : "GLM 병합안 생성 실패");
    }
  };

  const applyMergeSuggestion = () => {
    const mergedMarkdown = compare.suggestion?.mergedMarkdown || "";
    if (!mergedMarkdown) return;
    setCompare((current) => ({
      ...current,
      targetMarkdown: mergedMarkdown,
      message: "병합 초안을 편집기에 반영했습니다. 검토 후 저장하세요.",
    }));
  };

  const saveCompareTarget = async () => {
    if (!compare.targetPath) {
      setCompare((current) => ({ ...current, phase: "failed", message: "대상 경로가 없어 저장할 수 없습니다." }));
      return false;
    }
    setCompare((current) => ({ ...current, phase: "saving", message: "대상 문서를 저장하는 중입니다." }));
    notify("running", "대상 문서 저장 시작", compare.targetPath, { durationMs: 2200 });
    try {
      await saveWikiPage(compare.targetPath, compare.targetMarkdown);
      setCompare((current) => ({ ...current, phase: "ready", message: "대상 문서를 저장했습니다." }));
      notify("success", "대상 문서 저장 완료", compare.targetPath);
      return true;
    } catch (error) {
      setCompare((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "대상 문서 저장 실패",
      }));
      notify("error", "대상 문서 저장 실패", error instanceof Error ? error.message : "대상 문서 저장 실패");
      return false;
    }
  };

  const saveCompareAndApprove = async () => {
    const saved = await saveCompareTarget();
    if (!saved) return;
    await resolveActive("approve", resolutionNote || compare.suggestion?.summary || "Decision Deck 비교 패널에서 저장 후 승인 처리");
  };

  const setCompareTargetMarkdown = (targetMarkdown: string) => {
    setCompare((current) => ({ ...current, targetMarkdown }));
  };

  const applyInferenceRecommendation = () => {
    if (!inference.trim()) return;
    resolveActive(recommendedActionFromInference(inference));
  };

  const scanMergeCandidates = async () => {
    setMergeScan({ phase: "scanning", message: "전체 위키의 태그/키워드/그래프맵 기반 유사도를 계산하는 중입니다.", snapshot: mergeScan.snapshot });
    notify("running", "병합 후보 스캔 시작", "태그, 키워드, 그래프 연결을 분석합니다.", { durationMs: 2400 });
    try {
      const snapshot = await scanDecisionMergeCandidates(workspace, 24);
      setMergeScan({
        phase: "ready",
        message: `병합 후보 ${snapshot.candidates.length}건 · 충돌 위험 ${snapshot.summary.conflictRisk}건`,
        snapshot,
      });
      notify("success", "병합 후보 스캔 완료", `${snapshot.candidates.length}건의 전략 후보를 찾았습니다.`);
    } catch (error) {
      setMergeScan({
        phase: "failed",
        message: error instanceof Error ? error.message : "병합 후보 스캔 실패",
        snapshot: mergeScan.snapshot,
      });
      notify("error", "병합 후보 스캔 실패", error instanceof Error ? error.message : "병합 후보 스캔 실패");
    }
  };

  const enqueueMergeCandidate = async (candidate: DecisionMergeCandidate) => {
    setMergeScan((current) => ({ ...current, phase: "enqueuing", message: "병합 후보를 Decision Queue에 등록하는 중입니다." }));
    notify("running", "Decision Queue 등록", candidate.primary?.title || candidate.id, { durationMs: 2200 });
    try {
      await enqueueDecisionMergeCandidate(candidate, workspace);
      await reload("");
      setMergeScan((current) => ({ ...current, phase: "ready", message: "병합 후보를 Decision Queue에 등록했습니다." }));
      notify("success", "Decision Queue 등록 완료", candidate.primary?.title || candidate.id);
    } catch (error) {
      setMergeScan((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "Decision Queue 등록 실패",
      }));
      notify("error", "Decision Queue 등록 실패", error instanceof Error ? error.message : "Decision Queue 등록 실패");
    }
  };

  const scanAndEnqueueTopMergeCandidates = async () => {
    setMergeScan({ phase: "enqueuing", message: "병합 후보를 스캔하고 상위 후보를 Decision Queue에 등록하는 중입니다.", snapshot: mergeScan.snapshot });
    notify("running", "상위 병합 후보 등록", "스캔 후 상위 5건을 Decision Queue에 올립니다.", { durationMs: 2600 });
    try {
      const snapshot = await scanAndEnqueueDecisionMergeCandidates(workspace, 5, 24);
      await reload("");
      setMergeScan({
        phase: "ready",
        message: `상위 후보 ${snapshot.enqueued?.length || 0}건 등록 · 전체 후보 ${snapshot.candidates.length}건`,
        snapshot,
      });
      notify("success", "상위 병합 후보 등록 완료", `${snapshot.enqueued?.length || 0}건을 Decision Queue에 등록했습니다.`);
    } catch (error) {
      setMergeScan({
        phase: "failed",
        message: error instanceof Error ? error.message : "상위 병합 후보 등록 실패",
        snapshot: mergeScan.snapshot,
      });
      notify("error", "상위 병합 후보 등록 실패", error instanceof Error ? error.message : "상위 병합 후보 등록 실패");
    }
  };

  const scanIntegrationCandidates = async () => {
    setIntegrationScan({ phase: "scanning", message: "프로젝트/계정/Slack 성격과 연결 신호를 계산하는 중입니다.", snapshot: integrationScan.snapshot });
    notify("running", "통합 후보 스캔 시작", "고객/주제/문서 성격을 분석합니다.", { durationMs: 2400 });
    try {
      const snapshot = await scanWikiIntegrationCandidates(workspace, 20);
      setIntegrationScan({
        phase: "ready",
        message: `통합 후보 ${snapshot.candidates.length}건 · account rollup ${snapshot.summary.accountRollups || 0}건`,
        snapshot,
      });
      notify("success", "통합 후보 스캔 완료", `${snapshot.candidates.length}건의 통합 후보를 찾았습니다.`);
    } catch (error) {
      setIntegrationScan({
        phase: "failed",
        message: error instanceof Error ? error.message : "통합 후보 스캔 실패",
        snapshot: integrationScan.snapshot,
      });
      notify("error", "통합 후보 스캔 실패", error instanceof Error ? error.message : "통합 후보 스캔 실패");
    }
  };

  const enqueueIntegrationCandidate = async (candidate: WikiIntegrationCandidate) => {
    setIntegrationScan((current) => ({ ...current, phase: "enqueuing", message: "통합 후보를 Decision Queue에 등록하는 중입니다." }));
    notify("running", "통합 후보 등록", candidate.groupKey, { durationMs: 2200 });
    try {
      await enqueueWikiIntegrationDecisionCandidate(candidate, workspace);
      await reload("");
      setIntegrationScan((current) => ({ ...current, phase: "ready", message: "통합 후보를 Decision Queue에 등록했습니다." }));
      notify("success", "통합 후보 등록 완료", candidate.groupKey);
    } catch (error) {
      setIntegrationScan((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "통합 후보 등록 실패",
      }));
      notify("error", "통합 후보 등록 실패", error instanceof Error ? error.message : "통합 후보 등록 실패");
    }
  };

  const scanAndEnqueueTopIntegrationCandidates = async () => {
    setIntegrationScan({ phase: "enqueuing", message: "통합 후보를 스캔하고 상위 후보를 Decision Queue에 등록하는 중입니다.", snapshot: integrationScan.snapshot });
    notify("running", "상위 통합 후보 등록", "스캔 후 상위 5건을 Decision Queue에 올립니다.", { durationMs: 2600 });
    try {
      const snapshot = await scanAndEnqueueWikiIntegrationCandidates(workspace, 5, 20);
      await reload("");
      setIntegrationScan({
        phase: "ready",
        message: `상위 후보 ${snapshot.enqueued?.length || 0}건 등록 · 전체 후보 ${snapshot.candidates.length}건`,
        snapshot,
      });
      notify("success", "상위 통합 후보 등록 완료", `${snapshot.enqueued?.length || 0}건을 Decision Queue에 등록했습니다.`);
    } catch (error) {
      setIntegrationScan({
        phase: "failed",
        message: error instanceof Error ? error.message : "상위 통합 후보 등록 실패",
        snapshot: integrationScan.snapshot,
      });
      notify("error", "상위 통합 후보 등록 실패", error instanceof Error ? error.message : "상위 통합 후보 등록 실패");
    }
  };

  return {
    items,
    pendingItems,
    resolvedItems,
    activeItem,
    activeIndex,
    activeContentItems,
    activeTargetPath,
    activeIsConflict,
    activeIsDeletion,
    activeIsIntegration,
    directive,
    inference,
    resolutionNote,
    compare,
    mergeScan,
    integrationScan,
    status,
    summary,
    setActiveItemId,
    focusItem,
    setDirective,
    setResolutionNote,
    setCompareTargetMarkdown,
    move,
    reload,
    resolveActive,
    runInference,
    loadComparison,
    requestMergeSuggestion,
    applyMergeSuggestion,
    saveCompareTarget,
    saveCompareAndApprove,
    applyInferenceRecommendation,
    scanMergeCandidates,
    enqueueMergeCandidate,
    scanAndEnqueueTopMergeCandidates,
    scanIntegrationCandidates,
    enqueueIntegrationCandidate,
    scanAndEnqueueTopIntegrationCandidates,
  };
}
