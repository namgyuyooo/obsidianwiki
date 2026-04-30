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

export type PipelineStatePayload = {
  updatedAt?: string;
  state?: Record<string, unknown>;
};

export type CollectionPlan = {
  objective?: string;
  sources?: Partial<Record<"slack" | "drive" | "filesystem", boolean>>;
  scope?: {
    slack?: {
      channels?: string[];
      sinceDate?: string;
      untilDate?: string;
      oldestDays?: number;
      limitPerChannel?: number;
      includeThreads?: boolean;
      includeFiles?: boolean;
    };
    drive?: {
      remotePath?: string;
      candidate?: DriveCandidate;
    };
    filesystem?: {
      path?: string;
      maxDepth?: number;
      maxFiles?: number;
      maxEntriesPerDirectory?: number;
    };
  };
  execution?: {
    mode?: string;
    completionMode?: string;
    connectionPolicy?: string;
    retryAfterMinutes?: number;
    continueAfterCollect?: boolean;
    refreshAfterCollect?: boolean;
  };
  rules?: Record<string, string>;
  existingMode?: string;
  skillRoutes?: Array<Record<string, unknown>>;
};

export type PipelineRunStep = {
  id?: string;
  label?: string;
  status?: string;
  detail?: string;
  command?: string;
  runId?: string;
};

export type PipelineFileStatus = {
  path?: string;
  source?: string;
  ext?: string;
  extractor?: string;
  skill?: string;
  status?: string;
  wikiTarget?: string;
  action?: string;
  warnings?: string[];
  channel?: string;
  channelId?: string;
  messages?: number;
  order?: string;
  pages?: number;
  exhausted?: boolean;
  downloadedFiles?: number;
  analyzedFiles?: number;
  promotedDocuments?: number;
  promotedProjects?: number;
  newestTs?: string;
  oldestTs?: string;
};

export type PipelineRunRecord = {
  runId?: string;
  command?: string;
  status?: string;
  createdAt?: string;
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  currentStep?: string;
  steps?: PipelineRunStep[];
  fileStatuses?: PipelineFileStatus[];
  summary?: Record<string, unknown>;
  errors?: string[];
};

export type FilesystemBrowsePayload = {
  files?: string[];
  directories?: string[];
  blocked?: string[];
  entries?: Array<{
    path?: string;
    type?: string;
    fileCount?: number;
    directoryCount?: number;
    tree?: Array<{
      depth?: number;
      path?: string;
      type?: string;
    }>;
    ext?: string;
    size?: number;
    updatedAt?: string;
  }>;
};

export type FilesystemRoot = {
  key?: string;
  label?: string;
  path: string;
  exists?: boolean;
};

export type FilesystemCollectResult = {
  runId?: string;
  command?: string;
  status?: string;
  stdout?: string;
  stderr?: string;
  browse?: FilesystemBrowsePayload;
  steps?: Array<{ command?: string; status?: string; stdout?: string }>;
};

