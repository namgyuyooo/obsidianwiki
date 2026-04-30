import { useEffect, useMemo, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import { fetchAutomationSnapshot, triggerAutomation, type AutomationRun, type AutomationSnapshot } from "../api/missionApi";
import {
  analyzeDriveInstruction,
  analyzeDriveTargets,
  collectSlack,
  continueAfterCollection,
  fetchDriveAnalyses,
  fetchSlackChannels,
  fetchSlackStatus,
  runTargetedRclone,
  stopAutomation,
  type DriveAnalysis,
  type DriveCandidate,
  type SlackChannel,
  type SlackStatusSnapshot,
} from "../api/controlPlaneApi";

type PipelineCockpitProps = {
  chatContext: ChatContext;
};

function shortDate(value = "") {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

function compactCountMap(map: Record<string, number> | undefined) {
  return Object.entries(map || {})
    .filter(([, value]) => Number(value) > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ") || "-";
}

function currentDriveAnalysis(analyses: DriveAnalysis[]) {
  return analyses[0] || { candidates: [] };
}

export function PipelineCockpit({ chatContext }: PipelineCockpitProps) {
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("Pipeline cockpit 상태를 불러오는 중입니다.");
  const [slackStatus, setSlackStatus] = useState<SlackStatusSnapshot>({});
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelQuery, setChannelQuery] = useState("");
  const [oldestDays, setOldestDays] = useState(2);
  const [limitPerChannel, setLimitPerChannel] = useState(80);
  const [driveInstruction, setDriveInstruction] = useState("쏘닉스 같은 신규 고객/프로젝트 후보를 찾아 안전하게 수집 계획을 세워줘.");
  const [driveAnalyses, setDriveAnalyses] = useState<DriveAnalysis[]>([]);
  const [automation, setAutomation] = useState<AutomationSnapshot>({ running: [], runs: [] });

  const activeAnalysis = currentDriveAnalysis(driveAnalyses);

  const loadAll = async (query = channelQuery) => {
    setPhase("loading");
    try {
      const [nextSlackStatus, channelPayload, analysisPayload, automationPayload] = await Promise.all([
        fetchSlackStatus(),
        fetchSlackChannels(query),
        fetchDriveAnalyses(),
        fetchAutomationSnapshot(),
      ]);
      setSlackStatus(nextSlackStatus);
      setSlackChannels(channelPayload.channels || []);
      setDriveAnalyses(analysisPayload.analyses || []);
      setAutomation(automationPayload);
      setPhase("ready");
      setMessage("Pipeline cockpit 동기화 완료.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Pipeline cockpit 로드 실패");
    }
  };

  useEffect(() => {
    loadAll("");
  }, []);

  const visibleChannels = useMemo(() => {
    const query = channelQuery.trim().toLowerCase();
    return slackChannels.filter((channel) => {
      if (!query) return true;
      return `${channel.name} ${channel.type || ""}`.toLowerCase().includes(query);
    });
  }, [slackChannels, channelQuery]);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setPhase("running");
    try {
      await action();
      setPhase("ready");
      setMessage(success);
      await loadAll(channelQuery);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Pipeline 작업 실패");
    }
  };

  const toggleChannel = (name: string) => {
    setSelectedChannels((current) => (
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    ));
  };

  const runSlackCollect = (dryRun: boolean) => runAction(
    () => collectSlack({ channels: selectedChannels, oldestDays, limitPerChannel, dryRun }),
    dryRun ? "Slack 2일 미리보기를 실행했습니다." : "Slack 2일 수집을 실행했습니다.",
  );

  const runDrivePlanner = () => runAction(async () => {
    const result = driveInstruction.trim()
      ? await analyzeDriveInstruction(driveInstruction.trim())
      : await analyzeDriveTargets();
    setDriveAnalyses((current) => [result, ...current].slice(0, 8));
  }, "Drive 수집 계획을 갱신했습니다.");

  const runningJob = automation.running[0];
  const latestRuns = [...automation.running, ...automation.runs.filter((run) => !automation.running.some((live) => live.runId === run.runId))].slice(0, 8);

  return (
    <main className="aui-ops-surface">
      <section className="aui-ops-hero">
        <div>
          <span className="aui-kicker">mission / automation cockpit</span>
          <h1>Pipeline Cockpit</h1>
          <p>{chatContext.workspace.toUpperCase()} 워크스페이스에서 Slack, Drive, rclone, 후속 위키화를 한 화면에서 안전하게 지휘합니다.</p>
        </div>
        <aside className={`aui-ops-live ${phase}`}>
          <strong>{phase}</strong>
          <span>{message}</span>
          <button onClick={() => loadAll(channelQuery)} type="button">전체 새로고침</button>
        </aside>
      </section>

      <section className="aui-ops-grid aui-ops-grid-wide">
        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>Slack routing</span>
            <strong>{slackStatus.workspace || "workspace 미설정"}</strong>
          </div>
          <div className="aui-ops-statline">
            <span>{slackStatus.configured ? `configured · ${slackStatus.authMode}` : "token 미설정"}</span>
            <span>{slackStatus.collectedChannels || 0} channels</span>
            <span>latest {shortDate(slackStatus.lastCollectedAt)}</span>
          </div>
          <p className="aui-ops-muted">
            bucket {compactCountMap(slackStatus.routingSummary?.channelBuckets)}
          </p>
          <label className="aui-ops-field">
            <span>채널 검색</span>
            <input value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="pjt, sales, tf, 고객명" />
          </label>
          <div className="aui-ops-actions">
            <button onClick={() => loadAll(channelQuery)} type="button">채널 조회</button>
            <button disabled={!selectedChannels.length} onClick={() => runSlackCollect(true)} type="button">2일 미리보기</button>
            <button disabled={!selectedChannels.length} onClick={() => runSlackCollect(false)} type="button">2일 수집 실행</button>
          </div>
          <div className="aui-ops-inline-fields">
            <label>
              <span>lookback</span>
              <input min={1} type="number" value={oldestDays} onChange={(event) => setOldestDays(Number(event.target.value) || 2)} />
            </label>
            <label>
              <span>limit/channel</span>
              <input min={1} type="number" value={limitPerChannel} onChange={(event) => setLimitPerChannel(Number(event.target.value) || 80)} />
            </label>
          </div>
          <div className="aui-ops-list aui-ops-channel-list">
            {visibleChannels.slice(0, 18).map((channel) => {
              const checked = selectedChannels.includes(channel.name);
              const bucket = channel.routing?.channel_profile?.channel_bucket || "unknown";
              return (
                <label className={`aui-ops-checkcard ${checked ? "active" : ""}`} key={channel.id || channel.name}>
                  <input checked={checked} onChange={() => toggleChannel(channel.name)} type="checkbox" />
                  <div>
                    <strong>{channel.name}</strong>
                    <span>{bucket} · {channel.type || "channel"}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </article>

        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>Drive planner</span>
            <strong>{String(activeAnalysis.summary?.driveFolders || 0)} folders scanned</strong>
          </div>
          <label className="aui-ops-field">
            <span>지시 기반 수집 계획</span>
            <textarea
              rows={4}
              value={driveInstruction}
              onChange={(event) => setDriveInstruction(event.target.value)}
              placeholder="예: 특정 고객/프로젝트를 찾아 필요한 경로만 안전하게 수집해."
            />
          </label>
          <div className="aui-ops-actions">
            <button onClick={runDrivePlanner} type="button">GLM 표적 계획 생성</button>
            <button onClick={() => runAction(() => triggerAutomation("rclone-copy", true), "전체 rclone dry-run을 실행했습니다.")} type="button">전체 미리보기</button>
            <button onClick={() => runAction(() => continueAfterCollection(), "수집 이후 manifest/run/refresh-global 체인을 실행했습니다.")} type="button">수집 후 계속</button>
          </div>
          <p className="aui-ops-muted">
            keywords {(activeAnalysis.plan?.keywords || []).join(", ") || "-"}
          </p>
          <div className="aui-ops-list">
            {(activeAnalysis.candidates || []).slice(0, 10).map((candidate) => (
              <DriveCandidateCard key={`${candidate.remotePath}-${candidate.score || 0}`} candidate={candidate} onRun={runAction} />
            ))}
            {!activeAnalysis.candidates?.length ? <p className="aui-ops-muted">아직 Drive 후보 분석이 없습니다.</p> : null}
          </div>
        </article>

        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>Run control</span>
            <strong>{runningJob?.command || "대기"}</strong>
          </div>
          <div className="aui-ops-runbox">
            <span>현재 실행</span>
            <strong>{runningJob?.status || "idle"}</strong>
            <p>{runningJob?.progress?.summary || runningJob?.progress?.lastLogLine || "실행 중인 작업이 없습니다."}</p>
          </div>
          <div className="aui-ops-actions">
            <button onClick={() => runAction(() => triggerAutomation("refresh-global"), "refresh-global 실행을 요청했습니다.")} type="button">그래프맵 업데이트</button>
            <button disabled={!runningJob?.runId} onClick={() => runAction(() => stopAutomation(runningJob?.runId || ""), "실행 중인 자동화에 stop을 요청했습니다.")} type="button">현재 작업 중지</button>
          </div>
          <div className="aui-ops-list">
            {latestRuns.map((run: AutomationRun) => (
              <article className="aui-ops-log-card" key={run.runId || `${run.command}-${run.createdAt}`}>
                <strong>{run.command || "command"}</strong>
                <span>{run.status || "-"} · {shortDate(run.updatedAt || run.createdAt)}</span>
                <small>{run.progress?.summary || run.progress?.lastLogLine || "-"}</small>
              </article>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function DriveCandidateCard({
  candidate,
  onRun,
}: {
  key?: string;
  candidate: DriveCandidate;
  onRun: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  return (
    <article className={`aui-ops-drive-card ${candidate.priority || "low"}`}>
      <div className="aui-ops-drive-top">
        <div>
          <strong>{candidate.folder || candidate.remotePath}</strong>
          <span>{candidate.remotePath}</span>
        </div>
        <b>{candidate.priority || "low"} · {candidate.score || 0}</b>
      </div>
      <p>{candidate.matchedProjectLabel || "매칭 프로젝트 없음"}</p>
      <small>{(candidate.reasons || []).slice(0, 2).join(" · ") || "분석 이유 없음"}</small>
      <div className="aui-ops-chipline">
        {(candidate.missingKinds || []).slice(0, 4).map((kind) => <span key={kind}>{kind}</span>)}
      </div>
      <div className="aui-ops-actions">
        <button onClick={() => onRun(() => runTargetedRclone(candidate.remotePath, true), `${candidate.remotePath} dry-run을 실행했습니다.`)} type="button">target dry-run</button>
        <button onClick={() => onRun(() => runTargetedRclone(candidate.remotePath, false), `${candidate.remotePath} 로컬 mirror 수집을 실행했습니다.`)} type="button">target run</button>
      </div>
    </article>
  );
}
