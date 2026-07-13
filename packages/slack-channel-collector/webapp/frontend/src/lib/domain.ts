// Pure logic ported from the original RTM_고객DB_대시보드.html so the React app
// reproduces the exact grouping / filtering / charting behaviour, now driven by
// API data instead of embedded seed constants.
import type { Customer, CompanyProfile, UiState } from "../types";

export const UNKNOWN_KEY = "(회사 미상)";

export function normInterest(i: string): string {
  return (i || "")
    .replace(" Brochure", "")
    .replace("2025 ", "")
    .replace("Hubble Engine", "Hubble")
    .trim();
}

export interface CompanyGroup {
  key: string;
  name: string;
  members: Customer[];
  i: string[];
  s: string[];
  l: string;
  a: number;
  isNew: boolean;
}

export function companyProfile(
  companies: Record<string, CompanyProfile>,
  key: string
): CompanyProfile {
  return (
    companies[key] || {
      key,
      name: key,
      ind: "",
      sub: "",
      desc: "",
      owner: "",
      memo: "",
      auto: false,
    }
  );
}

export type ColFilters = Record<string, string>;

function matchColFilters(
  r: Customer,
  companies: Record<string, CompanyProfile>,
  cf: ColFilters
): boolean {
  for (const [k, raw] of Object.entries(cf)) {
    const val = (raw || "").trim().toLowerCase();
    if (!val) continue;
    const ci = companyProfile(companies, r.ckey);
    let hay = "";
    switch (k) {
      case "company": hay = r.c + " " + ci.name; break;
      case "name": hay = r.n; break;
      case "title": hay = r.t; break;
      case "email": hay = r.e; break;
      case "phone": hay = r.p; break;
      case "dept": hay = r.d; break;
      case "industry": hay = ci.ind + " " + ci.sub; break;
      case "interest": hay = r.i.join(" "); break;
      case "source": hay = r.s.join(" ") + " " + (r.tags || []).join(" "); break;
      case "owner": hay = ci.owner; break;
      default: hay = "";
    }
    if (!hay.toLowerCase().includes(val)) return false;
  }
  return true;
}

