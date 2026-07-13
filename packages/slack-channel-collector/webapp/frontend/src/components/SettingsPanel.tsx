import { useState } from "react";
import type { SyncSettings } from "../types";

function strategyLabel(strategy: string): string {
  if (strategy === "inbound") return "인바운드 훅";
  if (strategy === "cross_team") return "미팅/활동 로그";
  if (strategy === "business_card") return "명함 OCR";
  return strategy;
}

export function SettingsPanel({
  settings,
  glmConfigured,
  onSave,
  onResolveUsers,
  onBatchInfer,
  batchInferBusy,
  onRecleanse,
}: {
  settings: SyncSettings;
  glmConfigured: boolean;
  onSave: (patch: Partial<SyncSettings>) => void;
  onResolveUsers?: () => void;
  onBatchInfer?: () => void;
  batchInferBusy?: boolean;
  onRecleanse?: () => void;
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
                {strategyLabel(ch.strategy)}
              </span>
            </span>
            <span className="hint">{ch.id}</span>
          </div>
        ))}
        <div className="hint" style={{ marginTop: 4 }}>
          인바운드 = 릴레잇/피트페이퍼 훅 → 신규 리드 · 크로스팀 = 미팅 일지/액션 → 활동·회사정보
          · 명함 OCR = 이미지 업로드 → GLM-V 추출 → 연락처/회사 반영
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
            checked={f.glm_parse_cross_team}
            onChange={(e) => upd("glm_parse_cross_team", e.target.checked)}
          />{" "}
          GLM 적극 사용 — 규칙 파싱이 회사를 못 찾으면 GLM으로 추출 (토큰 사용)
        </label>
        <label className="hint" style={{ display: "block", margin: "6px 0" }}>
          Slack 완료 표시{" "}
          <select
            value={f.slack_callback_mode || (f.slack_callback_enabled ? "thread" : "off")}
            onChange={(e) => {
              const mode = e.target.value as SyncSettings["slack_callback_mode"];
              setF({
                ...f,
                slack_callback_mode: mode,
                slack_callback_enabled: mode !== "off",
              });
            }}
            style={{ marginLeft: 8 }}
          >
            <option value="off">끄기 - Slack 알림 없음</option>
            <option value="reaction">이모티콘만 - reactions:write 필요</option>
            <option value="thread">스레드 메시지 - 알림 가능</option>
          </select>
        </label>
        {f.slack_callback_mode === "reaction" && (
          <label className="hint" style={{ display: "block", margin: "6px 0" }}>
            완료 이모티콘{" "}
            <input
              value={f.slack_callback_reaction || "database"}
              onChange={(e) => upd("slack_callback_reaction", e.target.value.replace(/:/g, ""))}
              placeholder="database"
              style={{ width: 180, marginLeft: 8 }}
            />
          </label>
        )}
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
            ? "GLM이 연결되어 자연어 검색·자동 추정·명함 OCR을 사용할 수 있습니다."
            : "GLM 미설정 — 검색은 키워드 폴백으로 동작합니다. GLM_API_URL / GLM_API_KEY를 설정하면 자연어 검색, 회사 자동 추정, 명함 OCR이 활성화됩니다."}
        </div>
        <button
          className="btn"
          style={{ marginTop: 6 }}
          disabled={!glmConfigured || batchInferBusy}
          onClick={() => onBatchInfer?.()}
        >
          ✨ 회사 정보 일괄 자동추정
        </button>
        <div className="hint" style={{ marginTop: 4 }}>
          업종·세부분야·회사 설명이 비어 있는 회사만 채우고, 기존 입력값은 덮어쓰지 않습니다.
        </div>
      </div>

      <div className="field">
        <div className="k">슬랙 유저 이름</div>
        <div className="v hint">멘션 <code>&lt;@U…&gt;</code>을 실제 이름으로 보이게 하려면 유저 목록을 갱신하세요.</div>
        <button className="btn" style={{ marginTop: 4 }} onClick={() => onResolveUsers?.()}>
          슬랙 유저 이름 갱신
        </button>
      </div>

      <div className="field">
        <div className="k">전체 재클렌징</div>
        <div className="v hint">
          저장된 Slack 원문을 개선된 파서·GLM으로 다시 처리해 슬랙 유래 활동을 재생성합니다
          (재수집 없음, 시드·수기 데이터 보존, 콜백 미발송).
        </div>
        <button
          className="btn"
          style={{ marginTop: 4 }}
          onClick={() => {
            if (confirm("저장된 원문으로 슬랙 활동을 재생성합니다. 계속할까요?")) onRecleanse?.();
          }}
        >
          ♻️ 원문 재파싱 재클렌징
        </button>
      </div>

      <button className="btn primary" onClick={() => onSave(f)}>
        설정 저장
      </button>
    </>
  );
}
