import { useEffect, useState } from "react";
import {
  fetchAutomationSnapshot,
  fetchMissionSnapshot,
  triggerAutomation,
  type AutomationSnapshot,
  type MissionProject,
  type MissionSnapshot,
} from "../api/missionApi";

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
  const [activeProjectKey, setActiveProjectKey] = useState("");
  const [status, setStatus] = useState<MissionStatus>({
    phase: "loading",
    message: "Mission Control 데이터를 불러오는 중입니다.",
  });

  const activeProject = mission.projects.find((project) => project.projectKey === activeProjectKey) || mission.projects[0] || null;
  const riskyProjects = mission.projects.filter((project) => (project.risks || []).length || project.decisionQueueCount);
  const latestRun = automation.running[0] || automation.runs[0] || null;

  async function reload() {
    setStatus({ phase: "loading", message: "Mission Control을 동기화하는 중입니다." });
    const [nextMission, nextAutomation] = await Promise.all([
      fetchMissionSnapshot(workspace),
      fetchAutomationSnapshot(),
    ]);
    setMission(nextMission);
    setAutomation(nextAutomation);
    setActiveProjectKey((current) => nextMission.projects.some((project) => project.projectKey === current)
      ? current
      : nextMission.projects[0]?.projectKey || "");
    setStatus({ phase: "ready", message: "Mission Control 동기화 완료." });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMissionSnapshot(workspace), fetchAutomationSnapshot()])
      .then(([nextMission, nextAutomation]) => {
        if (cancelled) return;
        setMission(nextMission);
        setAutomation(nextAutomation);
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
    activeProject: activeProject as MissionProject | null,
    activeProjectKey: activeProject?.projectKey || activeProjectKey,
    latestRun,
    missionQuestions,
    riskyProjects,
    status,
    setActiveProjectKey,
    reload,
    runAutomation,
  };
}
