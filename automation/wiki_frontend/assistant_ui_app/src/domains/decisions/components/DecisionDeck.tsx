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
};

export function DecisionDeck({ chatContext }: DecisionDeckProps) {
  const deck = useDecisionDeck(chatContext.workspace);
  const item = deck.activeItem;
  const currentPosition = deck.activeIndex >= 0 ? `${deck.activeIndex + 1} / ${deck.pendingItems.length}` : "0 / 0";
  const stats = [
    { label: "Pending", value: deck.summary.pending },
    { label: "Approved", value: deck.summary.approved },
    { label: "Total", value: deck.summary.total },
  ];

  return (
    <WorkspaceSurface variant="decision">
      <section className="aui-brand-panel" aria-label="decision queue rail">
        <BrandCard
          eyebrow="decision os"
          title="Decision Deck"
          description="충돌, 미확정 사실, 버전 차이를 카드 단위로 검수하고 GLM 보조 판정을 바로 실행합니다."
        />
        <StatGrid stats={stats} />
        <PanelCard eyebrow="Queue Rail" title={`${deck.pendingItems.length}건`}>
          <div className="aui-project-list">
            {deck.pendingItems.map((queueItem) => (
              <RailButton
                active={queueItem.id === item?.id}
                detail={queueItem.content || queueItem.path || "내용 없음"}
                key={queueItem.id}
                onClick={() => deck.setActiveItemId(queueItem.id)}
                title={queueItem.projectLabel || queueItem.projectKey || queueItem.title || "Decision"}
              />
            ))}
          </div>
          <button className="aui-wide-action" onClick={() => deck.reload()} type="button">큐 새로고침</button>
        </PanelCard>
      </section>

      <section className="aui-chat-stage aui-decision-stage" aria-label="decision card">
        <StageHeader
          eyebrow="data conflict triage"
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
              <p>{item.content || "카드 내용이 비어 있습니다."}</p>
              {item.path ? <code>{item.path}</code> : null}
            </article>
          ) : (
            <article className="aui-decision-card empty">
              <h2>판정 대기 카드 없음</h2>
              <p>현재 workspace에는 pending Decision Queue 항목이 없습니다.</p>
            </article>
          )}

          <div className="aui-decision-actions">
            <button className="aui-wide-action" onClick={() => deck.move(-1)} type="button">이전</button>
            <button className="aui-wide-action" onClick={() => deck.resolveActive("hold")} type="button">보류</button>
            <button className="aui-wide-action" onClick={() => deck.resolveActive("investigate")} type="button">추가 조사</button>
            <button className="aui-wide-action" onClick={() => deck.resolveActive("approve")} type="button">승인 반영</button>
            <button className="aui-wide-action" onClick={() => deck.move(1)} type="button">다음</button>
          </div>
        </div>
      </section>

      <aside className="aui-context-panel" aria-label="decision assistant">
        <PanelCard eyebrow="LLM Directive" title="덱 안에서 판정">
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
          <button className="aui-wide-action" onClick={deck.runInference} type="button">GLM 판정 실행</button>
          <StatusLine phase={deck.status.phase} message={deck.status.message} />
        </PanelCard>

        <PanelCard eyebrow="Inference" title="판정 보조 결과">
          <div className="aui-decision-inference">
            {deck.inference || "아직 실행된 GLM 판정이 없습니다."}
          </div>
        </PanelCard>
      </aside>
    </WorkspaceSurface>
  );
}
