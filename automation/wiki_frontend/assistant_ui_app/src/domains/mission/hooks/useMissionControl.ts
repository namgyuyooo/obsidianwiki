import { useEffect, useState } from "react";
import {
  appendProjectAction,
  appendProjectDecision,
  fetchAutomationSnapshot,
  fetchMissionSnapshot,
  fetchProjectBrief,
  fetchProjectGovernance,
  triggerAutomation,
  type AutomationSnapshot,
  type MissionProject,
  type MissionSnapshot,
  type ProjectBriefPayload,
  type ProjectGovernancePayload,
} from "../api/missionApi";
import { fetchCoverage, fetchLlmPolicy, type CoveragePayload, type LlmPolicyPayload } from "../api/controlPlaneApi";

type MissionStatus =
  | { phase: "loading"; message: string }
  | { phase: "ready"; message: string }
  | { phase: "running"; message: string }
  | { phase: "failed"; message: string };

const EMPTY_MISSION: MissionSnapshot = {
  generatedAt: "",
  workspace: "rtm",
  summary: {
    projects: 0,
    ongoing: 0,
    decisionQueue: 0,
    highPriorityDocuments: 0,
  },
  projects: [],
};

const EMPTY_AUTOMATION: AutomationSnapshot = {
  running: [],
  runs: [],
};

