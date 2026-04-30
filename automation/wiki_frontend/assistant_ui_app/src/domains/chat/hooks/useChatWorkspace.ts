import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatContext } from "../constants";
import {
  deleteInstructionCandidate as deleteInstructionCandidateApi,
  deleteChatProject,
  fetchChatWorkspace,
  fetchSkillCatalog,
  fetchWikiProjectOptions,
  moveChatProjectMessages,
  promoteInstructionCandidate as promoteInstructionCandidateApi,
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
  moveActiveConversation: (targetProjectId: string) => Promise<void>;
  saveGlobal: (global: ChatGlobalSettings) => Promise<void>;
  promoteInstructionCandidate: (candidateId: string) => Promise<void>;
  deleteInstructionCandidate: (candidateId: string) => Promise<void>;
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
  const initialSkillTagSeed = useMemo(() => [...initialContext.skillTags], [initialContext.skillTags]);
  const projectsInWorkspace = projects.filter((project) => (project.workspace || "work") === workspace);
  const activeProject = projectsInWorkspace.find((project) => project.id === activeProjectId) || projectsInWorkspace[0] || null;

  const applySelectedSkillTags = useCallback((nextTags: string[]) => {
    setSelectedSkillTags((current) => {
      if (current.length === nextTags.length && current.every((value, index) => value === nextTags[index])) {
        return current;
      }
      return nextTags;
    });
  }, []);

  const reload = useCallback(async (nextActiveProjectId = activeProjectId) => {
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
  }, [activeProjectId, wikiWorkspace, workspace]);

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
      applySelectedSkillTags(initialSkillTagSeed);
      return;
    }
    const saved = window.localStorage.getItem(skillStorageKey(workspace, storageProjectId));
    if (!saved) {
      applySelectedSkillTags(initialSkillTagSeed);
      return;
    }
    try {
      const parsed = JSON.parse(saved);
      applySelectedSkillTags(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
    } catch {
      applySelectedSkillTags(initialSkillTagSeed);
    }
  }, [activeProject?.id, activeProjectId, applySelectedSkillTags, initialSkillTagSeed, workspace]);

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

  const moveActiveConversation = async (targetProjectId: string) => {
    if (!activeProject || !targetProjectId || targetProjectId === activeProject.id) return;
    setStatus({ phase: "saving", message: "현재 대화를 다른 프로젝트로 이동 중입니다." });
    const result = await moveChatProjectMessages(activeProject.id, targetProjectId);
    await reload(result.targetProject?.id || targetProjectId);
  };

  const saveGlobal = async (nextGlobal: ChatGlobalSettings) => {
    setStatus({ phase: "saving", message: "전역 지침을 저장 중입니다." });
    const saved = await saveChatGlobalSettings(nextGlobal);
    setGlobal(saved);
    setStatus({ phase: "ready", message: "전역 지침을 저장했습니다." });
  };

  const promoteInstructionCandidate = async (candidateId: string) => {
    if (!activeProject) return;
    setStatus({ phase: "saving", message: "지침 승격 후보를 반영 중입니다." });
    const project = await promoteInstructionCandidateApi(activeProject.id, candidateId);
    await reload(project.id);
  };

  const deleteInstructionCandidate = async (candidateId: string) => {
    if (!activeProject) return;
    setStatus({ phase: "saving", message: "지침 승격 후보를 정리 중입니다." });
    await deleteInstructionCandidateApi(activeProject.id, candidateId);
    await reload(activeProject.id);
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
    moveActiveConversation,
    saveGlobal,
    promoteInstructionCandidate,
    deleteInstructionCandidate,
    toggleSkillTag,
    selectSkillTag,
    removeSkillTag,
    reload,
  };
}
