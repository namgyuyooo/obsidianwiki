import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ChatContext } from "../constants";
import type { LinkedWikiProject, WikiProjectOption } from "../api/chatWorkspaceApi";
import type { ChatWorkspaceState } from "../hooks/useChatWorkspace";
import { OrchestrationPanel } from "./OrchestrationPanel";

type AssistantShellProps = {
  chatContext: ChatContext;
  workspace: ChatWorkspaceState;
  orchestration: Record<string, any>;
  children: ReactNode;
};

const FALLBACK_SKILL_TAGS = [
  { id: "paperclip", name: "Paperclip" },
  { id: "wiki-graph", name: "Wiki Graph" },
  { id: "evidence-log", name: "Evidence Log" },
  { id: "drive-files", name: "Drive Files" },
] as const;

const RECENT_PROJECT_LIMIT = 18;

function projectPreview(instructions = "") {
  return instructions.trim() || "프로젝트 지침 없음";
}

function statusLabel(phase: string) {
  if (phase === "loading") return "동기화 중";
  if (phase === "saving") return "저장 중";
  if (phase === "failed") return "오류";
  return "준비됨";
}

function linkedProjectOptions(
  options: WikiProjectOption[],
  linkedProject?: LinkedWikiProject | null,
): LinkedWikiProject[] {
  if (!linkedProject?.projectKey) return options;
  const alreadyListed = options.some((option) => option.projectKey === linkedProject.projectKey);
  if (alreadyListed) return options;
  return [linkedProject, ...options];
}

function linkedProjectFromKey(options: LinkedWikiProject[], projectKey: string) {
  if (!projectKey) return null;
  return options.find((option) => option.projectKey === projectKey) || null;
}

