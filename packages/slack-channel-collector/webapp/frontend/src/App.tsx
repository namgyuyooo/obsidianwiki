import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Activity,
  CompanyProfile,
  CustomersResponse,
  Review,
  SyncSettings,
  UiState,
} from "./types";
import {
  api,
  type ActivityPayload,
  type LeadPayload,
  type ResolvePayload,
} from "./lib/api";
import {
  buildSourceOptions,
  companyGroups,
  companyProfile,
  distinctOwners,
  distinctTags,
  filtered,
  kpis,
  ownerGroups,
  toCsv,
} from "./lib/domain";
import { Charts } from "./components/Charts";
import { CustomerTable, makeSortHandler } from "./components/CustomerTable";
import { OwnerTable } from "./components/OwnerTable";
import { CompanyDetail, PersonDetail } from "./components/DetailPanels";
import { AddLeadForm } from "./components/AddLeadForm";
import { ReviewPanel } from "./components/ReviewPanel";
import { GuidePanel } from "./components/GuidePanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { DuplicatesPanel } from "./components/DuplicatesPanel";
import { RawMessagesPanel } from "./components/RawMessagesPanel";
import { AuditPanel } from "./components/AuditPanel";

const UI_KEY = "rtm-db-ui";

const DEFAULT_UI: UiState = {
  q: "",
  src: "all",
  interest: "",
  status: "정상",
  owner: "",
  tag: "",
  sort: "l",
  dir: -1,
  page: 0,
  per: 50,
  view: "company",
};

function loadUi(): UiState {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
    return { ...DEFAULT_UI, ...saved, page: 0 };
  } catch {
    return DEFAULT_UI;
  }
}

type Drawer =
  | { type: "company"; key: string }
  | { type: "person"; email: string }
  | { type: "addlead" }
  | { type: "reviews" }
  | { type: "guide" }
  | { type: "settings" }
  | null;

