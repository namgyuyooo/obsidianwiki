import { useEffect, useMemo, useState } from "react";
import type { ChatContext } from "../../chat/constants";
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

export function OperationsControlPlane({ chatContext }: OperationsControlPlaneProps) {
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("Operations control plane을 불러오는 중입니다.");
  const [systemStatus, setSystemStatus] = useState<SystemStatusPayload>({ status: {} });
  const [settings, setSettings] = useState<SettingsPayload>({ settings: {}, locked: {} });
  const [draftSettings, setDraftSettings] = useState<Record<string, string>>({});
  const [coverage, setCoverage] = useState<CoveragePayload>({});
  const [llmPolicy, setLlmPolicy] = useState<LlmPolicyPayload>({});
  const [schedules, setSchedules] = useState<AutomationSchedule[]>([]);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(EMPTY_DRAFT);

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
      setMessage("Operations control plane 동기화 완료.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Operations load 실패");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const groupedSettings = useMemo(() => groupSettings(draftSettings), [draftSettings]);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setPhase("saving");
    try {
      await action();
      setPhase("ready");
      setMessage(success);
      await reload();
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Operations action 실패");
    }
  };

  return (
    <main className="aui-ops-surface">
      <section className="aui-ops-hero">
        <div>
          <span className="aui-kicker">mission / admin control plane</span>
          <h1>Operations</h1>
          <p>{chatContext.workspace.toUpperCase()} 운영 설정, 스케줄, 안전 상태, 커버리지, 모델 정책을 새 프론트에서 직접 관리합니다.</p>
        </div>
        <aside className={`aui-ops-live ${phase}`}>
          <strong>{phase}</strong>
          <span>{message}</span>
          <button onClick={reload} type="button">새로고침</button>
        </aside>
      </section>

      <section className="aui-ops-grid">
        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>System status</span>
            <strong>{coverage.progressPercent || 0}% coverage</strong>
          </div>
          <div className="aui-ops-keyval">
            {Object.entries(systemStatus.status || {}).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </div>
          <p className="aui-ops-muted">
            safety · source drive protected {String(systemStatus.safety?.sourceDriveProtected ?? true)}
          </p>
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
            {(coverage.rows || []).slice(0, 8).map((row, index) => (
              <article className="aui-ops-log-card" key={`${row.folderPath}-${index}`}>
                <strong>{row.folderPath || "-"}</strong>
                <span>{row.status || "-"} · {row.drive || "-"}</span>
                <small>{row.nextAction || "-"}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="aui-ops-card aui-ops-card-span-2">
          <div className="aui-ops-card-head">
            <span>Settings</span>
            <strong>{Object.keys(draftSettings).length} editable keys</strong>
          </div>
          <div className="aui-ops-settings-grid">
            {Object.entries(groupedSettings).map(([group, entries]) => (
              <section className="aui-ops-settings-group" key={group}>
                <h2>{group}</h2>
                {(entries as Array<[string, string]>).slice(0, group === "Other" ? 10 : 14).map(([key, value]) => (
                  <label className="aui-ops-field" key={key}>
                    <span>{key}</span>
                    <input
                      value={draftSettings[key] ?? value}
                      onChange={(event) => setDraftSettings((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder={settings.secrets?.[key] ? "configured secret remains hidden" : ""}
                    />
                  </label>
                ))}
              </section>
            ))}
          </div>
          <div className="aui-ops-actions">
            <button onClick={() => runAction(() => saveSettings(draftSettings), "설정 저장을 완료했습니다.")} type="button">설정 저장</button>
          </div>
          <p className="aui-ops-muted">locked DRIVE_DELETE_SOURCE = {settings.locked?.DRIVE_DELETE_SOURCE || "false"}</p>
        </article>

        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>Schedules</span>
            <strong>{schedules.length} active rules</strong>
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
          </div>
          <div className="aui-ops-inline-fields">
            <label>
              <span>name</span>
              <input value={scheduleDraft.name} onChange={(event) => setScheduleDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              <span>time</span>
              <input value={scheduleDraft.timeOfDay} onChange={(event) => setScheduleDraft((current) => ({ ...current, timeOfDay: event.target.value }))} />
            </label>
            <label>
              <span>interval</span>
              <input min={1} type="number" value={scheduleDraft.intervalMinutes} onChange={(event) => setScheduleDraft((current) => ({ ...current, intervalMinutes: Number(event.target.value) || 60 }))} />
            </label>
          </div>
          <label className="aui-ops-checkcard">
            <input checked={scheduleDraft.dryRun} onChange={(event) => setScheduleDraft((current) => ({ ...current, dryRun: event.target.checked }))} type="checkbox" />
            <div>
              <strong>dry-run 예약</strong>
              <span>실제 실행 전에 안전 모드로 예약</span>
            </div>
          </label>
          <div className="aui-ops-actions">
            <button
              onClick={() => runAction(
                () => createSchedule(scheduleDraft),
                "예약 스케줄을 생성했습니다.",
              )}
              type="button"
            >
              스케줄 추가
            </button>
          </div>
          <div className="aui-ops-list">
            {schedules.slice(0, 8).map((schedule) => (
              <article className="aui-ops-log-card" key={schedule.id}>
                <strong>{schedule.name || schedule.command}</strong>
                <span>{schedule.command} · {schedule.mode} · next {schedule.nextRunAt?.slice(0, 16).replace("T", " ") || "-"}</span>
                <small>{schedule.dryRun ? "dry-run" : "live run"}</small>
                <button onClick={() => runAction(() => deleteSchedule(schedule.id), `${schedule.name || schedule.id} 스케줄을 삭제했습니다.`)} type="button">삭제</button>
              </article>
            ))}
          </div>
        </article>

        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>LLM policy</span>
            <strong>{(llmPolicy.policies || []).length} rules</strong>
          </div>
          <div className="aui-ops-list">
            {(llmPolicy.policies || []).slice(0, 10).map((policy, index) => (
              <article className="aui-ops-log-card" key={`${policy.id || policy.label}-${index}`}>
                <strong>{policy.label || policy.id || "policy"}</strong>
                <span>{policy.value || "-"}</span>
                <small>{policy.note || policy.source || "-"}</small>
              </article>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
