import { useEffect, useState } from "react";
import type { ChatContext } from "../constants";
import {
  deleteChatProject,
  fetchChatWorkspace,
  fetchSkillCatalog,
  fetchWikiProjectOptions,
  projectWorkspaceFromContext,
  saveChatGlobalSettings,
  saveChatProject,
  wikiWorkspaceFromContext,
  type ChatGlobalSettings,
  type LinkedWikiProject,
  type ChatProject,
  type SkillCatalogItem,
  type WikiProjectOption,
} from "../api/chatWorkspaceApi";

function skillStorageKey(workspace: string, projectId: string) {
  return `assistant-ui:skills:${workspace}:${projectId}`;
}

const DEFAULT_GLOBAL_SETTINGS: ChatGlobalSettings = {
  instructions: "",
  autoMemory: true,
};

type WorkspaceStatus =
  | { phase: "loading"; message: string }
  | { phase: "ready"; message: string }
  | { phase: "saving"; message: string }
  | { phase: "failed"; message: string };

export type ChatWorkspaceState = {
  projects: ChatProject[];
  activeProject: ChatProject | null;
  activeProjectId: string;
  global: ChatGlobalSettings;
  skills: SkillCatalogItem[];
  wikiProjectOptions: WikiProjectOption[];
  selectedSkillTags: string[];
  status: WorkspaceStatus;
  selectProject: (projectId: string) => void;
  createProject: () => Promise<void>;
  saveActiveProject: (input: { name: string; instructions: string; linkedWikiProject: LinkedWikiProject | null }) => Promise<void>;
  deleteActiveProject: () => Promise<void>;
  saveGlobal: (global: ChatGlobalSettings) => Promise<void>;
  toggleSkillTag: (skillId: string) => void;
  selectSkillTag: (skillId: string) => void;
  removeSkillTag: (skillId: string) => void;
  reload: (nextActiveProjectId?: string) => Promise<void>;
};