export default function App() {
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [guide, setGuide] = useState("");
  const [ui, setUiState] = useState<UiState>(loadUi);
  const [drawer, setDrawer] = useState<Drawer>(null);
  type ToastType = "info" | "loading" | "success" | "error";
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false); // AI 동작 중복 방지 (한 번에 하나)
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [glmConfigured, setGlmConfigured] = useState(false);
  const [glmEmails, setGlmEmails] = useState<Set<string> | null>(null);
  const [glmQuery, setGlmQuery] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [reviewsOpen, setReviewsOpen] = useState(false); // 정합성 확인: 모달 아닌 전체 창
  const [dupOpen, setDupOpen] = useState(false); // 유사 중복 병합 창
  const [rawOpen, setRawOpen] = useState(false); // Slack 원문 뷰어 창
  const [auditOpen, setAuditOpen] = useState(false); // 변경 이력/되돌리기 창

  const showToast = useCallback(
    (msg: string, type: ToastType = "info", ms = 4500) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ msg, type });
      if (type !== "loading" && ms > 0) {
        toastTimer.current = setTimeout(() => setToast(null), ms);
      }
    },
    []
  );

  const setUi = useCallback((patch: Partial<UiState>) => {
    setUiState((prev) => {
      const next = { ...prev, ...patch };
      const { q, src, interest, status, owner, tag, sort, dir, view } = next;
      localStorage.setItem(
        UI_KEY,
        JSON.stringify({ q, src, interest, status, owner, tag, sort, dir, view })
      );
      return next;
    });
  }, []);

  const loadCustomers = useCallback(async () => {
    const [cust, acts] = await Promise.all([api.customers(), api.activities()]);
    setData(cust);
    setActivities(acts.items);
  }, []);

  const loadReviews = useCallback(async () => {
    const res = await api.reviews("pending");
    setReviews(res.items);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          loadCustomers(),
          loadReviews(),
          api.guide().then((g) => setGuide(g.markdown || "")),
          api.getSettings().then(setSettings),
          api.glmStatus().then((s) => setGlmConfigured(s.configured)),
        ]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [loadCustomers, loadReviews]);

  const recs = data?.items ?? [];
  const companies: Record<string, CompanyProfile> = data?.companies ?? {};

  const groups = useMemo(
    () => companyGroups(recs, companies, ui, glmEmails, colFilters),
    [recs, companies, ui, glmEmails, colFilters]
  );
  const persons = useMemo(
    () => filtered(recs, companies, ui, glmEmails, colFilters),
    [recs, companies, ui, glmEmails, colFilters]
  );
  const owners = useMemo(
    () => ownerGroups(recs, companies, ui, glmEmails, colFilters),
    [recs, companies, ui, glmEmails, colFilters]
  );
  const onColFilter = (k: string, v: string) => {
    setColFilters((prev) => ({ ...prev, [k]: v }));
    setUi({ page: 0 });
  };
  const total =
    ui.view === "company" ? groups.length : ui.view === "owner" ? owners.length : persons.length;
  const start = ui.page * ui.per;
  const pageGroups = groups.slice(start, start + ui.per);
  const pagePersons = persons.slice(start, start + ui.per);
  const pageOwners = owners.slice(start, start + ui.per);
  const kpiRow = useMemo(() => kpis(recs, companies), [recs, companies]);
  const sourceOptions = useMemo(() => buildSourceOptions(recs), [recs]);
  const ownerOptions = useMemo(() => distinctOwners(companies), [companies]);
  const tagOptions = useMemo(() => distinctTags(recs), [recs]);
  const onSort = makeSortHandler(ui, setUi);

  // ── handlers ───────────────────────────────────────────────────────────
  const patchCompany = (key: string, fields: Record<string, string>) => {
    setData((prev) => {
      if (!prev) return prev;
      const co = prev.companies[key];
      if (!co) return prev;
      return {
        ...prev,
        companies: {
          ...prev.companies,
          [key]: {
            ...co,
            name: fields.display_name ?? co.name,
            ind: fields.industry ?? co.ind,
            sub: fields.sub_industry ?? co.sub,
            desc: fields.description ?? co.desc,
            owner: fields.owner ?? co.owner,
            memo: fields.memo ?? co.memo,
            auto: false,
          },
        },
      };
    });
  };

  const saveCompanyField = async (key: string, field: "owner" | "memo", value: string) => {
    const label = field === "owner" ? "담당자" : "메모";
    showToast(`${companies[key]?.name || key} · ${label} 저장 중…`, "loading");
    try {
      await api.updateCompany(key, { [field]: value });
      patchCompany(key, { [field]: value });
      showToast(`✅ ${companies[key]?.name || key} · ${label} 저장됨\n${label}: ${value || "(비움)"}`, "success");
    } catch (e) {
      showToast("⚠ 저장 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const saveCompanyProfile = async (key: string, fields: Record<string, string>) => {
    const name = companies[key]?.name || key;
    showToast(`${name} 회사 정보 저장 중…`, "loading");
    try {
      await api.updateCompany(key, fields);
      patchCompany(key, fields);
      const changed = Object.entries(fields)
        .filter(([, v]) => v)
        .map(([k, v]) => `${({ industry: "업종", sub_industry: "세부", description: "설명", owner: "담당", memo: "메모" } as Record<string, string>)[k] || k}: ${String(v).slice(0, 20)}`)
        .join(" · ");
      showToast(`✅ ${name} 저장됨\n${changed || "변경 없음"}`, "success");
    } catch (e) {
      showToast("⚠ 저장 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const addLead = async (lead: LeadPayload) => {
    if (!lead.email) {
      showToast("⚠ 올바른 이메일을 입력해주세요", "error");
      return;
    }
    showToast(`리드 등록 중… ${lead.email}`, "loading");
    try {
      const res = await api.addLead(lead);
      await loadCustomers();
      setDrawer(null);
      showToast(
        `✅ ${res.created ? "신규 리드 등록 완료" : "기존 고객에 활동 추가"}\n${lead.name || lead.email}${lead.company ? " · " + lead.company : ""}`,
        "success"
      );
    } catch (e) {
      showToast("⚠ 추가 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const resolveReview = async (id: number, payload: ResolvePayload) => {
    const actionLabel: Record<string, string> = {
      approve: "승인", edit: "수정 승인", reject: "거절",
      link_existing: "기고객사 연결", register_new: "신규 등록",
    };
    showToast(`정합성 항목 #${id} ${actionLabel[payload.action] || payload.action} 처리 중…`, "loading");
    try {
      await api.resolveReview(id, payload);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      if (payload.action !== "reject") await loadCustomers();
      const detail =
        payload.action === "link_existing" ? `→ ${payload.company_key}`
        : payload.action === "register_new" ? `→ ${payload.company_name}`
        : payload.action === "edit" ? `→ ${payload.value}` : "";
      showToast(`✅ #${id} ${actionLabel[payload.action]} 완료 ${detail}\n남은 항목 ${reviews.length - 1}건`, "success");
    } catch (e) {
      showToast("⚠ 처리 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const runSync = useCallback(async (backfill = false) => {
    setSyncing(true);
    setAiBusy(true);
    showToast(
      backfill ? "전체 히스토리 수집 중… (과거~현재, 시간이 걸릴 수 있어요)" : "슬랙 동기화 중… (최신 항목)",
      "loading"
    );
    try {
      const res = await api.sync({ backfill });
      // 상세 수집 로그를 브라우저 콘솔에 출력
      const log = (res as unknown as { log?: string[] }).log || [];
      console.groupCollapsed(`🔄 슬랙 동기화 로그 (${log.length}줄)`);
      log.forEach((line) => console.log(line));
      console.groupEnd();
      if (res.ok) {
        await Promise.all([loadCustomers(), loadReviews()]);
        const r = res as unknown as Record<string, number>;
        showToast(
          `✅ ${res.message}\n수집 ${r.collected ?? 0} · 신규 ${r.new_leads ?? 0} · 활동 ${r.new_activities ?? 0} · 검수 ${r.queued_reviews ?? 0}`,
          "success",
          6000
        );
      } else {
        showToast("ⓘ " + res.message, "info", 6000);
      }
    } catch (e) {
      showToast("⚠ 동기화 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setSyncing(false);
      setAiBusy(false);
    }
  }, [showToast, loadCustomers, loadReviews]);

  // Note: periodic collection runs server-side (see backend scheduler), so it
  // keeps working even when no dashboard tab is open. No client interval here.

  const saveSettings = async (patch: Partial<SyncSettings>) => {
    showToast("동기화 설정 저장 중…", "loading");
    try {
      const next = await api.saveSettings(patch);
      setSettings(next);
      const enabled = next.channels.filter((c) => c.enabled).map((c) => "#" + c.name).join(", ");
      showToast(
        `✅ 설정 저장됨\n채널: ${enabled || "없음"} · 자동 ${next.auto_sync_enabled ? next.auto_sync_interval_minutes + "분" : "off"}`,
        "success"
      );
      setDrawer(null);
    } catch (e) {
      showToast("⚠ 설정 저장 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const logActivity = async (payload: ActivityPayload, companyKey?: string) => {
    showToast(`활동 기록 저장 중… ${payload.activity_type || ""}`, "loading");
    try {
      await api.logActivity({ ...payload, company_key: companyKey });
      await loadCustomers();
      showToast(
        `✅ 활동 기록 저장\n${payload.activity_type || "활동"}${payload.email ? " · " + payload.email : ""}${payload.next_action ? "\n다음: " + payload.next_action : ""}`,
        "success"
      );
    } catch (e) {
      showToast("⚠ 기록 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const resolveUsers = async () => {
    showToast("슬랙 유저 이름 갱신 중…", "loading");
    try {
      const r = await api.resolveUsers();
      showToast(r.ok ? `✅ 유저 이름 ${r.stored}명 갱신` : "⚠ " + (r.message || "실패"), r.ok ? "success" : "error");
      if (r.ok) await loadCustomers();
    } catch (e) {
      showToast("⚠ 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const saveTags = async (email: string, tags: string[]) => {
    showToast("태그 저장 중…", "loading");
    try {
      await api.setTags(email, tags);
      await loadCustomers();
      showToast(`✅ 태그 ${tags.length}개 저장\n${tags.map((t) => "#" + t).join(" ") || "(비움)"}`, "success");
    } catch (e) {
      showToast("⚠ 태그 저장 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const inferCompany = async (key: string) => {
    setAiBusy(true);
    showToast(`✨ GLM 업종 추정 중… ${companies[key]?.name || key}`, "loading");
    try {
      const res = await api.inferCompany(key);
      const r = res.result as Record<string, string>;
      if (r._mode === "unavailable" || r._mode === "error") {
        showToast("⚠ " + (r.message || "GLM 추정을 사용할 수 없습니다"), "error");
        return null;
      }
      showToast(
        `✅ GLM 추정 완료 — 검토 후 저장\n업종: ${r.industry || "-"} · 세부: ${r.sub_industry || "-"}`,
        "success",
        6000
      );
      return {
        industry: r.industry || "",
        sub_industry: r.sub_industry || "",
        description: r.description || "",
      };
    } catch (e) {
      showToast("⚠ GLM 추정 실패: " + (e instanceof Error ? e.message : e), "error");
      return null;
    } finally {
      setAiBusy(false);
    }
  };

  const runGlmSearch = async () => {
    const q = glmQuery.trim();
    if (!q) {
      setGlmEmails(null);
      return;
    }
    setAiBusy(true);
    showToast(`${glmConfigured ? "✨ AI" : "🔍 키워드"} 검색 중… "${q}"`, "loading");
    try {
      const res = await api.glmSearch(q);
      setGlmEmails(new Set(res.emails));
      // 결과를 표에 그대로 보여주기 위해: 고객(개별) 뷰로 전환하고, 결과를 가릴 수 있는
      // 상태/컬럼 필터를 초기화 (검색 결과는 서버가 전체 상태 대상으로 계산함)
      setColFilters({});
      setUi({ page: 0, view: "person", status: "" });
      const filt = res.filters as Record<string, unknown>;
      const crit = ["industries", "interests", "sources", "keywords"]
        .map((k) => (Array.isArray(filt[k]) && (filt[k] as unknown[]).length ? `${k}:${(filt[k] as unknown[]).join("/")}` : ""))
        .filter(Boolean).join(" · ");
      showToast(
        res.count > 0
          ? `✅ ${res.mode === "glm" ? "AI" : "키워드"} 검색 — ${res.count}명 일치 (고객 뷰에 표시)${crit ? "\n" + crit : ""}`
          : `ⓘ 일치하는 결과가 없습니다${crit ? "\n조건: " + crit : ""}`,
        res.count > 0 ? "success" : "info",
        6000
      );
    } catch (e) {
      showToast("⚠ 검색 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setAiBusy(false);
    }
  };

  const clearGlmSearch = () => {
    setGlmQuery("");
    setGlmEmails(null);
  };

  const exportCsv = () => {
    let head: string[];
    let rows: (string | number)[][];
    if (ui.view === "company") {
      head = ["회사명", "업종", "세부분야", "회사설명", "영업메모", "내부담당자", "인원수", "담당자", "관심솔루션", "소스", "최근활동일", "활동수"];
      rows = groups.map((g) => {
        const ci = companyProfile(companies, g.key);
        return [
          g.name, ci.ind, ci.sub, ci.desc, ci.memo, ci.owner, g.members.length,
          g.members.map((m) => (m.n || "?") + (m.t ? "(" + m.t + ")" : "")).join(" / "),
          g.i.join(" / "), g.s.join(" + "), g.l, g.a,
        ];
      });
    } else {
      head = ["회사명", "이름", "직급", "업종", "이메일", "휴대폰", "관심솔루션", "소스", "상태", "최초유입일", "최근활동일", "활동수", "문의내용"];
      rows = persons.map((r) => {
        const ci = companyProfile(companies, r.ckey);
        return [
          r.c, r.n, r.t, ci.ind, r.e, r.p, r.i.join(" / "), r.s.join(" + "),
          r.st, r.f, r.l, r.a, (r.q || "").replace(/\n/g, " "),
        ];
      });
    }
    const csv = [head.join(",")].concat([toCsv(rows)]).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ui.view === "company" ? "RTM_회사DB_export.csv" : "RTM_고객DB_export.csv";
    a.click();
  };

  // ── drawer content ─────────────────────────────────────────────────────
  const openCompany = (key: string) => setDrawer({ type: "company", key });
  const openPerson = (email: string) => setDrawer({ type: "person", email });

  let drawerBody: React.ReactNode = null;
  if (drawer?.type === "company") {
    const g = groups.find((x) => x.key === drawer.key) ||
      companyGroups(recs, companies, { ...DEFAULT_UI, status: "" }).find((x) => x.key === drawer.key);
    if (g)
      drawerBody = (
        <CompanyDetail
          group={g}
          companies={companies}
          activities={activities}
          onSave={saveCompanyProfile}
          onLogActivity={(p) => logActivity(p, g.key)}
          onInfer={inferCompany}
          aiBusy={aiBusy}
        />
      );
  } else if (drawer?.type === "person") {
    const r = recs.find((x) => x.e === drawer.email);
    if (r)
      drawerBody = (
        <PersonDetail
          contact={r}
          companies={companies}
          activities={activities}
          onOpenCompany={openCompany}
          onLogActivity={(p) => logActivity(p)}
          onSaveTags={saveTags}
        />
      );
  } else if (drawer?.type === "addlead") {
    drawerBody = <AddLeadForm onSubmit={addLead} />;
  } else if (drawer?.type === "guide") {
    drawerBody = <GuidePanel markdown={guide} />;
  } else if (drawer?.type === "settings" && settings) {
    drawerBody = (
      <SettingsPanel
        settings={settings}
        glmConfigured={glmConfigured}
        onSave={saveSettings}
        onResolveUsers={resolveUsers}
      />
    );
  }
  const wideDrawer =
    drawer?.type === "reviews" || drawer?.type === "guide" || drawer?.type === "settings";

  if (error) {
    return (
      <div className="loading">
        ⚠ API에 연결할 수 없습니다.<br />
        <span className="hint">{error}</span>
        <br />
        <span className="hint">백엔드(FastAPI)가 실행 중인지 확인하세요: ./backend/run.sh</span>
      </div>
    );
  }
  if (!data) return <div className="loading">불러오는 중…</div>;

  // 변경 이력/되돌리기: 전체 창
  if (auditOpen) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="topbar">
          <button className="btn" onClick={() => { setAuditOpen(false); loadCustomers(); }}>← 대시보드로</button>
        </div>
        <AuditPanel onToast={(m, t) => showToast(m, t)} onChanged={() => { loadCustomers(); loadReviews(); }} />
        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.type === "loading" && <span className="spin" />}
            <span>{toast.msg}</span>
          </div>
        )}
      </div>
    );
  }

  // Slack 원문 뷰어: 전체 창
  if (rawOpen) {
    return (
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div className="topbar">
          <button className="btn" onClick={() => { setRawOpen(false); loadCustomers(); }}>← 대시보드로</button>
        </div>
        <RawMessagesPanel glmConfigured={glmConfigured} onToast={(m, t) => showToast(m, t)} />
        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.type === "loading" && <span className="spin" />}
            <span>{toast.msg}</span>
          </div>
        )}
      </div>
    );
  }

  // 유사 중복 병합: 전체 창
  if (dupOpen) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="topbar">
          <button
            className="btn"
            onClick={() => {
              setDupOpen(false);
              loadCustomers();
            }}
          >
            ← 대시보드로
          </button>
        </div>
        <DuplicatesPanel
          onToast={(m, t) => showToast(m, t)}
          onDone={() => {
            setDupOpen(false);
            loadCustomers();
          }}
        />
        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.type === "loading" && <span className="spin" />}
            <span>{toast.msg}</span>
          </div>
        )}
      </div>
    );
  }

  // 정합성 확인: 모달/드로어가 아닌 전체 창(페이지)
  if (reviewsOpen) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="topbar">
          <button className="btn" onClick={() => setReviewsOpen(false)}>
            ← 대시보드로
          </button>
          <button className="btn" onClick={() => loadReviews()}>
            새로고침
          </button>
        </div>
        <ReviewPanel reviews={reviews} onResolve={resolveReview} />
        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.type === "loading" && <span className="spin" />}
            <span>{toast.msg}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h1>
            RTM 고객 DB <span style={{ color: "var(--accent)" }}>통합 대시보드</span>
          </h1>
          <div className="sub">
            메일링 리스트 + 슬랙 (릴레잇·피트페이퍼) · React + FastAPI · 회사{" "}
            {data.companies ? Object.keys(data.companies).length.toLocaleString() : 0}곳
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setDrawer({ type: "guide" })}>
            📝 작성 가이드
          </button>
          <button className="btn" onClick={() => setDrawer({ type: "settings" })}>
            ⚙ 동기화 설정
          </button>
          <button className="btn" onClick={() => setRawOpen(true)}>
            📥 슬랙 원문
          </button>
          <button className="btn" onClick={() => setDupOpen(true)}>
            🔗 유사 중복
          </button>
          <button className="btn" onClick={() => setAuditOpen(true)}>
            ↩ 변경 이력
          </button>
          <button className="btn" onClick={() => setReviewsOpen(true)}>
            정합성 확인
            {reviews.length > 0 && (
              <span className="badge b-status" style={{ marginLeft: 4 }}>
                {reviews.length}
              </span>
            )}
          </button>
          <button className="btn" onClick={() => setDrawer({ type: "addlead" })}>
            ＋ 리드 직접 추가
          </button>
          <button className="btn" onClick={exportCsv}>
            CSV 내보내기
          </button>
          <button
            className="btn"
            onClick={() => runSync(true)}
            disabled={aiBusy}
            title="과거부터 현재까지 전체 히스토리를 수집 (초기 1회)"
          >
            전체 히스토리 수집
          </button>
          <button className="btn primary" onClick={() => runSync(false)} disabled={aiBusy}>
            {syncing ? "동기화 중…" : aiBusy ? "AI 작업 중…" : "슬랙 새 리드 동기화"}
          </button>
        </div>
      </div>

      <div className="kpis">
        {kpiRow.map((kp) => (
          <div className={`kpi ${kp.cls}`} key={kp.lab}>
            <div className="lab">{kp.lab}</div>
            <div className="v">{kp.v.toLocaleString()}</div>
          </div>
        ))}
        <div className="kpi clickable" onClick={() => setReviewsOpen(true)}>
          <div className="lab">정합성 확인 대기</div>
          <div className="v" style={{ color: reviews.length ? "var(--accent)" : undefined }}>
            {reviews.length.toLocaleString()}
          </div>
        </div>
      </div>

      <Charts recs={recs} companies={companies} />

      <div className="controls">
        <div className="viewtoggle">
          <span
            className={`vt ${ui.view === "company" ? "on" : ""}`}
            onClick={() => setUi({ view: "company", page: 0, sort: "l", dir: -1 })}
          >
            회사 뷰
          </span>
          <span
            className={`vt ${ui.view === "person" ? "on" : ""}`}
            onClick={() => setUi({ view: "person", page: 0, sort: "l", dir: -1 })}
          >
            고객 뷰
          </span>
          <span
            className={`vt ${ui.view === "owner" ? "on" : ""}`}
            onClick={() => setUi({ view: "owner", page: 0, sort: "l", dir: -1 })}
          >
            담당자 뷰
          </span>
        </div>
        <input
          type="search"
          placeholder="이름, 회사, 업종, 이메일, 문의내용 검색…"
          value={ui.q}
          onChange={(e) => setUi({ q: e.target.value, page: 0 })}
        />
        <select value={ui.src} onChange={(e) => setUi({ src: e.target.value, page: 0 })}>
          {sourceOptions.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={ui.interest} onChange={(e) => setUi({ interest: e.target.value, page: 0 })}>
          <option value="">관심 솔루션 전체</option>
          {["Hubble", "EHM", "RISA", "M.AX Agent", "TS Agent", "기타"].map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <select value={ui.owner} onChange={(e) => setUi({ owner: e.target.value, page: 0 })}>
          <option value="">담당자 전체</option>
          {ownerOptions.map((o) => (
            <option key={o} value={o}>
              담당: {o}
            </option>
          ))}
        </select>
        {tagOptions.length > 0 && (
          <select value={ui.tag} onChange={(e) => setUi({ tag: e.target.value, page: 0 })}>
            <option value="">태그 전체</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}
        <select value={ui.status} onChange={(e) => setUi({ status: e.target.value, page: 0 })}>
          <option value="정상">정상만</option>
          <option value="">전체(내부·테스트 포함)</option>
        </select>
      </div>

      <div className="controls">
        <input
          type="search"
          placeholder={
            glmConfigured
              ? "AI 검색 — 예: 반도체 장비 회사 중 Hubble 관심 고객"
              : "스마트 검색(키워드) — 예: 삼성 반도체 Hubble"
          }
          value={glmQuery}
          onChange={(e) => setGlmQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runGlmSearch()}
          style={{ flex: 1, minWidth: 240 }}
        />
        <button className="btn primary" onClick={runGlmSearch} disabled={aiBusy}>
          {aiBusy ? "AI 작업 중…" : glmConfigured ? "✨ AI 검색" : "🔍 스마트 검색"}
        </button>
        {glmEmails && (
          <button className="btn" onClick={clearGlmSearch}>
            검색 해제 ({glmEmails.size})
          </button>
        )}
      </div>

      {ui.view === "owner" ? (
        <OwnerTable
          owners={pageOwners}
          companies={companies}
          state={ui}
          colFilters={colFilters}
          onColFilter={onColFilter}
          onSort={onSort}
          onOpenCompany={openCompany}
        />
      ) : (
        <CustomerTable
          view={ui.view}
          groups={pageGroups}
          persons={pagePersons}
          companies={companies}
          state={ui}
          colFilters={colFilters}
          onColFilter={onColFilter}
          onSort={onSort}
          onOpenCompany={openCompany}
          onOpenPerson={openPerson}
          onSaveField={saveCompanyField}
        />
      )}

      <div className="pager">
        <span>
          {total.toLocaleString()}
          {ui.view === "company" ? "개 회사" : ui.view === "owner" ? "명 담당자" : "명"} 중{" "}
          {total ? start + 1 : 0}–{Math.min(start + ui.per, total)}
        </span>
        <button className="btn" onClick={() => ui.page > 0 && setUi({ page: ui.page - 1 })}>
          이전
        </button>
        <button
          className="btn"
          onClick={() => (ui.page + 1) * ui.per < total && setUi({ page: ui.page + 1 })}
        >
          다음
        </button>
      </div>

      <div className={`drawer ${drawer ? "open" : ""} ${wideDrawer ? "wide" : ""}`}>
        <button className="close" onClick={() => setDrawer(null)}>
          ✕
        </button>
        <div>{drawerBody}</div>
      </div>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === "loading" && <span className="spin" />}
          <span>{toast.msg}</span>
        </div>
      )}

      <datalist id="owners">
        {["이건영", "허정", "유남규", "김홍철", "이영주", "이욱", "박진우", "최동현"].map((o) => (
          <option value={o} key={o} />
        ))}
      </datalist>
      <datalist id="solutions">
        {["Hubble", "EHM", "RISA", "M.AX Agent", "TS Agent", "기타"].map((o) => (
          <option value={o} key={o} />
        ))}
      </datalist>
    </>
  );
}
