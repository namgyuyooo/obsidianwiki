import { useState } from "react";
import type { ChatContext } from "../../chat/constants";
import type { MissionProject } from "../api/missionApi";
import { useMissionControl } from "../hooks/useMissionControl";

type MissionControlProps = {
  chatContext: ChatContext;
};

const PROJECT_RAIL_LIMIT = 12;
const LIST_ITEM_LIMIT = 6;

function projectName(project: MissionProject | null) {
  return project?.projectLabel || project?.projectKey || "프로젝트 선택";
}

function shortDate(value = "") {
  return value ? value.slice(0, 10) : "-";
}

function DashboardList({
  items = [],
  emptyText,
}: {
  items: readonly string[] | undefined;
  emptyText: string;
}) {
  const visible = items.slice(0, LIST_ITEM_LIMIT);
  if (!visible.length) return <p>{emptyText}</p>;
  return (
    <ul>
      {visible.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function ProjectLane({
  emptyText,
  items = [],
  title,
}: {
  emptyText: string;
  items: readonly string[] | undefined;
  title: string;
}) {
  return (
    <section className="aui-command-lane">
      <h2>{title}</h2>
      <DashboardList items={items} emptyText={emptyText} />
    </section>
  );
}

export function MissionControl({ chatContext }: MissionControlProps) {
  const mission = useMissionControl(chatContext.workspace);
  const [actionDraft, setActionDraft] = useState("");
  const [decisionDraft, setDecisionDraft] = useState("");
  const active = mission.activeProject;
  const summaryCards = [
    { label: "Projects", value: mission.mission.summary.projects },
    { label: "Ongoing", value: mission.mission.summary.ongoing },
    { label: "Decision Queue", value: mission.mission.summary.decisionQueue },
    { label: "Risk Queue", value: mission.riskyProjects.length },
    { label: "Priority Docs", value: mission.mission.summary.highPriorityDocuments },
    { label: "Ops Ready", value: mission.mission.summary.operationalReady || 0 },
    { label: "Ops Gaps", value: mission.mission.summary.operationalGaps || 0 },
    { label: "Integrations", value: mission.mission.summary.integrationCandidates || 0 },
    { label: "Automation", value: mission.automation.running.length },
    { label: "Governance", value: mission.governance.summary?.projectsWithIssues || 0 },
  ];
  const briefLines = mission.projectBrief?.brief || [
    `현재상태: ${active?.workflowStatusLabel || active?.workflowStatus || "상태 없음"}`,
    `한줄상황: ${active?.oneLine || "운영 메모 보강 필요"}`,
    `통합 검토 필요: ${active?.decisionQueueCount || 0}건`,
  ];

  const submitAction = async () => {
    await mission.addProjectAction(actionDraft);
    setActionDraft("");
  };

  const submitDecision = async () => {
    await mission.addProjectDecision(decisionDraft);
    setDecisionDraft("");
  };

  return (
    <main className="aui-command-dashboard">
      <section className="aui-command-hero">
        <div>
          <span>Command Center</span>
          <h1>커맨드센터</h1>
          <p>프로젝트 상태, 운영 문서, 원문 보존, 결정 대기, 자동화 흐름을 한 번에 확인합니다.</p>
        </div>
        <div className={`aui-command-live ${mission.status.phase}`}>
          <strong>{mission.status.phase}</strong>
          <span>{mission.status.message}</span>
          <button onClick={mission.reload} type="button">새로고침</button>
        </div>
      </section>

      <section className="aui-command-metrics" aria-label="mission metrics">
        {summaryCards.map((card) => (
          <article key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="aui-command-layout">
        <aside className="aui-command-panel aui-command-projects">
          <div className="aui-command-panel-head">
            <span>프로젝트</span>
            <strong>{mission.mission.projects.length}건</strong>
          </div>
          <div className="aui-command-project-list">
            {mission.mission.projects.slice(0, PROJECT_RAIL_LIMIT).map((project) => (
              <button
                className={project.projectKey === mission.activeProjectKey ? "active" : ""}
                key={project.projectKey}
                onClick={() => mission.setActiveProjectKey(project.projectKey)}
                type="button"
              >
                <strong>{projectName(project)}</strong>
                <span>{project.workflowStatusLabel || project.workflowStatus || "상태 없음"}</span>
                <small>검토 큐 {project.decisionQueueCount || 0}건 · score {project.score || 0} · {shortDate(project.lastActivityAt)}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="aui-command-center-card">
          <div className="aui-command-card-top">
            <span>{active?.workflowStatusLabel || active?.workflowStatus || "상태 없음"}</span>
            <strong>{projectName(active)}</strong>
            <p>{active?.oneLine || active?.hubPath || "프로젝트 hub 연결 정보가 아직 부족합니다."}</p>
            <div className="aui-command-chipline">
              <span>{active?.division || "project"}</span>
              <span>score {active?.score || 0}</span>
              <span>ops {active?.operationalCoverage || 0}%</span>
              <span>pages {active?.pages?.length || 0}</span>
              <span>last {shortDate(active?.lastActivityAt)}</span>
              {(active?.workflowTags || []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div>

          <div className="aui-command-question-grid">
            {mission.missionQuestions.map((question) => (
              <article key={question.label}>
                <span>{question.label}</span>
                <strong>{question.value}</strong>
              </article>
            ))}
          </div>

          <div className="aui-command-brief-grid">
            <ProjectLane title="다음 액션" items={active?.nextActions} emptyText="액션 보강 필요" />
            <ProjectLane title="막힘 / 리스크" items={active?.risks} emptyText="명시 리스크 없음" />
            <ProjectLane title="결정 / 대표 공간" items={active?.decisions} emptyText="최근 결정 없음" />
            <ProjectLane title="충돌 / 정합성" items={active?.conflicts} emptyText="명시 충돌 없음" />
            <ProjectLane title="최근 운영 메모" items={active?.recentMemos} emptyText="최근 메모 없음" />
            <ProjectLane title="상태 변화 메모" items={active?.statusMemos} emptyText="상태 변화 메모 없음" />
            <ProjectLane title="CEO 판단" items={active?.ceoBrief} emptyText="CEO_Brief 보강 필요" />
            <ProjectLane title="PM 실행" items={active?.pmActions} emptyText="PM_Action_Plan 보강 필요" />
            <ProjectLane title="연결 가능 위키" items={active?.linkedWikis} emptyText="연결 후보 없음" />
            <ProjectLane title="통합 신호" items={active?.integrationSignals} emptyText="통합 신호 없음" />
            <ProjectLane title="Account Rollup 후보" items={active?.accountRollupCandidates} emptyText="rollup 후보 없음" />
            <section className="aui-command-lane">
              <h2>핵심 근거</h2>
              {active?.coreDocuments?.length ? (
                <ul>
                  {active.coreDocuments.slice(0, LIST_ITEM_LIMIT).map((doc) => (
                    <li key={doc.path || doc.title}>{doc.title || doc.path} {doc.priority ? `· ${doc.priority}` : ""}</li>
                  ))}
                </ul>
              ) : (
                <p>핵심문서 연결 부족</p>
              )}
            </section>
          </div>

          <section className="aui-command-operating-card">
            <div className="aui-command-panel-head">
              <span>운영형 위키 흐름</span>
              <strong>{active?.operationalCoverage || 0}%</strong>
            </div>
            <div className="aui-command-doc-grid">
              {(active?.operationalDocs || []).map((doc) => (
                <article className={doc.present && doc.hasContent ? "ready" : "missing"} key={doc.file || doc.path}>
                  <strong>{doc.label || doc.file}</strong>
                  <span>{doc.present && doc.hasContent ? "연결됨" : "보강 필요"}</span>
                  <small>{doc.path || "-"}</small>
                </article>
              ))}
            </div>
            <div className="aui-command-brief-grid compact">
              <ProjectLane title="Business Flow" items={active?.businessFlow} emptyText="흐름 정보 보강 필요" />
              <ProjectLane title="Customer Follow-up" items={active?.customerFollowups} emptyText="고객 후속 정보 없음" />
              <ProjectLane title="Raw Evidence" items={active?.rawEvidence} emptyText="원문 보존 확인 필요" />
            </div>
          </section>

          <section className="aui-command-brief-card">
            <div className="aui-command-panel-head">
              <span>요약</span>
              <button onClick={mission.loadActiveProjectBrief} type="button">브리프 갱신</button>
            </div>
            <ul>
              {briefLines.slice(0, 6).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </section>

          <section className="aui-command-writer">
            <label>
              <span>액션 추가</span>
              <textarea
                value={actionDraft}
                onChange={(event) => setActionDraft(event.target.value)}
                placeholder="예: 고객에게 최신 제안서 버전과 확인 필요 수치를 요청한다."
              />
            </label>
            <label>
              <span>결정 기록</span>
              <textarea
                value={decisionDraft}
                onChange={(event) => setDecisionDraft(event.target.value)}
                placeholder="예: 1차 제출 기준 성능 수치는 TTA 최종 성적서 확인 전까지 보류한다."
              />
            </label>
            <div>
              <button disabled={!actionDraft.trim()} onClick={submitAction} type="button">Action_Items에 추가</button>
              <button disabled={!decisionDraft.trim()} onClick={submitDecision} type="button">Decisions에 기록</button>
            </div>
          </section>
        </section>

        <aside className="aui-command-panel aui-command-ops">
          <div className="aui-command-panel-head">
            <span>자동화</span>
            <strong>{mission.latestRun?.status || "대기"}</strong>
          </div>
          <dl className="aui-command-run">
            <div>
              <dt>Latest</dt>
              <dd>{mission.latestRun?.command || "실행 없음"}</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>{mission.latestRun?.progress?.summary || mission.latestRun?.progress?.lastLogLine || "-"}</dd>
            </div>
          </dl>
          <button onClick={() => mission.runAutomation("refresh-global")} type="button">그래프맵 업데이트</button>
          <button onClick={() => mission.runAutomation("rclone-copy", true)} type="button">수집 미리보기</button>
          <button onClick={() => mission.planOperationalConversion()} type="button">운영형 전환 계획</button>
          <button className="secondary" onClick={mission.reload} type="button">Mission 갱신</button>

          <div className="aui-command-risk-list">
            <span>Automation Timeline</span>
            {mission.automationTimeline.slice(0, LIST_ITEM_LIMIT).map((run) => (
              <article className="aui-command-mini-card" key={run.runId || `${run.command}-${run.createdAt}`}>
                <strong>{run.command || "command"}</strong>
                <small>{run.status || "-"} · {shortDate(run.updatedAt || run.createdAt)}</small>
                <p>{run.progress?.summary || run.progress?.lastLogLine || "-"}</p>
              </article>
            ))}
          </div>

          <div className="aui-command-risk-list">
            <span>Risk Queue</span>
            {mission.riskyProjects.slice(0, LIST_ITEM_LIMIT).map((project) => (
              <button
                key={project.projectKey}
                onClick={() => mission.setActiveProjectKey(project.projectKey)}
                type="button"
              >
                {projectName(project)}
              </button>
            ))}
          </div>

          <div className="aui-command-risk-list">
            <span>Decision Queue</span>
            {mission.decisionProjects.slice(0, LIST_ITEM_LIMIT).map((project) => (
              <button
                key={project.projectKey}
                onClick={() => mission.setActiveProjectKey(project.projectKey)}
                type="button"
              >
                {projectName(project)} · {project.decisionQueueCount}건
              </button>
            ))}
          </div>

          <div className="aui-command-risk-list">
            <span>Priority Docs</span>
            {mission.highDocumentProjects.slice(0, LIST_ITEM_LIMIT).map((project) => (
              <button
                key={project.projectKey}
                onClick={() => mission.setActiveProjectKey(project.projectKey)}
                type="button"
              >
                {projectName(project)}
              </button>
            ))}
          </div>

          <div className="aui-command-risk-list">
            <span>Ops Gaps</span>
            {mission.operationalGapProjects.slice(0, LIST_ITEM_LIMIT).map((project) => (
              <button
                key={project.projectKey}
                onClick={() => mission.setActiveProjectKey(project.projectKey)}
                type="button"
              >
                {projectName(project)} · ops {project.operationalCoverage || 0}% · {(project.missingOperationalDocs || []).slice(0, 2).join(", ") || "내용 보강"}
              </button>
            ))}
          </div>

          <div className="aui-command-risk-list">
            <span>Coverage / GLM Policy</span>
            <article className="aui-command-mini-card">
              <strong>Coverage {mission.coverage.progressPercent || 0}%</strong>
              <small>{mission.coverage.documentsInManifest || 0} manifest docs · {mission.coverage.processedDocuments || 0} processed</small>
              <p>{Object.entries(mission.coverage.statuses || {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "coverage status 없음"}</p>
            </article>
            <article className="aui-command-mini-card">
              <strong>LLM Policy {(mission.llmPolicy.policies || []).length} rules</strong>
              <small>{(mission.llmPolicy.policies || [])[0]?.label || "정책 미표시"}</small>
              <p>{(mission.llmPolicy.policies || [])[0]?.note || (mission.llmPolicy.policies || [])[0]?.value || "Operations에서 정책을 확인하세요."}</p>
            </article>
          </div>

          <div className="aui-command-risk-list">
            <span>Governance Warnings</span>
            {(mission.governance.projects || []).slice(0, LIST_ITEM_LIMIT).map((project) => (
              <article className="aui-command-mini-card" key={project.projectKey}>
                <strong>{project.projectLabel || project.projectKey}</strong>
                <small>issues {project.issues?.length || 0} · missing docs {project.missingDocs?.length || 0}</small>
                <p>{project.issues?.[0]?.message || "명시 이슈 없음"}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
