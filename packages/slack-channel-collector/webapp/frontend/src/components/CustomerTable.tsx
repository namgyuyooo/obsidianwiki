import type { Customer, CompanyProfile, UiState } from "../types";
import type { CompanyGroup } from "../lib/domain";
import { companyProfile } from "../lib/domain";
import { SourceBadges, IndustryBadge } from "./Badges";

interface SortProps {
  state: UiState;
  onSort: (k: string) => void;
}

function SortableTh({
  k,
  label,
  state,
  onSort,
}: { k: string; label: string } & SortProps) {
  const arrow = state.sort === k ? (state.dir < 0 ? " ▾" : " ▴") : "";
  return (
    <th onClick={() => onSort(k)}>
      {label}
      {arrow}
    </th>
  );
}

// ── company view ─────────────────────────────────────────────────────────
function CompanyRows({
  g,
  companies,
  onOpenCompany,
  onOpenPerson,
  onSaveField,
}: {
  g: CompanyGroup;
  companies: Record<string, CompanyProfile>;
  onOpenCompany: (key: string) => void;
  onOpenPerson: (email: string) => void;
  onSaveField: (key: string, field: "owner" | "memo", value: string) => void;
}) {
  const ci = companyProfile(companies, g.key);
  const n = g.members.length;

  // group members by department (empty dept sorted last)
  const dmap: Record<string, Customer[]> = {};
  g.members.forEach((m) => {
    const d = (m.d || "").trim();
    (dmap[d] = dmap[d] || []).push(m);
  });
  const depts = Object.keys(dmap).sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)
  );
  const flat: { m: Customer; d: string; dFirst: boolean; dLen: number }[] = [];
  depts.forEach((d) =>
    dmap[d].forEach((m, di) =>
      flat.push({ m, d, dFirst: di === 0, dLen: dmap[d].length })
    )
  );

  // 담당자 없이 활동만 있는 회사 → 한 줄로 표시 (활동 수/최근활동 노출)
  if (g.members.length === 0) {
    return (
      <tr className="mrow">
        <td
          className="row"
          style={{ borderRight: "1px solid var(--line)", cursor: "pointer" }}
          onClick={() => onOpenCompany(g.key)}
        >
          <b>{g.name}</b>
          {g.isNew && <span className="badge b-new"> NEW</span>}
        </td>
        <td colSpan={6} className="hint">담당자 없음 · 활동 {g.a}건 (회사 클릭 → 상세/타임라인)</td>
        <td
          className="row"
          style={{ cursor: "pointer" }}
          onClick={() => onOpenCompany(g.key)}
        >
          {ci.ind ? <IndustryBadge ind={ci.ind} sub={ci.sub} /> : <span className="hint" style={{ color: "var(--accent)" }}>＋ 입력</span>}
        </td>
        <td>
          <input type="text" list="owners" defaultValue={ci.owner} placeholder="담당 지정" style={{ width: 90 }}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { if (e.target.value.trim() !== ci.owner) onSaveField(g.key, "owner", e.target.value.trim()); }} />
        </td>
        <td>
          <input type="text" defaultValue={ci.memo} placeholder="메모 입력" style={{ width: 150 }}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { if (e.target.value.trim() !== ci.memo) onSaveField(g.key, "memo", e.target.value.trim()); }} />
        </td>
        <td>{g.l}</td>
      </tr>
    );
  }

  return (
    <>
      {flat.map((f, ix) => {
        const m = f.m;
        const dim = m.st !== "정상" ? " dim" : "";
        return (
          <tr className={`mrow${dim}`} key={m.e}>
            {ix === 0 && (
              <td
                rowSpan={n}
                className="row"
                style={{ borderRight: "1px solid var(--line)", cursor: "pointer" }}
                onClick={() => onOpenCompany(g.key)}
              >
                <b>{g.name}</b>
                {g.isNew && <span className="badge b-new"> NEW</span>}
              </td>
            )}
            {f.dFirst && (
              <td rowSpan={f.dLen} style={{ borderRight: "1px dashed var(--line)" }}>
                {f.d}
              </td>
            )}
            <td
              className="row"
              style={{ cursor: "pointer" }}
              onClick={() => onOpenPerson(m.e)}
            >
              <b>{m.n || "—"}</b>
              {m.t && <span className="hint"> {m.t}</span>}
              {m.isNew && <span className="badge b-new"> NEW</span>}
              {m.st !== "정상" && <span className="badge b-status"> {m.st}</span>}
            </td>
            <td>{m.e}</td>
            <td>{m.p}</td>
            <td>{m.i.join(", ")}</td>
            <td>
              <SourceBadges sources={m.s} />
            </td>
            {ix === 0 && (
              <>
                <td
                  rowSpan={n}
                  className="row"
                  style={{ cursor: "pointer" }}
                  onClick={() => onOpenCompany(g.key)}
                >
                  {ci.ind ? (
                    <>
                      <IndustryBadge ind={ci.ind} sub={ci.sub} />
                      {!ci.auto ? null : (
                        <div>
                          <span className="badge b-auto">자동 추정</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="hint" style={{ color: "var(--accent)" }}>
                      ＋ 입력
                    </span>
                  )}
                </td>
                <td rowSpan={n}>
                  <input
                    type="text"
                    list="owners"
                    defaultValue={ci.owner}
                    placeholder="담당 지정"
                    style={{ width: 90 }}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== ci.owner)
                        onSaveField(g.key, "owner", e.target.value.trim());
                    }}
                  />
                </td>
                <td rowSpan={n}>
                  <input
                    type="text"
                    defaultValue={ci.memo}
                    placeholder="메모 입력"
                    style={{ width: 150 }}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      if (e.target.value.trim() !== ci.memo)
                        onSaveField(g.key, "memo", e.target.value.trim());
                    }}
                  />
                </td>
                <td rowSpan={n}>{g.l}</td>
              </>
            )}
          </tr>
        );
      })}
    </>
  );
}