export function filtered(
  recs: Customer[],
  companies: Record<string, CompanyProfile>,
  state: UiState,
  restrictEmails?: Set<string> | null,
  colFilters?: ColFilters | null
): Customer[] {
  const q = state.q.toLowerCase();
  return recs
    .filter((r) => {
      if (restrictEmails && !restrictEmails.has(r.e)) return false;
      if (colFilters && !matchColFilters(r, companies, colFilters)) return false;
      if (state.status && r.st !== state.status) return false;
      if (state.src === "multi") {
        if (r.s.length < 2) return false;
      } else if (state.src === "new") {
        if (r.s.includes("메일링리스트")) return false;
      } else if (state.src !== "all" && !r.s.includes(state.src)) {
        return false;
      }
      if (state.interest && !r.i.some((i) => i.includes(state.interest))) return false;
      if (state.tag && !(r.tags || []).some((t) => t === state.tag)) return false;
      if (state.owner) {
        const owner = companyProfile(companies, r.ckey).owner;
        if (owner !== state.owner) return false;
      }
      if (q) {
        const ci = companyProfile(companies, r.ckey);
        const hay = (
          r.e +
          " " +
          r.n +
          " " +
          r.c +
          " " +
          r.p +
          " " +
          r.q +
          " " +
          r.s.join(" ") +
          " " +
          ci.ind +
          " " +
          ci.sub +
          " " +
          ci.desc +
          " " +
          ci.memo +
          " " +
          (r.tags || []).join(" ")
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const k = state.sort as keyof Customer;
      const x = a[k];
      const y = b[k];
      if (k === "a") return ((x as number) - (y as number)) * state.dir;
      return String(x).localeCompare(String(y)) * state.dir;
    });
}

export function companyGroups(
  recs: Customer[],
  companies: Record<string, CompanyProfile>,
  state: UiState,
  restrictEmails?: Set<string> | null,
  colFilters?: ColFilters | null
): CompanyGroup[] {
  const map: Record<string, CompanyGroup> = {};
  for (const r of filtered(recs, companies, state, restrictEmails, colFilters)) {
    const key = r.ckey || UNKNOWN_KEY;
    if (!map[key]) {
      map[key] = {
        key,
        name: companies[key]?.name || r.c || UNKNOWN_KEY,
        members: [],
        i: [],
        s: [],
        l: "",
        a: 0,
        isNew: false,
      };
    }
    const g = map[key];
    if (r.c && r.c.length > g.name.length) g.name = r.c;
    g.members.push(r);
    r.i.forEach((i) => {
      if (!g.i.includes(i)) g.i.push(i);
    });
    r.s.forEach((s) => {
      if (!g.s.includes(s)) g.s.push(s);
    });
    if (r.l > g.l) g.l = r.l;
    g.a += r.a;
    if (r.isNew) g.isNew = true;
  }
  // company flagged NEW by backend (recent company-level activity)
  for (const g of Object.values(map)) {
    if (companies[g.key]?.new) g.isNew = true;
  }

  // 담당자(연락처) 없이 활동만 있는 회사도 회사 뷰에 표시 (cross_team 미팅 로그 등)
  if (!restrictEmails) {
    const ql = state.q.toLowerCase();
    for (const [key, co] of Object.entries(companies)) {
      if (map[key]) continue; // 이미 연락처로 표시됨
      if (!co.act_count) continue; // 활동 없는 회사는 제외
      if (state.owner && co.owner !== state.owner) continue;
      const cf = colFilters || {};
      if (cf.company && !`${co.name} ${key}`.toLowerCase().includes(cf.company.toLowerCase())) continue;
      if (cf.owner && !(co.owner || "").toLowerCase().includes(cf.owner.toLowerCase())) continue;
      if (cf.industry && !`${co.ind} ${co.sub}`.toLowerCase().includes(cf.industry.toLowerCase())) continue;
      if (ql && !`${co.name} ${co.ind} ${co.sub} ${co.desc}`.toLowerCase().includes(ql)) continue;
      map[key] = {
        key,
        name: co.name,
        members: [],
        i: [],
        s: [],
        l: co.act_last || "",
        a: co.act_count || 0,
        isNew: !!co.new,
      };
    }
  }
  const arr = Object.values(map);
  arr.forEach((g) => g.members.sort((a, b) => b.l.localeCompare(a.l)));
  const k = state.sort === "n" ? "name" : state.sort;
  return arr.sort((a, b) => {
    if (k === "a") return (a.a - b.a) * state.dir;
    if (k === "mcount") return (a.members.length - b.members.length) * state.dir;
    const av = (a as unknown as Record<string, unknown>)[k] ?? a.l;
    const bv = (b as unknown as Record<string, unknown>)[k] ?? b.l;
    return String(av).localeCompare(String(bv)) * state.dir;
  });
}

export interface Kpi {
  lab: string;
  v: number;
  cls: string;
}

export function kpis(recs: Customer[], companies: Record<string, CompanyProfile>): Kpi[] {
  const normal = recs.filter((r) => r.st === "정상");
  const newLeads = normal.filter(
    (r) => r.s.some((s) => s !== "메일링리스트") && !r.s.includes("메일링리스트")
  );
  const multi = normal.filter((r) => r.s.length >= 2);
  const nCo = new Set(normal.filter((r) => r.ckey).map((r) => r.ckey)).size;
  void companies;
  return [
    { lab: "전체 고객", v: normal.length, cls: "" },
    { lab: "회사 수", v: nCo, cls: "" },
    { lab: "슬랙 유입 신규 리드", v: newLeads.length, cls: "hl" },
    { lab: "복수 채널 접점", v: multi.length, cls: "" },
    { lab: "새로 동기화됨", v: recs.filter((r) => r.isNew).length, cls: "hl" },
  ];
}

export function industryChart(
  recs: Customer[],
  companies: Record<string, CompanyProfile>
): { labels: string[]; values: number[] } {
  const coSeen: Record<string, boolean> = {};
  recs.filter((r) => r.st === "정상" && r.ckey).forEach((r) => (coSeen[r.ckey] = true));
  const ind: Record<string, number> = {};
  Object.keys(coSeen).forEach((k) => {
    const i = companyProfile(companies, k).ind;
    if (i) ind[i] = (ind[i] || 0) + 1;
  });
  const labels = Object.keys(ind)
    .sort((a, b) => ind[b] - ind[a])
    .slice(0, 8);
  return { labels, values: labels.map((k) => ind[k]) };
}

export function interestChart(recs: Customer[]): { labels: string[]; values: number[] } {
  const ints: Record<string, number> = {};
  recs
    .filter((r) => r.st === "정상")
    .forEach((r) =>
      r.i.forEach((i) => {
        if (i) ints[i] = (ints[i] || 0) + 1;
      })
    );
  const labels = Object.keys(ints)
    .sort((a, b) => ints[b] - ints[a])
    .slice(0, 6);
  return { labels, values: labels.map((k) => ints[k]) };
}

export function buildSourceOptions(recs: Customer[]): [string, string][] {
  const have = new Set<string>();
  recs.forEach((r) => r.s.forEach((s) => have.add(s)));
  const KNOWN = ["릴레잇(홈페이지)", "피트페이퍼", "수기입력", "메일링리스트"];
  const tags = [...have].filter((s) => !KNOWN.includes(s)).sort();
  const items: [string, string][] = [["all", "소스·태그 전체"]];
  if (have.has("릴레잇(홈페이지)")) items.push(["릴레잇(홈페이지)", "릴레잇(홈페이지)"]);
  if (have.has("피트페이퍼")) items.push(["피트페이퍼", "피트페이퍼"]);
  tags.forEach((t) => items.push([t, t]));
  if (have.has("수기입력")) items.push(["수기입력", "수기입력"]);
  if (have.has("메일링리스트")) items.push(["메일링리스트", "메일링리스트"]);
  items.push(["multi", "복수 채널 접점"], ["new", "신규(미구독)"]);
  return items;
}

export function srcBadgeClass(s: string): { cls: string; label: string } {
  if (s === "릴레잇(홈페이지)") return { cls: "b-relate", label: "릴레잇" };
  if (s === "피트페이퍼") return { cls: "b-feat", label: "피트페이퍼" };
  if (s === "메일링리스트") return { cls: "b-mail", label: "메일링" };
  return { cls: "b-ind", label: s };
}

export interface OwnerGroup {
  owner: string;
  groups: CompanyGroup[];
  companyCount: number;
  memberCount: number;
  lastActivity: string;
}

const NO_OWNER = "(미지정)";

// Owner view: company groups bucketed under their internal owner.
export function ownerGroups(
  recs: Customer[],
  companies: Record<string, CompanyProfile>,
  state: UiState,
  restrictEmails?: Set<string> | null,
  colFilters?: ColFilters | null
): OwnerGroup[] {
  const cg = companyGroups(recs, companies, state, restrictEmails, colFilters);
  const map: Record<string, CompanyGroup[]> = {};
  for (const g of cg) {
    const owner = companyProfile(companies, g.key).owner || NO_OWNER;
    (map[owner] = map[owner] || []).push(g);
  }
  const result: OwnerGroup[] = Object.keys(map).map((owner) => {
    const groups = map[owner];
    return {
      owner,
      groups,
      companyCount: groups.length,
      memberCount: groups.reduce((n, g) => n + g.members.length, 0),
      lastActivity: groups.reduce((mx, g) => (g.l > mx ? g.l : mx), ""),
    };
  });
  const key = ["owner", "companyCount", "memberCount", "lastActivity"].includes(state.sort)
    ? (state.sort as keyof OwnerGroup)
    : "owner";
  result.sort((a, b) => {
    // 미지정 always last regardless of direction
    if (a.owner === NO_OWNER) return 1;
    if (b.owner === NO_OWNER) return -1;
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * state.dir;
    return String(av).localeCompare(String(bv)) * state.dir;
  });
  return result;
}

export function distinctOwners(companies: Record<string, CompanyProfile>): string[] {
  const set = new Set<string>();
  Object.values(companies).forEach((c) => {
    if (c.owner) set.add(c.owner);
  });
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function distinctTags(recs: Customer[]): string[] {
  const set = new Set<string>();
  recs.forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) => row.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(","))
    .join("\n");
}
