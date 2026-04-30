export type KnowledgePromotion = {
  id: string;
  status?: string;
  source?: string;
  sourceType?: string;
  projectHint?: string;
  tool?: string;
  content?: string;
  markdown?: string;
  path?: string;
  createdAt?: string;
  candidates?: {
    facts?: string[];
    numbers?: string[];
    decisions?: string[];
    actions?: string[];
    conflicts?: string[];
  };
};

export type KnowledgePromotionResult = {
  status?: string;
  path?: string;
  markdown?: string;
  promotion?: KnowledgePromotion;
  paperclipAgent?: unknown[];
  nextActions?: string[];
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

export async function promoteKnowledge(input: {
  content: string;
  projectHint?: string;
  source?: string;
  sourceProjectId?: string;
  tool?: string;
}) {
  return requestJson<KnowledgePromotionResult>("/api/knowledge/promote", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchKnowledgePromotions() {
  return requestJson<{ promotions: KnowledgePromotion[] }>("/api/knowledge/promotions");
}
