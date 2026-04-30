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

export type WikiGraphNode = {
  id: string;
  title: string;
  section?: string;
  type?: string;
  size?: number;
  degree?: number;
};

export type WikiGraphEdge = {
  source: string;
  target: string;
  label?: string;
};

export type WikiGraphPayload = {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
};

export type WikiManagementTargetPage = {
  title?: string;
  path: string;
  division?: string;
  projectKey?: string;
  projectLabel?: string;
  docKind?: string;
};

export type WikiManagementOperation = {
  type?: string;
  rationale?: string;
  applyMode?: string;
  proposedChanges?: unknown;
  pairs?: unknown;
};

export type WikiManagementCommand = {
  id: string;
  command: string;
  provider?: string;
  status?: string;
  createdAt?: string;
  upstreamStatus?: string;
  hints?: {
    renamePairs?: Array<{ from: string; to: string }>;
    keywords?: string[];
  };
  plan?: {
    summaryMarkdown?: string;
    targetPages?: WikiManagementTargetPage[];
    operations?: WikiManagementOperation[];
    risks?: string[];
    nextActions?: string[];
  };
};

export type WikiManagementApplyResult = {
  status?: string;
  createdAt?: string;
  error?: string;
  changedFiles?: Array<{
    path: string;
    title?: string;
    operation?: string;
    action?: string;
    dryRun?: boolean;
    replacements?: Array<{ from: string; to: string; count: number }>;
  }>;
  skippedOperations?: Array<{ type?: string; path?: string; reason?: string }>;
};

export type FilesystemBrowseTarget = {
  path: string;
  type: "file" | "directory";
  fileCount?: number;
  directoryCount?: number;
};

export type FilesystemBrowseEntry = {
  path: string;
  type: "file" | "directory" | "other";
  depth?: number;
  ext?: string;
  size?: number;
  updatedAt?: string;
  fileCount?: number;
  directoryCount?: number;
  tree?: Array<{
    depth: number;
    type: "file" | "directory" | "other";
    path: string;
  }>;
};

export type FilesystemBrowsePayload = {
  targets: FilesystemBrowseTarget[];
  files: string[];
  directories: string[];
  blocked: string[];
  entries: FilesystemBrowseEntry[];
};

export type RemoteBrowserItem = {
  name: string;
  remotePath: string;
  type: "directory" | "file";
  size?: number;
  updatedAt?: string;
};

export type RemoteBrowserPayload = {
  remote: string;
  root: string;
  currentPath: string;
  parentPath?: string;
  blocked?: boolean;
  error?: string;
  items: RemoteBrowserItem[];
};

export type CollectionStatusPayload = {
  manifestPath?: string;
  runOutputPath?: string;
  manifestFolders: string[];
  manifestFiles?: string[];
  processedFolders: string[];
  processedFiles: string[];
  documents?: number;
  processed?: number;
  updatedAt?: string;
};

export type WikiDeletionCandidate = {
  title: string;
  path: string;
  projectKey?: string;
  projectLabel?: string;
  division?: string;
  docKind?: string;
  workflowStatus?: string;
  workflowStatusLabel?: string;
  updatedAt?: string;
  size?: number;
  deletable: boolean;
  protected: boolean;
  score: number;
  reasons: string[];
  ageDays?: number | null;
  linkDegree?: number;
};

export type WikiDeletionCandidatesPayload = {
  generatedAt: string;
  workspace: string;
  candidates: WikiDeletionCandidate[];
  summary?: {
    total?: number;
    high?: number;
    orphan?: number;
  };
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

export async function deleteWikiPage(path: string, reason: string, workspace: string, force = false) {
  return requestJson<{ status: string; path: string; title: string; reason?: string; workspace: string; timestamp: string; force?: boolean }>("/api/wiki/page/delete", {
    method: "POST",
    body: JSON.stringify({ path, reason, workspace, force }),
  });
}

export async function deleteWikiProjectPackage(projectKey: string, reason: string, workspace: string) {
  return requestJson<{
    status: string;
    projectKey: string;
    removedPaths: string[];
    removedCount: number;
    reason?: string;
    workspace: string;
    timestamp: string;
  }>("/api/wiki/project/delete", {
    method: "POST",
    body: JSON.stringify({ projectKey, reason, workspace }),
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

export async function fetchWikiGraph() {
  return requestJson<WikiGraphPayload>("/api/wiki/graph");
}

export async function refreshWikiGraph() {
  return requestJson<{ status?: string; command?: string; error?: string; stderr?: string; stdout?: string }>("/api/wiki/graph/refresh", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchWikiManagementCommands() {
  return requestJson<{ commands: WikiManagementCommand[] }>("/api/wiki/manage");
}

export async function runWikiManagementCommand(command: string) {
  return requestJson<WikiManagementCommand>("/api/wiki/manage", {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}

export async function applyWikiManagementCommand(commandId: string, dryRun = false) {
  return requestJson<WikiManagementApplyResult>("/api/wiki/manage/apply", {
    method: "POST",
    body: JSON.stringify({ commandId, dryRun }),
  });
}

export async function browseFilesystem(input: {
  path?: string;
  note?: string;
  extensions?: string[];
  maxDepth?: number;
  maxFiles?: number;
  maxEntriesPerDirectory?: number;
  maxTreeEntries?: number;
}) {
  return requestJson<FilesystemBrowsePayload>("/api/filesystem/browse", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function browseRemoteDrive(path = "") {
  return requestJson<RemoteBrowserPayload>("/api/drive/remote-browser", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export async function fetchCollectionStatus() {
  return requestJson<CollectionStatusPayload>("/api/collection/status");
}

export async function fetchWikiDeletionCandidates(workspace: string, limit = 24) {
  return requestJson<WikiDeletionCandidatesPayload>(`/api/wiki/deletion-candidates?workspace=${encodeURIComponent(workspace)}&limit=${encodeURIComponent(String(limit))}`);
}

export async function enqueueWikiDeletionCandidates(input: {
  workspace: string;
  paths?: string[];
  limit?: number;
}) {
  return requestJson<{ status: string; workspace: string; count: number }>("/api/wiki/deletion-candidates/enqueue", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
