import { useEffect, useState } from "react";
import { api, type AuditBatch, type JobRun } from "../lib/api";

// 변경 이력 / 되돌리기: 사용자가 데이터에 가한 변경을 배치 단위로 원상복구.
export function AuditPanel({
  onToast,
  onChanged,
}: {
  onToast?: (msg: string, type: "loading" | "success" | "error") => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<AuditBatch[]>([]);
  const [jobs, setJobs] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [audit, jobRuns] = await Promise.all([api.listAudit(), api.listJobs()]);
      setItems(audit.items);
      setJobs(jobRuns.items);
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
              <th>사용자</th>
              <th>출처</th>
              <th>작업</th>
              <th>변경 수</th>
              <th>되돌리기</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.batch}>
                <td className="hint">{b.at}</td>
                <td className="hint">{b.actor_email || "-"}</td>
                <td className="hint">{b.source || "-"}</td>
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
      <h2 style={{ marginTop: 24 }}>작업 실행 이력</h2>
      {jobs.length === 0 ? (
        <div className="empty">기록된 작업 실행이 없습니다</div>
      ) : (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>시각</th>
              <th>작업</th>
              <th>상태</th>
              <th>사용자</th>
              <th>범위</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className="hint">{j.started_at}</td>
                <td>{j.job_type}</td>
                <td>{j.status}</td>
                <td className="hint">{j.actor_email || "-"}</td>
                <td className="hint">{j.target_scope || "-"}</td>
                <td className="hint">{j.error_message || j.result_summary || j.input_summary || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
