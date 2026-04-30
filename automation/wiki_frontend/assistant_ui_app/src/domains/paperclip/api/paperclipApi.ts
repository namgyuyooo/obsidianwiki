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

export type PaperclipSnapshot = {
  available: boolean;
  url: string;
  status: string;
  recommendedAgents: string[];
  templates: PaperclipTemplate[];
  tasks: PaperclipTask[];
  events: PaperclipEvent[];
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
  const [status, queue] = await Promise.all([
    requestJson<PaperclipSnapshot>("/api/paperclip/status"),
    requestJson<{ tasks: PaperclipTask[]; events: PaperclipEvent[] }>("/api/paperclip/tasks"),
  ]);
  return {
    ...status,
    tasks: queue.tasks || status.tasks || [],
    events: queue.events || status.events || [],
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
}) {
  return requestJson<{ task: PaperclipTask; result: Record<string, unknown> }>("/api/paperclip/trigger", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function triggerExistingPaperclipTask(taskId: string) {
  return requestJson<{ task: PaperclipTask; result: Record<string, unknown> }>(
    `/api/paperclip/tasks/${encodeURIComponent(taskId)}/trigger`,
    { method: "POST" },
  );
}
