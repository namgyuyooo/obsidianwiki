import { useEffect, useState } from "react";
import type { SyncSettings } from "../types";
import { api, type GlmAdminSettings, type SlackAdminSettings, type SchedulerStatus, type SchedulerRun } from "../lib/api";

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
  batchInferElapsed,
  onRecleanse,
}: {
  settings: SyncSettings;
  glmConfigured: boolean;
  onSave: (patch: Partial<SyncSettings>) => void;
  onResolveUsers?: () => void;
  onBatchInfer?: () => void;
  batchInferBusy?: boolean;
  batchInferElapsed?: number;
  onRecleanse?: () => void;
}) {
  const [f, setF] = useState<SyncSettings>(settings);
  const [ai, setAi] = useState<GlmAdminSettings | null>(null);
  const [aiKey, setAiKey] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiOperation, setAiOperation] = useState<"save" | "test" | null>(null);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [slack, setSlack] = useState<SlackAdminSettings | null>(null);
  const [slackToken, setSlackToken] = useState("");
  const [slackMessage, setSlackMessage] = useState("");
  const [slackBusy, setSlackBusy] = useState(false);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [schedulerBusy, setSchedulerBusy] = useState(false);
  const [openRun, setOpenRun] = useState<number | null>(null);
  const upd = <K extends keyof SyncSettings>(k: K, v: SyncSettings[K]) =>
    setF({ ...f, [k]: v });

  useEffect(() => {
    api.glmAdminSettings().then(setAi).catch((e) => setAiMessage(`설정을 불러오지 못했습니다: ${e}`));
    api.slackAdminSettings().then(setSlack).catch((e) => setSlackMessage(`설정을 불러오지 못했습니다: ${e}`));
    const loadScheduler = () => api.schedulerStatus().then(setScheduler).catch(() => undefined);
    loadScheduler();
    const timer = window.setInterval(loadScheduler, 10000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!aiBusy) return;
    const startedAt = Date.now();
    setAiElapsed(0);
    const timer = window.setInterval(
      () => setAiElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [aiBusy]);

  const checkScheduler = async () => {
    setSchedulerBusy(true);
    try {
      await api.runScheduledCheck();
      setScheduler(await api.schedulerStatus());
    } finally { setSchedulerBusy(false); }
  };

  const runResult = (run: SchedulerRun) => {
    try { return JSON.parse(run.result_summary || "{}") as Record<string, unknown>; }
    catch { return { message: run.result_summary }; }
  };

  const dateTime = (epoch: number) => epoch ? new Date(epoch * 1000).toLocaleString("ko-KR") : "-";

  const providerDefaults = (provider: GlmAdminSettings["provider"]) => {
    if (provider === "ollama") return { api_url: "http://127.0.0.1:11434/v1", model: "qwen3:8b" };
    if (provider === "internal") return { api_url: "http://ai.internal/v1", model: "" };
    return { api_url: "https://api.z.ai/api/paas/v4", model: "glm-4.5" };
  };

  const saveAi = async () => {
    if (!ai || aiBusy) return;
    setAiOperation("save"); setAiBusy(true); setAiMessage("1/2 · AI 연결 설정을 안전하게 저장 중…");
    try {
      const saved = await api.saveGlmAdminSettings({ ...ai, api_key: aiKey });
      setAi(saved); setAiKey(""); setAiMessage("연결 설정을 저장했습니다.");
    } catch (e) { setAiMessage(`저장 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setAiBusy(false); setAiOperation(null); }
  };

  const testAi = async () => {
    if (aiBusy) return;
    setAiOperation("test"); setAiBusy(true); setAiMessage("1/3 · 클릭 확인 — AI 서버 연결 요청 전송 중…");
    try { const result = await api.testGlmAdminSettings(); setAiMessage(`✓ ${result.message}`); }
    catch (e) { setAiMessage(`연결 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setAiBusy(false); setAiOperation(null); }
  };

  const saveSlack = async () => {
    setSlackBusy(true); setSlackMessage("저장 중…");
    try { const saved = await api.saveSlackAdminSettings({ bot_token: slackToken }); setSlack(saved); setSlackToken(""); setSlackMessage("Slack Bot Token을 저장했습니다."); }
    catch (e) { setSlackMessage(`저장 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setSlackBusy(false); }
  };

  const testSlack = async () => {
    setSlackBusy(true); setSlackMessage("Slack 연결 확인 중…");
    try { const result = await api.testSlackAdminSettings(); setSlackMessage(`✓ ${result.team} · ${result.user} 계정으로 연결되었습니다.`); }
    catch (e) { setSlackMessage(`연결 실패: ${e instanceof Error ? e.message : e}`); }
    finally { setSlackBusy(false); }
  };

  return (
    <>
      <h2>동기화 규칙 · 주기 설정</h2>
      <div className="sub">Slack 리드 동기화가 어떤 채널을 어떤 주기로 어떻게 처리할지 정합니다.</div>

      <section className="scheduler-card">
        <div className="scheduler-head">
          <div><span className={`scheduler-dot ${scheduler?.healthy ? "healthy" : ""}`} /><b>예약 수집 상태</b><small>{scheduler?.enabled ? `${scheduler.interval_minutes}분 간격으로 자동 수집` : "자동 수집 꺼짐"}</small></div>
          <button className="btn" disabled={schedulerBusy || scheduler?.sync_running} onClick={checkScheduler}>{schedulerBusy || scheduler?.sync_running ? "수집 진행 중…" : "지금 실행하여 점검"}</button>
        </div>
        <div className="scheduler-metrics">
          <div><span>스케줄러</span><b>{scheduler?.healthy ? "정상" : "확인 필요"}</b></div>
          <div><span>다음 실행</span><b>{scheduler?.enabled ? dateTime(scheduler.next_run) : "예약 없음"}</b></div>
          <div><span>최근 heartbeat</span><b>{dateTime(scheduler?.heartbeat || 0)}</b></div>
          <div><span>현재 작업</span><b>{scheduler?.sync_running ? "수집 중" : "대기"}</b></div>
          <div><span>명함 처리 큐</span><b>{scheduler ? `대기 ${scheduler.card_queue.pending} · 재시도 ${scheduler.card_queue.retrying}` : "-"}</b></div>
          <div><span>주기당 명함</span><b>{scheduler ? `최대 ${scheduler.business_card_batch_size}장 순차 처리` : "-"}</b></div>
        </div>
        {scheduler?.last_error && <div className="scheduler-error">최근 스케줄러 오류: {scheduler.last_error}</div>}
        <div className="schedule-history-head"><b>수집 실행 히스토리</b><button className="btn ghost" onClick={() => api.schedulerStatus().then(setScheduler)}>새로고침</button></div>
        <div className="schedule-history">
          {!scheduler?.runs.length ? <div className="empty">수집 실행 기록이 없습니다.</div> : scheduler.runs.map((run) => {
            const result = runResult(run);
            const isOpen = openRun === run.id;
            return <div className={`schedule-run ${run.status}`} key={run.id}>
              <button className="schedule-run-row" onClick={() => setOpenRun(isOpen ? null : run.id)}>
                <span className="run-status">{run.status === "success" ? "✓" : run.status === "started" ? "↻" : run.status === "failed" ? "!" : "–"}</span>
                <span><b>{run.job_type === "slack_auto_sync" ? "예약 자동 수집" : run.job_type === "slack_scheduled_test" ? "예약 수집 점검" : run.job_type === "slack_backfill" ? "전체 수집" : "수동 수집"}</b><small>{run.started_at} · {run.actor_email || "system"}</small></span>
                <span className="run-summary">{String(result.message || run.error_message || "실행 중")}</span>
                <span className="run-duration">{run.duration_seconds ?? 0}초</span><span>{isOpen ? "⌃" : "⌄"}</span>
              </button>
              {isOpen && <div className="schedule-run-detail">
                <div><span>실행 범위</span><b>{run.target_scope || "-"}</b></div><div><span>실행 조건</span><b>{run.input_summary || "-"}</b></div><div><span>종료 시각</span><b>{run.finished_at || "진행 중"}</b></div><div><span>상태</span><b>{run.status}</b></div>
                {run.error_message && <p className="run-error">{run.error_message}</p>}
                {Array.isArray(result.channels) && <div className="channel-results">{(result.channels as Record<string, unknown>[]).map((channel, index) => <span key={index}><b>{String(channel.channel || "채널")}</b> 수집 {String(channel.collected ?? 0)} · 파싱 {String(channel.parsed ?? 0)} · 신규 {String(channel.new_leads ?? 0)} · 활동 {String(channel.new_activities ?? 0)}{channel.strategy === "business_card" ? ` · 명함처리 ${String(channel.card_processed ?? 0)} · 남은큐 ${String(channel.card_pending ?? 0)} · 재시도 ${String(channel.card_retrying ?? 0)}` : ""}</span>)}</div>}
              </div>}
            </div>;
          })}
        </div>
      </section>

      <div className="field" style={{ marginTop: 14 }}>
        <div className="k">수집 채널 · 전략</div>
        {f.channels.map((ch, ix) => (
          <div className="member" key={ch.id}>
            <span>
              <input
                type="checkbox"
                checked={ch.enabled}
                disabled={ch.strategy === "business_card"}
                onChange={(e) => {
                  const channels = f.channels.map((c, i) =>
                    i === ix ? { ...c, enabled: c.strategy === "business_card" ? true : e.target.checked } : c
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
        <div>
          <label>주기당 명함 OCR 장수 <span className="hint">(순차 처리)</span></label>
          <input
            type="number"
            min={1}
            max={100}
            value={f.business_card_batch_size || 10}
            onChange={(e) => upd("business_card_batch_size", Number(e.target.value))}
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

      <div className="field ai-settings">
        <div className="k">AI 모델 연결</div>
        {ai ? (
          <div className="ai-settings-card">
            <div className="provider-tabs">
              {(["glm", "ollama", "internal"] as const).map((provider) => (
                <button key={provider} type="button" className={ai.provider === provider ? "on" : ""} onClick={() => setAi({ ...ai, provider, ...providerDefaults(provider) })}>
                  {provider === "glm" ? "GLM 클라우드" : provider === "ollama" ? "로컬 Ollama" : "사내 서버"}
                </button>
              ))}
            </div>
            <div className="ai-form">
              <label><span>API 기본 URL</span><input type="url" value={ai.api_url} onChange={(e) => setAi({ ...ai, api_url: e.target.value })} placeholder="http://127.0.0.1:11434/v1" /></label>
              <label><span>모델 이름</span><input type="text" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} placeholder="qwen3:8b" /></label>
              <label className="full"><span>API 키 {ai.provider === "ollama" && <em>(선택 사항)</em>}</span><input type="password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder={ai.api_key_configured ? `${ai.api_key_hint} · 변경할 때만 입력` : ai.provider === "glm" ? "필수" : "인증을 사용하는 경우에만 입력"} autoComplete="new-password" /></label>
            </div>
            <div className="ai-settings-actions"><button className="btn primary" onClick={saveAi} disabled={aiBusy}>{aiBusy && aiOperation === "save" ? <><span className="inline-spinner" /> 저장 중 · {aiElapsed}초</> : "설정 저장"}</button><button className="btn" onClick={testAi} disabled={aiBusy}>{aiBusy && aiOperation === "test" ? <><span className="inline-spinner dark" /> 연결 확인 중 · {aiElapsed}초</> : "연결 테스트"}</button><span className={`connection-state ${ai.api_key_configured || ai.provider !== "glm" ? "ready" : ""}`}>{ai.api_key_configured ? `키 설정됨 ${ai.api_key_hint}` : ai.provider === "glm" ? "API 키 미설정" : "API 키 없이 연결"}</span></div>
            {aiMessage && <div className="ai-message" role="status">{aiMessage}</div>}
            <div className="hint">Ollama는 OpenAI 호환 <code>/v1</code> 주소를 사용합니다. Docker에서 실행 중이면 <code>host.docker.internal:11434/v1</code>을 사용하세요.</div>
          </div>
        ) : <div className="hint">AI 연결 설정을 불러오는 중…</div>}
        <div className="v hint">
          {(ai?.api_url || glmConfigured)
            ? "GLM이 연결되어 자연어 검색·자동 추정·명함 OCR을 사용할 수 있습니다."
            : "GLM 미설정 — 검색은 키워드 폴백으로 동작합니다. GLM_API_URL / GLM_API_KEY를 설정하면 자연어 검색, 회사 자동 추정, 명함 OCR이 활성화됩니다."}
        </div>
        <button
          className="btn"
          style={{ marginTop: 6 }}
          disabled={!(ai?.api_url || glmConfigured) || batchInferBusy}
          onClick={() => onBatchInfer?.()}
        >
          {batchInferBusy ? <><span className="inline-spinner dark" /> 일괄 추론 중 · {batchInferElapsed || 0}초</> : "✨ 회사 정보 일괄 자동추정"}
        </button>
        <div className="hint" style={{ marginTop: 4 }}>
          업종·세부분야·회사 설명이 비어 있는 회사만 채우고, 기존 입력값은 덮어쓰지 않습니다.
        </div>
      </div>

      <div className="field">
        <div className="k">Slack 연결</div>
        <div className="secret-settings-card">
          <label><span>Bot Token</span><input type="password" value={slackToken} onChange={(e) => setSlackToken(e.target.value)} placeholder={slack?.bot_token_configured ? `${slack.bot_token_hint} · 변경할 때만 입력` : "xoxb-…"} autoComplete="new-password" /></label>
          <div className="ai-settings-actions"><button className="btn primary" onClick={saveSlack} disabled={slackBusy || !slackToken.trim()}>토큰 저장</button><button className="btn" onClick={testSlack} disabled={slackBusy || !slack?.bot_token_configured}>연결 테스트</button><span className={`connection-state ${slack?.bot_token_configured ? "ready" : ""}`}>{slack?.bot_token_configured ? `토큰 설정됨 ${slack.bot_token_hint}` : "토큰 미설정"}</span></div>
          {slackMessage && <div className="ai-message" role="status">{slackMessage}</div>}
          <div className="hint">필요 권한: 채널·메시지 조회, 사용자 조회, 파일 조회. 완료 표시 사용 시 메시지 또는 반응 추가 권한도 필요합니다.</div>
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
