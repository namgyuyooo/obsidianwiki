export type SlackRoutingSummary = {
  channelBuckets?: Record<string, number>;
  messageBuckets?: Record<string, number>;
  filterProviders?: Record<string, number>;
  filterErrors?: Record<string, number>;
  promotedDocuments?: number;
};

export type SlackStatusSnapshot = {
  configured?: boolean;
  authMode?: string;
  workspace?: string;
  collectedChannels?: number;
  lastCollectedAt?: string;
  routingSummary?: SlackRoutingSummary;
};

export type SlackChannel = {
  id?: string;
  name: string;
  type?: string;
  member_count?: number;
  is_archived?: boolean;
  routing?: {
    channel_profile?: {
      channel_bucket?: string;
    };
  };
};

export type SlackCollectResult = {
  status?: string;
  stdout?: string;
  stderr?: string;
  createdAt?: string;
  runId?: string;
};

export type DriveCandidate = {
  remotePath: string;
  folder?: string;
  score?: number;
  priority?: string;
  matchedProjectLabel?: string;
  tracked?: boolean;
  manifested?: boolean;
  missingKinds?: string[];
  reasons?: string[];
  instructionTargeted?: boolean;
};

export type DriveAnalysis = {
  createdAt?: string;
  source?: string;
  instruction?: string;
  summary?: Record<string, number | string>;
  plan?: {
    keywords?: string[];
    includeTerms?: string[];
    excludeTerms?: string[];
  };
  candidates?: DriveCandidate[];
};

export type SystemStatusPayload = {
  status: Record<string, string>;
  safety?: {
    driveDeleteSource?: string;
    sourceDriveProtected?: boolean;
  };
};

export type SettingsPayload = {
  settings: Record<string, string>;
  locked: Record<string, string>;
  secrets?: Record<string, boolean>;
  editableKeys?: string[];
};

export type CoveragePayload = {
  label?: string;
  progressPercent?: number;
  totalFolders?: number;
  drivesTracked?: number;
  statuses?: Record<string, number>;
  documentsInManifest?: number;
  processedDocuments?: number;
  localMirrorCleaned?: number;
  rows?: Array<{ drive?: string; folderPath?: string; status?: string; nextAction?: string }>;
  note?: string;
};

export type LlmPolicyPayload = {
  policies?: Array<{
    id?: string;
    label?: string;
    value?: string;
    note?: string;
    source?: string;
  }>;
  usage?: Array<Record<string, unknown>>;
};

export type AutomationSchedule = {
  id: string;
  name?: string;
  command?: string;
  dryRun?: boolean;
  mode?: string;
  runAt?: string;
  timeOfDay?: string;
  intervalMinutes?: number;
  nextRunAt?: string;
  enabled?: boolean;
};

export type SpotliteItem = {
  title?: string;
  path?: string;
  line?: string;
  project?: string;
  kind?: string;
  bucket?: string;
  score?: number;
};

export type SpotlitePayload = {
  scope: string;
  generatedAt?: string;
  summary?: Record<string, number>;
  analysis?: string[];
  digest?: {
    provider?: string;
    markdown?: string;
    todayPriorities?: string[];
    weeklyPriorities?: string[];
    risks?: string[];
    missingInputs?: string[];
  };
  today?: SpotliteItem[];
  week?: SpotliteItem[];
  risks?: SpotliteItem[];
  projects?: Array<{ project?: string; count?: number; risks?: number; actions?: number; latestPath?: string }>;
};

export type SpotliteTemplatesPayload = {
  templates: Array<{ id: string; title: string; description?: string; path?: string; markdown?: string }>;
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

export function fetchSlackStatus() {
  return requestJson<SlackStatusSnapshot>("/api/slack/status");
}

export function fetchSlackChannels(query = "") {
  return requestJson<{ channels: SlackChannel[] }>(`/api/slack/channels?limit=400&q=${encodeURIComponent(query)}`);
}

export function collectSlack(input: {
  channels: string[];
  oldestDays: number;
  limitPerChannel: number;
  dryRun?: boolean;
}) {
  return requestJson<SlackCollectResult>("/api/slack/collect", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchDriveAnalyses() {
  return requestJson<{ analyses: DriveAnalysis[] }>("/api/drive/targets");
}

export function analyzeDriveTargets() {
  return requestJson<DriveAnalysis>("/api/drive/targets", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function analyzeDriveInstruction(instruction: string) {
  return requestJson<DriveAnalysis>("/api/drive/instruction-targets", {
    method: "POST",
    body: JSON.stringify({ instruction }),
  });
}

export function runTargetedRclone(remotePath: string, dryRun = true) {
  return requestJson("/api/automation/target-rclone-copy", {
    method: "POST",
    body: JSON.stringify({ remotePath, dryRun }),
  });
}

export function continueAfterCollection() {
  return requestJson("/api/automation/continue-after-collection", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function stopAutomation(runId = "") {
  return requestJson("/api/automation/stop", {
    method: "POST",
    body: JSON.stringify({ runId }),
  });
}

export function fetchSystemStatus() {
  return requestJson<SystemStatusPayload>("/api/status");
}

export function fetchSettings() {
  return requestJson<SettingsPayload>("/api/settings");
}

export function saveSettings(settings: Record<string, string>) {
  return requestJson<SettingsPayload>("/api/settings", {
    method: "POST",
    body: JSON.stringify({ settings }),
  });
}

export function fetchCoverage() {
  return requestJson<CoveragePayload>("/api/coverage");
}

export function fetchLlmPolicy() {
  return requestJson<LlmPolicyPayload>("/api/ops/llm-policy");
}

export function fetchSchedules() {
  return requestJson<{ schedules: AutomationSchedule[] }>("/api/automation/schedules");
}

export function createSchedule(input: {
  name?: string;
  command: string;
  dryRun?: boolean;
  mode: string;
  runAt?: string;
  timeOfDay?: string;
  intervalMinutes?: number;
}) {
  return requestJson<{ schedule: AutomationSchedule }>("/api/automation/schedules", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteSchedule(id: string) {
  return requestJson<{ deleted: boolean; id: string }>(`/api/automation/schedules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function fetchSpotlite(scope: "work" | "personal") {
  return requestJson<SpotlitePayload>(`/api/spotlite?scope=${encodeURIComponent(scope)}`);
}

export function refreshSpotlite(scope: "work" | "personal") {
  return requestJson<SpotlitePayload>("/api/spotlite/glm-refresh", {
    method: "POST",
    body: JSON.stringify({ scope }),
  });
}

export function fetchSpotliteTemplates() {
  return requestJson<SpotliteTemplatesPayload>("/api/spotlite/templates");
}
