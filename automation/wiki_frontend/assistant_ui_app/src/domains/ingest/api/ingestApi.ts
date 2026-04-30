export type IngestDigestPayload = Record<string, unknown> & {
  provider?: string;
  model?: string;
  endpoint?: string;
  digest?: string | Record<string, unknown>;
  upstreamStatus?: string;
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

export async function generateIngestDigest(input: { text: string; projectHint?: string }) {
  return requestJson<IngestDigestPayload>("/api/llm/digest", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
