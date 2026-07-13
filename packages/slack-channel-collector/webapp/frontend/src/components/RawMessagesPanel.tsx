import { useEffect, useState } from "react";
import { api, type SlackRawMessage, type ApplyRawPayload } from "../lib/api";

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
  const [tab, setTab] = useState<"unapplied" | "applied" | "archived">("unapplied");
  const [editTs, setEditTs] = useState<string | null>(null);
  const [form, setForm] = useState<ApplyRawPayload | null>(null);
  const [busy, setBusy] = useState(false);

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
      }
    }
  };

  // 명함 이미지 → vision OCR 추론 → 기존 반영 폼에 프리필 (사용자 확인 후 '반영하기')
  const ocrCard = async (m: SlackRawMessage) => {
    setEditTs(m.ts);
    setForm({
      channel_id: m.channel_id, ts: m.ts, company: "", email: "", name: "",
      solution: "", activity_type: "명함 수집",
      note: m.text || "", next_action: "", occurred_at: "",
    });
    onToast?.("🪪 명함 추론 중… (Vision OCR)", "loading");
    try {
      const r = await api.ocrCard(m.channel_id, m.ts);
      const card = (r.cards || []).find((c) => c.ok && c.fields);
      if (!r.ok || !card) {
        const why = (r.cards || []).find((c) => c.message)?.message || r.message || "결과 없음";
        onToast?.("⚠ 명함 추론 실패: " + why, "error");
        return;
      }
      const fx = card.fields || {};
      setForm((f) => f && {
        ...f,
        company: fx.company || "", email: fx.email || "", name: fx.name || "",
        phone: fx.phone || "", department: fx.department || "", title: fx.title || "",
        note: (card.evidence ? "명함 OCR: " + card.evidence + "\n" : "") + (m.text || ""),
      });
      const cnt = (r.cards || []).filter((c) => c.ok).length;
      onToast?.(
        `✅ 명함 추론 완료[${card.provider || "?"}] · 신뢰도 ${(card.confidence ?? 0).toFixed(2)}${cnt > 1 ? ` · ${cnt}장 중 1장 표시` : ""} — 확인 후 반영하세요`,
        "success"
      );
    } catch (e) {
      onToast?.("⚠ 명함 추론 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const submit = async () => {
    if (!form) return;
    if (!form.company?.trim() && !(form.email && form.email.includes("@"))) {
      onToast?.("⚠ 회사명 또는 이메일 중 하나는 필요합니다", "error");
      return;
    }
    setBusy(true);
    onToast?.("DB 반영 중…", "loading");
    try {
      await api.applyRawMessage(form);
      onToast?.(`✅ DB 반영 완료 — ${form.company || form.email}`, "success");
      setEditTs(null);
      setForm(null);
      await load(q);
    } catch (e) {
      onToast?.("⚠ 반영 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setBusy(false);
    }
  };

  const upd = (k: keyof ApplyRawPayload, v: string) => setForm((f) => f && { ...f, [k]: v });

  const appliedCount = items.filter((m) => m.applied && !m.archived).length;
  const unappliedCount = items.filter((m) => !m.applied && !m.archived).length;

  return (
    <>
      <h2>Slack 수집 원문</h2>
      <div className="sub">파싱 여부와 무관하게 모든 원문·링크·댓글을 보여줍니다. 미반영 건은 수정 후 직접 DB에 반영할 수 있습니다.</div>

      <div className="controls" style={{ marginTop: 10 }}>
        <div className="viewtoggle">
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
                  {editTs !== m.ts && m.files.some(isImageFile) && (
                    <button className="btn" onClick={() => ocrCard(m)} title="명함 이미지에서 연락처 추론 (Vision OCR)">
                      🪪 명함 추론하기
                    </button>
                  )}
                  {!m.applied && !m.archived && editTs !== m.ts && (
                    <button className="btn primary" onClick={() => openApply(m)}>반영하기</button>
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
                    <button className="btn primary" disabled={busy} onClick={submit}>DB 반영</button>
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
