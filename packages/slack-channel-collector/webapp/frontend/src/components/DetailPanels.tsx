import { useEffect, useState } from "react";
import type { Customer, CompanyProfile, Activity } from "../types";
import type { CompanyGroup } from "../lib/domain";
import { companyProfile, normInterest } from "../lib/domain";
import type { ActivityPayload } from "../lib/api";
import { SourceBadges, TagBadges } from "./Badges";

export const ACTIVITY_TYPES = [
  "방문 미팅",
  "콜",
  "자료 요청",
  "견적 요청",
  "데모",
  "후속 확인",
  "문의",
  "메모",
];

function srcLabel(src: string): string {
  if (src === "relate") return "릴레잇 문의";
  if (src === "manual") return "수기 등록";
  if (src === "cross_team") return "크로스팀 활동";
  if (src === "business_card") return "명함 OCR";
  return "피트페이퍼 열람";
}

function nowStamp(): string {
  const n = new Date();
  return (
    n.getFullYear() +
    "-" +
    String(n.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(n.getDate()).padStart(2, "0") +
    " " +
    n.toTimeString().slice(0, 8)
  );
}

function ReassignInline({ id, onReassign }: { id: number; onReassign: (id: number, c: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open)
    return (
      <button className="btn ghost" style={{ fontSize: 10.5, padding: "0 5px" }} onClick={() => setOpen(true)}>
        ↪ 회사 지정
      </button>
    );
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <input value={v} placeholder="회사명" onChange={(e) => setV(e.target.value)} style={{ width: 110, fontSize: 11 }} />
      <button className="btn" style={{ fontSize: 10.5, padding: "0 6px" }}
        onClick={() => { if (v.trim()) { onReassign(id, v.trim()); setOpen(false); } }}>이동</button>
    </span>
  );
}

function Timeline({ events, onReassign }: { events: Activity[]; onReassign?: (id: number, c: string) => void }) {
  if (!events.length)
    return (
      <div className="tl">
        <div className="ev">
          <div>메일링 리스트 등록</div>
        </div>
      </div>
    );
  return (
    <div className="tl">
      {events.map((e, ix) => (
        <div className="ev" key={ix}>
          <div className="d">
            {e.dt} · {e.atype || srcLabel(e.src)}
            {e.nm ? " · " + e.nm : e.em ? " · " + e.em : ""}
            {e.link && (
              <>
                {" · "}
                <a href={e.link} target="_blank" rel="noreferrer">
                  🔗 Slack
                </a>
              </>
            )}
          </div>
          {e.it && <div>{normInterest(e.it)}</div>}
          {e.iq &&
            (() => {
              // 슬랙 수집(릴레잇/피트페이퍼/크로스팀)은 원문 전체를 그대로 노출
              const isSlack =
                !!e.link || ["relate", "featpaper", "cross_team", "business_card"].includes(e.src);
              return (
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    marginTop: 2,
                    background: "#f9fafb",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    padding: "6px 8px",
                    ...(isSlack ? {} : { maxHeight: 260, overflow: "auto" }),
                    fontSize: 12,
                  }}
                >
                  {e.iq}
                </div>
              );
            })()}
          {e.next && <div className="hint">▶ 다음 액션: {e.next}</div>}
          {onReassign && e.id != null && (
            <div style={{ marginTop: 2 }}><ReassignInline id={e.id} onReassign={onReassign} /></div>
          )}
          {e.comments && e.comments.length > 0 && (
            <div className="hint" style={{ marginTop: 3 }}>
              💬 댓글 {e.comments.length}
              {e.comments.slice(0, 3).map((c, ci) => (
                <div key={ci} style={{ marginLeft: 8 }}>
                  · {c.text.slice(0, 100)}
                  {c.permalink && (
                    <>
                      {" "}
                      <a href={c.permalink} target="_blank" rel="noreferrer">
                        🔗
                      </a>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// 영업 활동 기록 추가 (히스토리 관리)
function ActivityForm({
  contacts,
  onSubmit,
}: {
  contacts: { email: string; name: string }[];
  onSubmit: (p: ActivityPayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(contacts[0]?.email || "");
  const [atype, setAtype] = useState(ACTIVITY_TYPES[0]);
  const [solution, setSolution] = useState("");
  const [note, setNote] = useState("");
  const [next, setNext] = useState("");

  if (!open)
    return (
      <button className="btn" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        ＋ 활동 기록 추가
      </button>
    );
  return (
    <div className="editgrid" style={{ marginTop: 8 }}>
      {contacts.length > 0 && (
        <div>
          <label>담당자</label>
          <select value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }}>
            {contacts.map((c) => (
              <option key={c.email} value={c.email}>
                {c.name || c.email}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label>활동 유형</label>
        <select value={atype} onChange={(e) => setAtype(e.target.value)} style={{ width: "100%" }}>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label>관심 솔루션</label>
        <input list="solutions" value={solution} onChange={(e) => setSolution(e.target.value)} />
      </div>
      <div className="full">
        <label>활동 내용</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="full">
        <label>다음 액션</label>
        <input value={next} onChange={(e) => setNext(e.target.value)} placeholder="예: 7/12까지 샘플 수령" />
      </div>
      <div className="full">
        <button
          className="btn primary"
          onClick={() => {
            onSubmit({
              email: email || undefined,
              activity_type: atype,
              solution_name: solution,
              note,
              next_action: next,
              occurred_at: nowStamp(),
            });
            setOpen(false);
            setNote("");
            setNext("");
          }}
        >
          기록 저장
        </button>
        <button className="btn ghost" onClick={() => setOpen(false)} style={{ marginLeft: 6 }}>
          취소
        </button>
      </div>
    </div>
  );
}

function TagEditor({
  tags,
  onSave,
}: {
  tags: string[];
  onSave: (tags: string[]) => void;
}) {
  const [value, setValue] = useState(tags.join(", "));
  return (
    <div className="field">
      <div className="k">태그</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={value}
          placeholder="쉼표로 구분 (예: VIP, 재방문)"
          style={{ flex: 1 }}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className="btn"
          onClick={() => onSave(value.split(",").map((t) => t.trim()).filter(Boolean))}
        >
          저장
        </button>
      </div>
    </div>
  );
}

function ContactEditor({
  contact,
  onSave,
  onDelete,
}: {
  contact: Customer;
  onSave: (email: string, fields: Record<string, string>) => void | Promise<void>;
  onDelete: (email: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    name: contact.n || "",
    company: contact.c || "",
    department: contact.d || "",
    title: contact.t || "",
    phone: contact.p || "",
    status: contact.st || "정상",
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setForm({
      name: contact.n || "",
      company: contact.c || "",
      department: contact.d || "",
      title: contact.t || "",
      phone: contact.p || "",
      status: contact.st || "정상",
    });
  }, [contact.e, contact.n, contact.c, contact.d, contact.t, contact.p, contact.st]);

  const upd = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const save = async () => {
    setBusy(true);
    try {
      await onSave(contact.e, form);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <div className="k">기본 정보 수정</div>
      <div className="editgrid" style={{ marginTop: 8 }}>
        <div className="full">
          <label>이메일</label>
          <input value={contact.e} readOnly />
        </div>
        <div>
          <label>이름</label>
          <input value={form.name} onChange={(e) => upd("name")(e.target.value)} />
        </div>
        <div>
          <label>회사명</label>
          <input value={form.company} onChange={(e) => upd("company")(e.target.value)} />
        </div>
        <div>
          <label>부서</label>
          <input value={form.department} onChange={(e) => upd("department")(e.target.value)} />
        </div>
        <div>
          <label>직급</label>
          <input value={form.title} onChange={(e) => upd("title")(e.target.value)} />
        </div>
        <div>
          <label>휴대폰/연락처</label>
          <input value={form.phone} onChange={(e) => upd("phone")(e.target.value)} />
        </div>
        <div>
          <label>상태</label>
          <select value={form.status} onChange={(e) => upd("status")(e.target.value)} style={{ width: "100%" }}>
            {["정상", "내부", "테스트", "휴면", "수신거부"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="full">
          <button className="btn primary" disabled={busy} onClick={save}>
            연락처 정보 저장
          </button>
          <button
            className="btn ghost"
            disabled={busy}
            style={{ marginLeft: 6, color: "#b91c1c" }}
            onClick={async () => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              setBusy(true);
              try {
                await onDelete(contact.e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmDelete ? "정말 삭제" : "연락처 삭제"}
          </button>
          {confirmDelete && (
            <button className="btn ghost" disabled={busy} style={{ marginLeft: 6 }} onClick={() => setConfirmDelete(false)}>
              취소
            </button>
          )}
          <div className="hint" style={{ marginTop: 4 }}>
            삭제해도 기존 활동 원문은 타임라인 증적으로 보존됩니다.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── company detail (with edit) ─────────────────────────────────────────────
export function CompanyDetail({
  group,
  companies,
  activities,
  onSave,
  onLogActivity,
  onInfer,
  onReassignActivity,
  onReclassifyGlm,
  onDelete,
  aiBusy,
  aiStatus,
}: {
  group: CompanyGroup;
  companies: Record<string, CompanyProfile>;
  activities: Activity[];
  onSave: (key: string, fields: Record<string, string>) => void;
  onLogActivity: (p: ActivityPayload) => void;
  onReassignActivity?: (id: number, company: string) => void;
  onReclassifyGlm?: (key: string) => void;
  onDelete?: (key: string) => void;
  aiBusy?: boolean;
  aiStatus?: string;
  onInfer: (key: string) => Promise<{
    industry?: string;
    sub_industry?: string;
    description?: string;
  } | null>;
}) {
  const ci = companyProfile(companies, group.key);
  const [form, setForm] = useState({
    display_name: ci.name,
    industry: ci.ind,
    sub_industry: ci.sub,
    description: ci.desc,
    owner: ci.owner,
    memo: ci.memo,
  });
  const memberEmails = new Set(group.members.map((m) => m.e));
  const evFor = (email: string) =>
    activities.filter((e) => e.em === email).sort((a, b) => b.dt.localeCompare(a.dt));
  const myEv = activities
    .filter(
      (e) =>
        memberEmails.has(e.em) ||
        (e.cokey && e.cokey === group.key) ||
        (!e.cokey && e.co && e.co === group.name)
    )
    .sort((a, b) => b.dt.localeCompare(a.dt))
    .slice(0, 50);

  // 부서별 그룹핑 (히스토리 계층: 회사 → 부서 → 담당자)
  const deptMap: Record<string, Customer[]> = {};
  group.members.forEach((m) => {
    const d = (m.d || "").trim() || "(부서 미상)";
    (deptMap[d] = deptMap[d] || []).push(m);
  });
  const depts = Object.keys(deptMap).sort();

  const upd = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  return (
    <>
      <h2>{group.name}</h2>
      <div className="sub">
        {group.members.length}명 · 관심: {group.i.join(", ") || "—"} ·{" "}
        <SourceBadges sources={group.s} />
      </div>
      {group.name.includes("미분류") && onReclassifyGlm && (
        <div className="field">
          <button className="btn" disabled={aiBusy} onClick={() => onReclassifyGlm(group.key)}>
            {aiBusy ? <><span className="inline-spinner dark" /> {aiStatus || "GLM 처리 중…"}</> : "✨ GLM 자동 재분류 (원문에서 회사 추출)"}
          </button>
          <span className="hint"> 또는 아래 활동별 "↪ 회사 지정"으로 직접 이동</span>
        </div>
      )}
      <div className="editgrid">
        <div className="full">
          <label>회사명</label>
          <input
            type="text"
            value={form.display_name}
            placeholder="회사명"
            onChange={(e) => upd("display_name")(e.target.value)}
          />
        </div>
        <div>
          <label>
            업종 {ci.auto && !ci.owner ? <span className="badge b-auto">자동 추정</span> : null}
            <button
              className="btn ghost"
              style={{ fontSize: 11, padding: "1px 6px", marginLeft: 6 }}
              disabled={aiBusy}
              onClick={async () => {
                const r = await onInfer(group.key);
                if (r)
                  setForm((prev) => ({
                    ...prev,
                    industry: r.industry || prev.industry,
                    sub_industry: r.sub_industry || prev.sub_industry,
                    description: r.description || prev.description,
                  }));
              }}
              title="GLM으로 업종/설명 자동 추정"
            >
              {aiBusy ? <><span className="inline-spinner dark" /> {aiStatus || "추정 중…"}</> : "✨ GLM 추정"}
            </button>
          </label>
          <input
            type="text"
            value={form.industry}
            placeholder="예: 2차전지"
            onChange={(e) => upd("industry")(e.target.value)}
          />
        </div>
        <div>
          <label>세부분야</label>
          <input
            type="text"
            value={form.sub_industry}
            placeholder="예: 양극재, 검사장비…"
            onChange={(e) => upd("sub_industry")(e.target.value)}
          />
        </div>
        <div>
          <label>내부 담당자</label>
          <input
            type="text"
            list="owners"
            value={form.owner}
            placeholder="영업 담당 지정"
            onChange={(e) => upd("owner")(e.target.value)}
          />
        </div>
        <div className="full">
          <label>회사 설명</label>
          <textarea
            rows={2}
            value={form.description}
            placeholder="뭐 하는 회사인지 적어주세요"
            onChange={(e) => upd("description")(e.target.value)}
          />
        </div>
        <div className="full">
          <label>영업 메모</label>
          <textarea
            rows={2}
            value={form.memo}
            placeholder="다음 액션, 특이사항…"
            onChange={(e) => upd("memo")(e.target.value)}
          />
        </div>
        <div className="full">
          <button className="btn primary" onClick={() => onSave(group.key, form)}>
            회사 정보 저장
          </button>
          {onDelete && (
            <button
              className="btn"
              style={{ marginLeft: 6, color: "#dc2626", borderColor: "#f3b0b0" }}
              onClick={() => onDelete(group.key)}
            >
              회사 삭제
            </button>
          )}
        </div>
      </div>
      <div className="field">
        <div className="k">영업 히스토리 (부서 → 담당자)</div>
        {depts.map((d) => (
          <div key={d} style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{d}</div>
            {deptMap[d].map((m) => {
              const evs = evFor(m.e);
              return (
                <div key={m.e} style={{ margin: "4px 0 8px 8px" }}>
                  <div className="member" style={{ borderBottom: "none", paddingBottom: 2 }}>
                    <span>
                      <b>{m.n || "—"}</b>{" "}
                      <span className="hint">{m.t}</span>
                    </span>
                    <span className="hint">
                      {m.e}
                      {m.p ? " · " + m.p : ""} · 활동 {m.a}회
                    </span>
                  </div>
                  {evs.length > 0 && <Timeline events={evs.slice(0, 6)} />}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="field">
        <div className="k">활동 기록 추가</div>
        <ActivityForm
          contacts={group.members.map((m) => ({ email: m.e, name: m.n }))}
          onSubmit={onLogActivity}
        />
      </div>

      <div className="field">
        <div className="k">전체 타임라인</div>
        <Timeline events={myEv} onReassign={onReassignActivity} />
      </div>
    </>
  );
}

// ── person detail ──────────────────────────────────────────────────────────
export function PersonDetail({
  contact,
  companies,
  activities,
  onOpenCompany,
  onLogActivity,
  onSaveTags,
  onSaveContact,
  onDeleteContact,
}: {
  contact: Customer;
  companies: Record<string, CompanyProfile>;
  activities: Activity[];
  onOpenCompany: (key: string) => void;
  onLogActivity: (p: ActivityPayload) => void;
  onSaveTags: (email: string, tags: string[]) => void;
  onSaveContact: (email: string, fields: Record<string, string>) => void | Promise<void>;
  onDeleteContact: (email: string) => void | Promise<void>;
}) {
  const ci = companyProfile(companies, contact.ckey);
  const myEv = activities
    .filter((e) => e.em === contact.e)
    .sort((a, b) => b.dt.localeCompare(a.dt));
  return (
    <>
      <h2>
        {contact.n || "(이름 미상)"}{" "}
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{contact.t}</span>
      </h2>
      <div className="sub">
        {contact.c}
        {contact.d ? " · " + contact.d : ""}
      </div>
      {ci.ind && (
        <div className="field">
          <div className="k">회사 정보</div>
          <div className="v">
            <span className="badge b-ind">{ci.ind}</span> {ci.sub}
            {ci.desc && (
              <div className="hint" style={{ marginTop: 2 }}>
                {ci.desc}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="field">
        <div className="k">이메일 / 휴대폰</div>
        <div className="v">
          {contact.e}
          {contact.p ? " · " + contact.p : ""}
        </div>
      </div>
      <ContactEditor contact={contact} onSave={onSaveContact} onDelete={onDeleteContact} />
      <div className="field">
        <div className="k">
          관심 솔루션 <span className="hint">(릴레잇 문의 + 피트페이퍼 열람 통합)</span>
        </div>
        <div className="v">{contact.i.join(", ") || "—"}</div>
      </div>
      <div className="field">
        <div className="k">소스 / 태그</div>
        <div className="v">
          <SourceBadges sources={contact.s} />
          <TagBadges tags={contact.tags} />
        </div>
      </div>
      <TagEditor tags={contact.tags} onSave={(t) => onSaveTags(contact.e, t)} />
      <div className="field">
        <div className="k">최초유입 → 최근활동</div>
        <div className="v">
          {contact.f} → {contact.l} (활동 {contact.a}회)
        </div>
      </div>
      {contact.q && (
        <div className="field">
          <div className="k">문의내용</div>
          <div className="v" style={{ whiteSpace: "pre-wrap" }}>
            {contact.q}
          </div>
        </div>
      )}
      {contact.ckey && (
        <button className="btn" onClick={() => onOpenCompany(contact.ckey)}>
          회사 정보 보기/수정 →
        </button>
      )}
      <div className="field">
        <div className="k">활동 기록 추가</div>
        <ActivityForm
          contacts={[{ email: contact.e, name: contact.n }]}
          onSubmit={onLogActivity}
        />
      </div>
      <div className="field">
        <div className="k">활동 타임라인 (영업 히스토리)</div>
        <Timeline events={myEv} />
      </div>
    </>
  );
}
