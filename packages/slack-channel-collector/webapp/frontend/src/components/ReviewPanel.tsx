import { useState } from "react";
import type { Review } from "../types";
import { api, type CompanySearchItem, type ResolvePayload } from "../lib/api";

function confClass(c: number): string {
  if (c < 0.4) return "lo";
  if (c < 0.7) return "mid";
  return "hi";
}

function KeyVal({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === "" || v === null || v === undefined) return null;
  return (
    <>
      <div className="rk">{k}</div>
      <div>{v}</div>
    </>
  );
}

// raw collected source ↔ GLM interpretation, side by side
function RawVsInterpretation({ r }: { r: Review }) {
  if (!r.raw_source && !r.interpretation) return null;
  return (
    <div className="rgrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div>
        <div className="rk">수집 원본 (Slack)</div>
        <div
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 12,
            background: "#f9fafb",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 8,
            maxHeight: 180,
            overflow: "auto",
          }}
        >
          {r.raw_source?.text || "(원문 없음)"}
        </div>
        {r.raw_source?.permalink && (
          <div style={{ marginTop: 4 }}>
            <a href={r.raw_source.permalink} target="_blank" rel="noreferrer">
              🔗 Slack 원본 열기
            </a>
          </div>
        )}
      </div>
      <div>
        <div className="rk">해석 결과 (GLM)</div>
        <div
          style={{
            fontSize: 12,
            background: "#f9fafb",
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 8,
            maxHeight: 180,
            overflow: "auto",
          }}
        >
          {r.interpretation ? (
            <>
              <div>
                <b>유형:</b> {r.interpretation.kind} ·{" "}
                <span className={`conf ${confClass(r.interpretation.confidence)}`}>
                  신뢰도 {(r.interpretation.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>
                {JSON.stringify(r.interpretation.payload, null, 2)}
              </pre>
            </>
          ) : (
            "(해석 결과 없음)"
          )}
        </div>
      </div>
    </div>
  );
}

