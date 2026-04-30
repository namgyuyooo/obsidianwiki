import { useEffect, useState } from "react";
import {
  fetchDecisionQueue,
  inferDecisionItem,
  resolveDecisionItem,
  summarizeDecisionQueue,
  type DecisionItem,
} from "../api/decisionApi";

type DecisionDeckStatus =
  | { phase: "loading"; message: string }
  | { phase: "ready"; message: string }
  | { phase: "saving"; message: string }
  | { phase: "thinking"; message: string }
  | { phase: "failed"; message: string };

export function useDecisionDeck(workspace: string) {
  const [items, setItems] = useState<DecisionItem[]>([]);
  const [activeItemId, setActiveItemId] = useState("");
  const [directive, setDirective] = useState("승인 전 근거 충돌과 보류 조건을 먼저 따져줘.");
  const [inference, setInference] = useState("");
  const [status, setStatus] = useState<DecisionDeckStatus>({
    phase: "loading",
    message: "Decision Queue를 불러오는 중입니다.",
  });

  const pendingItems = items.filter((item) => item.status === "pending");
  const activeItem = pendingItems.find((item) => item.id === activeItemId) || pendingItems[0] || null;
  const activeIndex = activeItem ? pendingItems.findIndex((item) => item.id === activeItem.id) : -1;
  const summary = summarizeDecisionQueue(items);

  async function reload(preferredItemId = activeItemId) {
    setStatus({ phase: "loading", message: "Decision Queue를 동기화하는 중입니다." });
    const snapshot = await fetchDecisionQueue(workspace);
    const nextItems = snapshot.items || [];
    const nextPending = nextItems.filter((item) => item.status === "pending");
    const nextActive = nextPending.some((item) => item.id === preferredItemId)
      ? preferredItemId
      : nextPending[0]?.id || "";
    setItems(nextItems);
    setActiveItemId(nextActive);
    setStatus({ phase: "ready", message: `${nextPending.length}건의 판정 대기 카드가 있습니다.` });
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
  };

  const resolveActive = async (action: "approve" | "hold" | "investigate") => {
    if (!activeItem) return;
    setStatus({ phase: "saving", message: `${activeItem.title || "카드"}를 ${action} 처리 중입니다.` });
    await resolveDecisionItem(activeItem.id, action, inference || directive);
    setInference("");
    await reload("");
  };

  const runInference = async () => {
    if (!activeItem) return;
    setStatus({ phase: "thinking", message: "GLM이 현재 Decision Deck 카드를 검토 중입니다." });
    const result = await inferDecisionItem(activeItem, directive);
    setInference(result);
    setStatus({ phase: "ready", message: "GLM 판정 보조가 완료되었습니다." });
  };

  return {
    items,
    pendingItems,
    activeItem,
    activeIndex,
    directive,
    inference,
    status,
    summary,
    setActiveItemId,
    setDirective,
    move,
    reload,
    resolveActive,
    runInference,
  };
}
