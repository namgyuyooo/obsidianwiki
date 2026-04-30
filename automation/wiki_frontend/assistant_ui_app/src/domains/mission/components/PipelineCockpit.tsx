import { useEffect, useMemo, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import { fetchAutomationSnapshot, triggerAutomation, type AutomationRun, type AutomationSnapshot } from "../api/missionApi";
import {
  analyzeDriveInstruction,
  collectSlack,
  createSchedule,
  continueAfterCollection,
  fetchDriveAnalyses,
  fetchSchedules,
  fetchSettings,
  fetchSlackChannels,
  fetchSlackStatus,
  saveSettings,
  runTargetedRclone,
  stopAutomation,
  type AutomationSchedule,
  type DriveAnalysis,
  type DriveCandidate,
  type SettingsPayload,
  type SlackChannel,
  type SlackStatusSnapshot,
} from "../api/controlPlaneApi";

type PipelineCockpitProps = {
  chatContext: ChatContext;
};

type SourceKey = "slack" | "drive" | "filesystem";

type SourceSelection = Record<SourceKey, boolean>;

type ExecutionMode = "now" | "scheduled";
type CompletionMode = "timebox" | "objective";
type ConnectionPolicy = "stop" | "retry";
type ExistingMode = "skip-existing" | "overwrite";

type ScheduleDraft = {
  name: string;
  command: string;
  mode: string;
  runAt: string;
  timeOfDay: string;
  intervalMinutes: number;
};

const SOURCE_LABELS: Array<{ key: SourceKey; label: string; detail: string }> = [
  { key: "slack", label: "Slack", detail: "대화와 의사결정 증거" },
  { key: "drive", label: "Google Drive", detail: "문서와 폴더 증거" },
  { key: "filesystem", label: "파일 브라우징", detail: "로컬 mirror와 업로드 파일" },
];

const SOURCE_PRESETS: Array<{ label: string; sources: SourceSelection }> = [
  { label: "전체", sources: { slack: true, drive: true, filesystem: true } },
  { label: "대화+문서", sources: { slack: true, drive: true, filesystem: false } },
  { label: "문서+파일", sources: { slack: false, drive: true, filesystem: true } },
  { label: "Slack만", sources: { slack: true, drive: false, filesystem: false } },
  { label: "파일만", sources: { slack: false, drive: false, filesystem: true } },
];

const CONSERVATIVE_RULE_FIELDS = [
  { key: "RCLONE_BWLIMIT", label: "대역폭 제한", fallback: "1M" },
  { key: "RCLONE_TPSLIMIT", label: "요청 속도 제한", fallback: "1" },
  { key: "RCLONE_CHECKERS", label: "동시 검사", fallback: "1" },
  { key: "RCLONE_TRANSFERS", label: "동시 전송", fallback: "1" },
  { key: "RCLONE_COPY_MAX_MINUTES", label: "수집 시간(분)", fallback: "30" },
  { key: "RCLONE_EXCLUDE_PATTERNS", label: "제외 패턴", fallback: ".git,node_modules,*.tmp" },
  { key: "SLACK_HISTORY_LIMIT", label: "Slack 채널당 메시지", fallback: "80" },
  { key: "SLACK_OLDEST_DAYS", label: "Slack 최근 일수", fallback: "2" },
  { key: "SLACK_API_MIN_INTERVAL_SECONDS", label: "Slack API 간격(초)", fallback: "1.5" },
  { key: "SLACK_HISTORY_PAGE_PAUSE_SECONDS", label: "Slack 페이지 대기(초)", fallback: "1.2" },
  { key: "SLACK_THREAD_PAUSE_SECONDS", label: "Slack thread 대기(초)", fallback: "1.2" },
  { key: "SLACK_CHANNEL_PAUSE_SECONDS", label: "Slack 채널 대기(초)", fallback: "3" },
  { key: "SLACK_RATE_LIMIT_COOLDOWN_SECONDS", label: "Slack rate-limit 쿨다운(초)", fallback: "30" },
  { key: "SLACK_COLLECT_MAX_MINUTES", label: "Slack 최대 수집시간(분)", fallback: "10" },
];

const BATCH_COMMANDS = [
  { key: "slack-collect", label: "Slack 수집", source: "slack" },
  { key: "rclone-copy", label: "Drive/파일 mirror", source: "drive" },
  { key: "build-manifest", label: "Manifest 생성", source: "system" },
  { key: "run", label: "위키 반영", source: "system" },
  { key: "refresh-global", label: "검색/그래프 반영", source: "system" },
] as const;

function shortDate(value = "") {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

function currentDriveAnalysis(analyses: DriveAnalysis[]) {
  return analyses[0] || { candidates: [] };
}

function pickConservativeRules(settings: Record<string, string> = {}) {
  return Object.fromEntries(
    CONSERVATIVE_RULE_FIELDS.map((field) => [field.key, settings[field.key] || field.fallback]),
  ) as Record<string, string>;
}

function isPrecollected(candidate: DriveCandidate) {
  return Boolean((candidate.tracked && candidate.manifested) || (candidate.manifested && !(candidate.missingKinds || []).length));
}

function commandKey(command = "") {
  return command.replace(/\s+--dry-run/g, "").trim();
}

function conservativeNumber(settings: Record<string, string>, key: string, fallback: number) {
  const value = Number(settings[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  const [sources, setSources] = useState<SourceSelection>({ slack: true, drive: true, filesystem: true });
  const [filesystemPath, setFilesystemPath] = useState("automation/drive_wikify/runtime/mirror");
  const [continueAfterCollect, setContinueAfterCollect] = useState(true);
  const [refreshAfterCollect, setRefreshAfterCollect] = useState(true);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("now");
  const [completionMode, setCompletionMode] = useState<CompletionMode>("objective");
  const [connectionPolicy, setConnectionPolicy] = useState<ConnectionPolicy>("retry");
  const [existingMode, setExistingMode] = useState<ExistingMode>("skip-existing");
  const [retryAfterMinutes, setRetryAfterMinutes] = useState(10);
  const [settings, setSettings] = useState<SettingsPayload>({ settings: {}, locked: {} });
  const [ruleDraft, setRuleDraft] = useState<Record<string, string>>(pickConservativeRules());
  const [schedules, setSchedules] = useState<AutomationSchedule[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>({
    name: "증거 수집 전체 사이클",
    command: "full-cycle",
    mode: "daily",
    runAt: "",
    timeOfDay: "03:00",
    intervalMinutes: 60,
  });
  const [tested, setTested] = useState({ slack: false, drive: false, mirror: false });
  const [driveAnalyses, setDriveAnalyses] = useState<DriveAnalysis[]>([]);
  const [automation, setAutomation] = useState<AutomationSnapshot>({ running: [], runs: [] });

  const activeAnalysis = currentDriveAnalysis(driveAnalyses);
  const candidates = activeAnalysis.candidates || [];
  const topCandidate = candidates[0];
  const runningJob = automation.running[0];
  const recentRuns = [...automation.running, ...automation.runs.filter((run) => !automation.running.some((live) => live.runId === run.runId))].slice(0, 6);
  const latestRunsByCommand = new Map<string, AutomationRun>();
  [...automation.running, ...automation.runs].forEach((run) => {
    const key = commandKey(run.command);
    if (key && !latestRunsByCommand.has(key)) latestRunsByCommand.set(key, run);
  });

  const loadAll = async (query = channelQuery) => {
    setPhase("loading");
    try {
      const [nextSlackStatus, channelPayload, analysisPayload, automationPayload, settingsPayload, schedulePayload] = await Promise.all([
        fetchSlackStatus(),
        fetchSlackChannels(query),
        fetchDriveAnalyses(),
        fetchAutomationSnapshot(),
        fetchSettings(),
        fetchSchedules(),
      ]);
      setSlackStatus(nextSlackStatus);
      setSlackChannels(channelPayload.channels || []);
      setDriveAnalyses(analysisPayload.analyses || []);
      setAutomation(automationPayload);
      setSettings(settingsPayload);
      setRuleDraft(pickConservativeRules(settingsPayload.settings));
      setOldestDays(conservativeNumber(settingsPayload.settings, "SLACK_OLDEST_DAYS", 2));
      setLimitPerChannel(conservativeNumber(settingsPayload.settings, "SLACK_HISTORY_LIMIT", 80));
      setSchedules(schedulePayload.schedules || []);
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
  const selectedSourceCount = Object.values(sources).filter(Boolean).length;
  const activeSchedules = schedules.filter((schedule) => schedule.enabled !== false).slice(0, 4);
  const precollectedCandidates = candidates.filter(isPrecollected);
  const actionableCandidates = existingMode === "skip-existing" ? candidates.filter((candidate) => !isPrecollected(candidate)) : candidates;
  const visibleCandidates = existingMode === "skip-existing" ? actionableCandidates : candidates;
  const activeTopCandidate = visibleCandidates[0];
  const batchStatusCards = BATCH_COMMANDS.filter((item) => (
    item.source === "system" || sources[item.source as SourceKey]
  )).map((item) => {
    const run = latestRunsByCommand.get(item.key);
    return { ...item, run };
  });

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
    setTested((current) => ({ ...current, slack: false }));
  };

  const toggleSource = (key: SourceKey) => {
    setSources((current) => ({ ...current, [key]: !current[key] }));
  };

  const applyPreset = (nextSources: SourceSelection) => {
    setSources(nextSources);
    setTested({ slack: false, drive: false, mirror: false });
  };

  const selectSuggestedChannels = () => {
    setSelectedChannels((current) => Array.from(new Set([...current, ...suggestedChannels])));
    setMessage(suggestedChannels.length ? `추천 채널 ${suggestedChannels.length}개를 선택했습니다.` : "선택할 추천 채널이 없습니다.");
  };

  const runSlackCollect = (testOnly: boolean) => runAction(
    async () => {
      await collectSlack({ channels: selectedChannels, oldestDays, limitPerChannel, dryRun: testOnly });
      if (testOnly) setTested((current) => ({ ...current, slack: true }));
    },
    testOnly ? "Slack 테스트를 실행했습니다." : "Slack 실제 수집을 실행했습니다.",
  );

  const runPostCollection = async () => {
    if (continueAfterCollect) await continueAfterCollection();
    if (refreshAfterCollect) await triggerAutomation("refresh-global");
  };

  const saveConservativeRules = () => runAction(async () => {
    await saveSettings({
      ...(settings.settings || {}),
      ...ruleDraft,
      SLACK_OLDEST_DAYS: String(oldestDays),
      SLACK_HISTORY_LIMIT: String(limitPerChannel),
    });
  }, "공통 보수 룰을 저장했습니다.");

  const scheduleCollection = () => runAction(async () => {
    await createSchedule({
      ...scheduleDraft,
      name: scheduleDraft.name || "증거 수집 예약",
      dryRun: false,
      completionMode,
      connectionPolicy,
      retryAfterMinutes,
    });
  }, "실제 수집 예약을 생성했습니다.");

  const runSlackCollectWithAutomation = (testOnly: boolean) => runAction(async () => {
    await collectSlack({ channels: selectedChannels, oldestDays, limitPerChannel, dryRun: testOnly });
    if (testOnly) setTested((current) => ({ ...current, slack: true }));
    if (!testOnly) await runPostCollection();
  }, testOnly ? "Slack 테스트를 실행했습니다." : "Slack 실제 수집과 후속 자동화를 실행했습니다.");

  const runDrivePlanner = () => runAction(async () => {
    const result = await analyzeDriveInstruction(objective.trim());
    setDriveAnalyses((current) => [result, ...current].slice(0, 8));
  }, "표적 후보를 갱신했습니다.");

  const runTarget = (candidate: DriveCandidate, testOnly: boolean) => runAction(async () => {
    await runTargetedRclone(candidate.remotePath, testOnly, { existingMode });
    if (testOnly) setTested((current) => ({ ...current, drive: true }));
  }, testOnly ? `${candidate.remotePath} 테스트를 실행했습니다.` : `${candidate.remotePath} 실제 수집을 실행했습니다.`);

  const runTargetWithAutomation = (candidate: DriveCandidate, testOnly: boolean) => runAction(async () => {
    await runTargetedRclone(candidate.remotePath, testOnly, { existingMode });
    if (testOnly) setTested((current) => ({ ...current, drive: true }));
    if (!testOnly) await runPostCollection();
  }, testOnly ? `${candidate.remotePath} 테스트를 실행했습니다.` : `${candidate.remotePath} 실제 수집과 후속 자동화를 실행했습니다.`);

  const runMirrorTest = () => runAction(async () => {
    await triggerAutomation("rclone-copy", true);
    setTested((current) => ({ ...current, mirror: true }));
  }, "전체 mirror 테스트를 실행했습니다.");

  const openFilesystemBrowser = () => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("surface", "wiki");
    nextUrl.searchParams.set("collectionPath", filesystemPath);
    window.location.href = nextUrl.toString();
  };

  return (
    <main className="aui-ops-surface aui-work-surface">
      <section className="aui-ops-hero aui-work-titlebar">
        <div>
          <span className="aui-kicker">수집</span>
          <h1>수집 파이프라인</h1>
          <p>{chatContext.workspace.toUpperCase()} 증거 수집을 선택, 테스트, 실제 수집, 후속 반영 순서로 실행합니다.</p>
          <div className="aui-work-metrics">
            <span>{selectedChannels.length} 채널 선택</span>
            <span>{selectedSourceCount} 증거원</span>
            <span>{actionableCandidates.length}/{candidates.length} 수집 대상</span>
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
              <small>{selectedSourceCount}개 증거원 · {selectedChannelLabel}</small>
            </div>
          </header>
          <label className="aui-ops-field">
            <span>수집 목표</span>
            <textarea
              rows={4}
              value={objective}
              onChange={(event) => {
                setObjective(event.target.value);
                setTested((current) => ({ ...current, drive: false }));
              }}
              placeholder="무엇을 찾고 어떤 증거를 수집할지 적으세요."
            />
          </label>
          <div className="aui-pipeline-source-grid">
            {SOURCE_LABELS.map((source) => (
              <label className={sources[source.key] ? "active" : ""} key={source.key}>
                <input checked={sources[source.key]} onChange={() => toggleSource(source.key)} type="checkbox" />
                <strong>{source.label}</strong>
                <span>{source.detail}</span>
              </label>
            ))}
          </div>
          <div className="aui-pipeline-preset-row">
            {SOURCE_PRESETS.map((preset) => (
              <button key={preset.label} onClick={() => applyPreset(preset.sources)} type="button">{preset.label}</button>
            ))}
          </div>
          {sources.slack ? (
            <>
          <div className="aui-ops-inline-fields">
            <label>
              <span>채널 검색</span>
              <input value={channelQuery} onChange={(event) => setChannelQuery(event.target.value)} placeholder="sales, pjt, 고객명" />
            </label>
            <label>
              <span>최근 며칠</span>
              <input
                min={1}
                type="number"
                value={oldestDays}
                onChange={(event) => {
                  const nextValue = Number(event.target.value) || 2;
                  setOldestDays(nextValue);
                  setRuleDraft((current) => ({ ...current, SLACK_OLDEST_DAYS: String(nextValue) }));
                }}
              />
            </label>
            <label>
              <span>채널당 개수</span>
              <input
                min={1}
                type="number"
                value={limitPerChannel}
                onChange={(event) => {
                  const nextValue = Number(event.target.value) || 80;
                  setLimitPerChannel(nextValue);
                  setRuleDraft((current) => ({ ...current, SLACK_HISTORY_LIMIT: String(nextValue) }));
                }}
              />
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
            </>
          ) : null}
          {sources.filesystem ? (
            <div className="aui-pipeline-filebox">
              <label className="aui-ops-field">
                <span>파일 브라우징 시작 경로</span>
                <input
                  value={filesystemPath}
                  onChange={(event) => {
                    setFilesystemPath(event.target.value);
                    setTested((current) => ({ ...current, mirror: false }));
                  }}
                />
              </label>
              <button onClick={openFilesystemBrowser} type="button">파일 브라우저 열기</button>
            </div>
          ) : null}
        </article>

        <article className="aui-pipeline-step">
          <header>
            <span>2</span>
            <div>
              <strong>표적 생성</strong>
              <small>{topCandidate?.folder || topCandidate?.remotePath || "후보 없음"}</small>
            </div>
          </header>
          {sources.drive ? (
            <>
          <div className="aui-pipeline-actions">
            <button className="primary" disabled={!objective.trim()} onClick={runDrivePlanner} type="button">표적 후보 만들기</button>
            <button onClick={() => loadAll(channelQuery)} type="button">후보 다시 읽기</button>
          </div>
          <div className="aui-pipeline-existing-mode">
            <div>
              <strong>기수집 처리</strong>
              <span>{precollectedCandidates.length}개 후보가 이미 수집/manifest 상태입니다.</span>
            </div>
            <label className={existingMode === "skip-existing" ? "active" : ""}>
              <input checked={existingMode === "skip-existing"} onChange={() => setExistingMode("skip-existing")} type="radio" />
              <span>기수집 제외</span>
            </label>
            <label className={existingMode === "overwrite" ? "active" : ""}>
              <input checked={existingMode === "overwrite"} onChange={() => setExistingMode("overwrite")} type="radio" />
              <span>로컬 mirror 덮어쓰기</span>
            </label>
          </div>
          <div className="aui-pipeline-target-list">
            {visibleCandidates.slice(0, 6).map((candidate) => (
              <article key={`${candidate.remotePath}-${candidate.score || 0}`}>
                <div>
                  <strong>{candidate.folder || candidate.remotePath}</strong>
                  <span>{candidate.matchedProjectLabel || "프로젝트 미확정"} · {candidate.priority || "priority"} · {candidate.score || 0}</span>
                  <small>{isPrecollected(candidate) ? "기수집/manifest 확인됨" : (candidate.reasons || []).slice(0, 2).join(" · ") || "추천 근거 없음"}</small>
                </div>
                <div>
                  <button onClick={() => runTarget(candidate, true)} type="button">테스트</button>
                  <button onClick={() => runTargetWithAutomation(candidate, false)} type="button">실제 수집</button>
                </div>
              </article>
            ))}
            {existingMode === "skip-existing" && precollectedCandidates.slice(0, 3).map((candidate) => (
              <article className="skipped" key={`skipped-${candidate.remotePath}`}>
                <div>
                  <strong>{candidate.folder || candidate.remotePath}</strong>
                  <span>사전 제외 · tracked={candidate.tracked ? "yes" : "no"} · manifest={candidate.manifested ? "yes" : "no"}</span>
                  <small>덮어쓰기가 필요하면 위 옵션을 `로컬 mirror 덮어쓰기`로 바꾸세요.</small>
                </div>
              </article>
            ))}
            {!candidates.length ? <p className="aui-ops-muted">목표를 입력하고 표적 후보를 먼저 만드세요.</p> : null}
            {candidates.length && !visibleCandidates.length ? <p className="aui-ops-muted">모든 후보가 기수집 상태라 기본 정책에서는 제외됩니다. 필요하면 덮어쓰기를 선택하세요.</p> : null}
          </div>
            </>
          ) : (
            <p className="aui-ops-muted">Google Drive를 선택하면 표적 후보 생성과 rclone 수집 옵션이 열립니다.</p>
          )}
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
            {sources.slack ? <button disabled={!selectedChannels.length} onClick={() => runSlackCollect(true)} type="button">Slack 테스트</button> : null}
            {sources.drive ? <button disabled={!activeTopCandidate?.remotePath} onClick={() => activeTopCandidate && runTarget(activeTopCandidate, true)} type="button">최우선 표적 테스트</button> : null}
            {sources.filesystem ? <button onClick={openFilesystemBrowser} type="button">파일 브라우징 확인</button> : null}
            {sources.drive || sources.filesystem ? <button onClick={runMirrorTest} type="button">전체 mirror 테스트</button> : null}
            <p className="aui-ops-muted">테스트 완료: Slack {tested.slack ? "완료" : "대기"} · 표적 {tested.drive ? "완료" : "대기"} · mirror {tested.mirror ? "완료" : "대기"}</p>
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
          <div className="aui-pipeline-automation-options">
            <label>
              <input checked={continueAfterCollect} onChange={(event) => setContinueAfterCollect(event.target.checked)} type="checkbox" />
              <span>수집 후 위키 초안까지 반영</span>
            </label>
            <label>
              <input checked={refreshAfterCollect} onChange={(event) => setRefreshAfterCollect(event.target.checked)} type="checkbox" />
              <span>끝나면 검색/그래프에 반영</span>
            </label>
          </div>
          <div className="aui-pipeline-policy-grid">
            <label>
              <span>실행 방식</span>
              <select value={executionMode} onChange={(event) => setExecutionMode(event.target.value as ExecutionMode)}>
                <option value="now">즉시 실행</option>
                <option value="scheduled">예약 실행</option>
              </select>
            </label>
            <label>
              <span>종료 조건</span>
              <select value={completionMode} onChange={(event) => setCompletionMode(event.target.value as CompletionMode)}>
                <option value="objective">목적 완료 시 종료</option>
                <option value="timebox">설정 시간까지만 수집</option>
              </select>
            </label>
            <label>
              <span>연결 유실</span>
              <select value={connectionPolicy} onChange={(event) => setConnectionPolicy(event.target.value as ConnectionPolicy)}>
                <option value="retry">설정 시간 이후 재시도</option>
                <option value="stop">즉시 종료</option>
              </select>
            </label>
            {connectionPolicy === "retry" ? (
              <label>
                <span>재시도 대기(분)</span>
                <input min={1} type="number" value={retryAfterMinutes} onChange={(event) => setRetryAfterMinutes(Number(event.target.value) || 10)} />
              </label>
            ) : null}
          </div>
          {executionMode === "scheduled" ? (
            <div className="aui-pipeline-schedule-panel">
              <strong>예약 만들기</strong>
              <div className="aui-pipeline-policy-grid">
                <label>
                  <span>예약 이름</span>
                  <input value={scheduleDraft.name} onChange={(event) => setScheduleDraft((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <label>
                  <span>실행 명령</span>
                  <select value={scheduleDraft.command} onChange={(event) => setScheduleDraft((current) => ({ ...current, command: event.target.value }))}>
                    <option value="full-cycle">전체 수집+반영</option>
                    <option value="rclone-copy">Drive/파일 mirror 수집</option>
                    <option value="slack-collect">Slack 수집</option>
                    <option value="build-manifest">manifest 생성</option>
                    <option value="run">위키 반영 실행</option>
                  </select>
                </label>
                <label>
                  <span>반복 방식</span>
                  <select value={scheduleDraft.mode} onChange={(event) => setScheduleDraft((current) => ({ ...current, mode: event.target.value }))}>
                    <option value="daily">매일</option>
                    <option value="interval">간격 반복</option>
                    <option value="once">한 번만</option>
                  </select>
                </label>
                {scheduleDraft.mode === "interval" ? (
                  <label>
                    <span>반복 간격(분)</span>
                    <input min={5} type="number" value={scheduleDraft.intervalMinutes} onChange={(event) => setScheduleDraft((current) => ({ ...current, intervalMinutes: Number(event.target.value) || 60 }))} />
                  </label>
                ) : scheduleDraft.mode === "once" ? (
                  <label>
                    <span>실행 일시</span>
                    <input type="datetime-local" value={scheduleDraft.runAt} onChange={(event) => setScheduleDraft((current) => ({ ...current, runAt: event.target.value }))} />
                  </label>
                ) : (
                  <label>
                    <span>실행 시각</span>
                    <input type="time" value={scheduleDraft.timeOfDay} onChange={(event) => setScheduleDraft((current) => ({ ...current, timeOfDay: event.target.value }))} />
                  </label>
                )}
              </div>
              <div className="aui-pipeline-actions">
                <button className="primary" onClick={scheduleCollection} type="button">예약 생성</button>
              </div>
            </div>
          ) : null}
          <div className="aui-pipeline-rule-panel">
            <div>
              <strong>공통 보수 룰</strong>
              <span>대역폭, 요청량, 동시성, 최대 수집 시간을 보수적으로 제한합니다.</span>
            </div>
            <div className="aui-pipeline-rule-grid">
              {CONSERVATIVE_RULE_FIELDS.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                <input
                  value={ruleDraft[field.key] || ""}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setRuleDraft((current) => ({ ...current, [field.key]: nextValue }));
                    if (field.key === "SLACK_OLDEST_DAYS") setOldestDays(Number(nextValue) || 2);
                    if (field.key === "SLACK_HISTORY_LIMIT") setLimitPerChannel(Number(nextValue) || 80);
                  }}
                />
                  <small>{field.key}</small>
                </label>
              ))}
            </div>
            <div className="aui-pipeline-actions">
              <button onClick={saveConservativeRules} type="button">보수 설정 저장</button>
            </div>
          </div>
          <p className="aui-ops-muted">
            현재 정책: {completionMode === "objective" ? "목적 완료 시 종료" : `${ruleDraft.RCLONE_COPY_MAX_MINUTES || "30"}분 시간박스`} · 연결 유실 시 {connectionPolicy === "retry" ? `${retryAfterMinutes}분 후 재시도` : "즉시 종료"}
          </p>
          <div className="aui-pipeline-actions vertical">
            {sources.slack ? <button className="primary" disabled={!selectedChannels.length || !tested.slack} onClick={() => runSlackCollectWithAutomation(false)} type="button">Slack 실제 수집</button> : null}
            {sources.drive ? <button disabled={!activeTopCandidate?.remotePath || !tested.drive} onClick={() => activeTopCandidate && runTargetWithAutomation(activeTopCandidate, false)} type="button">최우선 표적 실제 수집</button> : null}
            {sources.filesystem ? <button onClick={openFilesystemBrowser} type="button">파일 큐로 넘기기</button> : null}
            <button onClick={() => runAction(() => continueAfterCollection(), "후속 반영을 실행했습니다.")} type="button">후속 반영</button>
            <button onClick={() => runAction(() => triggerAutomation("refresh-global"), "그래프맵 업데이트를 요청했습니다.")} type="button">그래프맵 업데이트</button>
            <button disabled={!runningJob?.runId} onClick={() => runAction(() => stopAutomation(runningJob?.runId || ""), "실행 중인 작업에 중지를 요청했습니다.")} type="button">현재 작업 중지</button>
          </div>
        </article>
      </section>

      <section className="aui-pipeline-rail">
        <article>
          <strong>배치 명령 상태</strong>
          <div className="aui-pipeline-batch-status">
            {batchStatusCards.map((item) => (
              <div className={item.run?.status || "idle"} key={item.key}>
                <b>{item.label}</b>
                <span>{item.run?.status || "대기"} · {item.run ? shortDate(item.run.updatedAt || item.run.createdAt) : "미실행"}</span>
                <small>{item.run?.progress?.summary || item.run?.progress?.lastLogLine || item.key}</small>
              </div>
            ))}
          </div>
        </article>
        <article>
          <strong>현재 실행</strong>
          <span>{runningJob?.status || "idle"}</span>
          <p>{runningJob?.progress?.summary || runningJob?.progress?.lastLogLine || "실행 중인 작업이 없습니다."}</p>
        </article>
        <article>
          <strong>예약</strong>
          <div className="aui-pipeline-schedule-list">
            {activeSchedules.map((schedule) => (
              <div key={schedule.id}>
                <b>{schedule.name || schedule.command}</b>
                <span>{schedule.command || "-"} · {schedule.mode || "-"} · 다음 {shortDate(schedule.nextRunAt || schedule.runAt)}</span>
              </div>
            ))}
            {!activeSchedules.length ? <p className="aui-ops-muted">활성 예약이 없습니다.</p> : null}
          </div>
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
