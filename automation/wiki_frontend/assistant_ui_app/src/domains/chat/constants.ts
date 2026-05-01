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
    title: "핵심 이해",
    description: "문서와 문맥을 빠르게 파악",
    prompt: "이 프로젝트의 핵심 맥락, 주요 논점, 지금 알아야 할 배경을 설명해줘.",
  },
  {
    title: "문서 비교",
    description: "관련 문서 차이와 의미 정리",
    prompt: "관련 문서들 사이의 차이, 충돌 가능성, 실무상 의미를 비교해줘.",
  },
  {
    title: "초안 작성",
    description: "메일, 보고, 메모 초안 생성",
    prompt: "현재 위키 근거를 바탕으로 바로 쓸 수 있는 초안 문서를 작성해줘.",
  },
  {
    title: "추가 조사",
    description: "무엇을 더 확인할지 제안",
    prompt: "지금 정보로 부족한 점과 추가로 확인할 문서/질문/근거를 제안해줘.",
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
