import { useEffect, useState } from "react";
import { api, apiAuth } from "../lib/api";
import type { AdminUser, AuthUser } from "../types";

export function AuthPanel({
  user,
  onUser,
  onClose,
}: {
  user: AuthUser | null;
  onUser: (user: AuthUser | null) => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState(apiAuth.get());
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");
  const canAdmin = user?.permissions.includes("settings.update");

  const refreshAdmin = async () => {
    if (!canAdmin) return;
    const res = await api.adminUsers();
    setUsers(res.items);
    setRoles(res.roles);
  };

  useEffect(() => {
    refreshAdmin().catch(() => undefined);
  }, [canAdmin]);

  const login = async () => {
    setMessage("로그인 중...");
    try {
      const res = apiKey.trim()
        ? await api.login({ api_key: apiKey.trim() })
        : await api.login({ email, password });
      apiAuth.set(res.token);
      onUser(res.user);
      setMessage("로그인 완료");
      await refreshAdmin();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const logout = () => {
    apiAuth.set("");
    onUser(null);
    setMessage("로그아웃했습니다");
  };

  const createUser = async () => {
    const nextEmail = window.prompt("사용자 이메일");
    if (!nextEmail) return;
    const role = window.prompt("역할(viewer/editor/manager/admin)", "viewer") || "viewer";
    const name = window.prompt("이름", "") || "";
    const nextPassword = window.prompt("초기 비밀번호(비워도 됨)", "") || "";
    await api.createAdminUser({ email: nextEmail, name, role, password: nextPassword });
    await refreshAdmin();
  };

  const changeRole = async (u: AdminUser, role: string) => {
    await api.updateAdminUser(u.id, { role });
    await refreshAdmin();
  };

  return (
    <div className="drawer">
      <div className="drawer-head">
        <h2>계정 · 권한 설정</h2>
        <button className="btn" onClick={onClose}>닫기</button>
      </div>

      <div className="field">
        <div className="k">현재 사용자</div>
        <div className="v">
          {user ? `${user.email} · ${user.role}` : "로그인 필요"}
        </div>
      </div>

      <div className="field">
        <div className="k">로그인</div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <input
          value={password}
          type="password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
        />
        <div className="hint" style={{ margin: "8px 0" }}>또는 운영 API 키</div>
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="RTM_ADMIN_API_KEY 또는 발급 토큰" />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn primary" onClick={login}>로그인</button>
          <button className="btn" onClick={logout}>로그아웃</button>
        </div>
        {message && <div className="hint" style={{ marginTop: 8 }}>{message}</div>}
      </div>

      {canAdmin && (
        <>
          <div className="field">
            <div className="k">사용자 관리</div>
            <button className="btn" onClick={createUser}>사용자 추가</button>
            {users.map((u) => (
              <div className="member" key={u.id}>
                <span>
                  <b>{u.email}</b> <span className="hint">{u.name || "-"}</span>
                </span>
                <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                  {Object.keys(roles).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="field">
            <div className="k">역할별 권한</div>
            {Object.entries(roles).map(([role, perms]) => (
              <div key={role} className="hint" style={{ marginBottom: 8 }}>
                <b>{role}</b>: {perms.join(", ")}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
