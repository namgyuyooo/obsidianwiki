import { useEffect, useMemo, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import { fetchAutomationSnapshot, triggerAutomation, type AutomationRun, type AutomationSnapshot } from "../api/missionApi";
import {
  analyzeDriveInstruction,
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

function currentDriveAnalysis(analyses: DriveAnalysis[]) {
  return analyses[0] || { candidates: [] };
}

export function PipelineCockpit({ chatContext }: PipelineCockpitProps) {
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("수집 화면을 불러오는 중입니다.");
  const [slackStatus, setSlackStatus] = useState<SlackStatusSnapshot>({});
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelQuery, setChannelQuery] = useState("");
  const [oldestDays, setOldestDays] = useState(2);
  const [limitPerChannel, setLimitPerChannel] = useState(80);
  const [objective, setObjective] = useState("쏘닉스 같은 신규 고객/프로젝트 후보를 찾아 안전하게 수집 계획을 세워줘.");
  const [driveAnalyses, setDriveAnalyses] = useState<DriveAnalysis[]>([]);
  const [automation, setAutomation] = useState<AutomationSnapshot>({ running: [], runs: [] });

  const activeAnalysis = currentDriveAnalysis(driveAnalyses);
  const candidates = activeAnalysis.candidates || [];
  const topCandidate = candidates[0];
  const runningJob = automation.running[0];
  const recentRuns = [...automation.running, ...automation.runs.filter((run) => !automation.running.some((live) => live.runId === run.runId))].slice(0, 6);

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
      setMessage("수집 화면 동기화 완료.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "수집 화면 로드 실패");
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
  }, [channelQuery, slackChannels]);

  const suggestedChannels = visibleChannels.slice(0, 4).map((channel) => channel.name).filter(Boolean);
  const selectedChannelLabel = selectedChannels.length ? selectedChannels.slice(0, 3).join(", ") : "선택 없음";

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

  const selectSuggestedChannels = () => {
    setSelectedChannels((current) => Array.from(new Set([...current, ...suggestedChannels])));
    setMessage(suggestedChannels.length ? `추천 채널 ${suggestedChannels.length}개를 선택했습니다.` : "선택할 추천 채널이 없습니다.");
  };

  const runSlackCollect = (testOnly: boolean) => runAction(
    () => collectSlack({ channels: selectedChannels, oldestDays, limitPerChannel, dryRun: testOnly }),
    testOnly ? "Slack 테스트를 실행했습니다." : "Slack 실제 수집을 실행했습니다.",
  );

  const runDrivePlanner = () => runAction(async () => {
    const result = await analyzeDriveInstruction(objective.trim());
    setDriveAnalyses((current) => [result, ...current].slice(0, 8));
  }, "표적 후보를 갱신했습니다.");

  const runTarget = (candidate: DriveCandidate, testOnly: boolean) => runAction(
    () => runTargetedRclone(candidate.remotePath, testOnly),
    testOnly ? `${candidate.remotePath} 테스트를 실행했습니다.` : `${candidate.remotePath} 실제 수집을 실행했습니다.`,
  );

  return (
    <main className="aui-ops-surface aui-work-surface">
      <section className="aui-ops-hero aui-work-titlebar">
        <div>
          <span className="aui-kicker">수집</span>
          <h1>수집 파이프라인</h1>
          <p>{chatContext.workspace.toUpperCase()} 증거 수집을 선택, 테스트, 실제 수집, 후속 반영 순서로 실행합니다.</p>
          <div className="aui-work-metrics">
            <span>{selectedChannels.length} 채널 선택</span>
            <span>{candidates.length} 표적 후보</span>
            <span>{runningJob?.status || "idle"}</span>
            <span>{recentRuns.length} 실행 이력</span>
          </div>
        </div>
        <aside className={`aui-ops-live ${phase}`}>
          <strong>{phase}</strong>
          <span>{message}</span>
          <button onClick={() => loadAll(channelQuery)} type="button">새로고침</button>
        </aside>
      </section>

      <section className="aui-pipeline-core">
        <article className="aui-pipeline-step">
          <header>
            <span>1</span>
            <div>
              <strong>목표와 범위 선택</strong>
              <small>{selectedChannelLabel}</small>
            </div>
          </header>
          <label className="aui-ops-field">
            <span>수집 목표</span>
            <textarea
              rows={4}
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="무엇을 찾고 어떤 증거를 수집할지 적으세요."
            />
          </label>
          <div className="aui-ops-inline-fields">
            <label>
              <span>채널 검색</span>
              <input value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="sales, pjt, 고객명" />
            </label>
            <label>
              <span>최근 며칠</span>
              <input min={1} type="number" value={oldestDays} onChange={(event) => setOldestDays(Number(event.target.value) || 2)} />
            </label>
            <label>
              <span>채널당 개수</span>
              <input min={1} type="number" value={limitPerChannel} onChange={(event) => setLimitPerChannel(Number(event.target.value) || 80)} />
            </label>
          </div>
          <div className="aui-pipeline-choice-list">
            {visibleChannels.slice(0, 10).map((channel) => {
              const checked = selectedChannels.includes(channel.name);
              return (
                <label className={checked ? "active" : ""} key={channel.id || channel.name}>
                  <input checked={checked} onChange={() => toggleChannel(channel.name)} type="checkbox" />
                  <span>{channel.name}</span>
                  <small>{channel.routing?.channel_profile?.channel_bucket || channel.type || "channel"}</small>
                </label>
              );
            })}
            {!visibleChannels.length ? <p className="aui-ops-muted">선택 가능한 채널이 없습니다. Slack 설정 또는 검색어를 확인하세요.</p> : null}
          </div>
          <div className="aui-pipeline-actions">
            <button disabled={!suggestedChannels.length} onClick={selectSuggestedChannels} type="button">추천 채널 선택</button>
            <button disabled={!selectedChannels.length} onClick={() => setSelectedChannels([])} type="button">선택 초기화</button>
          </div>
        </article>

        <article className="aui-pipeline-step">
          <header>
            <span>2</span>
            <div>
              <strong>표적 생성</strong>
              <small>{topCandidate?.folder || topCandidate?.remotePath || "후보 없음"}</small>
            </div>
          </header>
          <div className="aui-pipeline-actions">
            <button className="primary" disabled={!objective.trim()} onClick={runDrivePlanner} type="button">표적 후보 만들기</button>
            <button onClick={() => loadAll(channelQuery)} type="button">후보 다시 읽기</button>
          </div>
          <div className="aui-pipeline-target-list">
            {candidates.slice(0, 6).map((candidate) => (
              <article key={`${candidate.remotePath}-${candidate.score || 0}`}>
                <div>
                  <strong>{candidate.folder || candidate.remotePath}</strong>
                  <span>{candidate.matchedProjectLabel || "프로젝트 미확정"} · {candidate.priority || "priority"} · {candidate.score || 0}</span>
                  <small>{(candidate.reasons || []).slice(0, 2).join(" · ") || "추천 근거 없음"}</small>
                </div>
                <div>
                  <button onClick={() => runTarget(candidate, true)} type="button">테스트</button>
                  <button onClick={() => runTarget(candidate, false)} type="button">실제 수집</button>
                </div>
              </article>
            ))}
            {!candidates.length ? <p className="aui-ops-muted">목표를 입력하고 표적 후보를 먼저 만드세요.</p> : null}
          </div>
        </article>

        <article className="aui-pipeline-step">
          <header>
            <span>3</span>
            <div>
              <strong>테스트</strong>
              <small>실제 저장 전 범위와 위험 확인</small>
            </div>
          </header>
          <div className="aui-pipeline-actions vertical">
            <button disabled={!selectedChannels.length} onClick={() => runSlackCollect(true)} type="button">Slack 테스트</button>
            <button disabled={!topCandidate?.remotePath} onClick={() => topCandidate && runTarget(topCandidate, true)} type="button">최우선 표적 테스트</button>
            <button onClick={() => runAction(() => triggerAutomation("rclone-copy", true), "전체 mirror 테스트를 실행했습니다.")} type="button">전체 mirror 테스트</button>
          </div>
        </article>

        <article className="aui-pipeline-step">
          <header>
            <span>4</span>
            <div>
              <strong>실제 수집과 반영</strong>
              <small>{runningJob?.command || "대기 중"}</small>
            </div>
          </header>
          <div className="aui-pipeline-actions vertical">
            <button className="primary" disabled={!selectedChannels.length} onClick={() => runSlackCollect(false)} type="button">Slack 실제 수집</button>
            <button disabled={!topCandidate?.remotePath} onClick={() => topCandidate && runTarget(topCandidate, false)} type="button">최우선 표적 실제 수집</button>
            <button onClick={() => runAction(() => continueAfterCollection(), "후속 반영을 실행했습니다.")} type="button">후속 반영</button>
            <button onClick={() => runAction(() => triggerAutomation("refresh-global"), "그래프맵 업데이트를 요청했습니다.")} type="button">그래프맵 업데이트</button>
            <button disabled={!runningJob?.runId} onClick={() => runAction(() => stopAutomation(runningJob?.runId || ""), "실행 중인 작업에 중지를 요청했습니다.")} type="button">현재 작업 중지</button>
          </div>
        </article>
      </section>

      <section className="aui-pipeline-rail">
        <article>
          <strong>현재 실행</strong>
          <span>{runningJob?.status || "idle"}</span>
          <p>{runningJob?.progress?.summary || runningJob?.progress?.lastLogLine || "실행 중인 작업이 없습니다."}</p>
        </article>
        <article>
          <strong>최근 실행</strong>
          <div className="aui-ops-list">
            {recentRuns.map((run: AutomationRun) => (
              <div className="aui-ops-log-card" key={run.runId || `${run.command}-${run.createdAt}`}>
                <strong>{run.command || "command"}</strong>
                <span>{run.status || "-"} · {shortDate(run.updatedAt || run.createdAt)}</span>
                <small>{run.progress?.summary || run.progress?.lastLogLine || "-"}</small>
              </div>
            ))}
            {!recentRuns.length ? <p className="aui-ops-muted">아직 실행 이력이 없습니다.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
