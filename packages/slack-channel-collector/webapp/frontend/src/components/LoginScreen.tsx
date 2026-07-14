import { FormEvent, useState } from "react";
import { api, apiAuth } from "../lib/api";
import type { AuthUser } from "../types";

export function LoginScreen({ onAuthenticated }: { onAuthenticated: (user: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [useApiKey, setUseApiKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = useApiKey
        ? await api.login({ api_key: apiKey.trim() })
        : await api.login({ email: email.trim(), password });
      apiAuth.set(result.token);
      onAuthenticated(result.user);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(
        message.includes("401")
          ? useApiKey
            ? "운영 API 키를 확인해 주세요."
            : "이메일 또는 비밀번호를 확인해 주세요."
          : "로그인 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-intro" aria-label="서비스 소개">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">R</span>
          <span>RTM</span>
        </div>
        <div className="login-intro-copy">
          <div className="login-eyebrow">Customer Intelligence</div>
          <h1>고객의 모든 신호를<br />하나의 흐름으로.</h1>
          <p>흩어진 고객 정보와 활동을 연결하고, 팀이 지금 해야 할 일을 선명하게 확인하세요.</p>
        </div>
        <div className="login-proof">
          <span className="login-proof-icon" aria-hidden="true">✓</span>
          <div><b>안전한 사내 운영 환경</b><small>권한에 따라 필요한 정보와 기능만 제공됩니다.</small></div>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={login}>
          <div className="login-heading">
            <span className="login-mobile-mark" aria-hidden="true">R</span>
            <h2>다시 만나서 반가워요</h2>
            <p>RTM 고객 DB에 로그인하세요.</p>
          </div>

          {!useApiKey ? (
            <div className="login-fields">
              <label>
                <span>이메일</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@rtm.ai"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </label>
              <label>
                <span>비밀번호</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  autoComplete="current-password"
                  required
                />
              </label>
            </div>
          ) : (
            <div className="login-fields">
              <label>
                <span>운영 API 키</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="발급받은 키를 입력하세요"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </label>
            </div>
          )}

          {error && <div className="login-error" role="alert">{error}</div>}

          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? <><span className="login-spinner" />로그인 중…</> : "로그인"}
          </button>

          <button
            className="login-switch"
            type="button"
            onClick={() => { setUseApiKey((value) => !value); setError(""); }}
          >
            {useApiKey ? "이메일로 로그인" : "운영 API 키로 로그인"}
          </button>
          <p className="login-help">계정 관련 문의는 시스템 관리자에게 연락해 주세요.</p>
        </form>
      </section>
    </main>
  );
}
