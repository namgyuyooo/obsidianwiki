import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ChatContext } from "../../chat/constants";
import { fetchWikiIndex, type WikiPageIndexItem } from "../../wiki/api/wikiApi";
import {
  fetchKnowledgePromotions,
  promoteKnowledge,
  type KnowledgePromotion,
  type KnowledgePromotionResult,
} from "../../knowledge/api/knowledgeApi";
import {
  generateIngestDigest,
  type IngestDigestPayload,
} from "../api/ingestApi";

type IngestWorkbenchProps = {
  chatContext: ChatContext;
};

type IngestPhase = "loading" | "idle" | "digesting" | "promoting" | "error";

const EMPTY_DIGEST: IngestDigestPayload = {};
const DEFAULT_INGEST_TEXT = "";
const PROMOTION_PREVIEW_LIMIT = 5200;

function digestObject(payload: IngestDigestPayload) {
  if (typeof payload.digest === "string") {
    try {
      return JSON.parse(payload.digest) as Record<string, unknown>;
    } catch {
      return { digest: payload.digest };
    }
  }
  if (payload.digest && typeof payload.digest === "object") return payload.digest as Record<string, unknown>;
  return payload as Record<string, unknown>;
}

function fieldText(value: unknown, fallback = "-") {
  if (Array.isArray(value)) return value.map(String).filter(Boolean).join("\n");
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return fallback;
}

function fieldList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const text = fieldText(value, "");
  return text ? text.split(/\n+/).map((line) => line.replace(/^\s*[-*]\s?/, "").trim()).filter(Boolean) : [];
}

function projectOptions(pages: WikiPageIndexItem[]) {
  const options = new Map<string, string>();
  pages
    .filter((page) => page.division === "project" || page.division === "account")
    .forEach((page) => {
      const key = page.projectKey || page.section || "";
      if (key) options.set(key, page.projectLabel || key);
    });
  return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1], "ko"));
}