// company picker for "link to existing"
function CompanyLinker({ onPick }: { onPick: (c: CompanySearchItem) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CompanySearchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const search = async (value: string) => {
    setQ(value);
    if (value.trim().length < 1) {
      setItems([]);
      return;
    }
    setBusy(true);
    try {
      const res = await api.searchCompanies(value);
      setItems(res.items);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ flexBasis: "100%" }}>
      <input
        type="text"
        placeholder="기존 회사 검색… (예: 삼성전자)"
        value={q}
        onChange={(e) => search(e.target.value)}
        style={{ width: "100%" }}
      />
      {busy && <div className="hint">검색 중…</div>}
      {items.length > 0 && (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 8,
            marginTop: 4,
            maxHeight: 160,
            overflow: "auto",
          }}
        >
          {items.map((c) => (
            <div
              key={c.id}
              className="member"
              style={{ cursor: "pointer", padding: "6px 10px", margin: 0 }}
              onClick={() => onPick(c)}
            >
              <span>
                <b>{c.display_name}</b>{" "}
                {c.industry && <span className="badge b-ind">{c.industry}</span>}
              </span>
              <span className="hint">{c.contact_count}명 연결됨</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  r,
  onResolve,
}: {
  r: Review;
  onResolve: (id: number, payload: ResolvePayload) => void;
}) {
  const [editValue, setEditValue] = useState(r.proposed_value);
  const [mode, setMode] = useState<"" | "link" | "register">("");
  // Prefill new-company name from the interpreted company name when available.
  const interpCompany =
    (r.interpretation?.payload?.company as { name?: string } | undefined)?.name || "";
  const [newName, setNewName] = useState(
    r.entity_type === "company" && r.field_name === "name"
      ? r.proposed_value || interpCompany
      : interpCompany
  );

  // Company reviews (a new/ambiguous company from GLM, or a contact missing its
  // company link) get the "register new / link existing" flow. Everything else
  // is a plain field confirmation (approve / edit / reject).
  const isCompanyLink =
    r.entity_type === "company" ||
    ["company_id", "company", "company_name"].includes(r.field_name);

  return (
    <div className="review">
      <div className="rhead">
        <div>
          <div className="rtitle">
            {r.entity_type} · {r.field_name}
            {r.entity_context?.company && (
              <span className="hint"> — {r.entity_context.company}</span>
            )}
          </div>
          <div className="rmeta">
            {r.review_type} · {r.requested_at}
            {r.entity_context?.email && ` · ${r.entity_context.email}`}
          </div>
        </div>
        <span className={`conf ${confClass(r.confidence)}`}>
          신뢰도 {(r.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <RawVsInterpretation r={r} />

      <div className="rgrid">
        <KeyVal k="근거" v={r.evidence} />
        {r.entity_context && (
          <KeyVal
            k="대상"
            v={`${r.entity_context.name || "(이름 미상)"} / ${r.entity_context.email}`}
          />
        )}
        <KeyVal k="현재값" v={r.current_value || <i className="hint">(비어 있음)</i>} />
        <KeyVal k="제안값" v={r.proposed_value || <i className="hint">(비어 있음)</i>} />
      </div>

      {/* company linking flows */}
      {isCompanyLink && (
        <div className="ractions">
          {mode === "" && (
            <>
              <button className="btn" onClick={() => setMode("link")}>
                기고객사 연결
              </button>
              <button className="btn" onClick={() => setMode("register")}>
                신규 등록
              </button>
              <button className="btn ghost" onClick={() => onResolve(r.id, { action: "reject" })}>
                무시
              </button>
            </>
          )}
          {mode === "link" && (
            <>
              <CompanyLinker
                onPick={(c) =>
                  onResolve(r.id, { action: "link_existing", company_key: c.canonical_key })
                }
              />
              <button className="btn ghost" onClick={() => setMode("")}>
                취소
              </button>
            </>
          )}
          {mode === "register" && (
            <>
              <input
                type="text"
                placeholder="신규 회사명"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button
                className="btn primary"
                disabled={!newName.trim()}
                onClick={() =>
                  onResolve(r.id, { action: "register_new", company_name: newName.trim() })
                }
              >
                등록
              </button>
              <button className="btn ghost" onClick={() => setMode("")}>
                취소
              </button>
            </>
          )}
        </div>
      )}

      {/* generic field flows */}
      {!isCompanyLink && (
        <div className="ractions">
          <button
            className="btn primary"
            onClick={() => onResolve(r.id, { action: "approve" })}
          >
            승인
          </button>
          <input
            type="text"
            value={editValue}
            placeholder="수정 값 입력"
            onChange={(e) => setEditValue(e.target.value)}
          />
          <button
            className="btn"
            onClick={() => onResolve(r.id, { action: "edit", value: editValue })}
          >
            수정 승인
          </button>
          <button className="btn ghost" onClick={() => onResolve(r.id, { action: "reject" })}>
            거절
          </button>
        </div>
      )}
    </div>
  );
}

export function ReviewPanel({
  reviews,
  onResolve,
}: {
  reviews: Review[];
  onResolve: (id: number, payload: ResolvePayload) => void;
}) {
  return (
    <>
      <h2>
        정합성 확인 대기열{" "}
        {reviews.length > 0 && (
          <span className="badge b-status">{reviews.length}건 남음</span>
        )}
      </h2>
      <div className="sub">
        Slack/GLM 해석 결과가 운영 DB를 조용히 오염시키지 않도록, 원본과 해석을 비교하고
        하나씩 승인·연결·등록하세요. 처리하면 목록에서 사라집니다.
      </div>
      <div style={{ marginTop: 12 }}>
        {reviews.length === 0 ? (
          <div className="empty">확인 대기 중인 항목이 없습니다 🎉</div>
        ) : (
          reviews.map((r) => <ReviewCard key={r.id} r={r} onResolve={onResolve} />)
        )}
      </div>
    </>
  );
}
