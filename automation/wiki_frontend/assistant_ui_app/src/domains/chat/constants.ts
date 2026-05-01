type AssistantWorkspaceWindow = Window & typeof globalThis & {
  __WIKI_ASSISTANT_DEFAULT_WORKSPACE__?: string;
  __WIKI_ASSISTANT_ALLOWED_WORKSPACES__?: string[];
};

function normalizeWorkspace(value: string) {
  return value === "personal" ? "personal" : "rtm";
}

function injectedDefaultWorkspace() {
  if (typeof window === "undefined") return "";
  return normalizeWorkspace((window as AssistantWorkspaceWindow).__WIKI_ASSISTANT_DEFAULT_WORKSPACE__ || "");
}

function savedWorkspaceFallback() {
  if (typeof window === "undefined") return "";
  try {
    const saved = window.localStorage.getItem("wiki_ops_active_space");
    if (saved === "personal") return "personal";
    if (saved === "work") return "rtm";
  } catch {
    return "";
  }
  return "";
}

export const DEFAULT_WORKSPACE = injectedDefaultWorkspace() || savedWorkspaceFallback() || "rtm";
export const DEFAULT_PROJECT_ID = "default";

export const CHAT_API_ENDPOINTS = {
  stream: "/api/chat/glm/stream",
  stop: "/api/chat/stop",
  status: "/api/chat/status",
  files: "/api/chat/files",
  projects: "/api/chat/projects",
  global: "/api/chat/global",
  skills: "/api/skills/catalog",
  evidence: "/api/chat/evidence",
} as const;

export const ACCEPTED_ATTACHMENT_TYPES = [
  ".hwp",
  ".hwpx",
  ".pdf",
  ".docx",
  ".pptx",
  ".html",
  ".htm",
  ".xlsx",
  ".xls",
  ".csv",
  ".txt",
  ".md",
  ".json",
  "image/*",
].join(",");

export const STARTER_PROMPTS = [
  {
    title: "오늘 할 일",
    description: "업무 상태와 실행 우선순위 정리",
    prompt: "현재 프로젝트 상태, 리스크, 오늘 바로 해야 할 액션을 정리해줘.",
  },
  {
    title: "위키 반영",
    description: "변경 포인트와 충돌 후보 검토",
    prompt: "최근 들어온 자료를 기준으로 위키 반영 포인트와 충돌 가능성을 정리해줘.",
  },
  {
    title: "미팅 준비",
    description: "핵심 질문과 확인 포인트 정리",
    prompt: "미팅 전에 꼭 확인해야 할 질문 리스트를 만들어줘.",
  },
  {
    title: "추가 조사",
    description: "문서/근거 확인 순서 제안",
    prompt: "첨부 자료와 기존 위키 근거를 함께 보고 추가 조사 순서를 제안해줘.",
  },
] as const;

export type ChatContext = {
  workspace: string;
  projectId: string;
  skillTags: readonly string[];
};

function queryParam(name: string, fallback: string) {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name) || fallback;
  return name === "workspace" ? normalizeWorkspace(value) : value;
}

export function readChatContextFromUrl(): ChatContext {
  return {
    workspace: queryParam("workspace", DEFAULT_WORKSPACE),
    projectId: queryParam("projectId", DEFAULT_PROJECT_ID),
    skillTags: [],
  };
}
