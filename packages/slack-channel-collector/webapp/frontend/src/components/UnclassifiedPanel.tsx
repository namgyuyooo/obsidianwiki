import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Item {
  id: number;
  dt: string;
  text: string;
  suggestion: string;
}

// (미분류) 처리 화면: 원문 + 자동 감지 회사 제안 + 원클릭 지정.
export function UnclassifiedPanel({
  glmConfigured,
  onToast,
  onChanged,
}: {
  glmConfigured: boolean;
  onToast?: (msg: string, type: "loading" | "success" | "error") => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [vals, setVals] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [glmBusy, setGlmBusy] = useState(false);
  const [glmElapsed, setGlmElapsed] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.unclassified();
      setItems(r.items);
      const v: Record<number, string> = {};
      r.items.forEach((it) => (v[it.id] = it.suggestion));
      setVals(v);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!glmBusy) return;
    const startedAt = Date.now();
    setGlmElapsed(0);
    const timer = window.setInterval(
      () => setGlmElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000
    );
    return () => window.clearInterval(timer);
  }, [glmBusy]);

  const assign = async (it: Item) => {
    const co = (vals[it.id] || "").trim();
    if (!co) return;
    setBusy(it.id);
    onToast?.(`재분류 중… → ${co}`, "loading");
    try {
      await api.reassignActivity(it.id, co);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      onToast?.(`✅ '${co}'로 지정`, "success");
      onChanged?.();
    } catch (e) {
      onToast?.("⚠ 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setBusy(null);
    }
  };

  const glmBatch = async () => {
    if (glmBusy) return;
    setGlmBusy(true);
    onToast?.("✨ GLM 자동 재분류 중…", "loading");
    try {
      const r = await api.reclassifyGlm("(미분류)");
      onToast?.(r.ok ? `✅ ${r.moved}건 재분류` : "ⓘ " + (r.message || "GLM 필요"), r.ok ? "success" : "error");
      await load();
      onChanged?.();
    } finally {
      setGlmBusy(false);
    }
  };

  return (
    <>
      <h2>미분류 처리 {items.length > 0 && <span className="badge b-status">{items.length}</span>}</h2>
      <div className="sub">
        회사가 특정되지 않은 활동입니다. 원문을 보고 회사를 지정하세요. 원문에 이미 등록된 회사명이
        있으면 자동으로 제안됩니다{glmConfigured ? " (또는 GLM 자동 재분류)" : ""}.
      </div>
      <div className="controls" style={{ marginTop: 8 }}>
        <button className="btn" onClick={load}>새로고침</button>
        {glmConfigured && (
          <button className="btn" disabled={glmBusy} onClick={glmBatch}>
            {glmBusy ? <><span className="inline-spinner dark" /> 원문 분석 중 · {glmElapsed}초</> : "✨ GLM 자동 재분류"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className="empty">미분류 활동이 없습니다 🎉</div>
      ) : (
        <div>
          {items.map((it) => (
            <div className="review" key={it.id}>
              <div className="rmeta">{it.dt}</div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, margin: "4px 0" }}>{it.text}</div>
              <div className="ractions">
                {it.suggestion && (
                  <button className="btn ghost" onClick={() => setVals({ ...vals, [it.id]: it.suggestion })}>
                    제안: {it.suggestion}
                  </button>
                )}
                <input
                  type="text"
                  placeholder="회사명 지정"
                  value={vals[it.id] || ""}
                  onChange={(e) => setVals({ ...vals, [it.id]: e.target.value })}
                  style={{ minWidth: 160 }}
                />
                <button className="btn primary" disabled={busy === it.id || !(vals[it.id] || "").trim()} onClick={() => assign(it)}>
                  {busy === it.id ? "지정 중…" : "이 회사로 지정"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
