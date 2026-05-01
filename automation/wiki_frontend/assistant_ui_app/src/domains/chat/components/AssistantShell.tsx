import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ChatContext } from "../constants";
import type { LinkedWikiProject, WikiProjectOption } from "../api/chatWorkspaceApi";
import type { ChatWorkspaceState } from "../hooks/useChatWorkspace";
import { OrchestrationPanel } from "./OrchestrationPanel";
import { LAST_WIKI_PATH_EVENT, readLastWikiPath, surfaceScope } from "../../../shared/surfaceHandoff";

type AssistantShellProps = {
  chatContext: ChatContext;
  workspace: ChatWorkspaceState;
  orchestration: Record<string, any>;
  onOpenWikiPage: (path: string) => void;
  children: ReactNode;
};

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

function runStatusLabel(orchestration: Record<string, any>) {
  const phase = String(orchestration.status?.phase || "");
  if (!phase) return "대기 중";
  if (phase === "context_building") return "근거 조립 중";
  if (phase === "completed") return "응답 완료";
  if (phase === "stopped") return "중지됨";
  if (phase === "error") return "오류";
  return phase.replace(/_/g, " ");
}

function runStatusTone(orchestration: Record<string, any>) {
  const phase = String(orchestration.status?.phase || "");
  if (phase === "completed") return "done";
  if (phase === "stopped") return "stopped";
  if (phase === "error") return "error";
  if (phase) return "running";
  return "idle";
}

