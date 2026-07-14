import { FormEvent, useEffect, useState } from "react";
import { api, apiAuth } from "../lib/api";
import type { AdminUser, AuthUser } from "../types";

const ROLE_LABELS: Record<string, string> = {
  viewer: "조회자",
  editor: "편집자",
  manager: "매니저",
  admin: "관리자",
  system: "시스템",
};

const PERMISSION_LABELS: Record<string, string> = {
  "data.read": "데이터 조회",
  "data.write": "데이터 편집",
  "data.delete": "데이터 삭제",
  "slack.raw.read": "Slack 원문 조회",
  "slack.raw.apply": "Slack 원문 반영",
  "sync.run": "Slack 동기화",
  "sync.backfill": "전체 내역 수집",
  "sync.configure": "동기화 설정",
  "ai.infer.one": "AI 단건 추론",
  "ai.infer.batch": "AI 일괄 추론",
  "ai.vision.ocr": "명함 OCR",
  "ai.embedding.rebuild": "임베딩 재구축",
  "review.resolve": "정합성 검토",
  "audit.read": "변경 이력 조회",
  "audit.rollback": "변경 되돌리기",
  "settings.update": "사용자·설정 관리",
};

export function AuthPanel({
  user,
  onUser,
  onClose,
}: {
  user: AuthUser | null;
  onUser: (user: AuthUser | null) => void;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState({ email: "", name: "", role: "viewer", password: "" });
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdmin = Boolean(user?.permissions.includes("settings.update"));

  const refreshAdmin = async () => {
    if (!canAdmin) return;
    const result = await api.adminUsers();
    setUsers(result.items);
    setRoles(result.roles);
  };

  useEffect(() => {
    refreshAdmin().catch(() => setMessage("사용자 목록을 불러오지 못했습니다."));
  }, [canAdmin]);

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refreshAdmin();
      setMessage(success);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setMessage(detail.includes("409") ? "이미 등록된 이메일입니다." : `처리하지 못했습니다: ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const createUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.password.length < 8) {
      setMessage("초기 비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    run(async () => {
      await api.createAdminUser(form);
      setForm({ email: "", name: "", role: "viewer", password: "" });
    }, `${form.name || form.email} 계정을 추가했습니다.`);
  };

  const updateUser = (target: AdminUser, patch: Partial<AdminUser> & { password?: string }, success: string) =>
    run(() => api.updateAdminUser(target.id, patch).then(() => undefined), success);

  const resetUserPassword = (target: AdminUser) => {
    if (resetPassword.length < 8) {
      setMessage("새 비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    updateUser(target, { password: resetPassword }, `${target.name || target.email}의 비밀번호를 변경했습니다.`)
      .then(() => { setResetUserId(null); setResetPassword(""); });
  };

  const logout = () => {
    apiAuth.set("");
    onUser(null);
  };

  const assignableRoles = Object.keys(roles).filter((role) => role !== "system");

  const isError = message.includes("못했습니다") || message.includes("이상") || message.includes("등록된") || message.includes("실패");

  return (
    <>
      <div className="drawer-head">
        <div>
          <h2>사용자 · 권한 관리</h2>
          <p className="sub">계정을 추가하고 역할별 접근 범위를 관리합니다.</p>
        </div>
        <button className="btn" onClick={onClose}>닫기</button>
      </div>

      <div className="account-summary">
        <div className="account-avatar">{(user?.email || "R").slice(0, 1).toUpperCase()}</div>
        <div><b>{user?.email}</b><span>{ROLE_LABELS[user?.role || ""] || user?.role}</span></div>
        <button className="btn ghost" onClick={logout}>로그아웃</button>
      </div>

      {!canAdmin ? (
        <div className="admin-notice">관리자 권한이 있는 사용자만 계정과 권한을 변경할 수 있습니다.</div>
      ) : (
        <>
          <section className="admin-section">
            <div className="admin-section-head"><div><h3>새 사용자 추가</h3><p>초기 로그인에 사용할 정보를 입력하세요.</p></div></div>
            <form className="user-create-form" onSubmit={createUser}>
              <label><span>이름</span><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="홍길동" required /></label>
              <label><span>이메일(아이디)</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@rtm.ai" required /></label>
              <label><span>초기 비밀번호</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="8자 이상" minLength={8} autoComplete="new-password" required /></label>
              <label><span>역할</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{assignableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>)}</select></label>
              <button className="btn primary" type="submit" disabled={busy}>사용자 추가</button>
            </form>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><div><h3>사용자 목록</h3><p>총 {users.filter((item) => item.role !== "system").length}명</p></div><button className="btn ghost" onClick={() => refreshAdmin()} disabled={busy}>새로고침</button></div>
            <div className="user-list">
              {users.map((target) => {
                const isSystem = target.role === "system";
                const isSelf = target.id === user?.id;
                return (
                  <div className={`user-row ${target.status !== "active" ? "inactive" : ""}`} key={target.id}>
                    <div className="user-avatar">{(target.name || target.email).slice(0, 1).toUpperCase()}</div>
                    <div className="user-identity"><b>{target.name || "이름 없음"}{isSelf && <em>나</em>}</b><span>{target.email}</span><small>{target.last_login_at ? `최근 로그인 ${target.last_login_at}` : "로그인 기록 없음"}</small></div>
                    <div className="user-actions">
                      <select value={target.role} disabled={busy || isSystem} onChange={(e) => updateUser(target, { role: e.target.value }, "역할을 변경했습니다.")}>{isSystem && <option value="system">시스템</option>}{assignableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>)}</select>
                      {!isSystem && <button className="btn" disabled={busy || isSelf} onClick={() => updateUser(target, { status: target.status === "active" ? "disabled" : "active" }, target.status === "active" ? "계정을 비활성화했습니다." : "계정을 활성화했습니다.")}>{target.status === "active" ? "비활성화" : "활성화"}</button>}
                      {!isSystem && <button className="btn" disabled={busy} onClick={() => { setResetUserId(resetUserId === target.id ? null : target.id); setResetPassword(""); }}>비밀번호 변경</button>}
                    </div>
                    {resetUserId === target.id && <div className="password-reset"><input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="새 비밀번호 8자 이상" autoComplete="new-password" /><button className="btn primary" disabled={busy} onClick={() => resetUserPassword(target)}>저장</button><button className="btn" onClick={() => setResetUserId(null)}>취소</button></div>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head"><div><h3>역할별 권한</h3><p>역할을 선택하면 아래 권한이 일괄 적용됩니다.</p></div></div>
            <div className="role-grid">{Object.entries(roles).filter(([role]) => role !== "system").map(([role, permissions]) => <div className="role-card" key={role}><div className="role-card-head"><b>{ROLE_LABELS[role] || role}</b><span>{permissions.length}개 권한</span></div><div className="permission-list">{permissions.map((permission) => <span key={permission}>✓ {PERMISSION_LABELS[permission] || permission}</span>)}</div></div>)}</div>
          </section>
        </>
      )}

      {message && <div className={`admin-message ${isError ? "error" : "success"}`} role="status">{message}</div>}
    </>
  );
}
