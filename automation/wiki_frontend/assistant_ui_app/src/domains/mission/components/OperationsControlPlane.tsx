import { useEffect, useMemo, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import { triggerAutomation } from "../api/missionApi";
import {
  createSchedule,
  deleteSchedule,
  fetchCoverage,
  fetchLlmPolicy,
  fetchSchedules,
  fetchSettings,
  fetchSystemStatus,
  saveSettings,
  type AutomationSchedule,
  type CoveragePayload,
  type LlmPolicyPayload,
  type SettingsPayload,
  type SystemStatusPayload,
} from "../api/controlPlaneApi";

type OperationsControlPlaneProps = {
  chatContext: ChatContext;
};

type ScheduleDraft = {
  name: string;
  command: string;
  dryRun: boolean;
  mode: string;
  timeOfDay: string;
  intervalMinutes: number;
};

const EMPTY_DRAFT: ScheduleDraft = {
  name: "",
  command: "rclone-copy",
  dryRun: true,
  mode: "daily",
  timeOfDay: "03:00",
  intervalMinutes: 60,
};

function groupSettings(settings: Record<string, string>) {
  const groups: Record<string, Array<[string, string]>> = {
    Rclone: [],
    Slack: [],
    GLM: [],
    Paperclip: [],
    Other: [],
  };
  for (const entry of Object.entries(settings)) {
    const [key] = entry;
    if (key.startsWith("RCLONE_") || key.startsWith("DRIVE_")) groups.Rclone.push(entry);
    else if (key.startsWith("SLACK_")) groups.Slack.push(entry);
    else if (key.startsWith("GLM_") || key.startsWith("OPENCLAW_")) groups.GLM.push(entry);
    else if (key.startsWith("PAPERCLIP_")) groups.Paperclip.push(entry);
    else groups.Other.push(entry);
  }
  return groups;
}

function shortDate(value = "") {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

export function OperationsControlPlane({ chatContext }: OperationsControlPlaneProps) {
  const { notify } = useToastCenter();
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("운영 콘솔을 불러오는 중입니다.");
  const [systemStatus, setSystemStatus] = useState<SystemStatusPayload>({ status: {} });
  const [settings, setSettings] = useState<SettingsPayload>({ settings: {}, locked: {} });
  const [draftSettings, setDraftSettings] = useState<Record<string, string>>({});
  const [coverage, setCoverage] = useState<CoveragePayload>({});
  const [llmPolicy, setLlmPolicy] = useState<LlmPolicyPayload>({});
  const [schedules, setSchedules] = useState<AutomationSchedule[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(EMPTY_DRAFT);
  const [activeSettingsGroup, setActiveSettingsGroup] = useState("Rclone");

  const reload = async () => {
    setPhase("loading");
    try {
      const [nextStatus, nextSettings, nextCoverage, nextPolicy, nextSchedules] = await Promise.all([
        fetchSystemStatus(),
        fetchSettings(),
        fetchCoverage(),
        fetchLlmPolicy(),
        fetchSchedules(),
      ]);
      setSystemStatus(nextStatus);
      setSettings(nextSettings);
      setDraftSettings(nextSettings.settings || {});
      setCoverage(nextCoverage);
      setLlmPolicy(nextPolicy);
      setSchedules(nextSchedules.schedules || []);
      setPhase("ready");
      setMessage("운영 콘솔 동기화 완료.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "운영 콘솔 로드 실패");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const groupedSettings = useMemo(() => groupSettings(draftSettings), [draftSettings]);
  const currentSettingsEntries = groupedSettings[activeSettingsGroup] || [];

  const systemHealth = useMemo(() => {
    const values = Object.values(systemStatus.status || {});
    if (!values.length) return "unknown";
    return values.every((value) => String(value).toLowerCase().includes("ok")) ? "stable" : "check";
  }, [systemStatus.status]);

  const operationalAlerts = useMemo(() => {
    const alerts: string[] = [];
    if (!settings.settings?.SLACK_BOT_TOKEN && !settings.secrets?.SLACK_BOT_TOKEN) {
      alerts.push("Slack token이 비어 있어 채널 수집이 막혀 있을 수 있습니다.");
    }
    if (!settings.settings?.RCLONE_REMOTE && !settings.secrets?.RCLONE_REMOTE) {
      alerts.push("Rclone remote가 비어 있어 파일 수집 경로가 불명확합니다.");
    }
    if (systemStatus.safety?.sourceDriveProtected === false) {
      alerts.push("source drive 보호가 꺼져 있어 원본 삭제 위험이 있습니다.");
    }
    if (!schedules.length) {
      alerts.push("예약 스케줄이 없어 수집 파이프라인이 수동 운영 상태입니다.");
    }
    if (!llmPolicy.policies?.length) {
      alerts.push("LLM policy가 비어 있어 모델 라우팅 기준이 드러나지 않습니다.");
    }
    return alerts;
  }, [llmPolicy.policies, schedules.length, settings.secrets, settings.settings, systemStatus.safety?.sourceDriveProtected]);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setPhase("saving");
    notify("running", "운영 작업 시작", success, { durationMs: 2200 });
    try {
      await action();
      setPhase("ready");
      setMessage(success);
      await reload();
      notify("success", "운영 작업 완료", success);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "운영 작업 실패");
      notify("error", "운영 작업 실패", error instanceof Error ? error.message : "운영 작업 실패");
    }
  };

  return (
    <main className="aui-ops-surface">
      <section className="aui-ops-hero">
        <div>
          <span className="aui-kicker">Operations</span>
          <h1>운영 콘솔</h1>
          <p>{chatContext.workspace.toUpperCase()} 수집 시스템의 설정, 보호 상태, 스케줄, 모델 정책을 한 번에 점검합니다.</p>
        </div>
        <aside className={`aui-ops-live ${phase}`}>
          <strong>{phase}</strong>
          <span>{message}</span>
          <button onClick={reload} type="button">새로고침</button>
        </aside>
      </section>

      <section className="aui-ops-summary-grid">
        <article className="aui-ops-summary-card">
          <span>health</span>
          <strong>{systemHealth}</strong>
          <small>{Object.keys(systemStatus.status || {}).length} probes · protected {String(systemStatus.safety?.sourceDriveProtected ?? true)}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>coverage</span>
          <strong>{coverage.progressPercent || 0}%</strong>
          <small>{coverage.totalFolders || 0} tracked folders · processed {coverage.processedDocuments || 0}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>schedules</span>
          <strong>{schedules.length}</strong>
          <small>next {shortDate(schedules[0]?.nextRunAt)}</small>
        </article>
        <article className="aui-ops-summary-card">
          <span>alerts</span>
          <strong>{operationalAlerts.length}</strong>
          <small>{operationalAlerts[0] || "운영상 급한 경고 없음"}</small>
        </article>
      </section>

      <section className="aui-ops-command-bar">
        <button onClick={reload} type="button">전체 새로고침</button>
        <button onClick={() => runAction(() => saveSettings(draftSettings), "설정을 저장했습니다.")} type="button">설정 저장</button>
        <button
          onClick={() => runAction(
            () => createSchedule(scheduleDraft),
            "예약 스케줄을 생성했습니다.",
          )}
          type="button"
        >
          스케줄 추가
        </button>
        <button onClick={() => runAction(() => triggerAutomation("refresh-global"), "refresh-global 실행을 요청했습니다.")} type="button">그래프맵 업데이트</button>
      </section>

      <section className="aui-ops-workbench">
        <article className="aui-ops-card aui-ops-settings-card">
          <div className="aui-ops-card-head">
            <span>설정 편집</span>
            <strong>{activeSettingsGroup}</strong>
          </div>
          <div className="aui-ops-chipline">
            {Object.keys(groupedSettings).map((group) => (
              <button
                className={activeSettingsGroup === group ? "active" : ""}
                key={group}
                onClick={() => setActiveSettingsGroup(group)}
                type="button"
              >
                {group} {(groupedSettings[group] || []).length}
              </button>
            ))}
          </div>
          <p className="aui-ops-muted">지금 필요한 그룹만 열고 수정한 뒤 저장하는 방식으로 작업량을 줄였습니다.</p>
          <div className="aui-ops-settings-focus">
            {(currentSettingsEntries as Array<[string, string]>).slice(0, activeSettingsGroup === "Other" ? 18 : 24).map(([key, value]) => (
              <label className="aui-ops-field" key={key}>
                <span>{key}</span>
                <input
                  value={draftSettings[key] ?? value}
                  onChange={(event) => setDraftSettings((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder={settings.secrets?.[key] ? "configured secret remains hidden" : ""}
                />
              </label>
            ))}
            {!currentSettingsEntries.length ? <p className="aui-ops-muted">이 그룹에는 현재 표시할 설정이 없습니다.</p> : null}
          </div>
          <p className="aui-ops-muted">locked DRIVE_DELETE_SOURCE = {settings.locked?.DRIVE_DELETE_SOURCE || "false"}</p>
        </article>

        <div className="aui-ops-rail">
          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>지금 해야 할 일</span>
              <strong>{operationalAlerts.length ? "attention" : "stable"}</strong>
            </div>
            <div className="aui-ops-list">
              {(operationalAlerts.length ? operationalAlerts : ["즉시 조치가 필요한 경고는 없습니다. coverage와 policy를 유지하면 됩니다."]).map((item) => (
                <article className="aui-ops-log-card" key={item}>
                  <strong>Action</strong>
                  <span>{item}</span>
                </article>
              ))}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>System status</span>
              <strong>{systemHealth}</strong>
            </div>
            <div className="aui-ops-keyval">
              {Object.entries(systemStatus.status || {}).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>Coverage</span>
              <strong>{coverage.totalFolders || 0} tracked folders</strong>
            </div>
            <div className="aui-ops-chipline">
              {Object.entries(coverage.statuses || {}).map(([key, value]) => (
                <span key={key}>{key} {value}</span>
              ))}
            </div>
            <div className="aui-ops-list">
              {(coverage.rows || []).slice(0, 6).map((row, index) => (
                <article className="aui-ops-log-card" key={`${row.folderPath}-${index}`}>
                  <strong>{row.folderPath || "-"}</strong>
                  <span>{row.status || "-"} · {row.drive || "-"}</span>
                  <small>{row.nextAction || "-"}</small>
                </article>
              ))}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>Schedules</span>
              <strong>{schedules.length} rules</strong>
            </div>
            <div className="aui-ops-inline-fields">
              <label>
                <span>command</span>
                <select value={scheduleDraft.command} onChange={(event) => setScheduleDraft((current) => ({ ...current, command: event.target.value }))}>
                  <option value="rclone-copy">rclone-copy</option>
                  <option value="build-manifest">build-manifest</option>
                  <option value="run">run</option>
                  <option value="full-cycle">full-cycle</option>
                  <option value="slack-collect">slack-collect</option>
                </select>
              </label>
              <label>
                <span>mode</span>
                <select value={scheduleDraft.mode} onChange={(event) => setScheduleDraft((current) => ({ ...current, mode: event.target.value }))}>
                  <option value="daily">daily</option>
                  <option value="interval">interval</option>
                  <option value="once">once</option>
                </select>
              </label>
              <label>
                <span>time</span>
                <input value={scheduleDraft.timeOfDay} onChange={(event) => setScheduleDraft((current) => ({ ...current, timeOfDay: event.target.value }))} />
              </label>
            </div>
            <div className="aui-ops-inline-fields">
              <label>
                <span>name</span>
                <input value={scheduleDraft.name} onChange={(event) => setScheduleDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>interval</span>
                <input min={1} type="number" value={scheduleDraft.intervalMinutes} onChange={(event) => setScheduleDraft((current) => ({ ...current, intervalMinutes: Number(event.target.value) || 60 }))} />
              </label>
              <label className="aui-ops-checkcard">
                <input checked={scheduleDraft.dryRun} onChange={(event) => setScheduleDraft((current) => ({ ...current, dryRun: event.target.checked }))} type="checkbox" />
                <div>
                  <strong>dry-run</strong>
                  <span>safe mode</span>
                </div>
              </label>
            </div>
            <div className="aui-ops-list">
              {schedules.slice(0, 6).map((schedule) => (
                <article className="aui-ops-log-card" key={schedule.id}>
                  <strong>{schedule.name || schedule.command}</strong>
                  <span>{schedule.command} · {schedule.mode} · next {shortDate(schedule.nextRunAt)}</span>
                  <small>{schedule.dryRun ? "dry-run" : "live run"}</small>
                  <button onClick={() => runAction(() => deleteSchedule(schedule.id), `${schedule.name || schedule.id} 스케줄을 삭제했습니다.`)} type="button">삭제</button>
                </article>
              ))}
              {!schedules.length ? <p className="aui-ops-muted">아직 자동화 규칙이 없습니다. 최소 하나의 daily 스케줄을 권장합니다.</p> : null}
            </div>
          </article>

          <article className="aui-ops-card">
            <div className="aui-ops-card-head">
              <span>LLM policy</span>
              <strong>{(llmPolicy.policies || []).length} rules</strong>
            </div>
            <div className="aui-ops-list">
              {(llmPolicy.policies || []).slice(0, 8).map((policy, index) => (
                <article className="aui-ops-log-card" key={`${policy.id || policy.label}-${index}`}>
                  <strong>{policy.label || policy.id || "policy"}</strong>
                  <span>{policy.value || "-"}</span>
                  <small>{policy.note || policy.source || "-"}</small>
                </article>
              ))}
              {!llmPolicy.policies?.length ? <p className="aui-ops-muted">표시할 policy가 없습니다.</p> : null}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
