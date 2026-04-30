export type MissionProject = {
  projectKey: string;
  projectLabel?: string;
  division?: string;
  workflowStatus?: string;
  workflowStatusLabel?: string;
  workflowTags?: string[];
  decisionQueueCount?: number;
  pages?: Array<{ title?: string; path?: string; docKind?: string }>;
  oneLine?: string;
  recentMemos?: string[];
  nextActions?: string[];
  risks?: string[];
  decisions?: string[];
  conflicts?: string[];
  coreDocuments?: Array<{ title?: string; path?: string; score?: number; priority?: string }>;
  operationalDocs?: Array<{
    file?: string;
    label?: string;
    path?: string;
    present?: boolean;
    hasContent?: boolean;
    updatedAt?: string;
    docKind?: string;
  }>;
  missingOperationalDocs?: string[];
  operationalCoverage?: number;
  statusMemos?: string[];
  businessFlow?: string[];
  ceoBrief?: string[];
  pmActions?: string[];
  customerFollowups?: string[];
  rawEvidence?: string[];
  opsActions?: string[];
  lastActivityAt?: string;
  hubPath?: string;
  score?: number;
};

export type MissionSummary = {
  projects: number;
  ongoing: number;
  decisionQueue: number;
  highPriorityDocuments: number;
  operationalReady?: number;
  operationalGaps?: number;
};

export type MissionSnapshot = {
  generatedAt: string;
  workspace: string;
  summary: MissionSummary;
  projects: MissionProject[];
};

export type ProjectBriefPayload = {
  generatedAt: string;
  mode?: string;
  project: MissionProject;
  brief: string[];
};

export type ProjectGovernancePayload = {
  generatedAt?: string;
  workspace?: string;
  registryPath?: string;
  summary?: {
    projects?: number;
    projectPages?: number;
    projectsWithIssues?: number;
    missingProjectKeyPages?: number;
    mismatchedProjectKeyPages?: number;
    missingCanonicalDocs?: number;
  };
  projects?: Array<{
    projectKey: string;
    projectLabel?: string;
    issues?: Array<{ code?: string; severity?: string; message?: string; path?: string }>;
    missingDocs?: string[];
    canonicalCoverage?: number;
    canonicalExpected?: number;
  }>;
};

export type AutomationRun = {
  runId?: string;
  command?: string;
  status?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
  progress?: {
    summary?: string;
    percent?: number;
    transferred?: string;
    speed?: string;
    eta?: string;
    currentFile?: string;
    lastLogLine?: string;
    recentLines?: string[];
    updatedAt?: string;
  };
  slackScopeKey?: string;
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

export async function fetchProjectBrief(projectKey: string, workspace: string) {
  return requestJson<ProjectBriefPayload>(
    `/api/projects/${encodeURIComponent(projectKey)}/brief?workspace=${encodeURIComponent(workspace)}`,
  );
}

export async function fetchProjectGovernance(workspace: string) {
  return requestJson<ProjectGovernancePayload>(
    `/api/wiki/project-governance?workspace=${encodeURIComponent(workspace)}`,
  );
}

export async function appendProjectAction(projectKey: string, input: {
  workspace: string;
  action: string;
  owner?: string;
  due?: string;
  status?: string;
  evidencePath?: string;
}) {
  return requestJson<{ status: string; path: string; updatedAt: string }>(
    `/api/projects/${encodeURIComponent(projectKey)}/action`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function appendProjectDecision(projectKey: string, input: {
  workspace: string;
  title?: string;
  decision: string;
  action?: "approve" | "hold" | "investigate";
  note?: string;
}) {
  return requestJson<{ status: string; action?: string; appliedPath?: string; targetFile?: string }>(
    `/api/projects/${encodeURIComponent(projectKey)}/decision`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function runWikiManagementCommand(command: string) {
  return requestJson<{ id?: string; title?: string; operations?: Array<Record<string, unknown>>; summary?: string }>(
    "/api/wiki/manage",
    {
      method: "POST",
      body: JSON.stringify({ command }),
    },
  );
}
