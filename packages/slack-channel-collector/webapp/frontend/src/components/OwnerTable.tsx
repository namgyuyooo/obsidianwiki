import type { CompanyProfile, UiState } from "../types";
import type { OwnerGroup } from "../lib/domain";
import { companyProfile } from "../lib/domain";
import { IndustryBadge } from "./Badges";

// 내부 담당자별 뷰: 담당자 → 담당 회사 목록.
export function OwnerTable({
  owners,
  companies,
  state,
  colFilters,
  onColFilter,
  onSort,
  onOpenCompany,
}: {
  owners: OwnerGroup[];
  companies: Record<string, CompanyProfile>;
  state: UiState;
  colFilters: Record<string, string>;
  onColFilter: (k: string, v: string) => void;
  onSort: (k: string) => void;
  onOpenCompany: (key: string) => void;
}) {
  const th = (k: string, label: string) => {
    const arrow = state.sort === k ? (state.dir < 0 ? " ▾" : " ▴") : "";
    return (
      <th onClick={() => onSort(k)}>
        {label}
        {arrow}
      </th>
    );
  };
  return (
    <table>
      <thead>
        <tr>
          {th("owner", "내부 담당자")}
          {th("companyCount", "담당 회사")}
          {th("memberCount", "인원")}
          <th>업종 / 세부분야</th>
          <th>관심 솔루션</th>
          {th("lastActivity", "최근활동")}
        </tr>
        <tr className="filterrow">
          <th>
            <input
              type="text"
              placeholder="담당자 필터"
              value={colFilters.owner || ""}
              onChange={(e) => onColFilter("owner", e.target.value)}
            />
          </th>
          <th>
            <input
              type="text"
              placeholder="회사 필터"
              value={colFilters.company || ""}
              onChange={(e) => onColFilter("company", e.target.value)}
            />
          </th>
          <th></th>
          <th>
            <input
              type="text"
              placeholder="업종 필터"
              value={colFilters.industry || ""}
              onChange={(e) => onColFilter("industry", e.target.value)}
            />
          </th>
          <th>
            <input
              type="text"
              placeholder="솔루션 필터"
              value={colFilters.interest || ""}
              onChange={(e) => onColFilter("interest", e.target.value)}
            />
          </th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {owners.length ? (
          owners.map((o) =>
            o.groups.map((g, ix) => {
              const ci = companyProfile(companies, g.key);
              return (
                <tr className="mrow" key={o.owner + g.key}>
                  {ix === 0 && (
                    <td
                      rowSpan={o.groups.length}
                      style={{ borderRight: "1px solid var(--line)", verticalAlign: "top" }}
                    >
                      <b>{o.owner}</b>
                      <div className="hint">
                        회사 {o.companyCount} · {o.memberCount}명
                      </div>
                    </td>
                  )}
                  <td
                    className="row"
                    style={{ cursor: "pointer" }}
                    onClick={() => onOpenCompany(g.key)}
                  >
                    <b>{g.name}</b>
                    {g.isNew && <span className="badge b-new"> NEW</span>}
                  </td>
                  <td>{g.members.length}</td>
                  <td>
                    <IndustryBadge ind={ci.ind} sub={ci.sub} />
                  </td>
                  <td>{g.i.join(", ")}</td>
                  <td>{g.l}</td>
                </tr>
              );
            })
          )
        ) : (
          <tr>
            <td colSpan={6} className="empty">
              조건에 맞는 담당자가 없습니다
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
