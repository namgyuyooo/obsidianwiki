import { useEffect, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import {
  fetchSpotlite,
  fetchSpotliteTemplates,
  refreshSpotlite,
  type SpotlitePayload,
  type SpotliteTemplatesPayload,
} from "../api/controlPlaneApi";

type SpotliteBoardProps = {
  chatContext: ChatContext;
};

const EMPTY_SPOTLITE: SpotlitePayload = {
  scope: "work",
  summary: {},
  analysis: [],
  today: [],
  week: [],
  risks: [],
  projects: [],
};

function shortList(items: string[] | undefined) {
  return (items || []).filter(Boolean).slice(0, 5);
}

export function SpotliteBoard({ chatContext }: SpotliteBoardProps) {
  const { notify } = useToastCenter();
  const [scope, setScope] = useState<"work" | "personal">("work");
  const [phase, setPhase] = useState("loading");
  const [message, setMessage] = useState("요약 화면을 불러오는 중입니다.");
  const [spotlite, setSpotlite] = useState<SpotlitePayload>(EMPTY_SPOTLITE);
  const [templates, setTemplates] = useState<SpotliteTemplatesPayload>({ templates: [] });

  const load = async (nextScope = scope) => {
    setPhase("loading");
    try {
      const [summary, nextTemplates] = await Promise.all([
        fetchSpotlite(nextScope),
        fetchSpotliteTemplates(),
      ]);
      setSpotlite(summary);
      setTemplates(nextTemplates);
      setPhase("ready");
      setMessage("요약 화면 동기화 완료.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "요약 화면 로드 실패");
    }
  };

  useEffect(() => {
    load(scope);
  }, [scope]);

  const refreshDigest = async () => {
    setPhase("running");
    notify("running", "요약 갱신 시작", scope, { durationMs: 2200 });
    try {
      const result = await refreshSpotlite(scope);
      setSpotlite(result);
      setPhase("ready");
      setMessage("요약 갱신 완료.");
      notify("success", "요약 갱신 완료", scope);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "요약 갱신 실패");
      notify("error", "요약 갱신 실패", error instanceof Error ? error.message : "요약 갱신 실패");
    }
  };

  return (
    <main className="aui-ops-surface">
      <section className="aui-ops-hero">
        <div>
          <span className="aui-kicker">요약</span>
          <h1>요약</h1>
          <p>{chatContext.workspace.toUpperCase()} 기준 진행 중 프로젝트 신호를 오늘, 이번주, 리스크 중심으로 보여줍니다.</p>
        </div>
        <aside className={`aui-ops-live ${phase}`}>
          <strong>{phase}</strong>
          <span>{message}</span>
          <div className="aui-ops-actions">
            <button className={scope === "work" ? "active" : ""} onClick={() => setScope("work")} type="button">work</button>
            <button className={scope === "personal" ? "active" : ""} onClick={() => setScope("personal")} type="button">personal</button>
            <button onClick={refreshDigest} type="button">요약 갱신</button>
          </div>
        </aside>
      </section>

      <section className="aui-ops-grid">
        <article className="aui-ops-card aui-ops-card-span-2">
          <div className="aui-ops-card-head">
            <span>Digest</span>
            <strong>{spotlite.digest?.provider || "local"} · {spotlite.generatedAt?.slice(0, 16).replace("T", " ") || "-"}</strong>
          </div>
          <pre className="aui-ops-markdown">{spotlite.digest?.markdown || "아직 생성된 digest가 없습니다."}</pre>
          <div className="aui-ops-chipline">
            {shortList(spotlite.digest?.todayPriorities).map((item) => <span key={item}>{item}</span>)}
          </div>
        </article>

        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>Today</span>
            <strong>{spotlite.summary?.today || 0}</strong>
          </div>
          <div className="aui-ops-list">
            {(spotlite.today || []).slice(0, 8).map((item, index) => (
              <article className="aui-ops-log-card" key={`${item.path}-${index}`}>
                <strong>{item.project || item.title || "-"}</strong>
                <span>{item.line || "-"}</span>
                <small>{item.path || "-"}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>This week</span>
            <strong>{spotlite.summary?.week || 0}</strong>
          </div>
          <div className="aui-ops-list">
            {(spotlite.week || []).slice(0, 8).map((item, index) => (
              <article className="aui-ops-log-card" key={`${item.path}-${index}`}>
                <strong>{item.project || item.title || "-"}</strong>
                <span>{item.line || "-"}</span>
                <small>{item.kind || "signal"}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>Risks</span>
            <strong>{spotlite.summary?.risks || 0}</strong>
          </div>
          <div className="aui-ops-list">
            {(spotlite.risks || []).slice(0, 8).map((item, index) => (
              <article className="aui-ops-log-card" key={`${item.path}-${index}`}>
                <strong>{item.project || item.title || "-"}</strong>
                <span>{item.line || "-"}</span>
                <small>{item.path || "-"}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="aui-ops-card">
          <div className="aui-ops-card-head">
            <span>Project heat</span>
            <strong>{spotlite.summary?.projects || 0}</strong>
          </div>
          <div className="aui-ops-list">
            {(spotlite.projects || []).slice(0, 8).map((item, index) => (
              <article className="aui-ops-log-card" key={`${item.project}-${index}`}>
                <strong>{item.project || "-"}</strong>
                <span>signals {item.count || 0} · risks {item.risks || 0} · actions {item.actions || 0}</span>
                <small>{item.latestPath || "-"}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="aui-ops-card aui-ops-card-span-2">
          <div className="aui-ops-card-head">
            <span>Templates</span>
            <strong>{templates.templates.length} assets</strong>
          </div>
          <div className="aui-ops-list">
            {templates.templates.map((template) => (
              <article className="aui-ops-log-card" key={template.id}>
                <strong>{template.title}</strong>
                <span>{template.description || "-"}</span>
                <small>{template.path || "-"}</small>
              </article>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