export function useChatWorkspace(initialContext: ChatContext): ChatWorkspaceState {
  const [projects, setProjects] = useState<ChatProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState(initialContext.projectId);
  const [global, setGlobal] = useState<ChatGlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [wikiProjectOptions, setWikiProjectOptions] = useState<WikiProjectOption[]>([]);
  const [selectedSkillTags, setSelectedSkillTags] = useState<string[]>([]);
  const [status, setStatus] = useState<WorkspaceStatus>({
    phase: "loading",
    message: "프로젝트와 스킬 카탈로그를 불러오는 중입니다.",
  });

  const workspace = projectWorkspaceFromContext(initialContext);
  const wikiWorkspace = wikiWorkspaceFromContext(initialContext);
  const projectsInWorkspace = projects.filter((project) => (project.workspace || "work") === workspace);
  const activeProject = projectsInWorkspace.find((project) => project.id === activeProjectId) || projectsInWorkspace[0] || null;

  async function reload(nextActiveProjectId = activeProjectId) {
    const [workspaceSnapshot, skillCatalog, wikiProjectCatalog] = await Promise.all([
      fetchChatWorkspace(),
      fetchSkillCatalog(),
      fetchWikiProjectOptions(wikiWorkspace),
    ]);
    const nextProjects = workspaceSnapshot.projects || [];
    const scopedProjects = nextProjects.filter((project) => (project.workspace || "work") === workspace);
    const nextActive = scopedProjects.some((project) => project.id === nextActiveProjectId)
      ? nextActiveProjectId
      : scopedProjects[0]?.id || "";
    setProjects(nextProjects);
    setGlobal(workspaceSnapshot.global || DEFAULT_GLOBAL_SETTINGS);
    setSkills(skillCatalog);
    setWikiProjectOptions(wikiProjectCatalog);
    setActiveProjectId(nextActive);
    setStatus({ phase: "ready", message: "assistant-ui workspace가 동기화되었습니다." });
  }

  useEffect(() => {
    let cancelled = false;
    setStatus({ phase: "loading", message: "프로젝트와 스킬 카탈로그를 불러오는 중입니다." });
    Promise.all([fetchChatWorkspace(), fetchSkillCatalog(), fetchWikiProjectOptions(wikiWorkspace)])
      .then(([workspaceSnapshot, skillCatalog, wikiProjectCatalog]) => {
        if (cancelled) return;
        const nextProjects = workspaceSnapshot.projects || [];
        const scopedProjects = nextProjects.filter((project) => (project.workspace || "work") === workspace);
        const nextActive = scopedProjects.some((project) => project.id === initialContext.projectId)
          ? initialContext.projectId
          : scopedProjects[0]?.id || "";
        setProjects(nextProjects);
        setGlobal(workspaceSnapshot.global || DEFAULT_GLOBAL_SETTINGS);
        setSkills(skillCatalog);
        setWikiProjectOptions(wikiProjectCatalog);
        setActiveProjectId(nextActive);
        setStatus({ phase: "ready", message: "assistant-ui workspace가 준비되었습니다." });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({ phase: "failed", message: String((error as Error)?.message || error) });
      });
    return () => {
      cancelled = true;
    };
  }, [initialContext.projectId, wikiWorkspace, workspace]);

  useEffect(() => {
    const storageProjectId = activeProject?.id || activeProjectId;
    if (!storageProjectId) {
      setSelectedSkillTags([...initialContext.skillTags]);
      return;
    }
    const saved = window.localStorage.getItem(skillStorageKey(workspace, storageProjectId));
    if (!saved) {
      setSelectedSkillTags([...initialContext.skillTags]);
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      setSelectedSkillTags(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
    } catch {
      setSelectedSkillTags([...initialContext.skillTags]);
    }
  }, [activeProject?.id, activeProjectId, initialContext.skillTags, workspace]);

  useEffect(() => {
    const storageProjectId = activeProject?.id || activeProjectId;
    if (!storageProjectId) return;
    window.localStorage.setItem(
      skillStorageKey(workspace, storageProjectId),
      JSON.stringify(selectedSkillTags),
    );
  }, [activeProject?.id, activeProjectId, selectedSkillTags, workspace]);

  const selectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setStatus({ phase: "ready", message: "프로젝트 컨텍스트를 전환했습니다." });
  };

  const createProject = async () => {
    setStatus({ phase: "saving", message: "새 assistant-ui 프로젝트를 생성 중입니다." });
    const project = await saveChatProject({
      name: workspace === "personal" ? "새 개인 챗" : "새 업무 챗",
      instructions: workspace === "personal"
        ? "개인용 위키와 개인 메모리 범위에서만 답한다."
        : "업무용 RTM 위키와 고객 프로젝트 운영 범위에서 답한다.",
      workspace,
    });
    await reload(project.id);
  };

  const saveActiveProject = async (input: { name: string; instructions: string; linkedWikiProject: LinkedWikiProject | null }) => {
    if (!activeProject) return;
    setStatus({ phase: "saving", message: "프로젝트 지침과 위키 연결을 저장 중입니다." });
    const project = await saveChatProject({
      id: activeProject.id,
      name: input.name,
      instructions: input.instructions,
      workspace,
      linkedWikiProject: input.linkedWikiProject,
    });
    await reload(project.id);
  };

  const deleteActiveProject = async () => {
    if (!activeProject) return;
    setStatus({ phase: "saving", message: "프로젝트를 삭제 중입니다." });
    await deleteChatProject(activeProject.id);
    await reload("");
  };

  const saveGlobal = async (nextGlobal: ChatGlobalSettings) => {
    setStatus({ phase: "saving", message: "전역 지침을 저장 중입니다." });
    const saved = await saveChatGlobalSettings(nextGlobal);
    setGlobal(saved);
    setStatus({ phase: "ready", message: "전역 지침을 저장했습니다." });
  };

  const toggleSkillTag = (skillId: string) => {
    setSelectedSkillTags((current) => current.includes(skillId)
      ? current.filter((id) => id !== skillId)
      : [...current, skillId]);
  };

  const selectSkillTag = (skillId: string) => {
    setSelectedSkillTags((current) => (current.includes(skillId) ? current : [...current, skillId]));
  };

  const removeSkillTag = (skillId: string) => {
    setSelectedSkillTags((current) => current.filter((id) => id !== skillId));
  };

  return {
    projects: projectsInWorkspace,
    activeProject,
    activeProjectId: activeProject?.id || activeProjectId,
    global,
    skills,
    wikiProjectOptions,
    selectedSkillTags,
    status,
    selectProject,
    createProject,
    saveActiveProject,
    deleteActiveProject,
    saveGlobal,
    toggleSkillTag,
    selectSkillTag,
    removeSkillTag,
    reload,
  };
}
