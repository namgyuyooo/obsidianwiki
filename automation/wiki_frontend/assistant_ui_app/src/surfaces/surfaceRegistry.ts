export type PrimarySurfaceId = "chat" | "wiki" | "mission";

export type SurfaceId =
  | "chat"
  | "decisions"
  | "wiki"
  | "paperclip"
  | "ingest"
  | "mission"
  | "pipeline"
  | "spotlite"
  | "operations";

export type SurfaceStatus = "live" | "scaffold" | "fallback";

export type PrimarySurfaceDefinition = {
  id: PrimarySurfaceId;
  label: string;
  description: string;
  defaultSurfaceId: SurfaceId;
};

export type SurfaceDefinition = {
  id: SurfaceId;
  primary: PrimarySurfaceId;
  label: string;
  shortLabel: string;
  description: string;
  densityPattern: string;
  status: SurfaceStatus;
  legacyHash?: string;
  requiredEndpoints: readonly string[];
};

export const PRIMARY_SURFACES: readonly PrimarySurfaceDefinition[] = [
  { id: "chat", label: "채팅", description: "LLM 프로젝트 대화", defaultSurfaceId: "chat" },
  { id: "wiki", label: "위키 관련", description: "Decisions · Wiki · Ingest · Pipeline · Operations", defaultSurfaceId: "decisions" },
  { id: "mission", label: "Mission Control", description: "Command Center · Spotlite", defaultSurfaceId: "mission" },
] as const;

export const SURFACES: readonly SurfaceDefinition[] = [
  {
    id: "chat",
    primary: "chat",
    label: "GLM Chat",
    shortLabel: "채팅",
    description: "프로젝트 지침, 파일, 스킬 태그, 위키 근거를 묶어 대화합니다.",
    densityPattern: "Conversational workbench",
    status: "live",
    legacyHash: "#chat",
    requiredEndpoints: ["/api/chat/glm/stream", "/api/chat/files", "/api/chat/projects", "/api/chat/global", "/api/skills/catalog"],
  },
  {
    id: "decisions",
    primary: "wiki",
    label: "Decision Deck",
    shortLabel: "Decisions",
    description: "충돌, 미확정 사실, 승격 후보를 카드 단위로 판정합니다.",
    densityPattern: "Review deck",
    status: "live",
    legacyHash: "#decisions",
    requiredEndpoints: ["/api/decision-queue", "/api/decision-queue/:id/resolve", "/api/chat/glm/stream"],
  },
  {
    id: "wiki",
    primary: "wiki",
    label: "Evidence Console",
    shortLabel: "Wiki",
    description: "검색, 문서 preview/edit, status, graph, management command를 다루는 Evidence IDE입니다.",
    densityPattern: "Evidence IDE",
    status: "live",
    legacyHash: "#wiki",
    requiredEndpoints: ["/api/wiki/search", "/api/wiki/page", "/api/wiki/status", "/api/wiki/graph", "/api/wiki/graph/refresh"],
  },
  {
    id: "paperclip",
    primary: "wiki",
    label: "Paperclip Studio",
    shortLabel: "Paperclip",
    description: "스킬 템플릿, task composer, queue, event log, result review를 관리합니다.",
    densityPattern: "Skill operations bench",
    status: "live",
    legacyHash: "#paperclip",
    requiredEndpoints: ["/api/paperclip/status", "/api/paperclip/templates", "/api/paperclip/tasks", "/api/paperclip/trigger"],
  },
  {
    id: "ingest",
    primary: "wiki",
    label: "Ingest Workbench",
    shortLabel: "Ingest",
    description: "원문을 digest하고 지식 승격 후보로 보존하는 capture/promote surface입니다.",
    densityPattern: "Capture and promote",
    status: "live",
    legacyHash: "#ingest",
    requiredEndpoints: ["/api/llm/digest", "/api/knowledge/promote", "/api/knowledge/promotions"],
  },
  {
    id: "mission",
    primary: "mission",
    label: "Mission Dashboard",
    shortLabel: "Dashboard",
    description: "프로젝트 상태, 결정 대기, 자동화, 리스크를 한 화면에서 지휘합니다.",
    densityPattern: "Central command dashboard",
    status: "live",
    legacyHash: "#mission",
    requiredEndpoints: ["/api/projects/command-center", "/api/automation/status", "/api/automation/trigger"],
  },
  {
    id: "pipeline",
    primary: "wiki",
    label: "Pipeline Cockpit",
    shortLabel: "Pipeline",
    description: "Slack/Drive/OpenClaw/rclone 수집과 run history를 안전하게 실행합니다.",
    densityPattern: "Automation cockpit",
    status: "live",
    legacyHash: "#pipeline",
    requiredEndpoints: ["/api/slack/status", "/api/slack/channels", "/api/drive/targets", "/api/automation/status", "/api/automation/stop"],
  },
  {
    id: "spotlite",
    primary: "mission",
    label: "Spotlite",
    shortLabel: "Spotlite",
    description: "오늘/이번주 attention, work/personal digest, GLM refresh를 관리합니다.",
    densityPattern: "Daily brief board",
    status: "live",
    legacyHash: "#spotlite",
    requiredEndpoints: ["/api/spotlite", "/api/spotlite/glm-refresh", "/api/spotlite/templates"],
  },
  {
    id: "operations",
    primary: "wiki",
    label: "Operations",
    shortLabel: "Operations",
    description: "설정, 스케줄, LLM policy, coverage, safety state를 관리합니다.",
    densityPattern: "Admin control plane",
    status: "live",
    legacyHash: "#operations",
    requiredEndpoints: ["/api/settings", "/api/automation/schedules", "/api/ops/llm-policy", "/api/coverage", "/api/skills/draft"],
  },
] as const;

const SURFACE_ALIASES: Record<string, SurfaceId> = {
  "": "chat",
  decision: "decisions",
  "decision-deck": "decisions",
  "wiki-related": "decisions",
  paperclips: "paperclip",
  "spotlite-work": "spotlite",
  "spotlite-personal": "spotlite",
  command: "mission",
  "command-center": "mission",
};

export function normalizeSurfaceId(surface: string | null | undefined): SurfaceId {
  const value = String(surface || "").trim().toLowerCase();
  const alias = SURFACE_ALIASES[value];
  if (alias) return alias;
  return SURFACES.some((entry) => entry.id === value) ? (value as SurfaceId) : "chat";
}

export function getSurfaceDefinition(surface: SurfaceId): SurfaceDefinition {
  return SURFACES.find((entry) => entry.id === surface) || SURFACES[0];
}

export function getPrimarySurfaceDefinition(primary: PrimarySurfaceId): PrimarySurfaceDefinition {
  return PRIMARY_SURFACES.find((entry) => entry.id === primary) || PRIMARY_SURFACES[0];
}

export function getSurfacesByPrimary(primary: PrimarySurfaceId): readonly SurfaceDefinition[] {
  return SURFACES.filter((surface) => surface.primary === primary);
}
