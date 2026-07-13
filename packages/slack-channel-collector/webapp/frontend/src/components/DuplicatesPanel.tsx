import { useEffect, useState } from "react";
import { api, type DuplicateGroup, type CompanySearchItem } from "../lib/api";

// 검색 + 체크박스로 임의 회사들을 골라 병합
function SearchMerge({
  onToast,
  onMerged,
}: {
  onToast?: (msg: string, type: "loading" | "success" | "error") => void;
  onMerged: () => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CompanySearchItem[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [keep, setKeep] = useState("");
  const [busy, setBusy] = useState(false);

  const search = async (v: string) => {
    setQ(v);
    if (v.trim().length < 1) { setItems([]); return; }
    setItems((await api.searchCompanies(v)).items);
  };
  const toggle = (key: string) => {
    const n = new Set(sel);
    n.has(key) ? n.delete(key) : n.add(key);
    setSel(n);
    if (!keep && n.size) setKeep([...n][0]);
  };
  const merge = async () => {
    const keys = [...sel];
    if (keys.length < 2 || !keep) return;
    const mergeKeys = keys.filter((k) => k !== keep);
    setBusy(true);
    onToast?.(`병합 중… ${mergeKeys.length}곳 → ${keep}`, "loading");
    try {
      const r = await api.mergeCompanies(keep, mergeKeys);
      onToast?.(`✅ 병합 완료 → ${keep} (담당자 ${r.moved_contacts}·활동 ${r.moved_activities} 이관)`, "success");
      setSel(new Set()); setKeep(""); setItems([]); setQ("");
      onMerged();
    } catch (e) {
      onToast?.("⚠ 병합 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="review" style={{ marginBottom: 14 }}>
      <div className="rtitle">검색해서 병합</div>
      <div className="hint">회사를 검색해 체크로 여러 곳을 고르고, 남길 회사를 선택한 뒤 병합합니다.</div>
      <input type="text" placeholder="회사 검색…" value={q} onChange={(e) => search(e.target.value)}
        style={{ width: "100%", marginTop: 6 }} />
      {items.length > 0 && (
        <div style={{ maxHeight: 200, overflow: "auto", marginTop: 6 }}>
          {items.map((c) => (
            <label className="member" key={c.canonical_key} style={{ cursor: "pointer" }}>
              <span>
                <input type="checkbox" checked={sel.has(c.canonical_key)} onChange={() => toggle(c.canonical_key)} />{" "}
                <input type="radio" name="keepsel" disabled={!sel.has(c.canonical_key)}
                  checked={keep === c.canonical_key} onChange={() => setKeep(c.canonical_key)} title="남길 회사" />{" "}
                <b>{c.display_name}</b> {c.industry && <span className="badge b-ind">{c.industry}</span>}
              </span>
              <span className="hint">{c.contact_count}명</span>
            </label>
          ))}
        </div>
      )}
      {sel.size >= 2 && (
        <div className="ractions" style={{ marginTop: 6 }}>
          <button className="btn primary" disabled={busy || !keep} onClick={merge}>
            {busy ? "병합 중…" : `${sel.size}곳 병합 → ${keep}`}
          </button>
          <span className="hint">체크={sel.size} · 라디오로 남길 회사 지정</span>
        </div>
      )}
    </div>
  );
}

// 유사 중복 회사 병합: 그룹별로 남길 회사를 고르고 나머지를 병합.
export function DuplicatesPanel({
  onDone,
  onToast,
}: {
  onDone: () => void;
  onToast?: (msg: string, type: "loading" | "success" | "error") => void;
}) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [keep, setKeep] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.duplicates();
      setGroups(r.groups);
      // default: keep the company with the most contacts (first)
      const k: Record<string, string> = {};
      r.groups.forEach((g) => (k[g.key] = g.companies[0]?.canonical_key || ""));
      setKeep(k);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const merge = async (g: DuplicateGroup) => {
    const keepKey = keep[g.key];
    const mergeKeys = g.companies.map((c) => c.canonical_key).filter((k) => k !== keepKey);
    if (!keepKey || mergeKeys.length === 0) return;
    setBusy(g.key);
    onToast?.(`회사 병합 중… ${mergeKeys.length}곳 → ${keepKey}`, "loading");
    try {
      const res = await api.mergeCompanies(keepKey, mergeKeys);
      setGroups((prev) => prev.filter((x) => x.key !== g.key));
      onToast?.(
        `✅ 병합 완료 → ${keepKey}\n담당자 ${res.moved_contacts}명 · 활동 ${res.moved_activities}건 이관`,
        "success"
      );
    } catch (e) {
      onToast?.("⚠ 병합 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h2>
        유사 중복 회사{" "}
        {groups.length > 0 && <span className="badge b-status">{groups.length}건</span>}
      </h2>
      <div className="sub">
        표기가 다르지만 같은 회사로 보이는 후보입니다. 남길 회사를 고르고 병합하면 담당자·활동이
        합쳐지고 나머지 이름은 별칭으로 등록됩니다.
      </div>
      <div style={{ marginTop: 12 }}>
        <SearchMerge onToast={onToast} onMerged={load} />
      </div>
      {loading ? (
        <div className="loading">불러오는 중…</div>
      ) : groups.length === 0 ? (
        <div className="empty">유사 중복 후보가 없습니다 🎉</div>
      ) : (
        <div style={{ marginTop: 12 }}>
          {groups.map((g) => (
            <div className="review" key={g.key}>
              <div className="rtitle" style={{ marginBottom: 6 }}>
                병합 후보 {g.companies.length}곳
              </div>
              {g.companies.map((c) => (
                <label className="member" key={c.canonical_key} style={{ cursor: "pointer" }}>
                  <span>
                    <input
                      type="radio"
                      name={`keep-${g.key}`}
                      checked={keep[g.key] === c.canonical_key}
                      onChange={() => setKeep({ ...keep, [g.key]: c.canonical_key })}
                    />{" "}
                    <b>{c.display_name}</b>{" "}
                    {c.industry && <span className="badge b-ind">{c.industry}</span>}
                  </span>
                  <span className="hint">{c.contact_count}명 · {c.canonical_key}</span>
                </label>
              ))}
              <div className="ractions">
                <button
                  className="btn primary"
                  disabled={busy === g.key}
                  onClick={() => merge(g)}
                >
                  {busy === g.key ? "병합 중…" : "이 회사로 병합"}
                </button>
                <button
                  className="btn ghost"
                  onClick={async () => {
                    await api.dismissDuplicate(g.companies.map((c) => c.canonical_key));
                    setGroups((prev) => prev.filter((x) => x.key !== g.key));
                    onToast?.("병합 안 함으로 표시 (다시 추천되지 않음)", "success");
                  }}
                >
                  병합 안 함
                </button>
                <span className="hint">남길 회사: {keep[g.key]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12 }}>
        <button className="btn" onClick={onDone}>
          닫기
        </button>
      </div>
    </>
  );
}
