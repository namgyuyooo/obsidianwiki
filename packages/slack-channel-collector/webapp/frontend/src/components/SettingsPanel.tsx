import { useState } from "react";
import type { SyncSettings } from "../types";

export function SettingsPanel({
  settings,
  glmConfigured,
  onSave,
}: {
  settings: SyncSettings;
  glmConfigured: boolean;
  onSave: (patch: Partial<SyncSettings>) => void;
}) {
  const [f, setF] = useState<SyncSettings>(settings);
  const upd = <K extends keyof SyncSettings>(k: K, v: SyncSettings[K]) =>
    setF({ ...f, [k]: v });

  return (
    <>
      <h2>동기화 규칙 · 주기 설정</h2>
      <div className="sub">Slack 리드 동기화가 어떤 채널을 어떤 주기로 어떻게 처리할지 정합니다.</div>

      <div className="field" style={{ marginTop: 14 }}>
        <div className="k">수집 채널 · 전략</div>
        {f.channels.map((ch, ix) => (
          <div className="member" key={ch.id}>
            <span>
              <input
                type="checkbox"
                checked={ch.enabled}
                onChange={(e) => {
                  const channels = f.channels.map((c, i) =>
                    i === ix ? { ...c, enabled: e.target.checked } : c
                  );
                  setF({ ...f, channels });
                }}
              />{" "}
              <b>#{ch.name}</b>{" "}
              <span className="badge b-ind">
                {ch.strategy === "inbound" ? "인바운드 훅" : "미팅/활동 로그"}
              </span>
            </span>
            <span className="hint">{ch.id}</span>
          </div>
        ))}
        <div className="hint" style={{ marginTop: 4 }}>
          인바운드 = 릴레잇/피트페이퍼 훅 → 신규 리드 · 크로스팀 = 미팅 일지/액션 → 활동·회사정보
        </div>
      </div>

      <div className="editgrid">
        <div>
          <label>수집 범위 (시간)</label>
          <input
            type="number"
            min={1}
            value={f.lookback_hours}
            onChange={(e) => upd("lookback_hours", Number(e.target.value))}
          />
        </div>
        <div>
          <label>최근 N개만 수집 <span className="hint">(0 = 증분)</span></label>
          <input
            type="number"
            min={0}
            value={f.sync_limit}
            onChange={(e) => upd("sync_limit", Number(e.target.value))}
          />
        </div>
        <div>
          <label>자동 동기화 주기 (분)</label>
          <input
            type="number"
            min={1}
            value={f.auto_sync_interval_minutes}
            onChange={(e) => upd("auto_sync_interval_minutes", Number(e.target.value))}
          />
        </div>
      </div>

      <div className="field">
        <div className="k">처리 규칙</div>
        <label className="hint" style={{ display: "block", margin: "6px 0" }}>
          <input
            type="checkbox"
            checked={f.include_relate}
            onChange={(e) => upd("include_relate", e.target.checked)}
          />{" "}
          릴레잇(홈페이지) 리드 포함
        </label>
        <label className="hint" style={{ display: "block", margin: "6px 0" }}>
          <input
            type="checkbox"
            checked={f.include_featpaper}
            onChange={(e) => upd("include_featpaper", e.target.checked)}
          />{" "}
          피트페이퍼 리드 포함
        </label>
        <label className="hint" style={{ display: "block", margin: "6px 0" }}>
          <input
            type="checkbox"
            checked={f.require_review_for_new_company}
            onChange={(e) => upd("require_review_for_new_company", e.target.checked)}
          />{" "}
          새 회사는 자동 등록하지 않고 정합성 확인 큐로 보내기
        </label>
        <label className="hint" style={{ display: "block", margin: "6px 0" }}>
          <input
            type="checkbox"
            checked={f.auto_sync_enabled}
            onChange={(e) => upd("auto_sync_enabled", e.target.checked)}
          />{" "}
          자동 동기화 사용 (서버에서 주기적으로 실행 — 대시보드를 닫아도 동작)
        </label>
      </div>

      <div className="field">
        <div className="k">GLM 고도화</div>
        <div className="v hint">
          {glmConfigured
            ? "GLM이 연결되어 자연어 검색·자동 추정을 사용할 수 있습니다."
            : "GLM 미설정 — 검색은 키워드 폴백으로 동작합니다. GLM_API_URL / GLM_API_KEY를 설정하면 자연어 검색과 회사 자동 추정이 활성화됩니다."}
        </div>
      </div>

      <button className="btn primary" onClick={() => onSave(f)}>
        설정 저장
      </button>
    </>
  );
}