export function useMissionControl(workspace: string) {
  const [mission, setMission] = useState<MissionSnapshot>(EMPTY_MISSION);
  const [automation, setAutomation] = useState<AutomationSnapshot>(EMPTY_AUTOMATION);
  const [coverage, setCoverage] = useState<CoveragePayload>({});
  const [llmPolicy, setLlmPolicy] = useState<LlmPolicyPayload>({});
  const [governance, setGovernance] = useState<ProjectGovernancePayload>({});
  const [projectBrief, setProjectBrief] = useState<ProjectBriefPayload | null>(null);
  const [activeProjectKey, setActiveProjectKey] = useState("");
  const [status, setStatus] = useState<MissionStatus>({
    phase: "loading",
    message: "Mission Control 데이터를 불러오는 중입니다.",
  });

  const activeProject = mission.projects.find((project) => project.projectKey === activeProjectKey) || mission.projects[0] || null;
  const riskyProjects = mission.projects.filter((project) => (project.risks || []).length || (project.conflicts || []).length || project.decisionQueueCount);
  const decisionProjects = mission.projects.filter((project) => project.decisionQueueCount);
  const staleProjects = mission.projects.filter((project) => !project.lastActivityAt).slice(0, 8);
  const highDocumentProjects = mission.projects
    .filter((project) => (project.coreDocuments || []).some((doc) => doc.priority === "high"))
    .slice(0, 8);
  const latestRun = automation.running[0] || automation.runs[0] || null;
  const automationTimeline = [...automation.running, ...automation.runs]
    .filter((run, index, list) => list.findIndex((item) => (item.runId || `${item.command}-${item.createdAt}`) === (run.runId || `${run.command}-${run.createdAt}`)) === index)
    .slice(0, 8);

  async function reload() {
    setStatus({ phase: "loading", message: "Mission Control을 동기화하는 중입니다." });
    const [nextMission, nextAutomation, nextCoverage, nextPolicy, nextGovernance] = await Promise.all([
      fetchMissionSnapshot(workspace),
      fetchAutomationSnapshot(),
      fetchCoverage().catch(() => ({})),
      fetchLlmPolicy().catch(() => ({})),
      fetchProjectGovernance(workspace).catch(() => ({})),
    ]);
    setMission(nextMission);
    setAutomation(nextAutomation);
    setCoverage(nextCoverage);
    setLlmPolicy(nextPolicy);
    setGovernance(nextGovernance);
    setActiveProjectKey((current) => nextMission.projects.some((project) => project.projectKey === current)
      ? current
      : nextMission.projects[0]?.projectKey || "");
    setProjectBrief(null);
    setStatus({ phase: "ready", message: "Mission Control 동기화 완료." });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchMissionSnapshot(workspace),
      fetchAutomationSnapshot(),
      fetchCoverage().catch(() => ({})),
      fetchLlmPolicy().catch(() => ({})),
      fetchProjectGovernance(workspace).catch(() => ({})),
    ])
      .then(([nextMission, nextAutomation, nextCoverage, nextPolicy, nextGovernance]) => {
        if (cancelled) return;
        setMission(nextMission);
        setAutomation(nextAutomation);
        setCoverage(nextCoverage);
        setLlmPolicy(nextPolicy);
        setGovernance(nextGovernance);
        setActiveProjectKey(nextMission.projects[0]?.projectKey || "");
        setStatus({ phase: "ready", message: "Mission Control 준비 완료." });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({ phase: "failed", message: String((error as Error)?.message || error) });
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  const runAutomation = async (command: string, dryRun = false) => {
    setStatus({ phase: "running", message: `${command}${dryRun ? " dry-run" : ""} 실행 요청 중입니다.` });
    await triggerAutomation(command, dryRun);
    await reload();
  };

  const loadActiveProjectBrief = async () => {
    if (!activeProject?.projectKey) return;
    setStatus({ phase: "loading", message: `${activeProject.projectLabel || activeProject.projectKey} 브리프를 불러오는 중입니다.` });
    try {
      const brief = await fetchProjectBrief(activeProject.projectKey, workspace);
      setProjectBrief(brief);
      setStatus({ phase: "ready", message: "프로젝트 브리프를 불러왔습니다." });
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "프로젝트 브리프 로드 실패" });
    }
  };

  const addProjectAction = async (action: string) => {
    if (!activeProject?.projectKey || !action.trim()) return;
    setStatus({ phase: "running", message: "프로젝트 Action_Items.md에 액션을 추가하는 중입니다." });
    try {
      await appendProjectAction(activeProject.projectKey, {
        workspace,
        action: action.trim(),
        status: "planned",
      });
      await reload();
      setStatus({ phase: "ready", message: "프로젝트 액션을 추가했습니다." });
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "프로젝트 액션 추가 실패" });
    }
  };

  const addProjectDecision = async (decision: string) => {
    if (!activeProject?.projectKey || !decision.trim()) return;
    setStatus({ phase: "running", message: "프로젝트 Decisions.md에 수동 결정을 추가하는 중입니다." });
    try {
      await appendProjectDecision(activeProject.projectKey, {
        workspace,
        decision: decision.trim(),
        action: "approve",
        title: "Mission Control 수동 결정",
      });
      await reload();
      setStatus({ phase: "ready", message: "프로젝트 결정을 추가했습니다." });
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "프로젝트 결정 추가 실패" });
    }
  };

  const missionQuestions = [
    {
      label: "오늘 밀 프로젝트",
      value: activeProject?.projectLabel || activeProject?.projectKey || "선택 없음",
    },
    {
      label: "근거 확인",
      value: activeProject?.coreDocuments?.length ? `${activeProject.coreDocuments.length}개 핵심문서` : "핵심문서 보강 필요",
    },
    {
      label: "정합성 대기",
      value: mission.summary.decisionQueue ? `${mission.summary.decisionQueue}건` : "대기 없음",
    },
    {
      label: "리스크",
      value: riskyProjects.length ? `${riskyProjects.length}개 프로젝트` : "명시 리스크 없음",
    },
    {
      label: "자동화",
      value: latestRun?.status === "running" ? `${latestRun.command} 실행 중` : latestRun?.command || "대기",
    },
  ];

  return {
    mission,
    automation,
    coverage,
    llmPolicy,
    governance,
    activeProject: activeProject as MissionProject | null,
    activeProjectKey: activeProject?.projectKey || activeProjectKey,
    latestRun,
    missionQuestions,
    riskyProjects,
    decisionProjects,
    staleProjects,
    highDocumentProjects,
    automationTimeline,
    projectBrief,
    status,
    setActiveProjectKey,
    reload,
    runAutomation,
    loadActiveProjectBrief,
    addProjectAction,
    addProjectDecision,
  };
}
