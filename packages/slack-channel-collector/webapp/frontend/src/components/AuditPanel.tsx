import { useEffect, useState } from "react";
import { api, type AuditBatch } from "../lib/api";

// 변경 이력 / 되돌리기: 사용자가 데이터에 가한 변경을 배치 단위로 원상복구.
export function AuditPanel({
  onToast,
  onChanged,
}: {
  onToast?: (msg: string, type: "loading" | "success" | "error") => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<AuditBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems((await api.listAudit()).items);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const undo = async (b: AuditBatch) => {
    setBusy(b.batch);
    onToast?.(`되돌리는 중… ${b.label}`, "loading");
    try {
      const r = await api.undoBatch(b.batch);
      onToast?.(`✅ 되돌림 — ${b.label} (${r.undone}건 복구)`, "success");
      await load();
      onChanged?.();
    } catch (e) {
      onToast?.("⚠ 되돌리기 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h2>변경 이력 · 되돌리기</h2>
      <div className="sub">사용자가 데이터에 가한 변경(회사 수정·병합·정합성 처리·리드/활동 추가 등)을 배치 단위로 원상복구합니다. (대량 슬랙 수집은 제외)</div>
      {loading ? (
        <div className="loading">불러오는 중…</div>
      ) : items.length === 0 ? (
        <div className="empty">기록된 변경이 없습니다</div>
      ) : (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>시각</th>
              <th>작업</th>
              <th>변경 수</th>
              <th>되돌리기</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.batch}>
                <td className="hint">{b.at}</td>
                <td>{b.label}</td>
                <td>{b.changes}</td>
                <td>
                  {b.undone ? (
                    <span className="hint">되돌림</span>
                  ) : (
                    <button className="btn" disabled={busy === b.batch} onClick={() => undo(b)}>
                      {busy === b.batch ? "복구 중…" : "되돌리기"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