// ── person view ──────────────────────────────────────────────────────────
function PersonRow({
  r,
  companies,
  onOpenPerson,
}: {
  r: Customer;
  companies: Record<string, CompanyProfile>;
  onOpenPerson: (email: string) => void;
}) {
  const ci = companyProfile(companies, r.ckey);
  const dim = r.st !== "정상" ? " dim" : "";
  return (
    <tr className={`row${dim}`} onClick={() => onOpenPerson(r.e)}>
      <td>
        <b>{r.c}</b>
      </td>
      <td>
        {r.n || <span style={{ color: "#B0B0B6" }}>—</span>}
        {r.isNew && <span className="badge b-new"> NEW</span>}
        {r.st !== "정상" && <span className="badge b-status"> {r.st}</span>}
      </td>
      <td>{r.t}</td>
      <td>{ci.ind && <span className="badge b-ind">{ci.ind}</span>}</td>
      <td>{r.e}</td>
      <td>{r.p}</td>
      <td>{r.i.join(", ")}</td>
      <td>
        <SourceBadges sources={r.s} />
      </td>
      <td>{r.l}</td>
      <td>{r.a || ""}</td>
    </tr>
  );
}

function FilterInput({
  col,
  colFilters,
  onColFilter,
}: {
  col: string;
  colFilters: Record<string, string>;
  onColFilter: (k: string, v: string) => void;
}) {
  return (
    <th>
      <input
        type="text"
        placeholder="필터"
        value={colFilters[col] || ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onColFilter(col, e.target.value)}
      />
    </th>
  );
}

export function CustomerTable({
  view,
  groups,
  persons,
  companies,
  state,
  colFilters,
  onColFilter,
  onSort,
  onOpenCompany,
  onOpenPerson,
  onSaveField,
}: {
  view: UiState["view"];
  groups: CompanyGroup[];
  persons: Customer[];
  companies: Record<string, CompanyProfile>;
  state: UiState;
  colFilters: Record<string, string>;
  onColFilter: (k: string, v: string) => void;
  onSort: (k: string) => void;
  onOpenCompany: (key: string) => void;
  onOpenPerson: (email: string) => void;
  onSaveField: (key: string, field: "owner" | "memo", value: string) => void;
}) {
  const sortProps = { state, onSort };
  const fi = (col: string) => (
    <FilterInput col={col} colFilters={colFilters} onColFilter={onColFilter} />
  );
  if (view === "company") {
    return (
      <table>
        <thead>
          <tr>
            <SortableTh k="name" label="회사" {...sortProps} />
            <th>부서</th>
            <th>담당자 (이름·직급)</th>
            <th>이메일</th>
            <th>휴대폰</th>
            <th>관심 솔루션</th>
            <th>소스·태그</th>
            <th>업종 / 세부분야</th>
            <th>내부 담당자</th>
            <th>영업 메모</th>
            <SortableTh k="l" label="최근활동" {...sortProps} />
          </tr>
          <tr className="filterrow">
            {fi("company")}
            {fi("dept")}
            {fi("name")}
            {fi("email")}
            {fi("phone")}
            {fi("interest")}
            {fi("source")}
            {fi("industry")}
            {fi("owner")}
            <th></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {groups.length ? (
            groups.map((g) => (
              <CompanyRows
                key={g.key}
                g={g}
                companies={companies}
                onOpenCompany={onOpenCompany}
                onOpenPerson={onOpenPerson}
                onSaveField={onSaveField}
              />
            ))
          ) : (
            <tr>
              <td colSpan={11} className="empty">
                조건에 맞는 회사가 없습니다
              </td>
            </tr>
          )}
        </tbody>
      </table>
    );
  }
  return (
    <table>
      <thead>
        <tr>
          <SortableTh k="c" label="회사" {...sortProps} />
          <SortableTh k="n" label="이름" {...sortProps} />
          <SortableTh k="t" label="직급" {...sortProps} />
          <th>업종</th>
          <SortableTh k="e" label="이메일" {...sortProps} />
          <SortableTh k="p" label="휴대폰" {...sortProps} />
          <th>관심 솔루션</th>
          <th>소스</th>
          <SortableTh k="l" label="최근활동" {...sortProps} />
          <SortableTh k="a" label="활동" {...sortProps} />
        </tr>
        <tr className="filterrow">
          {fi("company")}
          {fi("name")}
          {fi("title")}
          {fi("industry")}
          {fi("email")}
          {fi("phone")}
          {fi("interest")}
          {fi("source")}
          <th></th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {persons.length ? (
          persons.map((r) => (
            <PersonRow
              key={r.e}
              r={r}
              companies={companies}
              onOpenPerson={onOpenPerson}
            />
          ))
        ) : (
          <tr>
            <td colSpan={10} className="empty">
              조건에 맞는 고객이 없습니다
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// header sort-toggle helper used by App
export function makeSortHandler(
  state: UiState,
  setState: (u: Partial<UiState>) => void
) {
  return (k: string) => {
    if (state.sort === k) setState({ dir: state.dir * -1 });
    else setState({ sort: k, dir: k === "l" || k === "a" || k === "mcount" ? -1 : 1 });
  };
}
