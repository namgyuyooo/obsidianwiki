import { useEffect, useState } from "react";
import { api, type SlackRawMessage, type ApplyRawPayload, type OcrCard } from "../lib/api";

const ACT_TYPES = ["방문 미팅", "콜", "자료 요청", "견적 요청", "데모", "후속 확인", "문의", "메모", "명함 수집"];
const isImageFile = (f: { mimetype?: string; filetype?: string; name?: string }) => {
  const m = (f.mimetype || "").toLowerCase();
  const t = (f.filetype || "").toLowerCase();
  const n = (f.name || "").toLowerCase();
  return m.startsWith("image/") || ["jpg", "jpeg", "png", "webp"].includes(t) || /\.(jpe?g|png|webp)$/.test(n);
};
const fmtBytes = (n: number) => {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// 수집 원문 뷰어: 반영됨/미반영 탭. 미반영은 수정 후 DB 반영 가능. GLM 구조화는 부가 기능.
export function RawMessagesPanel({
  glmConfigured,
  onToast,
}: {
  glmConfigured: boolean;
  onToast?: (msg: string, type: "loading" | "success" | "error") => void;
}) {
  const [items, setItems] = useState<SlackRawMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"cards" | "unapplied" | "applied" | "archived">("cards");
  const [editTs, setEditTs] = useState<string | null>(null);
  const [form, setForm] = useState<ApplyRawPayload | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [visionBusy, setVisionBusy] = useState(false);
  const [selectedCard, setSelectedCard] = useState<SlackRawMessage | null>(null);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [cardImageUrl, setCardImageUrl] = useState("");
  const [ocrResult, setOcrResult] = useState<OcrCard | null>(null);
  const [visionLogs, setVisionLogs] = useState<string[]>([]);
  const [visionElapsed, setVisionElapsed] = useState(0);
  const [prefillBusyTs, setPrefillBusyTs] = useState<string | null>(null);
  const [prefillElapsed, setPrefillElapsed] = useState(0);

  const load = async (query = "") => {
    setLoading(true);
    try {
      const r = await api.slackMessages(query, 500);
      setItems(r.items);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  useEffect(() => () => { if (cardImageUrl) URL.revokeObjectURL(cardImageUrl); }, [cardImageUrl]);
  useEffect(() => {
    if (!visionBusy) return;
    const startedAt = Date.now();
    setVisionElapsed(0);
    const timer = window.setInterval(
      () => setVisionElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [visionBusy]);
  useEffect(() => {
    if (!prefillBusyTs) return;
    const startedAt = Date.now();
    setPrefillElapsed(0);
    const timer = window.setInterval(
      () => setPrefillElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000
    );
    return () => window.clearInterval(timer);
  }, [prefillBusyTs]);

  const cardItems = items.filter((m) =>
    m.is_business_card_channel && !m.archived && m.files.some(isImageFile)
  );

  const selectCard = (message: SlackRawMessage, requestedFileId = "") => {
    const imageFiles = message.files.filter(isImageFile);
    const file = imageFiles.find((f) => f.id === requestedFileId)
      || imageFiles.find((f) => !f.card_archived)
      || imageFiles[0];
    if (!file) return;
    setSelectedCard(message);
    setSelectedFileId(file.id);
    setEditTs(message.ts);
    // 이전에 파싱해 저장한 OCR 결과가 있으면 즉시 프리필 (재파싱 불필요).
    const saved = file.card_ocr && file.card_ocr.ok ? file.card_ocr : null;
    const fx = saved?.fields || {};
    setOcrResult(saved);
    setVisionLogs(saved ? ["✓ 저장된 파싱 결과를 불러왔습니다 — 확인 후 반영하세요"] : []);
    setForm({
      channel_id: message.channel_id, ts: message.ts, file_id: file.id,
      company: fx.company || "", email: fx.email || "", name: fx.name || "",
      phone: fx.phone || "", department: fx.department || "", title: fx.title || "",
      solution: "", activity_type: "명함 수집",
      note: (saved?.evidence ? "명함 OCR: " + saved.evidence + "\n" : "") + (message.text || ""),
      next_action: "", occurred_at: "",
    });
    setCardImageUrl("");
    void api.cardImage(message.channel_id, message.ts, file.id)
      .then((blob) => setCardImageUrl(URL.createObjectURL(blob)))
      .catch((e) => {
        setCardImageUrl("");
        onToast?.("⚠ 명함 이미지를 불러오지 못했습니다: " + (e instanceof Error ? e.message : e), "error");
      });
  };

  const archiveCard = async (archived: boolean) => {
    if (!selectedCard || !selectedFileId) return;
    try {
      await api.archiveMessage(selectedCard.channel_id, selectedCard.ts, archived, selectedFileId);
      const updated = { ...selectedCard, files: selectedCard.files.map((f) => f.id === selectedFileId ? { ...f, card_archived: archived } : f) };
      const next = updated.files.find((f) => isImageFile(f) && !f.card_archived && f.id !== selectedFileId);
      onToast?.(archived ? "명함 이미지가 아카이브되었습니다" : "명함 아카이브가 해제되었습니다", "success");
      if (next) await selectCard(updated, next.id);
      else await selectCard(updated, selectedFileId);
      await load(q);
    } catch (e) {
      onToast?.("⚠ 명함 아카이브 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const shown = items.filter((m) =>
    tab === "applied" ? m.applied && !m.archived
    : tab === "archived" ? m.archived
    : !m.applied && !m.archived
  );

  const archive = async (m: SlackRawMessage, archived: boolean) => {
    try {
      await api.archiveMessage(m.channel_id, m.ts, archived);
      onToast?.(archived ? "아카이브됨" : "아카이브 해제됨", "success");
      await load(q);
    } catch (e) {
      onToast?.("⚠ 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const openApply = async (m: SlackRawMessage) => {
    if (prefillBusyTs) return;
    setEditTs(m.ts);
    // 기본값: 원문을 note에 채우고, GLM 있으면 자동 구조화로 프리필
    const base: ApplyRawPayload = {
      channel_id: m.channel_id, ts: m.ts, company: "", email: "", name: "",
      solution: "", activity_type: "방문 미팅",
      note: m.text + (m.comments.length ? "\n---(스레드)---\n" + m.comments.map((c) => c.text).join("\n") : ""),
      next_action: "", occurred_at: "",
    };
    setForm(base);
    if (glmConfigured) {
      setPrefillBusyTs(m.ts);
      onToast?.("✨ GLM 구조화로 프리필 중…", "loading");
      try {
        const r = await api.glmExtract(base.note || m.text);
        const res = r.result as Record<string, unknown>;
        const comp = (res.companies as { name?: string }[] | undefined)?.[0]?.name || "";
        const con = (res.contacts as Record<string, string>[] | undefined)?.[0] || {};
        const act = (res.activity as Record<string, string>) || {};
        setForm((f) => f && {
          ...f, company: comp, email: con.email || "", name: con.name || "",
          phone: con.phone || "", department: con.department || "", title: con.title || "",
          solution: act.solution_name || "", activity_type: act.activity_type || f.activity_type,
          next_action: act.next_action || "", occurred_at: act.occurred_at || "",
        });
        onToast?.("✅ GLM 프리필 완료 — 확인 후 반영하세요", "success");
      } catch {
        onToast?.("GLM 프리필 실패 — 직접 입력하세요", "error");
      } finally {
        setPrefillBusyTs(null);
      }
    }
  };

  // 명함 이미지 → vision OCR 추론 → 기존 반영 폼에 프리필 (사용자 확인 후 '반영하기')
  const ocrCard = async (m: SlackRawMessage) => {
    if (visionBusy || applyBusy) return;
    setVisionBusy(true);
    setVisionLogs(["✓ 클릭 확인 — 요청을 시작합니다", "Slack 이미지와 OCR 작업 준비 중…"]);
    let fileId = selectedCard?.ts === m.ts ? selectedFileId : "";
    if (!fileId) {
      const first = m.files.find((f) => isImageFile(f) && !f.card_archived);
      fileId = first?.id || "";
      selectCard(m, fileId);
    }
    if (!fileId) {
      setVisionLogs(["✕ 처리할 명함 이미지가 없습니다"]);
      setVisionBusy(false);
      return;
    }
    setEditTs(m.ts);
    setForm({
      channel_id: m.channel_id, ts: m.ts, file_id: fileId, company: "", email: "", name: "",
      solution: "", activity_type: "명함 수집",
      note: m.text || "", next_action: "", occurred_at: "",
    });
    setVisionLogs(["✓ 클릭 확인 — 요청 시작", "↻ 이미지 미리보기와 OCR 병렬 처리", "↻ GLM Vision 연결 중…"]);
    onToast?.("🪪 명함 추론 중… (Vision OCR)", "loading");
    try {
      const r = await api.ocrCard(m.channel_id, m.ts, fileId);
      setVisionLogs([...(r.logs || []), r.ok ? "✓ 구조화 필드 생성 완료" : "✕ 파싱 실패"]);
      const card = (r.cards || []).find((c) => c.file_id === fileId && c.ok && c.fields);
      if (!r.ok || !card) {
        const why = (r.cards || []).find((c) => c.message)?.message || r.message || "결과 없음";
        onToast?.("⚠ 명함 추론 실패: " + why, "error");
        return;
      }
      const fx = card.fields || {};
      setOcrResult(card);
      setForm((f) => f && {
        ...f,
        company: fx.company || "", email: fx.email || "", name: fx.name || "",
        phone: fx.phone || "", department: fx.department || "", title: fx.title || "",
        note: (card.evidence ? "명함 OCR: " + card.evidence + "\n" : "") + (m.text || ""),
      });
      onToast?.(
        `✅ 명함 추론 완료[${card.provider || "?"}] · 신뢰도 ${(card.confidence ?? 0).toFixed(2)}${card.rotation ? ` · 자동 회전 ${card.rotation}°` : ""} — 확인 후 반영하세요`,
        "success"
      );
    } catch (e) {
      setVisionLogs((v) => [...v, "✕ " + (e instanceof Error ? e.message : String(e))]);
      onToast?.("⚠ 명함 추론 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setVisionBusy(false);
    }
  };

  const submit = async () => {
    if (!form) return;
    if (!form.company?.trim() && !(form.email && form.email.includes("@"))) {
      onToast?.("⚠ 회사명 또는 이메일 중 하나는 필요합니다", "error");
      return;
    }
    if (applyBusy || visionBusy) return;
    setApplyBusy(true);
    onToast?.("DB 반영 중…", "loading");
    try {
      const applied = await api.applyRawMessage(form);
      const progress = applied.total_cards ? ` (${applied.applied_cards}/${applied.total_cards})` : "";
      onToast?.(`✅ DB 반영 완료${progress} — ${form.company || form.email}`, "success");
      if (selectedCard && selectedFileId) {
        const updated = { ...selectedCard, applied: !!applied.message_applied, files: selectedCard.files.map((f) => f.id === selectedFileId ? { ...f, card_status: "applied" as const } : f) };
        const next = updated.files.find((f) => isImageFile(f) && !f.card_archived && f.card_status !== "applied");
        if (next) await selectCard(updated, next.id);
        else { setEditTs(null); setForm(null); setSelectedCard(null); setSelectedFileId(""); setOcrResult(null); }
      } else {
        setEditTs(null); setForm(null);
      }
      await load(q);
    } catch (e) {
      onToast?.("⚠ 반영 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setApplyBusy(false);
    }
  };

  const upd = (k: keyof ApplyRawPayload, v: string) => setForm((f) => f && { ...f, [k]: v });

  const appliedCount = items.filter((m) => m.applied && !m.archived).length;
  const unappliedCount = items.filter((m) => !m.applied && !m.archived).length;
  const selectedImageFiles = selectedCard?.files.filter(isImageFile) || [];
  const selectedFile = selectedImageFiles.find((f) => f.id === selectedFileId);
  const selectedFileIndex = Math.max(0, selectedImageFiles.findIndex((f) => f.id === selectedFileId));

  return (
    <>
      <h2>Slack 수집 원문</h2>
      <div className="sub">파싱 여부와 무관하게 모든 원문·링크·댓글을 보여줍니다. 미반영 건은 수정 후 직접 DB에 반영할 수 있습니다.</div>

      <div className="controls" style={{ marginTop: 10 }}>
        <div className="viewtoggle">
          <span className={`vt ${tab === "cards" ? "on" : ""}`} onClick={() => setTab("cards")}>
            명함 파싱 {cardItems.length}
          </span>
          <span className={`vt ${tab === "unapplied" ? "on" : ""}`} onClick={() => setTab("unapplied")}>
            미반영 {unappliedCount}
          </span>
          <span className={`vt ${tab === "applied" ? "on" : ""}`} onClick={() => setTab("applied")}>
            반영됨 {appliedCount}
          </span>
          <span className={`vt ${tab === "archived" ? "on" : ""}`} onClick={() => setTab("archived")}>
            아카이브
          </span>
        </div>
        <input type="search" placeholder="원문 검색…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(q)} />
        <button className="btn" onClick={() => load(q)}>검색</button>
        <button className="btn ghost" onClick={() => { setQ("jpg"); load("jpg"); }}>
          명함 파일
        </button>
      </div>

      {loading ? (
        <div className="loading">불러오는 중…</div>
      ) : tab === "cards" ? (
        <div className="card-review-layout">
          <aside className="card-inbox">
            <div className="card-inbox-head"><b>수집된 명함</b><span>{cardItems.length}건</span></div>
            {cardItems.length === 0 ? <div className="empty">수집된 명함 이미지가 없습니다.</div> : cardItems.map((message) => {
              const cardFiles = message.files.filter(isImageFile);
              const activeFiles = cardFiles.filter((f) => !f.card_archived);
              const file = activeFiles[0] || cardFiles[0];
              const done = activeFiles.filter((f) => f.card_status === "applied").length;
              return <button key={`${message.channel_id}:${message.ts}`} className={`card-inbox-item ${selectedCard?.ts === message.ts ? "on" : ""}`} onClick={() => selectCard(message)}>
                <span className="card-file-icon">▧</span><span><b>{file?.name || "명함 이미지"}{cardFiles.length > 1 ? ` 외 ${cardFiles.length - 1}장` : ""}</b><small>{message.when} · {message.user}{cardFiles.length !== activeFiles.length ? ` · 보관 ${cardFiles.length - activeFiles.length}` : ""}</small></span><em className={activeFiles.length > 0 && done === activeFiles.length ? "done" : ""}>{activeFiles.length ? `${done}/${activeFiles.length}` : "보관"}</em>
              </button>;
            })}
          </aside>

          <section className="card-review-main">
            {!selectedCard || !form ? (
              <div className="card-review-empty"><span>▧</span><b>검수할 명함을 선택하세요</b><p>왼쪽 목록에서 명함을 선택하면 이미지와 파싱 결과를 함께 확인할 수 있습니다.</p></div>
            ) : (
              <>
                <div className="card-review-toolbar"><div><b>{selectedFile?.name || "명함 이미지"}</b><span>{selectedCard.when} · {selectedCard.user} · {selectedFileIndex + 1}/{selectedImageFiles.length}장</span></div><div className="card-toolbar-actions"><button className="btn ghost" onClick={() => archiveCard(!selectedFile?.card_archived)}>{selectedFile?.card_archived ? "아카이브 해제" : "이 명함 아카이브"}</button>{selectedCard.permalink && <a className="btn" href={selectedCard.permalink} target="_blank" rel="noreferrer">Slack 원문</a>}</div></div>
                <div className="card-review-split">
                  <div className="card-image-pane">
                    <div className="pane-label">명함 이미지</div>
                    {selectedImageFiles.length > 1 && <div className="card-file-tabs">{selectedImageFiles.map((file, index) => <button key={file.id} className={file.id === selectedFileId ? "on" : ""} onClick={() => selectCard(selectedCard, file.id)}><span>{index + 1}</span>{file.card_archived ? "보관" : file.card_status === "applied" ? "반영됨" : file.card_status === "parsed" ? "파싱됨" : "대기"}</button>)}</div>}
                    <div className="card-image-stage">{cardImageUrl ? <img src={cardImageUrl} alt="수집된 명함" /> : <div className="loading">이미지를 불러오는 중…</div>}</div>
                  </div>
                  <div className="card-data-pane">
                    <div className="pane-label-row"><div className="pane-label">GLM Vision 파싱 내역</div>{ocrResult && <span className={`confidence ${(ocrResult.confidence || 0) >= .75 ? "high" : "low"}`}>신뢰도 {Math.round((ocrResult.confidence || 0) * 100)}%</span>}</div>
                    {!ocrResult && <button className={`vision-run ${visionBusy ? "working" : ""}`} aria-busy={visionBusy} disabled={visionBusy || applyBusy || selectedFile?.card_archived} onClick={() => ocrCard(selectedCard)}><span>{visionBusy ? <span className="inline-spinner dark" /> : "✦"}</span><div><b>{selectedFile?.card_archived ? "아카이브된 명함" : visionBusy ? `GLM Vision 처리 중 · ${visionElapsed}초` : "GLM Vision으로 명함 파싱"}</b><small>{selectedFile?.card_archived ? "다시 작업하려면 아카이브를 해제하세요." : visionBusy ? "이미지 준비 → GLM 요청 → 결과 구조화 순서로 처리합니다." : "회사·이름·이메일·직급·연락처를 자동 추출합니다."}</small></div></button>}
                    {(visionBusy || visionLogs.length > 0) && <div className="vision-console" aria-live="polite"><div><b>Vision 처리 콘솔</b><span className={visionBusy ? "running" : "done"}>{visionBusy ? `처리 중 · ${visionElapsed}초` : "완료"}</span></div><pre>{visionLogs.map((line, index) => `${String(index + 1).padStart(2, "0")}  ${line}`).join("\n")}</pre></div>}
                    <div className="card-fields">
                      <label><span>회사명</span><input value={form.company} onChange={(e) => upd("company", e.target.value)} /></label>
                      <label><span>이름</span><input value={form.name} onChange={(e) => upd("name", e.target.value)} /></label>
                      <label className="full"><span>이메일</span><input type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} /></label>
                      <label><span>부서</span><input value={form.department || ""} onChange={(e) => upd("department", e.target.value)} /></label>
                      <label><span>직급</span><input value={form.title || ""} onChange={(e) => upd("title", e.target.value)} /></label>
                      <label className="full"><span>연락처</span><input value={form.phone || ""} onChange={(e) => upd("phone", e.target.value)} /></label>
                      <label className="full"><span>메모</span><textarea rows={3} value={form.note} onChange={(e) => upd("note", e.target.value)} /></label>
                    </div>
                    {ocrResult?.evidence && <div className="ocr-evidence"><b>인식 근거</b><p>{ocrResult.evidence}</p></div>}
                    <div className="card-apply-bar"><button className="btn" onClick={() => ocrCard(selectedCard)} disabled={visionBusy || applyBusy || selectedFile?.card_archived}>{visionBusy ? <><span className="inline-spinner dark" /> 다시 파싱 중 · {visionElapsed}초</> : "다시 파싱"}</button><button className="btn primary" onClick={submit} disabled={visionBusy || applyBusy || selectedFile?.card_archived || selectedFile?.card_status === "applied"}>{applyBusy ? <><span className="inline-spinner" /> DB 반영 중</> : selectedFile?.card_archived ? "아카이브됨" : selectedFile?.card_status === "applied" ? "이 명함은 반영됨" : `이 명함 반영하기 (${selectedFileIndex + 1}/${selectedImageFiles.length}) →`}</button></div>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">{tab === "unapplied" ? "미반영 원문이 없습니다 🎉" : "반영된 원문이 없습니다"}</div>
      ) : (
        <div>
          {shown.map((m) => (
            <div className="review" key={m.ts}>
              <div className="rhead">
                <div className="rmeta">
                  {m.applied ? (
                    <span className="badge b-new">DB 반영됨{m.applied_kind ? ` · ${m.applied_kind}` : ""}</span>
                  ) : (
                    <span className="badge b-status">미반영</span>
                  )}{" "}
                  {m.when} · {m.user}
                  {m.permalink && (
                    <> · <a href={m.permalink} target="_blank" rel="noreferrer">🔗 Slack 원문</a></>
                  )}
                </div>
                <span style={{ display: "flex", gap: 6 }}>
                  {editTs !== m.ts && m.is_business_card_channel && m.files.some(isImageFile) && (
                    <button className="btn" aria-busy={visionBusy && editTs === m.ts} disabled={visionBusy || applyBusy} onClick={() => ocrCard(m)} title="명함 이미지에서 연락처 추론 (Vision OCR)">
                      {visionBusy && editTs === m.ts ? <><span className="inline-spinner dark" /> 추론 중 · {visionElapsed}초</> : "🪪 명함 추론하기"}
                    </button>
                  )}
                  {!m.applied && !m.archived && editTs !== m.ts && (
                    <button className="btn primary" disabled={Boolean(prefillBusyTs)} onClick={() => openApply(m)}>{prefillBusyTs === m.ts ? <><span className="inline-spinner" /> GLM 구조화 중 · {prefillElapsed}초</> : "반영하기"}</button>
                  )}
                  {!m.applied && !m.archived && (
                    <button className="btn ghost" onClick={() => archive(m, true)} title="등록 불필요 — 아카이브">
                      아카이브
                    </button>
                  )}
                  {m.archived && (
                    <button className="btn" onClick={() => archive(m, false)}>아카이브 해제</button>
                  )}
                </span>
              </div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, marginTop: 4 }}>{m.text}</div>
              {m.files.length > 0 && (
                <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                  <div className="hint">첨부파일 {m.files.length}</div>
                  {m.files.map((f) => (
                    <div key={f.id || f.name} className="pill" style={{ justifyContent: "space-between", gap: 10 }}>
                      <span>
                        <b>{f.name || f.title || f.id}</b>
                        <span className="hint"> · {f.pretty_type || f.mimetype || f.filetype || "file"} {fmtBytes(f.size) ? `· ${fmtBytes(f.size)}` : ""}</span>
                      </span>
                      {m.permalink && <a href={m.permalink} target="_blank" rel="noreferrer">Slack에서 보기</a>}
                    </div>
                  ))}
                </div>
              )}
              {m.comments.length > 0 && (
                <div style={{ marginTop: 6, borderLeft: "2px solid var(--line)", paddingLeft: 10 }}>
                  <div className="hint">💬 댓글 {m.comments.length} (스레드 연결)</div>
                  {m.comments.map((c, i) => (
                    <div key={i} style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 3 }}>
                      · {c.text}
                      {c.permalink && <> <a href={c.permalink} target="_blank" rel="noreferrer">🔗</a></>}
                    </div>
                  ))}
                </div>
              )}

              {editTs === m.ts && form && (
                <div className="editgrid" style={{ marginTop: 10 }}>
                  {prefillBusyTs === m.ts && <div className="full ai-inline-status"><span className="inline-spinner dark" /><div><b>GLM 원문 구조화 중 · {prefillElapsed}초</b><small>회사·담당자·활동 정보를 추출하고 있습니다.</small></div></div>}
                  <div>
                    <label>회사명</label>
                    <input value={form.company} onChange={(e) => upd("company", e.target.value)} />
                  </div>
                  <div>
                    <label>활동 유형</label>
                    <select value={form.activity_type} onChange={(e) => upd("activity_type", e.target.value)} style={{ width: "100%" }}>
                      {ACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>담당자 이메일</label>
                    <input value={form.email} placeholder="선택 (있으면 담당자로 등록)" onChange={(e) => upd("email", e.target.value)} />
                  </div>
                  <div>
                    <label>담당자 이름</label>
                    <input value={form.name} onChange={(e) => upd("name", e.target.value)} />
                  </div>
                  <div>
                    <label>부서</label>
                    <input value={form.department || ""} onChange={(e) => upd("department", e.target.value)} />
                  </div>
                  <div>
                    <label>직급</label>
                    <input value={form.title || ""} onChange={(e) => upd("title", e.target.value)} />
                  </div>
                  <div>
                    <label>연락처</label>
                    <input value={form.phone || ""} onChange={(e) => upd("phone", e.target.value)} />
                  </div>
                  <div>
                    <label>관심 솔루션</label>
                    <input list="solutions" value={form.solution} onChange={(e) => upd("solution", e.target.value)} />
                  </div>
                  <div>
                    <label>발생일시</label>
                    <input value={form.occurred_at} placeholder="YYYY-MM-DD HH:MM (비우면 지금)" onChange={(e) => upd("occurred_at", e.target.value)} />
                  </div>
                  <div className="full">
                    <label>활동 내용 (원문)</label>
                    <textarea rows={3} value={form.note} onChange={(e) => upd("note", e.target.value)} />
                  </div>
                  <div className="full">
                    <label>다음 액션</label>
                    <input value={form.next_action} onChange={(e) => upd("next_action", e.target.value)} />
                  </div>
                  <div className="full">
                    <button className="btn primary" disabled={applyBusy || visionBusy} onClick={submit}>{applyBusy ? <><span className="inline-spinner" /> DB 반영 중</> : "DB 반영"}</button>
                    <button className="btn ghost" style={{ marginLeft: 6 }} onClick={() => { setEditTs(null); setForm(null); }}>취소</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
