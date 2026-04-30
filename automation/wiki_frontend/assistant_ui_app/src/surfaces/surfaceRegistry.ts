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
  { id: "wiki", label: "위키", description: "검토, 위키, 수집, 설정", defaultSurfaceId: "decisions" },
  { id: "mission", label: "현황", description: "프로젝트 현황과 요약", defaultSurfaceId: "mission" },
] as const;

export const SURFACES: readonly SurfaceDefinition[] = [
  {
    id: "chat",
    primary: "chat",
    label: "GLM Chat",
    shortLabel: "채팅",
    description: "프로젝트 지침, 파일, 스킬 태그, 위키 근거를 묶어 대화합니다.",
    densityPattern: "대화",
    status: "live",
    legacyHash: "#chat",
    requiredEndpoints: ["/api/chat/glm/stream", "/api/chat/files", "/api/chat/projects", "/api/chat/global", "/api/skills/catalog"],
  },
  {
    id: "decisions",
    primary: "wiki",
    label: "검토",
    shortLabel: "검토",
    description: "충돌, 미확정 사실, 승격 후보를 카드 단위로 판정합니다.",
    densityPattern: "검토",
    status: "live",
    legacyHash: "#decisions",
    requiredEndpoints: ["/api/decision-queue", "/api/decision-queue/:id/resolve", "/api/chat/glm/stream"],
  },
  {
    id: "wiki",
    primary: "wiki",
    label: "위키",
    shortLabel: "Wiki",
    description: "문서 검색, 편집, 상태 확인, 그래프 업데이트를 처리합니다.",
    densityPattern: "문서 작업",
    status: "live",
    legacyHash: "#wiki",
    requiredEndpoints: ["/api/wiki/search", "/api/wiki/page", "/api/wiki/status", "/api/wiki/graph", "/api/wiki/graph/refresh"],
  },
  {
    id: "paperclip",
    primary: "wiki",
    label: "Paperclip",
    shortLabel: "Paperclip",
    description: "스킬 템플릿, 실행 대기열, 결과를 확인합니다.",
    densityPattern: "작업 관리",
    status: "live",
    legacyHash: "#paperclip",
    requiredEndpoints: ["/api/paperclip/status", "/api/paperclip/templates", "/api/paperclip/tasks", "/api/paperclip/trigger"],
  },
  {
    id: "ingest",
    primary: "wiki",
    label: "원문 정리",
    shortLabel: "Ingest",
    description: "원문을 요약하고 지식 승격 후보를 만듭니다.",
    densityPattern: "원문 처리",
    status: "live",
    legacyHash: "#ingest",
    requiredEndpoints: ["/api/llm/digest", "/api/knowledge/promote", "/api/knowledge/promotions"],
  },
  {
    id: "mission",
    primary: "mission",
    label: "프로젝트 현황",
    shortLabel: "현황",
    description: "프로젝트 상태, 결정 대기, 자동화, 리스크를 확인합니다.",
    densityPattern: "현황",
    status: "live",
    legacyHash: "#mission",
    requiredEndpoints: ["/api/projects/command-center", "/api/automation/status", "/api/automation/trigger"],
  },
  {
    id: "pipeline",
    primary: "wiki",
    label: "수집",
    shortLabel: "Pipeline",
    description: "Slack, Drive 등 수집 작업과 실행 이력을 확인합니다.",
    densityPattern: "수집",
    status: "live",
    legacyHash: "#pipeline",
    requiredEndpoints: ["/api/slack/status", "/api/slack/channels", "/api/drive/targets", "/api/automation/status", "/api/automation/stop"],
  },
  {
    id: "spotlite",
    primary: "mission",
    label: "Spotlite",
    shortLabel: "Spotlite",
    description: "오늘, 이번주, 리스크 중심으로 현황을 요약합니다.",
    densityPattern: "요약",
    status: "live",
    legacyHash: "#spotlite",
    requiredEndpoints: ["/api/spotlite", "/api/spotlite/glm-refresh", "/api/spotlite/templates"],
  },
  {
    id: "operations",
    primary: "wiki",
    label: "설정",
    shortLabel: "설정",
    description: "설정, 스케줄, 정책, 커버리지를 확인하고 수정합니다.",
    densityPattern: "설정",
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
