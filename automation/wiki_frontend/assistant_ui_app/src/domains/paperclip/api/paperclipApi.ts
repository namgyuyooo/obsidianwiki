export type PaperclipTemplate = {
  id: string;
  agent: string;
  title: string;
  description: string;
  command: string;
  dryRun?: boolean;
  safety?: string;
  inputHint?: string;
  output?: string;
};

export type PaperclipTask = {
  id: string;
  templateId: string;
  agent?: string;
  title?: string;
  description?: string;
  command?: string;
  dryRun?: boolean;
  status?: string;
  safety?: {
    mode?: string;
    driveDeleteSource?: boolean;
    remoteDeleteAllowed?: boolean;
  };
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  finishedAt?: string;
};

export type PaperclipEvent = {
  taskId?: string;
  type?: string;
  message?: string;
  resultStatus?: string;
  createdAt?: string;
};

export type PaperclipRunArtifact = {
  name: string;
  kind?: string;
  path?: string;
  size?: number;
  updatedAt?: string;
};

export type PaperclipRun = {
  runId: string;
  runPath?: string;
  taskId?: string;
  templateId?: string;
  title?: string;
  phase?: string;
  provider?: string;
  updatedAt?: string;
  sourcePaths?: string[];
  planMode?: boolean;
  chunkCount?: number;
  preferredArtifactName?: string;
  artifacts: PaperclipRunArtifact[];
  state?: Record<string, unknown> | null;
};

export type PaperclipSnapshot = {
  available: boolean;
  url: string;
  status: string;
  recommendedAgents: string[];
  templates: PaperclipTemplate[];
  tasks: PaperclipTask[];
  events: PaperclipEvent[];
  runs: PaperclipRun[];
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

export async function fetchPaperclipSnapshot(): Promise<PaperclipSnapshot> {
  const [status, queue, runs] = await Promise.all([
    requestJson<PaperclipSnapshot>("/api/paperclip/status"),
    requestJson<{ tasks: PaperclipTask[]; events: PaperclipEvent[] }>("/api/paperclip/tasks"),
    requestJson<{ runs: PaperclipRun[] }>("/api/paperclip/runs"),
  ]);
  return {
    ...status,
    tasks: queue.tasks || status.tasks || [],
    events: queue.events || status.events || [],
    runs: runs.runs || status.runs || [],
  };
}

export async function createPaperclipTask(input: {
  templateId: string;
  title?: string;
  dryRun?: boolean;
  payload?: Record<string, unknown>;
}) {
  return requestJson<{ task: PaperclipTask }>("/api/paperclip/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function triggerPaperclipTemplate(input: {
  templateId: string;
  title?: string;
  dryRun?: boolean;
  payload?: Record<string, unknown>;
  async?: boolean;
}) {
  return requestJson<{ task: PaperclipTask; result: Record<string, unknown> }>("/api/paperclip/trigger", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function triggerExistingPaperclipTask(taskId: string, options?: { async?: boolean }) {
  return requestJson<{ task: PaperclipTask; result: Record<string, unknown> }>(
    `/api/paperclip/tasks/${encodeURIComponent(taskId)}/trigger`,
    {
      method: "POST",
      body: JSON.stringify(options || {}),
    },
  );
}

export async function fetchPaperclipRun(runId: string) {
  return requestJson<{ run: PaperclipRun }>(`/api/paperclip/runs/${encodeURIComponent(runId)}`);
}

export async function fetchPaperclipRunArtifact(runId: string, artifactName: string) {
  return requestJson<{ runId: string; artifact: PaperclipRunArtifact; content: string }>(
    `/api/paperclip/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactName)}`,
  );
}
