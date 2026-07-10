import { useEffect, useState } from "react";
import { api, type DuplicateGroup } from "../lib/api";

// 유사 중복 회사 병합: 그룹별로 남길 회사를 고르고 나머지를 병합.
export function DuplicatesPanel({ onDone }: { onDone: () => void }) {
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
    try {
      await api.mergeCompanies(keepKey, mergeKeys);
      setGroups((prev) => prev.filter((x) => x.key !== g.key));
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
