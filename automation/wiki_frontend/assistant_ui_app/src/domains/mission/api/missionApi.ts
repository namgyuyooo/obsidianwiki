export type MissionProject = {
  projectKey: string;
  projectLabel?: string;
  workflowStatus?: string;
  workflowStatusLabel?: string;
  decisionQueueCount?: number;
  pages?: Array<{ title?: string; path?: string; docKind?: string }>;
  nextActions?: string[];
  risks?: string[];
  coreDocuments?: Array<{ title?: string; path?: string; score?: number; priority?: string }>;
  lastActivityAt?: string;
  hubPath?: string;
};

export type MissionSummary = {
  projects: number;
  ongoing: number;
  decisionQueue: number;
  highPriorityDocuments: number;
};

export type MissionSnapshot = {
  generatedAt: string;
  workspace: string;
  summary: MissionSummary;
  projects: MissionProject[];
};

export type AutomationRun = {
  runId?: string;
  command?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  progress?: {
    summary?: string;
    percent?: number;
    currentFile?: string;
    lastLogLine?: string;
  };
};

export type AutomationSnapshot = {
  running: AutomationRun[];
  runs: AutomationRun[];
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

export async function fetchMissionSnapshot(workspace: string): Promise<MissionSnapshot> {
  return requestJson<MissionSnapshot>(`/api/projects/command-center?workspace=${encodeURIComponent(workspace)}`);
}

export async function fetchAutomationSnapshot(): Promise<AutomationSnapshot> {
  return requestJson<AutomationSnapshot>("/api/automation/status");
}

export async function triggerAutomation(command: string, dryRun = false) {
  return requestJson("/api/automation/trigger", {
    method: "POST",
    body: JSON.stringify({ command, dryRun }),
  });
}
