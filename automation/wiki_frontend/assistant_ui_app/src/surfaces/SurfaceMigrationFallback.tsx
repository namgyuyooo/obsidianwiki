import type { SurfaceDefinition } from "./surfaceRegistry";

type SurfaceMigrationFallbackProps = {
  surface: SurfaceDefinition;
};

function legacyFallbackHref(surface: SurfaceDefinition) {
  return `/?legacy=1${surface.legacyHash || ""}`;
}

function statusLabel(status: SurfaceDefinition["status"]) {
  if (status === "live") return "React surface active";
  if (status === "scaffold") return "React scaffold";
  return "Legacy fallback required";
}

export function SurfaceMigrationFallback({ surface }: SurfaceMigrationFallbackProps) {
  return (
    <main className="aui-migration-surface">
      <section className="aui-migration-hero">
        <div>
          <span className="aui-kicker">{surface.primary} / migration surface</span>
          <h1>{surface.label}</h1>
          <p>{surface.description}</p>
        </div>
        <div className={`aui-migration-status ${surface.status}`}>
          <span>{statusLabel(surface.status)}</span>
          <strong>{surface.densityPattern}</strong>
        </div>
      </section>

      <section className="aui-migration-grid">
        <article className="aui-migration-card">
          <span>Migration rule</span>
          <h2>새 프론트 기준으로 자리 고정</h2>
          <p>
            이 surface는 assistant-ui 앱의 정식 라우트로 등록되었습니다. 기능 parity가
            완료되기 전까지는 legacy cockpit을 fallback으로 연결합니다.
          </p>
          {surface.legacyHash ? (
            <a className="aui-migration-link" href={legacyFallbackHref(surface)}>
              Legacy full cockpit 열기
            </a>
          ) : null}
        </article>

        <article className="aui-migration-card">
          <span>Required endpoints</span>
          <h2>연결해야 할 API</h2>
          <ul className="aui-endpoint-list">
            {surface.requiredEndpoints.map((endpoint) => (
              <li key={endpoint}>{endpoint}</li>
            ))}
          </ul>
        </article>

        <article className="aui-migration-card">
          <span>Acceptance</span>
          <h2>완료 기준</h2>
          <p>
            요약 카드가 아니라 이 surface의 원래 업무 흐름, 큐/로그/상태/실행 버튼,
            근거 preview가 React 안에서 동작해야 legacy fallback을 제거합니다.
          </p>
        </article>
      </section>
    </main>
  );
}