export type FilesystemFolderImportResult = {
  status?: string;
  importedFiles?: number;
  skippedFiles?: number;
  mirrorBatchPath?: string;
  browse?: FilesystemBrowsePayload;
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

export type LlmUsageEntry = {
  id?: string;
  createdAt?: string;
  provider?: string;
  feature?: string;
  reason?: string;
  model?: string;
  status?: string;
  durationMs?: number;
  fallback?: string;
  error?: string;
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
  completionMode?: string;
  connectionPolicy?: string;
  retryAfterMinutes?: number;
  retentionDays?: number;
  scope?: "uploads" | "all";
  cleanupMode?: "age" | "processed" | "processed_or_age";
  retentionMaxBytes?: number;
  retentionManaged?: boolean;
};

export type MirrorRootSnapshot = {
  path?: string;
  exists?: boolean;
  fileCount?: number;
  directoryCount?: number;
  totalBytes?: number;
  oldestAt?: string;
  newestAt?: string;
  olderThanDays?: number;
  staleFileCount?: number;
  staleBytes?: number;
};

export type MirrorStatusPayload = {
  roots?: {
    all?: MirrorRootSnapshot;
    uploads?: MirrorRootSnapshot;
  };
  retention?: {
    enabled?: boolean;
    days?: number;
    scope?: "uploads" | "all";
    cleanupMode?: "age" | "processed" | "processed_or_age";
    maxBytes?: number;
    timeOfDay?: string;
    updatedAt?: string;
    scheduleId?: string;
    nextRunAt?: string;
    scheduleEnabled?: boolean;
  };
};

export type MirrorCleanupPayload = {
  scope?: "uploads" | "all";
  rootPath?: string;
  dryRun?: boolean;
  deleteAll?: boolean;
  olderThanDays?: number;
  cleanupMode?: "age" | "processed" | "processed_or_age";
  thresholdBytes?: number;
  currentBytes?: number;
  skipped?: boolean;
  skipReason?: string;
  exists?: boolean;
  matchedFiles?: number;
  deletedFiles?: number;
  deletedDirectories?: number;
  freedBytes?: number;
  samplePaths?: Array<{ path?: string; size?: number; modifiedAt?: string }>;
  executedAt?: string;
};

export type CoreDocumentRecord = {
  key?: string;
  title?: string;
  driveName?: string;
  folderPath?: string;
  filePath?: string;
  modifiedTime?: string;
  projectKey?: string;
  projectLabel?: string;
  projectMatchScore?: number;
  score?: number;
  priority?: string;
  status?: string;
  statusLabel?: string;
  note?: string;
  importance?: string;
  updatedAt?: string;
  connections?: {
    inSources?: boolean;
    inEvidence?: boolean;
    inActions?: boolean;
    inDecisions?: boolean;
    inRisks?: boolean;
    inUsage?: boolean;
  };
};

export type CoreDocumentsPayload = {
  manifestPath?: string;
  documents?: CoreDocumentRecord[];
  summary?: {
    manifestDocuments?: number;
    coreCandidates?: number;
    highPriority?: number;
    used?: number;
    decisionEvidence?: number;
  };
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
  operations?: Array<{
    project?: string;
    projectKey?: string;
    coverage?: number;
    decisionQueueCount?: number;
    missingDocs?: string[];
    actions?: string[];
    latestStatusMemo?: string;
    rawEvidence?: string;
    hubPath?: string;
  }>;
  projects?: Array<{ project?: string; count?: number; risks?: number; actions?: number; latestPath?: string }>;
};

export type SpotliteTemplatesPayload = {
  templates: Array<{ id: string; title: string; description?: string; path?: string; markdown?: string }>;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    headers: isFormData ? init?.headers : {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(response.ok ? `JSON parse failure from ${path}` : text);
    }
  }
  if (!response.ok || payload.error) {
    throw new Error(String(payload.error || `HTTP ${response.status}`));
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
  sinceDate?: string;
  untilDate?: string;
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

export function runTargetedRclone(remotePath: string, dryRun = true, options: { existingMode?: string } = {}) {
  return requestJson("/api/automation/target-rclone-copy", {
    method: "POST",
    body: JSON.stringify({ remotePath, dryRun, ...options }),
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

export function fetchPipelineState() {
  return requestJson<PipelineStatePayload>("/api/pipeline/state");
}

export function savePipelineState(state: Record<string, unknown>) {
  return requestJson<PipelineStatePayload>("/api/pipeline/state", {
    method: "POST",
    body: JSON.stringify({ state }),
  });
}

export function planPipelineCollection(plan: CollectionPlan) {
  return requestJson<{ plan: CollectionPlan; preview: PipelineRunRecord }>("/api/pipeline/plan", {
    method: "POST",
    body: JSON.stringify({ collectionPlan: plan }),
  });
}

export function testPipelineCollection(plan: CollectionPlan) {
  return requestJson<{ run: PipelineRunRecord }>("/api/pipeline/test", {
    method: "POST",
    body: JSON.stringify({ collectionPlan: plan }),
  });
}

export function runPipelineCollection(plan: CollectionPlan) {
  return requestJson<{ run: PipelineRunRecord }>("/api/pipeline/run", {
    method: "POST",
    body: JSON.stringify({ collectionPlan: plan }),
  });
}

export function fetchPipelineRuns() {
  return requestJson<{ runs: PipelineRunRecord[] }>("/api/pipeline/runs");
}

export function fetchPipelineRun(runId: string) {
  return requestJson<{ run: PipelineRunRecord }>(`/api/pipeline/runs/${encodeURIComponent(runId)}`);
}

export function fetchFilesystemRoots() {
  return requestJson<{ roots: FilesystemRoot[] }>("/api/filesystem/roots");
}

export function browseFilesystem(input: {
  path: string;
  maxDepth?: number;
  maxFiles?: number;
  maxEntriesPerDirectory?: number;
}) {
  return requestJson<FilesystemBrowsePayload>("/api/filesystem/browse", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function importFilesystemFolder(form: FormData) {
  return requestJson<FilesystemFolderImportResult>("/api/filesystem/import-folder", {
    method: "POST",
    body: form,
  });
}

export function collectFilesystem(input: {
  path: string;
  dryRun?: boolean;
  continueAfter?: boolean;
  refreshAfter?: boolean;
  maxDepth?: number;
  maxFiles?: number;
  maxEntriesPerDirectory?: number;
}) {
  return requestJson<FilesystemCollectResult>("/api/filesystem/collect", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchCoverage() {
  return requestJson<CoveragePayload>("/api/coverage");
}

export function fetchLlmPolicy() {
  return requestJson<LlmPolicyPayload>("/api/ops/llm-policy");
}

export function fetchLlmUsage() {
  return requestJson<{ usage: LlmUsageEntry[] }>("/api/ops/llm-usage");
}

export function fetchSchedules() {
  return requestJson<{ schedules: AutomationSchedule[] }>("/api/automation/schedules");
}

export function fetchCoreDocuments(workspace = "rtm") {
  return requestJson<CoreDocumentsPayload>(`/api/documents/core?workspace=${encodeURIComponent(workspace)}`);
}

export function fetchMirrorStatus() {
  return requestJson<MirrorStatusPayload>("/api/mirror/status");
}

export function cleanupMirror(input: {
  scope?: "uploads" | "all";
  olderThanDays?: number;
  dryRun?: boolean;
  deleteAll?: boolean;
  cleanupMode?: "age" | "processed" | "processed_or_age";
  thresholdBytes?: number;
}) {
  return requestJson<MirrorCleanupPayload>("/api/mirror/cleanup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function saveMirrorRetention(input: {
  enabled: boolean;
  days?: number;
  scope?: "uploads" | "all";
  cleanupMode?: "age" | "processed" | "processed_or_age";
  maxBytes?: number;
  timeOfDay?: string;
}) {
  return requestJson<MirrorStatusPayload>("/api/mirror/retention", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createSchedule(input: {
  name?: string;
  command: string;
  dryRun?: boolean;
  mode: string;
  runAt?: string;
  timeOfDay?: string;
  intervalMinutes?: number;
  completionMode?: string;
  connectionPolicy?: string;
  retryAfterMinutes?: number;
  retentionDays?: number;
  scope?: "uploads" | "all";
  cleanupMode?: "age" | "processed" | "processed_or_age";
  retentionMaxBytes?: number;
  retentionManaged?: boolean;
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
