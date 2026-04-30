import type { ChatContext } from "../../chat/constants";
import {
  BrandCard,
  PanelCard,
  RailButton,
  StageHeader,
  StatGrid,
  StatusLine,
  WorkspaceSurface,
} from "../../../components/surface/Surface";
import { useDecisionDeck } from "../hooks/useDecisionDeck";

type DecisionDeckProps = {
  chatContext: ChatContext;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  approved: "승인",
  hold: "보류",
  held: "보류",
  investigate: "추가조사",
  needs_investigation: "추가조사",
  rejected: "반려",
};

const DOC_PREVIEW_LIMIT = 4200;

function shortText(value = "", limit = 120) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function actionLabel(action = "") {
  if (action === "approved" || action === "approve") return "승인";
  if (action === "needs_investigation" || action === "investigate") return "추가조사";
  if (action === "rejected" || action === "reject") return "반려";
  return "보류";
}

export function DecisionDeck({ chatContext }: DecisionDeckProps) {
  const deck = useDecisionDeck(chatContext.workspace);
  const item = deck.activeItem;
  const currentPosition = deck.activeIndex >= 0 ? `${deck.activeIndex + 1} / ${deck.pendingItems.length}` : "0 / 0";
  const stats = [
    { label: "Pending", value: deck.summary.pending },
    { label: "Approved", value: deck.summary.approved },
    { label: "Held", value: deck.summary.held },
    { label: "Total", value: deck.summary.total },
  ];
  const busy = ["loading", "saving", "thinking"].includes(deck.status.phase);
  const compareBusy = ["loading", "merging", "saving"].includes(deck.compare.phase);
  const scanBusy = ["scanning", "enqueuing"].includes(deck.mergeScan.phase);
  const integrationBusy = ["scanning", "enqueuing"].includes(deck.integrationScan.phase);
  const recommendationReady = Boolean(deck.inference.trim());

  return (
    <WorkspaceSurface variant="decision">
      <section className="aui-brand-panel" aria-label="decision queue rail">
        <BrandCard
          eyebrow="decision mailbox"
          title="판정 작업함"
          description="충돌, 미확정 사실, 버전 차이를 업무 큐로 접수하고 GLM 보조 판정, 병합, 승인 로그까지 처리합니다."
        />
        <StatGrid stats={stats} />
        <PanelCard eyebrow="Similarity trigger" title="병합 후보 스캔">
          <p className="aui-decision-empty-note">
            전체 위키의 주요 태그, 키워드, 그래프맵 연결을 비교해 중복/충돌 가능 문서와 병합 전략을 찾습니다.
          </p>
          <button className="aui-wide-action" disabled={scanBusy} onClick={deck.scanMergeCandidates} type="button">
            유사도/그래프 병합 후보 찾기
          </button>
          <button className="aui-wide-action" disabled={scanBusy} onClick={deck.scanAndEnqueueTopMergeCandidates} type="button">
            상위 5건 큐 등록
          </button>
          <StatusLine phase={deck.mergeScan.phase} message={deck.mergeScan.message} />
          <div className="aui-decision-history">
            {(deck.mergeScan.snapshot?.candidates || []).slice(0, 6).map((candidate) => (
              <article key={candidate.id}>
                <strong>{candidate.primary.title || candidate.primary.path}</strong>
                <span>
                  score {candidate.score} · {candidate.conflictRisk ? "충돌 우선" : "연결/정리"} · {candidate.graphLinked ? "graph" : "keyword"}
                </span>
                <small>{candidate.secondary.title || candidate.secondary.path}</small>
                <small>{candidate.mergePlan?.changeMemo || candidate.reason?.join(", ")}</small>
                <button className="aui-wide-action" disabled={scanBusy} onClick={() => deck.enqueueMergeCandidate(candidate)} type="button">
                  Decision Queue 등록
                </button>
              </article>
            ))}
          </div>
        </PanelCard>
        <PanelCard eyebrow="Workspace grouping" title="성격별 통합 후보">
          <p className="aui-decision-empty-note">
            프로젝트, Account, Slack 수집형 위키를 고객/주제/문서 성격 기준으로 묶어 승인 게이트용 통합 후보를 찾습니다.
          </p>
          <button className="aui-wide-action" disabled={integrationBusy} onClick={deck.scanIntegrationCandidates} type="button">
            성격별 통합 후보 스캔
          </button>
          <button className="aui-wide-action" disabled={integrationBusy} onClick={deck.scanAndEnqueueTopIntegrationCandidates} type="button">
            상위 5건 큐 등록
          </button>
          <StatusLine phase={deck.integrationScan.phase} message={deck.integrationScan.message} />
          <div className="aui-decision-history">
            {(deck.integrationScan.snapshot?.candidates || []).slice(0, 6).map((candidate) => (
              <article key={candidate.id}>
                <strong>{candidate.groupKey}</strong>
                <span>
                  {candidate.recommendedStrategy} · {candidate.conflictRisk ? "충돌 게이트" : "append only"} · score {Math.round((candidate.similarityScore || 0) * 100)}
                </span>
                <small>{candidate.relatedWikis.map((item) => item.projectLabel || item.projectKey).join(", ")}</small>
                <small>{candidate.changeTargets?.slice(0, 2).join(" / ") || candidate.reason?.join(", ")}</small>
                <button className="aui-wide-action" disabled={integrationBusy} onClick={() => deck.enqueueIntegrationCandidate(candidate)} type="button">
                  Decision Queue 등록
                </button>
              </article>
            ))}
          </div>
        </PanelCard>
        <PanelCard eyebrow="Pending queue" title={`${deck.pendingItems.length}건`}>
          <div className="aui-project-list">
            {deck.pendingItems.map((queueItem) => (
              <RailButton
                active={queueItem.id === item?.id}
                detail={queueItem.content || queueItem.path || "내용 없음"}
                key={queueItem.id}
                onClick={() => deck.focusItem(queueItem.id)}
                title={queueItem.projectLabel || queueItem.projectKey || queueItem.title || "Decision"}
              />
            ))}
            {!deck.pendingItems.length ? <p className="aui-decision-empty-note">대기 중인 카드가 없습니다.</p> : null}
          </div>
          <button className="aui-wide-action" onClick={() => deck.reload()} type="button">큐 새로고침</button>
        </PanelCard>

        <PanelCard eyebrow="Audit trail" title={`${deck.resolvedItems.length}건`}>
          <div className="aui-decision-history">
            {deck.resolvedItems.slice(0, 8).map((historyItem) => (
              <article key={historyItem.id}>
                <strong>{historyItem.title || historyItem.id}</strong>
                <span>{actionLabel(historyItem.status)} · {historyItem.resolvedAt?.slice(0, 10) || "처리일 없음"}</span>
                <small>{shortText(historyItem.appliedPath || historyItem.note || historyItem.content || "감사 메모 없음", 150)}</small>
              </article>
            ))}
            {!deck.resolvedItems.length ? <p className="aui-decision-empty-note">아직 처리 이력이 없습니다.</p> : null}
          </div>
        </PanelCard>
      </section>

      <section className="aui-chat-stage aui-decision-stage" aria-label="decision card">
        <StageHeader
          eyebrow="decision record body"
          meta={currentPosition}
          title={item?.projectLabel || item?.projectKey || "판정할 카드 없음"}
        />

        <div className="aui-decision-card-wrap">
          {item ? (
            <article className="aui-decision-card">
              <div className="aui-decision-card-meta">
                <span>{STATUS_LABELS[item.status] || item.status}</span>
                <span>{item.kind || item.sourceType || "signal"}</span>
                <span>{item.createdAt?.slice(0, 10) || "날짜 없음"}</span>
              </div>
              <h2>{item.title || "Conflict Register"}</h2>
              <div className="aui-decision-card-grid">
                <section>
                  <span>접수된 판단 내용</span>
                  {deck.activeContentItems.length ? (
                    <ul>
                      {deck.activeContentItems.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  ) : (
                    <p>{item.content || "카드 내용이 비어 있습니다."}</p>
                  )}
                </section>
                <section>
                  <span>업무 반영 대상</span>
                  <strong>{deck.activeIsDeletion ? "문서 삭제 + deletion audit" : deck.activeIsIntegration ? "다중 승인 반영 대상" : "Conflict_Register.md"}</strong>
                  <p>
                    {deck.activeIsDeletion
                      ? "승인 시 보호 규칙을 다시 확인한 뒤 실제 문서를 삭제하고 감사 로그를 남깁니다."
                      : deck.activeIsIntegration
                        ? "승인 시 추천 전략에 맞는 hub/Status/Change_Log append만 수행합니다. 자동 병합과 원문 삭제는 하지 않습니다."
                        : "승인 시 이 프로젝트의 충돌/정합성 기록에 감사 메모와 함께 반영됩니다."}
                  </p>
                </section>
              </div>
              <div className="aui-decision-path-stack">
                {item.path ? <code>source: {item.path}</code> : <code>source: 경로 없음</code>}
                {deck.activeTargetPath ? <code>target: {deck.activeTargetPath}</code> : <code>target: 프로젝트 경로 계산 필요</code>}
              </div>
              <div className="aui-decision-resolution-note">
                <label className="aui-field">
                  <span>처리 메모 / 감사 로그</span>
                  <textarea
                    rows={4}
                    value={deck.resolutionNote}
                    onChange={(event) => deck.setResolutionNote(event.target.value)}
                    placeholder="승인/보류/추가조사 사유를 남기면 Decision Queue audit에 함께 저장됩니다."
                  />
                </label>
              </div>
            </article>
          ) : (
            <article className="aui-decision-card empty">
              <h2>판정 대기 카드 없음</h2>
              <p>현재 workspace에는 pending Decision Queue 항목이 없습니다.</p>
            </article>
          )}

          <div className="aui-decision-actions">
            <button className="aui-wide-action" disabled={busy} onClick={() => deck.move(-1)} type="button">이전</button>
            <button className="aui-wide-action" disabled={busy || !item} onClick={() => deck.resolveActive("hold")} type="button">보류</button>
            <button className="aui-wide-action" disabled={busy || !item} onClick={() => deck.resolveActive("investigate")} type="button">추가 조사</button>
            <button className="aui-wide-action" disabled={busy || !item} onClick={() => deck.resolveActive("approve")} type="button">승인 반영</button>
            <button className="aui-wide-action" disabled={busy} onClick={() => deck.move(1)} type="button">다음</button>
          </div>
        </div>
      </section>

      <aside className="aui-context-panel" aria-label="decision assistant">
        <PanelCard eyebrow="LLM directive" title="작업함 안에서 판정">
          <label className="aui-field">
            <span>처리 지시</span>
            <textarea
              rows={5}
              value={deck.directive}
              onChange={(event) => deck.setDirective(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  deck.runInference();
                }
              }}
            />
          </label>
          <div className="aui-decision-compare-actions">
            <button className="aui-wide-action" disabled={busy || !item} onClick={deck.runInference} type="button">GLM 판정 실행</button>
            <button className="aui-wide-action" disabled={busy || !recommendationReady} onClick={deck.applyInferenceRecommendation} type="button">추천대로 반영</button>
          </div>
          <StatusLine phase={deck.status.phase} message={deck.status.message} />
        </PanelCard>

        <PanelCard eyebrow="Inference" title="판정 보조 결과">
          <div className="aui-decision-inference">
            {deck.inference || "아직 실행된 GLM 판정이 없습니다."}
          </div>
        </PanelCard>

        <PanelCard eyebrow="Evidence Compare" title={deck.activeIsConflict ? "충돌 비교" : "근거 확인"}>
          <div className="aui-decision-compare-actions">
            <button className="aui-wide-action" disabled={compareBusy || !item} onClick={deck.loadComparison} type="button">근거/대상 불러오기</button>
            <button className="aui-wide-action" disabled={compareBusy || !item} onClick={deck.requestMergeSuggestion} type="button">GLM 병합안</button>
          </div>
          <StatusLine phase={deck.compare.phase} message={deck.compare.message} />
          <div className="aui-decision-path-grid">
            <code>{deck.compare.sourcePath || item?.path || "source path 없음"}</code>
            <code>{deck.compare.targetPath || deck.activeTargetPath || "target path 없음"}</code>
          </div>
          <section className="aui-decision-compare-grid">
            <article>
              <span>Source Evidence</span>
              <pre>{deck.compare.sourceMarkdown.slice(0, DOC_PREVIEW_LIMIT) || "근거 문서를 아직 불러오지 않았습니다."}</pre>
            </article>
            <article>
              <span>Target / Edit</span>
              <textarea
                disabled={!deck.compare.targetPath || compareBusy}
                onChange={(event) => deck.setCompareTargetMarkdown(event.target.value)}
                placeholder="Conflict_Register.md 내용을 불러오거나 병합 초안을 적용하면 여기서 편집합니다."
                rows={10}
                value={deck.compare.targetMarkdown}
              />
            </article>
          </section>
          {deck.compare.suggestion ? (
            <section className="aui-decision-merge-card">
              <strong>{deck.compare.suggestion.summary || "병합안 요약 없음"}</strong>
              {deck.compare.suggestion.conflictingPoints?.length ? (
                <ul>
                  {deck.compare.suggestion.conflictingPoints.map((line) => <li key={line}>{line}</li>)}
                </ul>
              ) : null}
              {deck.compare.suggestion.caution ? <p>{deck.compare.suggestion.caution}</p> : null}
            </section>
          ) : null}
          <div className="aui-decision-compare-actions">
            <button className="aui-wide-action" disabled={compareBusy || !deck.compare.suggestion?.mergedMarkdown} onClick={deck.applyMergeSuggestion} type="button">병합안 적용</button>
            <button className="aui-wide-action" disabled={compareBusy || !deck.compare.targetPath} onClick={deck.saveCompareTarget} type="button">문서 저장</button>
            <button className="aui-wide-action" disabled={compareBusy || !deck.compare.targetPath || !item} onClick={deck.saveCompareAndApprove} type="button">저장 후 승인</button>
          </div>
        </PanelCard>
      </aside>
    </WorkspaceSurface>
  );
}
