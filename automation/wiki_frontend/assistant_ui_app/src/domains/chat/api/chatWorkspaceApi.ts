import { CHAT_API_ENDPOINTS, type ChatContext } from "../constants";

export type ChatMemory = {
  id: string;
  title?: string;
  content: string;
  source?: string;
  confidence?: string;
  updatedAt?: string;
  createdAt?: string;
};

export type LinkedWikiProject = {
  workspace: string;
  projectKey: string;
  projectLabel: string;
  path?: string;
};

export type WikiProjectOption = LinkedWikiProject & {
  isProjectHub?: boolean;
};

export type ChatProject = {
  id: string;
  name: string;
  instructions?: string;
  workspace?: string;
  linkedWikiProject?: LinkedWikiProject | null;
  memories?: ChatMemory[];
  instructionCandidates?: ChatMemory[];
  messages?: Array<{ id?: string; role: string; content: string; createdAt?: string }>;
  updatedAt?: string;
};

export type ChatGlobalSettings = {
  instructions: string;
  autoMemory: boolean;
  updatedAt?: string;
};

export type SkillCatalogItem = {
  id: string;
  name?: string;
  title?: string;
  status?: string;
  description?: string;
};

export type ChatWorkspaceSnapshot = {
  projects: ChatProject[];
  global: ChatGlobalSettings;
};

export type ActiveChatRun = {
  projectId: string;
  status?: string;
  phase?: string;
  startedAt?: string;
};

type SaveProjectInput = {
  id?: string;
  name: string;
  instructions: string;
  workspace: string;
  linkedWikiProject?: LinkedWikiProject | null;
};

type WikiIndexPage = {
  division?: string;
  projectKey?: string;
  projectLabel?: string;
  path?: string;
  isProjectHub?: boolean;
};

type WikiIndexPayload = {
  pages?: WikiIndexPage[];
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

export function projectWorkspaceFromContext(chatContext: ChatContext) {
  return chatContext.workspace === "personal" ? "personal" : "work";
}

export function wikiWorkspaceFromContext(chatContext: ChatContext) {
  return chatContext.workspace === "personal" ? "personal" : "rtm";
}

export async function fetchChatWorkspace(): Promise<ChatWorkspaceSnapshot> {
  return requestJson<ChatWorkspaceSnapshot>(CHAT_API_ENDPOINTS.projects);
}

export async function fetchActiveChatRuns(): Promise<ActiveChatRun[]> {
  const payload = await requestJson<{ active: ActiveChatRun[] }>(CHAT_API_ENDPOINTS.status);
  return payload.active || [];
}

export async function fetchWikiProjectOptions(workspace: string): Promise<WikiProjectOption[]> {
  const payload = await requestJson<WikiIndexPayload>(`/api/wiki/index?workspace=${encodeURIComponent(workspace)}`);
  const seen = new Map<string, WikiProjectOption>();
  for (const page of payload.pages || []) {
    const isEligibleDivision = page.division === "project" || page.division === "account";
    if (!isEligibleDivision || !page.projectKey) continue;
    const option: WikiProjectOption = {
      workspace,
      projectKey: page.projectKey,
      projectLabel: page.projectLabel || page.projectKey,
      path: page.path || "",
      isProjectHub: Boolean(page.isProjectHub),
    };
    const existing = seen.get(page.projectKey);
    if (!existing || (!existing.isProjectHub && option.isProjectHub)) {
      seen.set(page.projectKey, option);
    }
  }
  return [...seen.values()]
    .map(({ isProjectHub: _isProjectHub, ...option }) => option)
    .sort((a, b) => a.projectLabel.localeCompare(b.projectLabel));
}

export async function fetchSkillCatalog(): Promise<SkillCatalogItem[]> {
  const payload = await requestJson<{ skills: SkillCatalogItem[] }>(CHAT_API_ENDPOINTS.skills);
  return payload.skills || [];
}

export async function saveChatProject(input: SaveProjectInput): Promise<ChatProject> {
  const payload = await requestJson<{ project: ChatProject }>(CHAT_API_ENDPOINTS.projects, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.project;
}

export async function deleteChatProject(projectId: string) {
  return requestJson<{ deleted: boolean; id: string }>(
    `${CHAT_API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}`,
    { method: "DELETE" },
  );
}

export async function saveChatGlobalSettings(global: ChatGlobalSettings): Promise<ChatGlobalSettings> {
  const payload = await requestJson<{ global: ChatGlobalSettings }>(CHAT_API_ENDPOINTS.global, {
    method: "POST",
    body: JSON.stringify(global),
  });
  return payload.global;
}

export async function deleteChatProjectMessage(projectId: string, messageId: string) {
  return requestJson<{ deleted: boolean; projectId: string; messageId: string }>(
    `${CHAT_API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE" },
  );
}

export async function moveChatProjectMessages(sourceProjectId: string, targetProjectId: string) {
  return requestJson<{ moved: number; sourceProject: ChatProject; targetProject: ChatProject }>(
    `${CHAT_API_ENDPOINTS.projects}/${encodeURIComponent(sourceProjectId)}/messages/move`,
    {
      method: "POST",
      body: JSON.stringify({ targetProjectId }),
    },
  );
}

export async function stopChatProjectRun(projectId: string) {
  return requestJson<{ stopped: boolean; projectId: string }>(CHAT_API_ENDPOINTS.stop, {
    method: "POST",
    body: JSON.stringify({ projectId }),
  });
}

export async function promoteInstructionCandidate(projectId: string, candidateId: string): Promise<ChatProject> {
  const payload = await requestJson<{ project: ChatProject }>(
    `${CHAT_API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}/instruction-candidates/${encodeURIComponent(candidateId)}/promote`,
    { method: "POST" },
  );
  return payload.project;
}

export async function deleteInstructionCandidate(projectId: string, candidateId: string) {
  return requestJson<{ deleted: boolean; projectId: string; candidateId: string }>(
    `${CHAT_API_ENDPOINTS.projects}/${encodeURIComponent(projectId)}/instruction-candidates/${encodeURIComponent(candidateId)}`,
    { method: "DELETE" },
  );
}
