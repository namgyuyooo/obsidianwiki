export type WikiPageIndexItem = {
  title: string;
  path: string;
  section?: string;
  projectKey?: string;
  projectLabel?: string;
  division?: string;
  docKind?: string;
  nature?: string;
  updatedAt?: string;
  size?: number;
  workflowStatus?: string;
  workflowStatusLabel?: string;
  workflowStatusColor?: string;
  workflowStatusHighlight?: string;
  workflowTags?: string[];
  workflowNote?: string;
  statusManaged?: boolean;
};

export type WikiPagePayload = {
  title: string;
  path: string;
  frontmatter?: Record<string, unknown>;
  markdown: string;
};

export type WikiSearchResult = {
  title: string;
  path: string;
  snippet?: string;
  score?: number;
  frontmatter?: Record<string, unknown>;
};

export type WikiIndexPayload = {
  pages: WikiPageIndexItem[];
  workspace: string;
};

export type WikiStatusCatalog = Record<string, { label: string; color: string; highlight: string }>;

export type WikiStatusPayload = {
  catalog: WikiStatusCatalog;
  store: Record<string, unknown>;
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

export async function fetchWikiIndex(workspace: string) {
  return requestJson<WikiIndexPayload>(`/api/wiki/index?workspace=${encodeURIComponent(workspace)}`);
}

export async function searchWiki(query: string, workspace: string) {
  const payload = await requestJson<{ results: WikiSearchResult[] }>(
    `/api/wiki/search?q=${encodeURIComponent(query)}&workspace=${encodeURIComponent(workspace)}`,
  );
  return payload.results || [];
}

export async function fetchWikiPage(path: string) {
  return requestJson<WikiPagePayload>(`/api/wiki/page?path=${encodeURIComponent(path)}`);
}

export async function saveWikiPage(path: string, markdown: string) {
  return requestJson<{ status: string; path: string; title: string; updatedAt: string; projectKeyAutofixed?: boolean }>("/api/wiki/page", {
    method: "PUT",
    body: JSON.stringify({ path, markdown }),
  });
}

export async function fetchWikiStatusCatalog() {
  return requestJson<WikiStatusPayload>("/api/wiki/status");
}

export async function saveWikiStatus(input: {
  scope: "page" | "project";
  path?: string;
  projectKey?: string;
  status: string;
  tags?: string;
  highlight?: string;
  note?: string;
}) {
  return requestJson("/api/wiki/status", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
