import type { ChatContext } from "../../chat/constants";
import type { MissionProject } from "../api/missionApi";
import { useMissionControl } from "../hooks/useMissionControl";

type MissionControlProps = {
  chatContext: ChatContext;
};

const PROJECT_RAIL_LIMIT = 12;
const LIST_ITEM_LIMIT = 5;

function projectName(project: MissionProject | null) {
  return project?.projectLabel || project?.projectKey || "프로젝트 선택";
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

export function MissionControl({ chatContext }: MissionControlProps) {
  const mission = useMissionControl(chatContext.workspace);
  const active = mission.activeProject;
  const summaryCards = [
    { label: "Projects", value: mission.mission.summary.projects },
    { label: "Ongoing", value: mission.mission.summary.ongoing },
    { label: "Decision Queue", value: mission.mission.summary.decisionQueue },
    { label: "Priority Docs", value: mission.mission.summary.highPriorityDocuments },
  ];

  return (
    <main className="aui-command-dashboard">
      <section className="aui-command-hero">
        <div>
          <span>Mission Control / Command Center</span>
          <h1>중앙 운영 대시보드</h1>
          <p>프로젝트 상태, 의사결정 대기, 자동화 실행, 리스크를 한 화면에서 지휘합니다.</p>
        </div>
        <div className={`aui-command-live ${mission.status.phase}`}>
          <strong>{mission.status.phase}</strong>
          <span>{mission.status.message}</span>
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
            <span>Project Radar</span>
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
                <small>정합성 {project.decisionQueueCount || 0}건</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="aui-command-center-card">
          <div className="aui-command-card-top">
            <span>{active?.workflowStatusLabel || active?.workflowStatus || "상태 없음"}</span>
            <strong>{projectName(active)}</strong>
            <p>{active?.hubPath || "프로젝트 hub 연결 정보가 아직 부족합니다."}</p>
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
            <section>
              <h2>다음 액션</h2>
              <DashboardList items={active?.nextActions} emptyText="액션 보강 필요" />
            </section>
            <section>
              <h2>막힘 / 리스크</h2>
              <DashboardList items={active?.risks} emptyText="명시 리스크 없음" />
            </section>
            <section>
              <h2>핵심 근거</h2>
              {active?.coreDocuments?.length ? (
                <ul>
                  {active.coreDocuments.slice(0, LIST_ITEM_LIMIT).map((doc) => (
                    <li key={doc.path || doc.title}>{doc.title || doc.path}</li>
                  ))}
                </ul>
              ) : (
                <p>핵심문서 연결 부족</p>
              )}
            </section>
          </div>
        </section>

        <aside className="aui-command-panel aui-command-ops">
          <div className="aui-command-panel-head">
            <span>Automation</span>
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
          <button className="secondary" onClick={mission.reload} type="button">Mission 갱신</button>

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
        </aside>
      </section>
    </main>
  );
}
