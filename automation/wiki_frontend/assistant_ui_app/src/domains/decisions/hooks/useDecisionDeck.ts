import { useEffect, useState } from "react";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import { fetchWikiPage, saveWikiPage } from "../../wiki/api/wikiApi";
import {
  fetchDecisionQueue,
  inferDecisionItem,
  resolveDecisionItem,
  summarizeDecisionQueue,
  suggestDecisionMerge,
  type DecisionItem,
  type DecisionMergeSuggestion,
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

const EMPTY_COMPARE: DecisionCompareState = {
  phase: "idle",
  message: "근거 비교를 열면 출처 문서와 Conflict Register를 나란히 확인합니다.",
  itemId: "",
  sourcePath: "",
  targetPath: "",
  sourceMarkdown: "",
  targetMarkdown: "",
  suggestion: null,
};

function isDeletionDecision(item: DecisionItem | null) {
  if (!item) return false;
  return /deletion_candidate/i.test(`${item.kind || ""}`) || /wiki_deletion/i.test(`${item.sourceType || ""}`);
}

function decisionTargetPath(item: DecisionItem | null, workspace: string) {
  if (!item) return "";
  if (isDeletionDecision(item)) return item.path || "";
  if (item.path && /obsidian\/(Wiki|Personal_Wiki)\//.test(item.path)) {
    return item.path.replace(/[^/]+\.md$/i, "Conflict_Register.md");
  }
  if (!item.projectKey) return "";
  const root = workspace === "personal" ? "obsidian/Personal_Wiki" : "obsidian/Wiki";
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
  const [status, setStatus] = useState<DecisionDeckStatus>({
    phase: "loading",
    message: "Decision Queue를 불러오는 중입니다.",
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

  async function reload(preferredItemId = activeItemId) {
    setStatus({ phase: "loading", message: "Decision Queue를 동기화하는 중입니다." });
    try {
      const snapshot = await fetchDecisionQueue(workspace);
      const nextItems = snapshot.items || [];
      const nextPending = nextItems.filter((item) => item.status === "pending");
      const nextActive = nextPending.some((item) => item.id === preferredItemId)
        ? preferredItemId
        : nextPending[0]?.id || "";
      setItems(nextItems);
      setActiveItemId(nextActive);
      setStatus({ phase: "ready", message: `${nextPending.length}건의 판정 대기 카드가 있습니다.` });
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "Decision Queue 동기화 실패" });
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
        setStatus({ phase: "ready", message: `${nextPending.length}건의 판정 대기 카드가 있습니다.` });
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
    setStatus({ phase: "thinking", message: "GLM이 현재 Decision Deck 카드를 검토 중입니다." });
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
    directive,
    inference,
    resolutionNote,
    compare,
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
  };
}
