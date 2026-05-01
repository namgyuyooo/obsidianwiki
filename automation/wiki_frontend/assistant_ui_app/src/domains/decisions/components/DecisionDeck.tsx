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

function strategyLabel(strategy = "") {
  return {
    link_only: "상호 링크 추가",
    promote_to_new_project: "새 canonical project 승격",
    promote_to_common: "Common 운영 지식 승격",
    promote_to_shared: "Shared 재사용 자산 승격",
    keep_separate_project: "별도 project 유지",
    account_rollup: "Account rollup",
    hold_for_review: "추가 검토 보류",
    decision_merge: "승인 게이트 유지",
    evidence_index_merge: "Raw evidence 연동",
    status_rollup: "상태 집계",
    do_not_merge: "병합 금지",
  }[strategy] || strategy || "전략 미지정";
}

export function DecisionDeck({ chatContext }: DecisionDeckProps) {
  const deck = useDecisionDeck(chatContext.workspace);
  const item = deck.activeItem;
  const currentPosition = deck.activeIndex >= 0 ? `${deck.activeIndex + 1} / ${deck.filteredPendingItems.length}` : "0 / 0";
  const stats = [
    { label: "Pending", value: deck.summary.pending },
    { label: "Approved", value: deck.summary.approved },
    { label: "Held", value: deck.summary.held },
    { label: "Visible", value: deck.filteredPendingItems.length },
  ];
  const busy = ["loading", "saving", "thinking"].includes(deck.status.phase);
  const compareBusy = ["loading", "merging", "saving"].includes(deck.compare.phase);
  const scanBusy = ["scanning", "enqueuing"].includes(deck.mergeScan.phase);
  const integrationBusy = ["scanning", "enqueuing"].includes(deck.integrationScan.phase);
  const recommendationReady = Boolean(deck.inference.trim());
  const strategyApprovalLabel = deck.selectedStrategy === "promote_to_new_project" ? "새 project 승격 승인" : "선택 전략 승인";
  const activeScopeLabel = deck.pendingFilterScopes.find((bucket) => bucket.key === deck.queueScope)?.label || "전체 큐";
  const activeInboxLabel = deck.pendingValidationBuckets.find((bucket) => bucket.key === deck.queueInboxFilter)?.label || "전체 inbox";
  const activeStrategyLaneLabel = deck.queueStrategyFilter === "all" ? "전체 전략" : strategyLabel(deck.queueStrategyFilter);

  return (
    <WorkspaceSurface variant="decision">
      <section className="aui-brand-panel" aria-label="decision queue rail">
        <BrandCard
          eyebrow="integration review mailbox"
          title="통합 검토 작업함"
          description="승인 로그가 아니라 canonical workspace를 고르는 운영 콘솔입니다. 검증 inbox, 전략 lane, 실행 대기열, diff audit를 한 화면에서 다룹니다."
        />
        <div className="aui-decision-hero-strip">
          <article>
            <span>운영 모드</span>
            <strong>{activeScopeLabel}</strong>
            <small>{deck.filteredPendingItems.length}건 표시 중</small>
          </article>
          <article>
            <span>검증 inbox</span>
            <strong>{activeInboxLabel}</strong>
            <small>보류와 승격 판단을 분리</small>
          </article>
          <article>
            <span>전략 lane</span>
            <strong>{activeStrategyLaneLabel}</strong>
            <small>선택 전략 기준 실행</small>
          </article>
        </div>
        <StatGrid stats={stats} />
        <PanelCard eyebrow="Similarity trigger" title="중복/병합 후보 스캔">
          <p className="aui-decision-empty-note">
            전체 위키의 주요 태그, 키워드, 그래프맵 연결을 비교해 중복 intake, 충돌 가능 문서, 병합 전략을 찾습니다.
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
                  검토 큐 등록
                </button>
              </article>
            ))}
          </div>
        </PanelCard>
        <PanelCard eyebrow="Workspace grouping" title="대표 공간 통합 후보">
          <p className="aui-decision-empty-note">
            프로젝트, Account, Slack 수집형 위키를 고객/주제/문서 성격 기준으로 묶어 어떤 공간을 canonical로 삼을지 검토합니다.
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
                  {strategyLabel(candidate.recommendedStrategy)} · {candidate.conflictRisk ? "충돌 게이트" : "append only"} · score {Math.round((candidate.similarityScore || 0) * 100)}
                </span>
                <small>{candidate.relatedWikis.map((item) => item.projectLabel || item.projectKey).join(", ")}</small>
                <small>{candidate.changeTargets?.slice(0, 2).join(" / ") || candidate.reason?.join(", ")}</small>
                <button className="aui-wide-action" disabled={integrationBusy} onClick={() => deck.enqueueIntegrationCandidate(candidate)} type="button">
                  검토 큐 등록
                </button>
              </article>
            ))}
          </div>
        </PanelCard>
        <PanelCard eyebrow="Review queue" title={`${deck.pendingItems.length}건`}>
          <div className="aui-decision-filter-grid">
            {deck.pendingFilterScopes.map((bucket) => (
              <button
                key={bucket.key}
                className={`aui-filter-chip ${deck.queueScope === bucket.key ? "active" : ""}`}
                onClick={() => deck.setQueueScope(bucket.key as "all" | "integration" | "conflict" | "deletion")}
                type="button"
              >
                <strong>{bucket.label}</strong>
                <span>{bucket.count}</span>
              </button>
            ))}
          </div>
          <button className="aui-wide-action" onClick={() => deck.reload()} type="button">큐 새로고침</button>
        </PanelCard>

        <PanelCard eyebrow="Validation inbox" title={deck.queueInboxFilter === "all" ? "전체 inbox" : "필터 적용"}>
          <div className="aui-decision-history">
            {deck.pendingValidationBuckets.map((bucket) => (
              <article key={bucket.key}>
                <strong>{bucket.label}</strong>
                <span>{bucket.count}건</span>
                <button className="aui-wide-action" onClick={() => deck.setQueueInboxFilter(bucket.key)} type="button">
                  {deck.queueInboxFilter === bucket.key ? "선택됨" : "이 inbox 보기"}
                </button>
              </article>
            ))}
          </div>
        </PanelCard>

        <PanelCard eyebrow="Queue health" title="재판정 SLA">
          <div className="aui-decision-history">
            {deck.pendingAgeBuckets.map((bucket) => (
              <article key={bucket.key}>
                <strong>{bucket.label}</strong>
                <span>{bucket.count}건</span>
                <small>{bucket.key === "fresh" ? "새로 들어온 카드" : bucket.key === "due" ? "이번 주 내 재검토 권장" : bucket.key === "stale" ? "우선 재판정 필요" : "장기 체류 카드"}</small>
              </article>
            ))}
          </div>
        </PanelCard>

        <PanelCard eyebrow="Strategy lanes" title={deck.queueStrategyFilter === "all" ? "전체 전략" : strategyLabel(deck.queueStrategyFilter)}>
          <div className="aui-decision-history">
            {deck.pendingStrategyBuckets.map((bucket) => (
              <article key={bucket.key}>
                <strong>{bucket.label}</strong>
                <span>{bucket.count}건</span>
                <button className="aui-wide-action" onClick={() => deck.setQueueStrategyFilter(bucket.key)} type="button">
                  {deck.queueStrategyFilter === bucket.key ? "선택됨" : "이 전략 보기"}
                </button>
              </article>
            ))}
          </div>
        </PanelCard>

        <PanelCard eyebrow="Execution list" title={`${deck.filteredPendingItems.length}건`}>
          <p className="aui-decision-empty-note">
            현재 필터에 걸린 카드만 리스트로 유지합니다. 전략/검증 상태를 바꾸면 바로 이 리스트가 줄어드는 방향으로 운영합니다.
          </p>
          <div className="aui-project-list">
            {deck.filteredPendingItems.map((queueItem) => (
              <RailButton
                active={queueItem.id === item?.id}
                detail={queueItem.content || queueItem.path || "내용 없음"}
                key={queueItem.id}
                onClick={() => deck.focusItem(queueItem.id)}
                title={queueItem.projectLabel || queueItem.projectKey || queueItem.title || "Review"}
              />
            ))}
            {!deck.filteredPendingItems.length ? <p className="aui-decision-empty-note">현재 필터에 맞는 카드가 없습니다.</p> : null}
          </div>
          <div className="aui-decision-compare-actions">
            <button className="aui-wide-action" onClick={() => deck.setQueueInboxFilter("all")} type="button">inbox 필터 해제</button>
            <button className="aui-wide-action" onClick={() => deck.setQueueStrategyFilter("all")} type="button">전략 필터 해제</button>
          </div>
        </PanelCard>

        <PanelCard eyebrow="Apply queue" title={`${deck.executionQueue.length}건`}>
          <div className="aui-decision-history">
            {deck.executionQueue.slice(0, 8).map((entry) => (
              <article key={entry.id} className={`aui-decision-age-${entry.staleLevel}`}>
                <strong>{entry.projectLabel}</strong>
                <span>{entry.strategyLabel} · {entry.validationLabel}</span>
                <small>{entry.targetCount}개 문서 반영 대기 · 대기 {entry.ageLabel}</small>
                <button className="aui-wide-action" onClick={() => deck.focusItem(entry.id)} type="button">이 카드 열기</button>
              </article>
            ))}
            {!deck.executionQueue.length ? <p className="aui-decision-empty-note">실행 대기 리스트가 비어 있습니다.</p> : null}
          </div>
        </PanelCard>

        <PanelCard eyebrow="Diff audit" title={`${deck.resolvedAuditQueue.length}건`}>
          <div className="aui-decision-history">
            {deck.resolvedAuditQueue.slice(0, 8).map((historyItem) => (
              <article key={historyItem.id}>
                <strong>{historyItem.title}</strong>
                <span>{actionLabel(historyItem.status)} · {historyItem.resolvedAt?.slice(0, 10) || "처리일 없음"}</span>
                <small>{historyItem.docCount}개 문서 반영 · {shortText(historyItem.summary, 110)}</small>
                {historyItem.docPreview.map((path) => (
                  <small key={path}>{path}</small>
                ))}
                {historyItem.diffPreview.map((line) => (
                  <small key={line}>{shortText(line, 140)}</small>
                ))}
                <button className="aui-wide-action" onClick={() => deck.setAuditFocusId(historyItem.id)} type="button">
                  감사 상세
                </button>
              </article>
            ))}
            {!deck.resolvedAuditQueue.length ? <p className="aui-decision-empty-note">아직 처리 이력이 없습니다.</p> : null}
          </div>
        </PanelCard>
      </section>

      <section className="aui-chat-stage aui-decision-stage" aria-label="integration review card">
        <StageHeader
          eyebrow="integration review body"
          meta={currentPosition}
          title={item?.projectLabel || item?.projectKey || "판정할 카드 없음"}
        />

        <div className="aui-decision-card-wrap">
          {item ? (
            <article className="aui-decision-card">
              <div className="aui-decision-mode-banner">
                <div>
                  <span>현재 큐</span>
                  <strong>{activeScopeLabel}</strong>
                </div>
                <div>
                  <span>판정 inbox</span>
                  <strong>{deck.activeValidationInbox?.label || "일반 판정"}</strong>
                </div>
                <div>
                  <span>선택 전략</span>
                  <strong>{deck.activeIsIntegration ? strategyLabel(deck.selectedStrategy) : "일반 승인/보류"}</strong>
                </div>
              </div>
              <div className="aui-decision-card-meta">
                <span>{STATUS_LABELS[item.status] || item.status}</span>
                <span>{item.kind || item.sourceType || "signal"}</span>
                <span>{item.createdAt?.slice(0, 10) || "날짜 없음"}</span>
                <span>{deck.activeAgeBucket.label}</span>
              </div>
              <h2>{item.title || "Conflict Register"}</h2>
              {deck.activeIsIntegration ? (
                <section className="aui-decision-merge-card">
                  <strong>권고 판정: {strategyLabel(deck.activeIntegrationCandidate?.recommendedStrategy || deck.selectedStrategy)}</strong>
                  <p>{deck.activeStrategySummary || "권고 요약 없음"}</p>
                  {deck.activeValidationInbox ? (
                    <p>
                      검증 inbox: <strong>{deck.activeValidationInbox.label}</strong> · {deck.activeValidationInbox.message}
                    </p>
                  ) : null}
                  {deck.activeStrategyReasons.length ? (
                    <ul>
                      {deck.activeStrategyReasons.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  ) : null}
                  {deck.activeRelatedWikis.length ? (
                    <p>관련 위키: {deck.activeRelatedWikis.map((wiki) => wiki.projectLabel || wiki.projectKey).join(", ")}</p>
                  ) : null}
                </section>
              ) : null}
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
                  <span>대표 반영 대상</span>
                  <strong>{deck.activeIsDeletion ? "문서 삭제 + deletion audit" : deck.activeIsIntegration ? "대표 공간 판단 + append 반영" : "Conflict_Register.md 또는 대표 문서"}</strong>
                  <p>
                    {deck.activeIsDeletion
                      ? "승인 시 보호 규칙을 다시 확인한 뒤 실제 문서를 삭제하고 감사 로그를 남깁니다."
                      : deck.activeIsIntegration
                        ? "승인 시 선택한 전략에 맞는 문서만 반영합니다. 자동 병합과 원문 삭제는 하지 않습니다."
                        : "승인 시 충돌 기록 또는 대표 문서 갱신에 필요한 메모를 함께 남깁니다."}
                  </p>
                </section>
              </div>
              {deck.activeIsIntegration ? (
                <div className="aui-decision-card-grid">
                  <section>
                    <span>영향 문서 미리보기</span>
                    {deck.activeChangeTargets.length ? (
                      <ul>
                        {deck.activeChangeTargets.map((path) => <li key={path}>{path}</li>)}
                      </ul>
                    ) : (
                      <p>예상 반영 문서가 없습니다.</p>
                    )}
                  </section>
                  <section>
                    <span>반영 체크리스트</span>
                    {deck.reflectionChecklist.length ? (
                      <ul>
                        {deck.reflectionChecklist.map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    ) : (
                      <p>체크리스트 없음</p>
                    )}
                  </section>
                </div>
              ) : null}
              {deck.activeIsIntegration ? (
                <div className="aui-decision-resolution-note">
                  <label className="aui-field">
                    <span>전략 선택</span>
                    <select value={deck.overrideStrategy} onChange={(event) => deck.setOverrideStrategy(event.target.value)}>
                      {[
                        deck.activeIntegrationCandidate?.recommendedStrategy,
                        "promote_to_new_project",
                        "promote_to_common",
                        "promote_to_shared",
                        "keep_separate_project",
                        "account_rollup",
                        "hold_for_review",
                        "decision_merge",
                        "evidence_index_merge",
                        "status_rollup",
                        "link_only",
                        "do_not_merge",
                      ].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).map((value) => (
                        <option key={value} value={value}>
                          {strategyLabel(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {deck.overrideStrategy === "promote_to_new_project" ? (
                    <label className="aui-field">
                      <span>승격 project 이름</span>
                      <input
                        type="text"
                        value={deck.promotionProjectName}
                        onChange={(event) => deck.setPromotionProjectName(event.target.value)}
                        placeholder="예: CustomerA_NewProposal_Project"
                      />
                    </label>
                  ) : null}
                  <label className="aui-field">
                    <span>전략 override 이유</span>
                    <textarea
                      rows={3}
                      value={deck.overrideReason}
                      onChange={(event) => deck.setOverrideReason(event.target.value)}
                      placeholder="예: 같은 고객이지만 계약/예산/오너가 달라 새 project로 분리"
                    />
                  </label>
                </div>
              ) : null}
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
                    placeholder="승인/보류/추가조사 사유를 남기면 검토 큐 audit에 함께 저장됩니다."
                  />
                </label>
              </div>
            </article>
          ) : (
            <article className="aui-decision-card empty">
              <h2>판정 대기 카드 없음</h2>
              <p>현재 workspace에는 pending 통합 검토 항목이 없습니다.</p>
            </article>
          )}

          <div className="aui-decision-actions">
            <button className="aui-wide-action" disabled={busy} onClick={() => deck.move(-1)} type="button">이전</button>
            <button className="aui-wide-action" disabled={busy || !item} onClick={() => deck.resolveActive("hold")} type="button">보류</button>
            <button className="aui-wide-action" disabled={busy || !item} onClick={() => deck.resolveActive("investigate")} type="button">추가 조사</button>
            <button className="aui-wide-action" disabled={busy || !item} onClick={deck.approveWithSelectedStrategy} type="button">{strategyApprovalLabel}</button>
            {deck.activeIsIntegration ? (
              <button className="aui-wide-action" disabled={busy || !item} onClick={deck.approvePromoteToProject} type="button">빠른 새 project 승격</button>
            ) : null}
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
            <button className="aui-wide-action" disabled={busy || !item} onClick={deck.runInference} type="button">GLM 검토 실행</button>
            <button className="aui-wide-action" disabled={busy || !recommendationReady} onClick={deck.applyInferenceRecommendation} type="button">추천대로 반영</button>
          </div>
          <StatusLine phase={deck.status.phase} message={deck.status.message} />
        </PanelCard>

        <PanelCard eyebrow="Inference" title="검토 보조 결과">
          <div className="aui-decision-inference">
            {deck.inference || "아직 실행된 GLM 판정이 없습니다."}
          </div>
        </PanelCard>

        <PanelCard eyebrow="Diff drilldown" title={deck.activeAuditItem?.title || "감사 상세 없음"}>
          <div className="aui-decision-history">
            {deck.activeAuditItem ? (
              <>
                <article className="aui-decision-audit-lead">
                  <strong>{deck.activeAuditItem.title}</strong>
                  <span>{actionLabel(deck.activeAuditItem.status)} · {deck.activeAuditItem.resolvedAt?.slice(0, 10) || "처리일 없음"}</span>
                  <small>{deck.activeAuditItem.docCount}개 문서 반영</small>
                </article>
                {deck.activeAuditItem.diffs.map((diff) => (
                  <article key={`${deck.activeAuditItem.id}-${diff.path}`} className="aui-decision-diff-row">
                    <strong>{diff.changeType} · {diff.path}</strong>
                    <span>{diff.beforeChars}자 → {diff.afterChars}자</span>
                    <small>before: {shortText(diff.beforePreview || "empty", 140)}</small>
                    <small>after: {shortText(diff.afterPreview || "empty", 140)}</small>
                  </article>
                ))}
              </>
            ) : (
              <p className="aui-decision-empty-note">아직 선택된 감사 항목이 없습니다.</p>
            )}
          </div>
        </PanelCard>

        <PanelCard eyebrow="Evidence Compare" title={deck.activeIsConflict ? "충돌 비교" : "근거 / 대표 문서 비교"}>
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