export function AssistantShell({ chatContext, workspace, orchestration, onOpenWikiPage, children }: AssistantShellProps) {
  const [projectName, setProjectName] = useState("");
  const [projectInstructions, setProjectInstructions] = useState("");
  const [linkedProjectKey, setLinkedProjectKey] = useState("");
  const [moveTargetProjectId, setMoveTargetProjectId] = useState("");
  const [globalInstructions, setGlobalInstructions] = useState("");
  const [autoMemoryEnabled, setAutoMemoryEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [orchestrationOpen, setOrchestrationOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [lastWikiPath, setLastWikiPath] = useState("");

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

  useEffect(() => {
    setMoveTargetProjectId((current) => {
      const targets = workspace.projects.filter((project) => project.id !== workspace.activeProjectId);
      if (current && targets.some((project) => project.id === current)) return current;
      return targets[0]?.id || "";
    });
  }, [workspace.activeProjectId, workspace.projects]);

  useEffect(() => {
    const scope = surfaceScope(chatContext.projectId, chatContext.workspace);
    const sync = () => setLastWikiPath(readLastWikiPath(scope));
    sync();
    const handleWikiPath = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string }>).detail;
      if (detail?.scope && detail.scope !== scope) return;
      sync();
    };
    window.addEventListener(LAST_WIKI_PATH_EVENT, handleWikiPath);
    return () => window.removeEventListener(LAST_WIKI_PATH_EVENT, handleWikiPath);
  }, [chatContext.projectId, chatContext.workspace]);

  const projects = workspace.projects.slice(0, RECENT_PROJECT_LIMIT);
  const moveTargetProjects = workspace.projects.filter((project) => project.id !== workspace.activeProjectId);
  const wikiProjectOptions = linkedProjectOptions(
    workspace.wikiProjectOptions,
    workspace.activeProject?.linkedWikiProject,
  );
  const linkedProject = linkedProjectFromKey(wikiProjectOptions, linkedProjectKey);
  const activeLinkedProject = workspace.activeProject?.linkedWikiProject || null;
  const activeConversationCount = workspace.activeProject?.messages?.length || 0;
  const selectedMoveProject = moveTargetProjects.find((project) => project.id === moveTargetProjectId) || null;
  const canMoveConversation = activeConversationCount > 0 && Boolean(selectedMoveProject);
  const wikiResumePath = lastWikiPath || activeLinkedProject?.path || "";
  const runLabel = runStatusLabel(orchestration);
  const runTone = runStatusTone(orchestration);
  const modelLabel = "GLM";
  const skillCountLabel = `@${workspace.selectedSkillTags.length}`;
  const mailboxStats = [
    { label: "Project inbox", value: String(workspace.projects.length) },
    { label: "Linked wiki", value: activeLinkedProject ? "1" : "0" },
    { label: "Skill tags", value: String(workspace.selectedSkillTags.length) },
    { label: "Run events", value: String((orchestration.events || []).length || 0) },
  ];
  const shellClassName = [
    "aui-chat-product-shell",
    !sidebarOpen || focusMode ? "sidebar-collapsed" : "",
    !orchestrationOpen || focusMode ? "orchestration-collapsed" : "",
    focusMode ? "focus-mode" : "",
  ].filter(Boolean).join(" ");

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

  const moveConversation = async () => {
    if (!selectedMoveProject) return;
    const confirmed = window.confirm(
      `현재 프로젝트의 대화 메시지 ${activeConversationCount}개를 "${selectedMoveProject.name || "GLM 프로젝트"}"로 이동할까요?`,
    );
    if (!confirmed) return;
    await workspace.moveActiveConversation(selectedMoveProject.id);
    setSettingsOpen(false);
  };

  const confirmDeleteProject = async () => {
    const projectLabel = workspace.activeProject?.name || activeLinkedProject?.projectLabel || "현재 챗 프로젝트";
    const confirmed = window.confirm(
      `"${projectLabel}" 프로젝트를 삭제할까요?\n\n대화 메시지, 연결, 메모리, 지침 후보가 함께 제거됩니다.`,
    );
    if (!confirmed) return;
    await workspace.deleteActiveProject();
    setSettingsOpen(false);
  };

  return (
    <main className={shellClassName}>
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

        <button className="aui-manage-project-button" onClick={() => setSettingsOpen(true)} type="button">
          <strong>{activeLinkedProject?.projectLabel || "프로젝트 연결 없음"}</strong>
          <span>{activeLinkedProject?.path || "프로젝트 연결/지침 설정"}</span>
        </button>

        <section className="aui-mailbox-nav" aria-label="업무 메일함 요약">
          {mailboxStats.map((item) => (
            <div className="aui-mailbox-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </section>

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
                <span>{project.linkedWikiProject?.projectLabel || projectPreview(project.instructions)}</span>
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
            <span className="aui-mail-thread-kicker">Operational thread</span>
            <div className="aui-chat-main-utility-title">
              <strong title={activeLinkedProject?.path || workspace.activeProject?.name || "현재 챗 프로젝트"}>
                {activeLinkedProject?.projectLabel || workspace.activeProject?.name || "현재 챗 프로젝트"}
              </strong>
            </div>
            <div className="aui-chat-main-utility-meta" aria-label="chat summary">
              <span className={`aui-model-pill status ${runTone}`}>{runLabel}</span>
              <span className="aui-model-pill muted">{skillCountLabel}</span>
              <span className="aui-model-pill subtle">{modelLabel}</span>
            </div>
          </div>
          <div className="aui-chat-main-toolbar">
            <button
              className={`aui-chat-main-toggle ${sidebarOpen && !focusMode ? "active" : ""}`}
              aria-label="좌측 패널 토글"
              onClick={() => {
                setFocusMode(false);
                setSidebarOpen((current) => !current);
              }}
              type="button"
            >
              목록
            </button>
            <button
              className={`aui-chat-main-toggle ${orchestrationOpen && !focusMode ? "active" : ""}`}
              aria-label="오케스트레이션 패널 토글"
              onClick={() => {
                setFocusMode(false);
                setOrchestrationOpen((current) => !current);
              }}
              type="button"
            >
              안내
            </button>
            <button
              className={`aui-chat-main-toggle ${focusMode ? "active" : ""}`}
              aria-label="집중 모드 토글"
              onClick={() => setFocusMode((current) => !current)}
              type="button"
            >
              집중
            </button>
            <button
              className="aui-chat-main-toggle"
              aria-label="마지막 위키 문서 열기"
              disabled={!wikiResumePath}
              onClick={() => {
                if (!wikiResumePath) return;
                onOpenWikiPage(wikiResumePath);
              }}
              title={wikiResumePath || "마지막 위키 문서 없음"}
              type="button"
            >
              위키
            </button>
            <button
              aria-label="프로젝트 설정 열기"
              className="aui-chat-main-settings-button"
              onClick={() => setSettingsOpen(true)}
              type="button"
            >
              설정
            </button>
          </div>
        </div>
        {children}
      </section>

      <OrchestrationPanel data={orchestration} activeProject={workspace.activeProject} onOpenWikiPage={onOpenWikiPage} />

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
                  <strong>대화 이동</strong>
                  <span>{activeConversationCount}개 메시지</span>
                </div>
                <label>
                  <span>이동 대상 프로젝트</span>
                  <select
                    value={moveTargetProjectId}
                    onChange={(event) => setMoveTargetProjectId(event.target.value)}
                    disabled={!moveTargetProjects.length}
                  >
                    {!moveTargetProjects.length ? <option value="">이동 가능한 프로젝트 없음</option> : null}
                    {moveTargetProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name || "GLM 프로젝트"}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="aui-link-preview">
                  <span>이동 방식</span>
                  <strong>{selectedMoveProject?.name || "대상 프로젝트 선택 필요"}</strong>
                  <small>
                    현재 프로젝트의 대화 메시지만 대상 프로젝트로 병합합니다. 프로젝트 이름, 위키 연결, 고정 지침은 옮기지 않습니다.
                  </small>
                </div>
                <button
                  className="aui-secondary-action aui-conversation-move-action"
                  disabled={!canMoveConversation}
                  onClick={moveConversation}
                  type="button"
                >
                  현재 대화를 선택 프로젝트로 이동
                </button>
              </section>

              <section className="aui-settings-section aui-settings-danger-zone">
                <div className="aui-settings-section-head">
                  <strong>프로젝트 삭제</strong>
                  <span>되돌릴 수 없음</span>
                </div>
                <div className="aui-link-preview danger">
                  <span>삭제 대상</span>
                  <strong>{workspace.activeProject?.name || activeLinkedProject?.projectLabel || "현재 챗 프로젝트"}</strong>
                  <small>현재 프로젝트의 대화 메시지, 연결된 설정, 누적 메모리와 지침 후보를 함께 삭제합니다.</small>
                </div>
                <div className="aui-settings-action-row">
                  <button className="danger" onClick={confirmDeleteProject} type="button">이 프로젝트 삭제</button>
                </div>
              </section>

              <section className="aui-settings-section">
                <div className="aui-settings-section-head">
                  <strong>고정 지침</strong>
                  <span>승격된 규칙만 유지</span>
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

              <section className="aui-settings-section">
                <div className="aui-settings-section-head">
                  <strong>자동 축적 메모리</strong>
                  <span>{workspace.activeProject?.memories?.length || 0}건</span>
                </div>
                <div className="aui-settings-note-list">
                  {(workspace.activeProject?.memories || []).slice(0, 8).map((memory) => (
                    <article key={memory.id} className="aui-settings-note-card">
                      <strong>{memory.title || "메모리"}</strong>
                      <small>{memory.updatedAt || memory.createdAt || ""}</small>
                      <p>{memory.content}</p>
                    </article>
                  ))}
                  {!(workspace.activeProject?.memories || []).length ? (
                    <p className="aui-settings-empty">최근 대화에서 누적된 작업 메모가 아직 없습니다.</p>
                  ) : null}
                </div>
              </section>

              <section className="aui-settings-section">
                <div className="aui-settings-section-head">
                  <strong>지침 승격 후보</strong>
                  <span>{workspace.activeProject?.instructionCandidates?.length || 0}건</span>
                </div>
                <div className="aui-settings-note-list">
                  {(workspace.activeProject?.instructionCandidates || []).slice(0, 8).map((candidate) => (
                    <article key={candidate.id} className="aui-settings-note-card candidate">
                      <strong>{candidate.title || "후보"}</strong>
                      <small>{candidate.updatedAt || candidate.createdAt || ""}</small>
                      <p>{candidate.content}</p>
                      <div className="aui-settings-note-actions">
                        <button className="aui-secondary-action" onClick={() => workspace.promoteInstructionCandidate(candidate.id)} type="button">지침으로 승격</button>
                        <button onClick={() => workspace.deleteInstructionCandidate(candidate.id)} type="button">후보 삭제</button>
                      </div>
                    </article>
                  ))}
                  {!(workspace.activeProject?.instructionCandidates || []).length ? (
                    <p className="aui-settings-empty">대화 중 확인된 원칙/선호/금지 표현은 여기서 검토 후 고정 지침으로 승격합니다.</p>
                  ) : null}
                </div>
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
