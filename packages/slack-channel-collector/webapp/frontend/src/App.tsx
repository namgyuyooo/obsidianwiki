import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Activity,
  AuthUser,
  CompanyProfile,
  CustomersResponse,
  Review,
  SyncSettings,
  UiState,
} from "./types";
import {
  api,
  apiAuth,
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
import { UnclassifiedPanel } from "./components/UnclassifiedPanel";
import { AuthPanel } from "./components/AuthPanel";

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
  | { type: "auth" }
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
  const [syncLog, setSyncLog] = useState<string[]>([]); // 실시간 진행 로그 (화면 표시)
  const [progressLabel, setProgressLabel] = useState("작업 진행 로그");
  const [aiBusy, setAiBusy] = useState(false); // AI 동작 중복 방지 (한 번에 하나)
  const [batchInferBusy, setBatchInferBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [hasOpsKey, setHasOpsKey] = useState(() => Boolean(apiAuth.get()));
  const [glmConfigured, setGlmConfigured] = useState(false);
  const [glmEmails, setGlmEmails] = useState<Set<string> | null>(null);
  const [glmQuery, setGlmQuery] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [selectedCos, setSelectedCos] = useState<Set<string>>(new Set());
  const [mergeKeep, setMergeKeep] = useState("");
  const [reviewsOpen, setReviewsOpen] = useState(false); // 정합성 확인: 모달 아닌 전체 창
  const [dupOpen, setDupOpen] = useState(false); // 유사 중복 병합 창
  const [rawOpen, setRawOpen] = useState(false); // Slack 원문 뷰어 창
  const [auditOpen, setAuditOpen] = useState(false); // 변경 이력/되돌리기 창
  const [unclOpen, setUnclOpen] = useState(false); // 미분류 처리 창

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

  useEffect(() => {
    if (!apiAuth.get()) return;
    api.me()
      .then((res) => {
        setCurrentUser(res.user);
        setHasOpsKey(true);
      })
      .catch(() => {
        setCurrentUser(null);
        setHasOpsKey(false);
      });
  }, []);

  const recs = data?.items ?? [];
  const companies: Record<string, CompanyProfile> = data?.companies ?? {};
  const can = useCallback(
    (permission: string) => Boolean(currentUser?.permissions.includes(permission)),
    [currentUser]
  );

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
  const toggleSelectCo = (key: string) => {
    setSelectedCos((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      if (!mergeKeep && n.size) setMergeKeep([...n][0]);
      return n;
    });
  };
  const clearSelection = () => {
    setSelectedCos(new Set());
    setMergeKeep("");
  };
  const mergeSelected = async () => {
    const keys = [...selectedCos];
    if (keys.length < 2) return;
    const keep = selectedCos.has(mergeKeep) ? mergeKeep : keys[0];
    const others = keys.filter((k) => k !== keep);
    showToast(`회사 병합 중… ${others.length}곳 → ${companies[mergeKeep]?.name || mergeKeep}`, "loading");
    try {
      const r = await api.mergeCompanies(mergeKeep, others);
      await loadCustomers();
      clearSelection();
      showToast(`✅ 병합 완료 → ${companies[mergeKeep]?.name || mergeKeep}\n담당자 ${r.moved_contacts}·활동 ${r.moved_activities} 이관 (변경 이력에서 되돌리기 가능)`, "success", 6000);
    } catch (e) {
      showToast("⚠ 병합 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };
  const total =
    ui.view === "company" ? groups.length : ui.view === "owner" ? owners.length : persons.length;
  const start = ui.page * ui.per;
  const pageGroups = groups.slice(start, start + ui.per);
  const pagePersons = persons.slice(start, start + ui.per);
  const pageOwners = owners.slice(start, start + ui.per);
  const kpiRow = useMemo(() => kpis(recs, companies), [recs, companies]);
  const sourceOptions = useMemo(() => buildSourceOptions(recs), [recs]);
  const cardChannelId = (settings?.channels || []).find((c) => c.strategy === "business_card")?.id;
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

  const runSync = useCallback(async (opts: { backfill?: boolean; onlyChannel?: string; label?: string } = {}) => {
    const { backfill = false, onlyChannel, label } = opts;
    setSyncing(true);
    setAiBusy(true);
    showToast(
      label ? `${label} 시작…`
      : backfill ? "전체 히스토리 수집 시작… (백그라운드, 진행상황 콘솔)"
      : "슬랙 동기화 시작…",
      "loading"
    );
    console.group(`🔄 ${label || "슬랙 동기화"} 로그 (실시간)`);
    setProgressLabel(`🔄 ${label || "슬랙 동기화"}`);
    setSyncLog([`⏳ ${label || "슬랙 동기화"} 시작 요청 중…`]);
    let printed = 0;
    try {
      await api.sync({ backfill, onlyChannel });
      // 백그라운드 작업 상태를 폴링하며 로그를 실시간 콘솔 + 화면 패널에 출력
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 1200));
        const st = await api.syncStatus();
        for (; printed < st.logs.length; printed++) console.log(st.logs[printed]);
        if (st.logs.length) setSyncLog(st.logs.slice(-40));
        const last = st.logs[st.logs.length - 1];
        if (last) showToast("🔄 " + last, "loading");
        if (!st.running) {
          console.groupEnd();
          const r = (st.result || {}) as Record<string, unknown> & { message?: string };
          await Promise.all([loadCustomers(), loadReviews()]);
          if (r.ok === false) {
            showToast("ⓘ " + (r.message || "동기화 종료"), "info", 6000);
          } else {
            showToast(
              `✅ ${r.message || "동기화 완료"}\n수집 ${r.collected ?? 0} · 신규 ${r.new_leads ?? 0} · 활동 ${r.new_activities ?? 0} · 검수 ${r.queued_reviews ?? 0}`,
              "success",
              6000
            );
          }
          break;
        }
      }
    } catch (e) {
      console.groupEnd();
      showToast("⚠ 동기화 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setSyncing(false);
      setAiBusy(false);
      setTimeout(() => setSyncLog([]), 4000);
    }
  }, [showToast, loadCustomers, loadReviews]);

  // Note: periodic collection runs server-side (see backend scheduler), so it
  // keeps working even when no dashboard tab is open. No client interval here.

  const runRecleanse = useCallback(async () => {
    setAiBusy(true);
    setSyncing(true);
    showToast("전체 재클렌징 시작… (저장 원문 재파싱, 재수집 없음)", "loading");
    console.group("♻️ 재클렌징 로그 (실시간)");
    setProgressLabel("♻️ 전체 재클렌징");
    setSyncLog(["⏳ 재클렌징 시작 요청 중…"]);
    let printed = 0;
    try {
      await api.recleanse();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 1200));
        const st = await api.syncStatus();
        for (; printed < st.logs.length; printed++) console.log(st.logs[printed]);
        if (st.logs.length) setSyncLog(st.logs.slice(-40));
        const last = st.logs[st.logs.length - 1];
        if (last) showToast("♻️ " + last, "loading");
        if (!st.running) {
          console.groupEnd();
          const r = (st.result || {}) as Record<string, unknown> & { message?: string };
          await Promise.all([loadCustomers(), loadReviews()]);
          showToast("✅ " + (r.message || "재클렌징 완료"), "success", 6000);
          break;
        }
      }
    } catch (e) {
      console.groupEnd();
      showToast("⚠ 재클렌징 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setAiBusy(false);
      setSyncing(false);
      setTimeout(() => setSyncLog([]), 4000);
    }
  }, [showToast, loadCustomers, loadReviews]);

  // 단발성 외부 API(GLM/Slack) 작업의 진행상황을 동일 패널에 표시하는 헬퍼.
  const withProgress = useCallback(
    async <T,>(
      label: string,
      fn: (log: (m: string) => void) => Promise<T>
    ): Promise<T | undefined> => {
      setSyncing(true);
      setProgressLabel(label);
      const push = (m: string) => setSyncLog((prev) => [...prev, m].slice(-60));
      setSyncLog([`⏳ ${label} 시작…`]);
      const t0 = Date.now();
      try {
        const r = await fn(push);
        push(`✅ 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        return r;
      } catch (e) {
        push(`⚠ 실패: ${e instanceof Error ? e.message : e}`);
        throw e;
      } finally {
        setSyncing(false);
        setTimeout(() => setSyncLog([]), 4000);
      }
    },
    []
  );

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

  const deleteCompany = async (key: string) => {
    const nm = companies[key]?.name || key;
    if (!confirm(`'${nm}' 회사를 삭제할까요? (담당자·활동은 연결만 해제, 되돌리기 가능)`)) return;
    showToast(`회사 삭제 중… ${nm}`, "loading");
    try {
      await api.deleteCompany(key);
      setDrawer(null);
      await loadCustomers();
      showToast(`✅ 회사 삭제됨 — ${nm} (변경 이력에서 되돌리기 가능)`, "success");
    } catch (e) {
      showToast("⚠ 삭제 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const reassignActivity = async (id: number, company: string) => {
    showToast(`활동 재분류 중… → ${company}`, "loading");
    try {
      await api.reassignActivity(id, company);
      await loadCustomers();
      showToast(`✅ 활동을 '${company}'로 이동`, "success");
    } catch (e) {
      showToast("⚠ 재분류 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const reclassifyGlm = async (key: string) => {
    setAiBusy(true);
    showToast("✨ GLM 자동 재분류 중… (원문에서 회사 추출)", "loading");
    try {
      const r = await api.reclassifyGlm(key);
      await loadCustomers();
      showToast(r.ok ? `✅ ${r.moved}건 재분류` : "ⓘ " + (r.message || "GLM 필요"), r.ok ? "success" : "info", 6000);
    } catch (e) {
      showToast("⚠ 재분류 실패: " + (e instanceof Error ? e.message : e), "error");
    } finally {
      setAiBusy(false);
    }
  };

  const resolveUsers = async () => {
    showToast("슬랙 유저 이름 갱신 중…", "loading");
    await withProgress("👤 슬랙 유저 이름 갱신", async (log) => {
      log("Slack users.list 호출 중… (페이지네이션)");
      const r = await api.resolveUsers();
      if (r.ok) {
        log(`유저 ${r.stored}명 저장`);
        await loadCustomers();
        showToast(`✅ 유저 이름 ${r.stored}명 갱신`, "success");
      } else {
        log(r.message || "실패");
        showToast("⚠ " + (r.message || "실패"), "error");
      }
    }).catch((e) => showToast("⚠ 실패: " + (e instanceof Error ? e.message : e), "error"));
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

  const saveContact = async (email: string, fields: Record<string, string>) => {
    showToast(`연락처 정보 저장 중… ${email}`, "loading");
    try {
      await api.updateContact(email, fields);
      await loadCustomers();
      const changed = Object.entries(fields)
        .filter(([, v]) => String(v ?? "").trim())
        .map(([k, v]) => `${({ name: "이름", company: "회사", department: "부서", title: "직급", phone: "연락처", status: "상태" } as Record<string, string>)[k] || k}: ${String(v).slice(0, 24)}`)
        .join(" · ");
      showToast(`✅ 연락처 저장됨\n${changed || "빈 값으로 정리됨"}`, "success");
    } catch (e) {
      showToast("⚠ 연락처 저장 실패: " + (e instanceof Error ? e.message : e), "error");
    }
  };

  const deleteContact = async (email: string) => {
    showToast(`연락처 삭제 중… ${email}`, "loading");
    try {
      const r = await api.deleteContact(email);
      await loadCustomers();
      setDrawer(null);
      showToast(
        `✅ 연락처 삭제됨\n활동 ${r.detached_activities}건은 증적으로 보존 · 리뷰 ${r.closed_reviews}건 정리`,
        "success"
      );
    } catch (e) {
      showToast("⚠ 연락처 삭제 실패: " + (e instanceof Error ? e.message : e), "error");
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

  const batchInferCompanies = async () => {
    setBatchInferBusy(true);
    showToast("✨ 회사 정보 일괄 자동추정 중…", "loading", 120000);
    await withProgress("✨ 회사 정보 일괄 자동추정", async (log) => {
      log("GLM에 회사 최대 30곳 업종/세부/설명 추정 요청 중…");
      const r = await api.inferCompaniesBatch(30);
      if (!r.ok) {
        log(r.message || "사용 불가");
        showToast("⚠ " + (r.message || "일괄 자동추정을 사용할 수 없습니다"), "error");
        return;
      }
      log(`스캔 ${r.scanned} · 업데이트 ${r.updated} · 건너뜀 ${r.skipped}`);
      if (r.errors?.length) log(`오류 ${r.errors.length}건: ${r.errors[0]}`);
      await loadCustomers();
      const err = r.errors?.length ? `\n오류 ${r.errors.length}건: ${r.errors[0]}` : "";
      showToast(
        `✅ 일괄 자동추정 완료\n스캔 ${r.scanned}곳 · 업데이트 ${r.updated}곳 · 건너뜀 ${r.skipped}곳${err}`,
        "success",
        8000
      );
    }).catch((e) => showToast("⚠ 일괄 자동추정 실패: " + (e instanceof Error ? e.message : e), "error"));
    setBatchInferBusy(false);
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
      const res = await withProgress(
        `${glmConfigured ? "✨ AI" : "🔍 키워드"} 검색`,
        async (log) => {
          log(`질의: "${q}"`);
          log(glmConfigured ? "GLM으로 검색 조건 추출 중…" : "키워드 폴백 검색 중…");
          const r = await api.glmSearch(q);
          log(`${r.count}명 일치 (mode=${r.mode})`);
          return r;
        }
      );
      if (!res) return;
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
          onReassignActivity={reassignActivity}
          onReclassifyGlm={reclassifyGlm}
          onDelete={deleteCompany}
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
          onSaveContact={saveContact}
          onDeleteContact={deleteContact}
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
        onBatchInfer={batchInferCompanies}
        batchInferBusy={batchInferBusy}
        onRecleanse={runRecleanse}
      />
    );
  } else if (drawer?.type === "auth") {
    drawerBody = (
      <AuthPanel
        user={currentUser}
        onUser={(u) => {
          setCurrentUser(u);
          setHasOpsKey(Boolean(apiAuth.get()));
        }}
        onClose={() => setDrawer(null)}
      />
    );
  }
  const wideDrawer =
    drawer?.type === "reviews" || drawer?.type === "guide" ||
    drawer?.type === "settings" || drawer?.type === "auth";

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

  // 미분류 처리: 전체 창
  if (unclOpen) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="topbar">
          <button className="btn" onClick={() => { setUnclOpen(false); loadCustomers(); }}>← 대시보드로</button>
        </div>
        <UnclassifiedPanel
          glmConfigured={glmConfigured}
          onToast={(m, t) => showToast(m, t)}
          onChanged={loadCustomers}
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
          <button className={`btn ${hasOpsKey ? "primary" : ""}`} onClick={() => setDrawer({ type: "auth" })}>
            {currentUser ? `🔐 ${currentUser.role}` : hasOpsKey ? "🔐 인증 확인" : "🔐 로그인"}
          </button>
          <button className="btn" onClick={() => setDrawer({ type: "guide" })}>
            📝 작성 가이드
          </button>
          {can("sync.configure") && (
            <button className="btn" onClick={() => setDrawer({ type: "settings" })}>
              ⚙ 동기화 설정
            </button>
          )}
          {can("slack.raw.read") && (
            <button className="btn" onClick={() => setRawOpen(true)}>
              📥 슬랙 원문
            </button>
          )}
          <button className="btn" onClick={() => setDupOpen(true)}>
            🔗 유사 중복
          </button>
          <button className="btn" onClick={() => setUnclOpen(true)}>
            🗂 미분류 처리
          </button>
          {can("audit.read") && (
            <button className="btn" onClick={() => setAuditOpen(true)}>
              ↩ 변경 이력
            </button>
          )}
          {can("review.resolve") && (
            <button className="btn" onClick={() => setReviewsOpen(true)}>
              정합성 확인
              {reviews.length > 0 && (
                <span className="badge b-status" style={{ marginLeft: 4 }}>
                  {reviews.length}
                </span>
              )}
            </button>
          )}
          {can("data.write") && (
            <button className="btn" onClick={() => setDrawer({ type: "addlead" })}>
              ＋ 리드 직접 추가
            </button>
          )}
          <button className="btn" onClick={exportCsv}>
            CSV 내보내기
          </button>
          {can("sync.backfill") && (
            <button
              className="btn"
              onClick={() => runSync({ backfill: true })}
              disabled={aiBusy}
              title="과거부터 현재까지 전체 히스토리를 수집 (초기 1회)"
            >
              전체 히스토리 수집
            </button>
          )}
          {cardChannelId && can("sync.backfill") && (
            <button
              className="btn"
              onClick={() => runSync({ onlyChannel: cardChannelId, backfill: true, label: "명함 수집" })}
              disabled={aiBusy}
              title="#sales-명함 전체 이미지에서 명함 OCR 수집 (이미 반영된 명함은 UUID로 중복 제외)"
            >
              🪪 명함 수집
            </button>
          )}
          {can("sync.run") && (
            <button className="btn primary" onClick={() => runSync({})} disabled={aiBusy}>
              {syncing ? "동기화 중…" : aiBusy ? "AI 작업 중…" : "슬랙 새 리드 동기화"}
            </button>
          )}
        </div>
      </div>

      <div className="kpis">
        {kpiRow.map((kp) => (
          <div className={`kpi ${kp.cls}`} key={kp.lab}>
            <div className="lab">{kp.lab}</div>
            <div className="v">{kp.v.toLocaleString()}</div>
          </div>
        ))}
        <div
          className={`kpi ${can("review.resolve") ? "clickable" : ""}`}
          onClick={() => can("review.resolve") && setReviewsOpen(true)}
        >
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

      {ui.view === "company" && selectedCos.size >= 2 && (
        <div className="controls" style={{ background: "var(--accent-soft)", padding: "8px 10px", borderRadius: 8 }}>
          <b>{selectedCos.size}곳 선택됨</b>
          <span className="hint">남길 회사:</span>
          <select value={mergeKeep} onChange={(e) => setMergeKeep(e.target.value)}>
            {[...selectedCos].map((k) => (
              <option key={k} value={k}>{companies[k]?.name || k}</option>
            ))}
          </select>
          <button className="btn primary" onClick={mergeSelected}>선택한 회사 병합</button>
          <button className="btn" onClick={clearSelection}>선택 해제</button>
        </div>
      )}

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
          selected={selectedCos}
          onToggleSelect={toggleSelectCo}
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

      {syncLog.length > 0 && (
        <div className="synclog">
          <div className="synclog-head">
            {syncing && <span className="spin" />}
            <b>{progressLabel}</b>
            <span className="hint">{syncing ? "실행 중…" : "완료"}</span>
          </div>
          <div className="synclog-body">
            {[...syncLog].reverse().map((line, i) => (
              <div className="synclog-line" key={syncLog.length - i}>{line}</div>
            ))}
          </div>
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
