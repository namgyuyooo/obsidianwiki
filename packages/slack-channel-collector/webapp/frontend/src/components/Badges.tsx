import { srcBadgeClass } from "../lib/domain";

export function SourceBadges({ sources }: { sources: string[] }) {
  return (
    <>
      {sources.map((s, ix) => {
        const b = srcBadgeClass(s);
        return (
          <span key={ix} className={`badge ${b.cls}`}>
            {b.label}
          </span>
        );
      })}
    </>
  );
}

export function TagBadges({ tags }: { tags: string[] }) {
  if (!tags || !tags.length) return null;
  return (
    <>
      {tags.map((t, ix) => (
        <span key={ix} className="badge b-auto">
          #{t}
        </span>
      ))}
    </>
  );
}

export function IndustryBadge({ ind, sub }: { ind: string; sub?: string }) {
  if (!ind) return null;
  return (
    <>
      <span className="badge b-ind">{ind}</span>
      {sub ? <div className="hint">{sub}</div> : null}
    </>
  );
}