function downloadMarkdown(path: string, markdown = "") {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = path.split("/").pop() || "knowledge-promotion.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

function DigestPanel({ digest }: { digest: IngestDigestPayload }) {
  const parsed = digestObject(digest);
  const evidence = fieldList(parsed["핵심_근거_후보"]);
  const numbers = fieldList(parsed["수치_후보"]);
  const conflicts = fieldList(parsed["충돌_후보"]);
  const actions = fieldList(parsed["다음_액션"]);

  return (
    <section className="aui-ingest-card aui-ingest-digest">
      <div className="aui-ingest-card-head">
        <span>Korean Digest</span>
        <strong>{digest.provider || fieldText(parsed.provider, "local")}</strong>
      </div>
      <div className="aui-ingest-verdict">
        <span>판정</span>
        <strong>{fieldText(parsed["판정"])}</strong>
        <p>{fieldText(parsed["보류_이유"] || parsed["위키_반영_초안"] || parsed["출처_초안"])}</p>
      </div>
      <div className="aui-ingest-grid">
        <article>
          <span>프로젝트 후보</span>
          <strong>{fieldText(parsed["프로젝트_후보"] || parsed["프로젝트_힌트"])}</strong>
        </article>
        <article>
          <span>출처 초안</span>
          <strong>{fieldText(parsed["출처_초안"])}</strong>
        </article>
      </div>
      <div className="aui-ingest-columns">
        <ListBlock title="핵심 근거 후보" items={evidence} />
        <ListBlock title="수치 후보" items={numbers} />
        <ListBlock title="충돌 후보" items={conflicts} />
        <ListBlock title="다음 액션" items={actions} />
      </div>
      {digest.upstreamStatus ? <p className="aui-ingest-warning">GLM 상태: {digest.upstreamStatus}</p> : null}
    </section>
  );
}

function ListBlock({ items, title }: { items: string[]; title: string }) {
  return (
    <article className="aui-ingest-list-block">
      <span>{title}</span>
      {items.length ? (
        <ul>
          {items.slice(0, 7).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : <p>후보 없음</p>}
    </article>
  );
}

export function IngestWorkbench({ chatContext }: IngestWorkbenchProps) {
  const [phase, setPhase] = useState<IngestPhase>("loading");
  const [message, setMessage] = useState("지식 주입 작업대를 불러오는 중입니다.");
  const [text, setText] = useState(DEFAULT_INGEST_TEXT);
  const [projectHint, setProjectHint] = useState("");
  const [digest, setDigest] = useState<IngestDigestPayload>(EMPTY_DIGEST);
  const [promotionResult, setPromotionResult] = useState<KnowledgePromotionResult | null>(null);
  const [promotions, setPromotions] = useState<KnowledgePromotion[]>([]);
  const [pages, setPages] = useState<WikiPageIndexItem[]>([]);
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const projects = useMemo(() => projectOptions(pages), [pages]);
  const selectedPromotion = promotions.find((item) => item.id === selectedPromotionId) || promotions[0] || null;

  const load = async () => {
    setPhase("loading");
    try {
      const [index, promotionPayload] = await Promise.all([
        fetchWikiIndex(chatContext.workspace),
        fetchKnowledgePromotions(),
      ]);
      setPages(index.pages || []);
      setPromotions(promotionPayload.promotions || []);
      setSelectedPromotionId((current) => current || promotionPayload.promotions?.[0]?.id || "");
      setPhase("idle");
      setMessage(`프로젝트 ${projectOptions(index.pages || []).length}개와 승격 후보 ${promotionPayload.promotions?.length || 0}개를 불러왔습니다.`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Ingest Workbench 로드 실패");
    }
  };

  useEffect(() => {
    load();
  }, [chatContext.workspace]);

  const runDigest = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim()) {
      setPhase("error");
      setMessage("다이제스트할 원문이 비어 있습니다.");
      return;
    }
    setPhase("digesting");
    try {
      const payload = await generateIngestDigest({ text, projectHint });
      setDigest(payload);
      setPhase("idle");
      setMessage("한국어 다이제스트를 생성했습니다.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "다이제스트 생성 실패");
    }
  };

  const runPromotion = async () => {
    if (!text.trim()) {
      setPhase("error");
      setMessage("승격할 원문이 비어 있습니다.");
      return;
    }
    setPhase("promoting");
    try {
      const result = await promoteKnowledge({
        content: text,
        projectHint,
        source: "assistant_ui_ingest",
        sourceProjectId: chatContext.projectId,
        tool: "evidence",
      });
      setPromotionResult(result);
      setPromotions((current) => [result.promotion, ...current].filter(Boolean) as KnowledgePromotion[]);
      setSelectedPromotionId(result.promotion?.id || "");
      setPhase("idle");
      setMessage(`승격 후보 Markdown 생성 완료: ${result.path || result.promotion?.path || "path 없음"}`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "승격 후보 생성 실패");
    }
  };

  const promotionPath = promotionResult?.path || promotionResult?.promotion?.path || "";
  const promotionMarkdown = promotionResult?.markdown || promotionResult?.promotion?.markdown || selectedPromotion?.markdown || "";

  return (
    <main className="aui-ingest-surface aui-work-surface">
      <section className="aui-ingest-hero aui-work-titlebar">
        <div>
          <span className="aui-kicker">wiki related / intake mailbox</span>
          <h1>지식 접수함</h1>
          <p>회의 메모, 파일 경로, Drive mirror 내용, 채팅 발췌를 위키 승격 후보로 만들기 전에 접수, 요약, 검토, 저장합니다.</p>
          <div className="aui-work-metrics">
            <span>{projects.length} projects</span>
            <span>{promotions.length} candidates</span>
            <span>{phase}</span>
            <span>{selectedPromotion ? "record selected" : "no selection"}</span>
          </div>
        </div>
        <aside className={`aui-ingest-live ${phase}`}>
          <strong>{phase}</strong>
          <span>{message}</span>
          <button onClick={load} type="button">새로고침</button>
        </aside>
      </section>

      <section className="aui-ingest-layout">
        <form className="aui-ingest-card aui-ingest-composer" onSubmit={runDigest}>
          <div className="aui-ingest-card-head">
            <span>Incoming record</span>
            <strong>{chatContext.workspace.toUpperCase()} workspace</strong>
          </div>
          <label>
            <span>프로젝트 힌트</span>
            <input
              list="ingest-project-options"
              value={projectHint}
              onChange={(event) => setProjectHint(event.target.value)}
              placeholder="프로젝트명, 고객사명, account key"
            />
            <datalist id="ingest-project-options">
              {projects.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </datalist>
          </label>
          <label>
            <span>원문 / 경로 / 메모</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="새 지식, 회의 메모, 파일 경로, Drive mirror path를 한국어로 붙여넣기"
            />
          </label>
          <div className="aui-ingest-actions">
            <button disabled={phase === "digesting" || phase === "promoting"} type="submit">한국어 다이제스트 생성</button>
            <button disabled={phase === "digesting" || phase === "promoting"} onClick={runPromotion} type="button">승격 후보 저장</button>
          </div>
        </form>

        <DigestPanel digest={digest} />

        <aside className="aui-ingest-card aui-ingest-promotions">
          <div className="aui-ingest-card-head">
            <span>Candidate mailbox</span>
            <strong>{promotions.length} saved</strong>
          </div>
          <div className="aui-ingest-promotion-list">
            {promotions.slice(0, 12).map((item) => (
              <button
                className={item.id === selectedPromotion?.id ? "active" : ""}
                key={item.id}
                onClick={() => setSelectedPromotionId(item.id)}
                type="button"
              >
                <strong>{item.projectHint || "미지정 프로젝트"}</strong>
                <span>{item.status || "candidate"} · {item.createdAt?.slice(0, 10) || "no date"}</span>
                <small>{item.path || item.id}</small>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="aui-ingest-card aui-ingest-result">
        <div className="aui-ingest-card-head">
          <span>Generated record</span>
          <strong>{promotionPath || selectedPromotion?.path || "승격 후보를 선택하세요"}</strong>
        </div>
        <div className="aui-ingest-result-actions">
          <button disabled={!promotionMarkdown} onClick={() => downloadMarkdown(promotionPath || selectedPromotion?.path || "", promotionMarkdown)} type="button">MD 다운로드</button>
          <button disabled={!selectedPromotion?.content} onClick={() => setText(selectedPromotion?.content || "")} type="button">원문 다시 불러오기</button>
        </div>
        <pre>{promotionMarkdown ? promotionMarkdown.slice(0, PROMOTION_PREVIEW_LIMIT) : "승격 후보를 저장하거나 최근 후보를 선택하면 Markdown preview가 표시됩니다."}</pre>
        {promotionResult?.paperclipAgent?.length ? (
          <p className="aui-ingest-warning">Paperclip 검증/위키화 후보 {promotionResult.paperclipAgent.length}건이 생성되었습니다. 실행 전 Paperclip Studio에서 승인하세요.</p>
        ) : null}
      </section>
    </main>
  );
}
