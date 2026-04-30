export type DecisionItem = {
  id: string;
  status: string;
  sourceType?: string;
  kind?: string;
  title?: string;
  projectKey?: string;
  projectLabel?: string;
  content?: string;
  path?: string;
  createdAt?: string;
  resolvedAction?: string;
  resolvedAt?: string;
  note?: string;
};

export type DecisionQueueSnapshot = {
  generatedAt: string;
  workspace: string;
  items: DecisionItem[];
};

export type DecisionSummary = {
  pending: number;
  approved: number;
  held: number;
  total: number;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload as T;
}

export function summarizeDecisionQueue(items: readonly DecisionItem[]): DecisionSummary {
  const pending = items.filter((item) => item.status === "pending").length;
  const approved = items.filter((item) => item.status === "approved").length;
  const held = items.filter((item) => ["hold", "held", "investigate"].includes(item.status)).length;
  return {
    pending,
    approved,
    held,
    total: items.length,
  };
}

export async function fetchDecisionQueue(workspace: string): Promise<DecisionQueueSnapshot> {
  return requestJson<DecisionQueueSnapshot>(`/api/decision-queue?workspace=${encodeURIComponent(workspace)}`);
}

export async function resolveDecisionItem(itemId: string, action: "approve" | "hold" | "investigate", note = "") {
  return requestJson(`/api/decision-queue/${encodeURIComponent(itemId)}/resolve`, {
    method: "POST",
    body: JSON.stringify({ action, note }),
  });
}

export async function inferDecisionItem(item: DecisionItem, directive: string, signal?: AbortSignal) {
  const prompt = [
    "Decision Deck 카드에 대해 판정 보조를 수행해줘.",
    "",
    `프로젝트: ${item.projectLabel || item.projectKey || "미지정"}`,
    `종류: ${item.kind || item.sourceType || "unknown"}`,
    `경로: ${item.path || "-"}`,
    "",
    "카드 내용:",
    item.content || "",
    "",
    "사용자 처리 지시:",
    directive || "승인/보류/추가조사 중 무엇이 적절한지 근거와 함께 짧게 판단해줘.",
    "",
    "응답 형식:",
    "- 권장 판정:",
    "- 이유:",
    "- 확인할 근거:",
    "- 다음 액션:",
  ].join("\n");

  const response = await fetch("/api/chat/glm/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: prompt,
      projectId: "decision-deck",
      workspace: "rtm",
      profile: "decision_triage",
      skillTags: ["wiki-ingest-operator"],
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error((await response.text()) || `HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) continue;
      const payload = JSON.parse(data);
      if (event === "delta") content += payload.content || "";
      if (event === "done") return payload.messages?.assistant?.content || content;
      if (event === "error") throw new Error(payload.error || "Decision Deck GLM 추론 실패");
    }
  }

  return content;
}