export function AssistantShell({ chatContext, workspace, orchestration, children }: AssistantShellProps) {
  const [projectName, setProjectName] = useState("");
  const [projectInstructions, setProjectInstructions] = useState("");
  const [linkedProjectKey, setLinkedProjectKey] = useState("");
  const [globalInstructions, setGlobalInstructions] = useState("");
  const [autoMemoryEnabled, setAutoMemoryEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setProjectName(workspace.activeProject?.name || "");
    setProjectInstructions(workspace.activeProject?.instructions || "");
    setLinkedProjectKey(workspace.activeProject?.linkedWikiProject?.projectKey || "");
  }, [
    workspace.activeProject?.id,
    workspace.activeProject?.instructions,
    workspace.activeProject?.linkedWikiProject?.projectKey,
    workspace.activeProject?.name,
  ]);

  useEffect(() => {
    setGlobalInstructions(workspace.global.instructions || "");
    setAutoMemoryEnabled(workspace.global.autoMemory !== false);
  }, [workspace.global.instructions, workspace.global.autoMemory]);

  const skills = workspace.skills.length ? workspace.skills.slice(0, 10) : FALLBACK_SKILL_TAGS;
  const projects = workspace.projects.slice(0, RECENT_PROJECT_LIMIT);
  const wikiProjectOptions = linkedProjectOptions(
    workspace.wikiProjectOptions,
    workspace.activeProject?.linkedWikiProject,
  );
  const linkedProject = linkedProjectFromKey(wikiProjectOptions, linkedProjectKey);
  const activeLinkedProject = workspace.activeProject?.linkedWikiProject || null;

  const saveProject = async () => {
    await workspace.saveActiveProject({
      name: projectName.trim() || "새 GLM 프로젝트",
      instructions: projectInstructions.trim(),
      linkedWikiProject: linkedProject,
    });
  };

  const saveGlobalDraft = async () => {
    await workspace.saveGlobal({
      ...workspace.global,
      instructions: globalInstructions.trim(),
      autoMemory: autoMemoryEnabled,
    });
  };

  const saveProjectAndClose = async () => {
    await Promise.all([saveProject(), saveGlobalDraft()]);
    setSettingsOpen(false);
  };

  const saveGlobal = async () => {
    await saveGlobalDraft();
  };

  return (
    <main className="aui-chat-product-shell">
      <aside className="aui-project-sidebar" aria-label="GLM chat projects">
        <div className="aui-sidebar-brand">
          <span className="aui-orb">G</span>
          <div>
            <strong>GLM Chat</strong>
            <span>{chatContext.workspace} workspace</span>
          </div>
        </div>

        <button className="aui-new-chat-button" onClick={workspace.createProject} type="button">
          <span>+</span>
          새 프로젝트 챗
        </button>

        <section className="aui-linked-project-card" aria-label="연결된 위키 프로젝트">
          <span>Wiki project link</span>
          <strong>{activeLinkedProject?.projectLabel || "연결 없음"}</strong>
          <small>
            {activeLinkedProject?.path || "프로젝트 설정에서 업무 위키 프로젝트를 연결하세요."}
          </small>
        </section>

        <button className="aui-manage-project-button" onClick={() => setSettingsOpen(true)} type="button">
          <strong>프로젝트 연결/지침</strong>
          <span>챗 프로젝트와 업무 위키 프로젝트 연결 설정</span>
        </button>

        <section className="aui-sidebar-section" aria-label="프로젝트 목록">
          <div className="aui-sidebar-heading">
            <span>Projects</span>
            <small>{workspace.projects.length}</small>
          </div>
          <div className="aui-conversation-list">
            {projects.map((project) => (
              <button
                className={`aui-conversation-item ${project.id === workspace.activeProjectId ? "active" : ""}`}
                key={project.id}
                onClick={() => workspace.selectProject(project.id)}
                type="button"
              >
                <strong>{project.name || "GLM 프로젝트"}</strong>
                <span>{projectPreview(project.linkedWikiProject?.projectLabel || project.instructions)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="aui-sidebar-section" aria-label="스킬 태그">
          <div className="aui-sidebar-heading">
            <span>Skills</span>
            <small>{workspace.selectedSkillTags.length} selected</small>
          </div>
          <div className="aui-side-skill-list">
            {skills.map((skill) => (
              <button
                className={`aui-side-skill ${workspace.selectedSkillTags.includes(skill.id) ? "active" : ""}`}
                key={skill.id}
                onClick={() => workspace.toggleSkillTag(skill.id)}
                type="button"
              >
                @{skill.name || skill.title || skill.id}
              </button>
            ))}
          </div>
        </section>

        <p className={`aui-sidebar-status ${workspace.status.phase}`}>
          <strong>{statusLabel(workspace.status.phase)}</strong>
          <span>{workspace.status.message}</span>
        </p>
      </aside>

      <section className="aui-chat-main" aria-label="GLM chat thread">
        <div className="aui-chat-main-utility">
          <div className="aui-chat-main-utility-copy">
            <span>Project settings</span>
            <strong>{activeLinkedProject?.projectLabel || workspace.activeProject?.name || "현재 챗 프로젝트"}</strong>
            <small>
              {activeLinkedProject?.path || "현재 챗과 연결할 업무 위키 프로젝트, 지침, 전역 규칙을 여기서 관리합니다."}
            </small>
          </div>
          <button className="aui-chat-main-settings-button" onClick={() => setSettingsOpen(true)} type="button">
            프로젝트 설정
          </button>
        </div>
        {children}
      </section>

      <OrchestrationPanel data={orchestration} activeProject={workspace.activeProject} />

      {settingsOpen ? (
        <div className="aui-settings-overlay" role="dialog" aria-modal="true" aria-label="프로젝트 연결 및 지침 설정">
          <button className="aui-settings-scrim" onClick={() => setSettingsOpen(false)} type="button" aria-label="설정 닫기" />
          <section className="aui-settings-panel">
            <header className="aui-settings-header">
              <div>
                <span>Project settings</span>
                <h2>챗 프로젝트 연결 설정</h2>
                <p>GLM 챗 프로젝트를 업무 위키 프로젝트와 묶고, 이 챗에서만 적용할 지침을 관리합니다.</p>
              </div>
              <button onClick={() => setSettingsOpen(false)} type="button">닫기</button>
            </header>

            <div className="aui-settings-grid">
              <section className="aui-settings-section">
                <div className="aui-settings-section-head">
                  <strong>프로젝트 연결</strong>
                  <span>{wikiProjectOptions.length}개 위키 프로젝트</span>
                </div>
                <label>
                  <span>챗 프로젝트 이름</span>
                  <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                </label>
                <label>
                  <span>연결할 업무 위키 프로젝트</span>
                  <select value={linkedProjectKey} onChange={(event) => setLinkedProjectKey(event.target.value)}>
                    <option value="">연결 안 함</option>
                    {wikiProjectOptions.map((project) => (
                      <option key={project.projectKey} value={project.projectKey}>
                        {project.projectLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="aui-link-preview">
                  <span>현재 연결 대상</span>
                  <strong>{linkedProject?.projectLabel || "연결 안 함"}</strong>
                  <small>{linkedProject?.path || "위키 프로젝트를 선택하면 GLM 검색/근거 조립의 우선 범위가 됩니다."}</small>
                </div>
              </section>

              <section className="aui-settings-section">
                <div className="aui-settings-section-head">
                  <strong>프로젝트 지침</strong>
                  <span>이 챗에만 적용</span>
                </div>
                <label>
                  <span>고객/범위/산출물/금지 표현</span>
                  <textarea
                    rows={10}
                    value={projectInstructions}
                    onChange={(event) => setProjectInstructions(event.target.value)}
                  />
                </label>
              </section>

              <section className="aui-settings-section aui-settings-global">
                <div className="aui-settings-section-head">
                  <strong>전역 지침</strong>
                  <span>모든 GLM 챗 공통</span>
                </div>
                <label>
                  <span>공통 운영 규칙</span>
                  <textarea
                    rows={8}
                    value={globalInstructions}
                    onChange={(event) => setGlobalInstructions(event.target.value)}
                  />
                </label>
                <label className="aui-toggle-field">
                  <span>자동 메모리 적재</span>
                  <div className="aui-toggle-copy">
                    <small>사용자 메시지에서 기억할 후보를 감지하면 프로젝트 메모리/L1 보조 기억으로 자동 적재합니다.</small>
                    <input
                      type="checkbox"
                      checked={autoMemoryEnabled}
                      onChange={(event) => setAutoMemoryEnabled(event.target.checked)}
                    />
                  </div>
                </label>
                <button className="aui-secondary-action" onClick={saveGlobal} type="button">전역 지침 저장</button>
              </section>
            </div>

            <footer className="aui-settings-footer">
              <button className="danger" onClick={workspace.deleteActiveProject} type="button">챗 프로젝트 삭제</button>
              <div>
                <button onClick={() => setSettingsOpen(false)} type="button">취소</button>
                <button className="primary" onClick={saveProjectAndClose} type="button">연결 저장</button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
