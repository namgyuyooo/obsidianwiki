import { useEffect, useState } from "react";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import { fetchWikiPage, saveWikiPage } from "../../wiki/api/wikiApi";
import {
  enqueueDecisionMergeCandidate,
  enqueueWikiIntegrationDecisionCandidate,
  fetchDecisionQueue,
  inferDecisionItem,
  resolveDecisionItem,
  scanAndEnqueueDecisionMergeCandidates,
  scanAndEnqueueWikiIntegrationCandidates,
  scanDecisionMergeCandidates,
  scanWikiIntegrationCandidates,
  summarizeDecisionQueue,
  suggestDecisionMerge,
  type DecisionMergeCandidate,
  type DecisionMergeCandidateScan,
  type DecisionItem,
  type DecisionMergeSuggestion,
  type DecisionResolveOptions,
  type WikiIntegrationCandidate,
  type WikiIntegrationCandidateScan,
} from "../api/decisionApi";

type DecisionDeckStatus =
  | { phase: "loading"; message: string }
  | { phase: "ready"; message: string }
  | { phase: "saving"; message: string }
  | { phase: "thinking"; message: string }
  | { phase: "failed"; message: string };

type DecisionCompareState = {
  phase: "idle" | "loading" | "ready" | "merging" | "saving" | "failed";
  message: string;
  itemId: string;
  sourcePath: string;
  targetPath: string;
  sourceMarkdown: string;
  targetMarkdown: string;
  suggestion: DecisionMergeSuggestion | null;
};

type DecisionMergeScanState = {
  phase: "idle" | "scanning" | "ready" | "enqueuing" | "failed";
  message: string;
  snapshot: DecisionMergeCandidateScan | null;
};

type WikiIntegrationScanState = {
  phase: "idle" | "scanning" | "ready" | "enqueuing" | "failed";
  message: string;
  snapshot: WikiIntegrationCandidateScan | null;
};

type DecisionQueueScope = "all" | "integration" | "conflict" | "deletion";

type DecisionFilterBucket = {
  key: string;
  label: string;
  count: number;
};

type DecisionExecutionItem = {
  id: string;
  title: string;
  strategy: string;
  strategyLabel: string;
  validationKey: string;
  validationLabel: string;
  targetCount: number;
  projectLabel: string;
  ageDays: number;
  ageLabel: string;
  staleLevel: string;
};

type DecisionAuditItem = {
  id: string;
  title: string;
  status: string;
  resolvedAt: string;
  docCount: number;
  docPreview: string[];
  summary: string;
  diffPreview: string[];
  diffs: Array<{
    path: string;
    changeType: string;
    beforeChars: number;
    afterChars: number;
    beforePreview?: string;
    afterPreview?: string;
  }>;
};

const EMPTY_COMPARE: DecisionCompareState = {
  phase: "idle",
  message: "근거 비교를 열면 intake 문서와 대표 반영 문서를 나란히 확인합니다.",
  itemId: "",
  sourcePath: "",
  targetPath: "",
  sourceMarkdown: "",
  targetMarkdown: "",
  suggestion: null,
};

const EMPTY_MERGE_SCAN: DecisionMergeScanState = {
  phase: "idle",
  message: "전체 위키의 태그, 키워드, 그래프 연결을 스캔해 중복 intake와 병합 후보를 찾을 수 있습니다.",
  snapshot: null,
};

const EMPTY_INTEGRATION_SCAN: WikiIntegrationScanState = {
  phase: "idle",
  message: "프로젝트/계정/Slack 성격을 스캔해 대표 공간 선정용 통합 후보를 찾을 수 있습니다.",
  snapshot: null,
};

const INTEGRATION_STRATEGY_LABELS: Record<string, string> = {
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
};

const INTEGRATION_STRATEGY_STEPS: Record<string, string[]> = {
  link_only: ["각 허브 운영 링크에 상호 링크를 추가합니다.", "Change_Log에 연결 근거를 기록합니다."],
  promote_to_new_project: ["새 canonical project 공간을 생성합니다.", "hub/Status/Reference_Register/Project_Overview/Change_Log/L1_memory를 초기화합니다.", "기존 intake 위키와 account hub에 provenance 링크를 남깁니다."],
  promote_to_common: ["Common hub 또는 기존 common page에 운영 지식을 승격합니다.", "기존 intake 위키에는 provenance와 Change_Log만 남깁니다."],
  promote_to_shared: ["Shared hub 또는 기존 shared asset에 재사용 자산을 승격합니다.", "원 프로젝트에는 promotion provenance link만 남깁니다."],
  keep_separate_project: ["각 project를 그대로 유지합니다.", "Status/Change_Log에 별도 유지 판단과 재검토 조건을 남깁니다."],
  account_rollup: ["Account hub에 상태/다음 접점 rollup을 추가합니다.", "하위 프로젝트 Status/Change_Log에 rollup 메모를 append합니다."],
  hold_for_review: ["즉시 병합하지 않고 재판정 조건을 기록합니다.", "Action_Items와 Change_Log에 hold 이유를 남깁니다."],
  decision_merge: ["Conflict_Register에 검토 메모와 링크를 추가합니다.", "실제 병합 없이 승인 게이트를 유지합니다."],
  evidence_index_merge: ["상위 Raw_Evidence_Index에 원문 위치 링크를 추가합니다.", "원문 파일과 기존 문서는 그대로 둡니다."],
  status_rollup: ["상위 hub에 상태 집계 메모를 추가합니다.", "관련 프로젝트 Status/Change_Log에 집계 흔적을 남깁니다."],
  do_not_merge: ["병합 금지 판단만 기록합니다.", "원문/허브 구조는 유지합니다."],
};

const INTEGRATION_VALIDATION_LABELS: Record<string, string> = {
  ready_now: "바로 반영 가능",
  needs_evidence: "근거 더 필요",
  user_confirmation: "사용자 확인 필요",
  promote_review: "새 project 승격 검토",
  account_rollup_review: "account rollup 검토",
  common_promotion_review: "common 승격 검토",
  shared_promotion_review: "shared 승격 검토",
  stale_review: "stale queue 재판정",
};

function integrationCandidateFromItem(item: DecisionItem | null): WikiIntegrationCandidate | null {
  if (!item || !isIntegrationDecision(item) || !item.original) return null;
  const original = item.original as WikiIntegrationCandidate;
  return Array.isArray(original.relatedWikis) ? original : null;
}

function slugifyPromotionName(value = "") {
  return String(value || "Promoted Project")
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "Promoted_Project";
}

function integrationProjectRoot(workspace: string) {
  return workspace === "personal" ? "../obsidianwiki-personal/obsidian/Wiki" : "obsidian/Wiki";
}

function integrationL1Root(workspace: string) {
  return workspace === "personal" ? "../obsidianwiki-personal/obsidian/L1_memory" : "obsidian/L1_memory";
}

function integrationCommonHub(workspace = "rtm") {
  return `${integrationProjectRoot(workspace)}/Common/hub.md`;
}

function integrationSharedHub(workspace = "rtm") {
  return `${integrationProjectRoot(workspace)}/Shared/hub.md`;
}

function promoteProjectPreviewPaths(projectName = "", workspace = "rtm") {
  const rawKey = slugifyPromotionName(projectName);
  const projectKey = rawKey.endsWith("_Project") ? rawKey : `${rawKey}_Project`;
  const root = integrationProjectRoot(workspace);
  const l1Root = integrationL1Root(workspace);
  return {
    projectKey,
    projectLabel: String(projectName || "").trim() || projectKey.replace(/_/g, " "),
    paths: [
      `${root}/${projectKey}/hub.md`,
      `${root}/${projectKey}/Status.md`,
      `${root}/${projectKey}/Reference_Register.md`,
      `${root}/${projectKey}/Project_Overview.md`,
      `${root}/${projectKey}/Change_Log.md`,
      `${l1Root}/${projectKey}.md`,
    ],
  };
}

function integrationStrategyLabel(strategy = "") {
  return INTEGRATION_STRATEGY_LABELS[strategy] || strategy || "전략 미지정";
}

function integrationStrategySteps(strategy = "", fallback: string[] = []) {
  return INTEGRATION_STRATEGY_STEPS[strategy] || fallback;
}

function integrationDocPath(
  record: WikiIntegrationCandidate["relatedWikis"][number] | null | undefined,
  fileName = "",
  workspace = "rtm",
) {
  if (!record?.projectKey) return "";
  if (record.division === "common" || record.division === "shared") {
    return record.hubPath || record.pagePaths?.find((path) => path.endsWith(`/${fileName}`)) || record.pagePaths?.[0] || "";
  }
  return `${integrationProjectRoot(workspace)}/${record.projectKey}/${fileName}`;
}

function integrationChangeTargetsForStrategy(
  candidate: WikiIntegrationCandidate | null,
  workspace = "rtm",
  strategy = "",
  promotionName = "",
) {
  if (!candidate) return [];
  const related = Array.isArray(candidate.relatedWikis) ? candidate.relatedWikis : [];
  const account = related.find((item) => item.division === "account") || null;
  const common = related.find((item) => item.division === "common") || null;
  const shared = related.find((item) => item.division === "shared") || null;
  const paths = new Set<string>();
  if (strategy === "promote_to_new_project") {
    const promoted = promoteProjectPreviewPaths(promotionName || candidate.groupKey || "Promoted Project", workspace);
    for (const path of promoted.paths) paths.add(path);
    if (account) paths.add(integrationDocPath(account, "hub.md", workspace));
  } else if (strategy === "promote_to_common") {
    paths.add(common ? integrationDocPath(common, "hub.md", workspace) : integrationCommonHub(workspace));
    for (const item of related.filter((entry) => entry.division !== "common")) {
      paths.add(integrationDocPath(item, "Change_Log.md", workspace));
    }
  } else if (strategy === "promote_to_shared") {
    paths.add(shared ? integrationDocPath(shared, "hub.md", workspace) : integrationSharedHub(workspace));
    for (const item of related.filter((entry) => entry.division !== "shared")) {
      paths.add(integrationDocPath(item, "Change_Log.md", workspace));
    }
  } else if (strategy === "account_rollup" && account) {
    paths.add(integrationDocPath(account, "hub.md", workspace));
    for (const item of related.filter((entry) => entry.projectKey !== account.projectKey && entry.division === "project")) {
      paths.add(integrationDocPath(item, "Status.md", workspace));
      paths.add(integrationDocPath(item, "Change_Log.md", workspace));
    }
  } else if (strategy === "hold_for_review") {
    for (const item of related.filter((entry) => entry.division !== "common" && entry.division !== "shared")) {
      paths.add(integrationDocPath(item, "Action_Items.md", workspace));
      paths.add(integrationDocPath(item, "Change_Log.md", workspace));
    }
  } else if (strategy === "keep_separate_project") {
    for (const item of related.filter((entry) => entry.division !== "common")) {
      paths.add(integrationDocPath(item, "Change_Log.md", workspace));
      paths.add(integrationDocPath(item, "Status.md", workspace));
    }
  } else if (strategy === "decision_merge") {
    for (const item of related) {
      paths.add(integrationDocPath(item, "Conflict_Register.md", workspace));
      paths.add(integrationDocPath(item, "Change_Log.md", workspace));
    }
  } else if (strategy === "evidence_index_merge") {
    const target = account || related[0];
    if (target) {
      paths.add(integrationDocPath(target, "Raw_Evidence_Index.md", workspace));
      paths.add(integrationDocPath(target, "Change_Log.md", workspace));
    }
  } else if (strategy === "status_rollup") {
    const target = account || related[0];
    if (target) paths.add(integrationDocPath(target, "hub.md", workspace));
    for (const item of related.filter((entry) => entry.division !== "common")) {
      paths.add(integrationDocPath(item, "Status.md", workspace));
      paths.add(integrationDocPath(item, "Change_Log.md", workspace));
    }
  } else if (strategy === "do_not_merge") {
    for (const item of related) paths.add(integrationDocPath(item, "Change_Log.md", workspace));
  } else {
    for (const item of related) {
      paths.add(integrationDocPath(item, "hub.md", workspace));
      paths.add(integrationDocPath(item, "Change_Log.md", workspace));
    }
  }
  return [...paths].filter(Boolean);
}

function integrationStrategySummary(
  candidate: WikiIntegrationCandidate | null,
  strategy = "",
  workspace = "rtm",
  promotionName = "",
) {
  if (!candidate) return "";
  const relatedCount = candidate.relatedWikis?.length || 0;
  const groupKey = candidate.groupKey || "integration";
  if (strategy === "promote_to_new_project") {
    const promoted = promoteProjectPreviewPaths(promotionName || candidate.groupKey || "Promoted Project", workspace);
    return `${promoted.projectLabel}를 canonical project로 승격하고 기존 intake는 provenance link로 남깁니다.`;
  }
  return {
    link_only: `${groupKey} 관련 위키 ${relatedCount}개는 기존 구조를 유지한 채 상호 링크만 추가합니다.`,
    promote_to_common: `${groupKey} 관련 위키 ${relatedCount}개는 project보다 Common 운영 지식으로 승격합니다.`,
    promote_to_shared: `${groupKey} 관련 위키 ${relatedCount}개는 재사용 asset으로 Shared에 승격합니다.`,
    keep_separate_project: `${groupKey} 관련 위키 ${relatedCount}개는 별도 project로 유지하고 재검토 조건만 남깁니다.`,
    account_rollup: `${groupKey} 관련 위키 ${relatedCount}개는 account hub 중심으로 상태와 다음 접점을 집계합니다.`,
    hold_for_review: `${groupKey} 관련 위키 ${relatedCount}개는 식별 근거가 더 모일 때까지 hold 상태로 유지합니다.`,
    decision_merge: `${groupKey} 관련 위키 ${relatedCount}개는 병합 대신 Decision Queue 승인 게이트로 묶어 검토합니다.`,
    evidence_index_merge: `${groupKey} 관련 위키 ${relatedCount}개는 Raw_Evidence_Index 중심으로 원문 위치만 연동합니다.`,
    status_rollup: `${groupKey} 관련 위키 ${relatedCount}개는 상태 집계 메모를 상위 hub에 반영합니다.`,
    do_not_merge: `${groupKey} 관련 위키 ${relatedCount}개는 병합 없이 금지 판단만 기록합니다.`,
  }[strategy] || candidate.preview?.summary || `${integrationStrategyLabel(strategy)} 전략을 검토합니다.`;
}

function integrationValidationInbox(
  candidate: WikiIntegrationCandidate | null,
  strategy = "",
  changeTargets: string[] = [],
  ageDays = 0,
) {
  if (!candidate) {
    return {
      key: "needs_evidence",
      label: INTEGRATION_VALIDATION_LABELS.needs_evidence,
      message: "대표 공간을 판정할 근거가 아직 부족합니다.",
    };
  }
  if (strategy === "promote_to_new_project") {
    return {
      key: "promote_review",
      label: INTEGRATION_VALIDATION_LABELS.promote_review,
      message: "승격 시 새 canonical project와 provenance 반영이 함께 일어납니다.",
    };
  }
  if (strategy === "account_rollup") {
    return {
      key: "account_rollup_review",
      label: INTEGRATION_VALIDATION_LABELS.account_rollup_review,
      message: "개별 project 생성보다 account 단위 운영 가치가 큰지 확인이 필요합니다.",
    };
  }
  if (strategy === "promote_to_common") {
    return {
      key: "common_promotion_review",
      label: INTEGRATION_VALIDATION_LABELS.common_promotion_review,
      message: "공통 운영 지식으로 보내는 편이 project 유지보다 나은지 확인이 필요합니다.",
    };
  }
  if (strategy === "promote_to_shared") {
    return {
      key: "shared_promotion_review",
      label: INTEGRATION_VALIDATION_LABELS.shared_promotion_review,
      message: "재사용 asset으로 승격할 만큼 범용성이 충분한지 검토가 필요합니다.",
    };
  }
  if (strategy === "hold_for_review" || ageDays >= 5) {
    return {
      key: "stale_review",
      label: INTEGRATION_VALIDATION_LABELS.stale_review,
      message: "보류 카드가 누적됐거나 대기 시간이 길어 재판정이 필요합니다.",
    };
  }
  if (candidate.conflictRisk || strategy === "decision_merge" || strategy === "keep_separate_project" || strategy === "do_not_merge") {
    return {
      key: "user_confirmation",
      label: INTEGRATION_VALIDATION_LABELS.user_confirmation,
      message: "충돌 가능성 또는 운영 경계 이슈가 있어 최종 사용자 확인이 우선입니다.",
    };
  }
  if (!changeTargets.length || (candidate.similarityScore || 0) < 0.45) {
    return {
      key: "needs_evidence",
      label: INTEGRATION_VALIDATION_LABELS.needs_evidence,
      message: "반영 문서나 유사도 신호가 약해 추가 근거를 보고 판단하는 편이 안전합니다.",
    };
  }
  return {
    key: "ready_now",
    label: INTEGRATION_VALIDATION_LABELS.ready_now,
    message: "대표 공간과 반영 문서가 비교적 명확해 바로 반영 가능한 상태입니다.",
  };
}

function isDeletionDecision(item: DecisionItem | null) {
  if (!item) return false;
  return /deletion_candidate/i.test(`${item.kind || ""}`) || /wiki_deletion/i.test(`${item.sourceType || ""}`);
}

function decisionTargetPath(item: DecisionItem | null, workspace: string) {
  if (!item) return "";
  if (item.kind === "wiki_integration" || item.sourceType === "wiki_integration_scan") return item.path || "";
  if (isDeletionDecision(item)) return item.path || "";
  if (item.path && /(^|\/)obsidian\/Wiki\//.test(item.path)) {
    return item.path.replace(/[^/]+\.md$/i, "Conflict_Register.md");
  }
  if (!item.projectKey) return "";
  const root = workspace === "personal" ? "../obsidianwiki-personal/obsidian/Wiki" : "obsidian/Wiki";
  return `${root}/${item.projectKey}/Conflict_Register.md`;
}

function decisionContentItems(content = "") {
  return String(content || "")
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 6);
}

function isConflictDecision(item: DecisionItem | null) {
  if (!item) return false;
  return /conflict|충돌|불일치|상이|상충|미확정|정합성/i.test(`${item.kind || ""} ${item.title || ""} ${item.content || ""}`);
}

function isIntegrationDecision(item: DecisionItem | null) {
  if (!item) return false;
  return item.kind === "wiki_integration" || item.sourceType === "wiki_integration_scan";
}

function recommendedActionFromInference(content = "") {
  const text = content.toLowerCase();
  const firstSignal = text.split("\n").find((line) => /판정|권장|recommend|decision/.test(line)) || text.slice(0, 240);
  if (/investigate|추가\s*조사|조사/.test(firstSignal)) return "investigate";
  if (/approve|승인|반영/.test(firstSignal)) return "approve";
  return "hold";
}

function decisionAgeDays(createdAt = "") {
  const timestamp = Date.parse(createdAt || "");
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000)));
}

function decisionAgeBucket(ageDays = 0) {
  if (ageDays >= 14) return { key: "critical", label: "14일+", staleLevel: "critical" };
  if (ageDays >= 5) return { key: "stale", label: "5일+", staleLevel: "stale" };
  if (ageDays >= 2) return { key: "due", label: "2일+", staleLevel: "due" };
  return { key: "fresh", label: "신규", staleLevel: "fresh" };
}

export function useDecisionDeck(workspace: string) {
  const { notify } = useToastCenter();
  const [items, setItems] = useState<DecisionItem[]>([]);
  const [activeItemId, setActiveItemId] = useState("");
  const [auditFocusId, setAuditFocusId] = useState("");
  const [queueScope, setQueueScope] = useState<DecisionQueueScope>("all");
  const [queueInboxFilter, setQueueInboxFilter] = useState("all");
  const [queueStrategyFilter, setQueueStrategyFilter] = useState("all");
  const [directive, setDirective] = useState("승인 전 근거 충돌과 보류 조건을 먼저 따져줘.");
  const [inference, setInference] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [overrideStrategy, setOverrideStrategy] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [promotionProjectName, setPromotionProjectName] = useState("");
  const [compare, setCompare] = useState<DecisionCompareState>(EMPTY_COMPARE);
  const [mergeScan, setMergeScan] = useState<DecisionMergeScanState>(EMPTY_MERGE_SCAN);
  const [integrationScan, setIntegrationScan] = useState<WikiIntegrationScanState>(EMPTY_INTEGRATION_SCAN);
  const [status, setStatus] = useState<DecisionDeckStatus>({
    phase: "loading",
    message: "통합 검토 큐를 불러오는 중입니다.",
  });

  const pendingItems = items.filter((item) => item.status === "pending");
  const resolvedItems = items.filter((item) => item.status && item.status !== "pending");
  const summary = summarizeDecisionQueue(items);
  const pendingIntegrationItems = pendingItems.filter((item) => isIntegrationDecision(item));
  const pendingAgeBuckets: DecisionFilterBucket[] = [
    { key: "fresh", label: "신규", count: pendingItems.filter((item) => decisionAgeBucket(decisionAgeDays(item.createdAt)).key === "fresh").length },
    { key: "due", label: "2일+", count: pendingItems.filter((item) => decisionAgeBucket(decisionAgeDays(item.createdAt)).key === "due").length },
    { key: "stale", label: "5일+", count: pendingItems.filter((item) => decisionAgeBucket(decisionAgeDays(item.createdAt)).key === "stale").length },
    { key: "critical", label: "14일+", count: pendingItems.filter((item) => decisionAgeBucket(decisionAgeDays(item.createdAt)).key === "critical").length },
  ];
  const pendingFilterScopes: DecisionFilterBucket[] = [
    { key: "all", label: "전체 큐", count: pendingItems.length },
    { key: "integration", label: "통합 검토", count: pendingIntegrationItems.length },
    { key: "conflict", label: "충돌/판정", count: pendingItems.filter((item) => isConflictDecision(item)).length },
    { key: "deletion", label: "삭제 검토", count: pendingItems.filter((item) => isDeletionDecision(item)).length },
  ];
  const pendingValidationBuckets: DecisionFilterBucket[] = [
    { key: "all", label: "전체 inbox", count: pendingIntegrationItems.length },
    ...Object.entries(INTEGRATION_VALIDATION_LABELS).map(([key, label]) => ({
      key,
      label,
      count: pendingIntegrationItems.filter((item) => {
        const candidate = integrationCandidateFromItem(item);
        const strategy = candidate?.recommendedStrategy || "";
        const targets = integrationChangeTargetsForStrategy(candidate, workspace, strategy, candidate?.groupKey || "");
        return integrationValidationInbox(candidate, strategy, targets, decisionAgeDays(item.createdAt)).key === key;
      }).length,
    })),
  ];
  const pendingStrategyBuckets: DecisionFilterBucket[] = [
    { key: "all", label: "전체 전략", count: pendingIntegrationItems.length },
    ...Object.entries(INTEGRATION_STRATEGY_LABELS).map(([key, label]) => ({
      key,
      label,
      count: pendingIntegrationItems.filter((item) => integrationCandidateFromItem(item)?.recommendedStrategy === key).length,
    })),
  ];
  const filteredPendingItems = pendingItems.filter((item) => {
    if (queueScope === "integration" && !isIntegrationDecision(item)) return false;
    if (queueScope === "conflict" && !isConflictDecision(item)) return false;
    if (queueScope === "deletion" && !isDeletionDecision(item)) return false;
    if (queueInboxFilter !== "all") {
      const candidate = integrationCandidateFromItem(item);
      const strategy = candidate?.recommendedStrategy || "";
      const targets = integrationChangeTargetsForStrategy(candidate, workspace, strategy, candidate?.groupKey || "");
      if (!candidate || integrationValidationInbox(candidate, strategy, targets, decisionAgeDays(item.createdAt)).key !== queueInboxFilter) return false;
    }
    if (queueStrategyFilter !== "all") {
      const candidate = integrationCandidateFromItem(item);
      if (!candidate || candidate.recommendedStrategy !== queueStrategyFilter) return false;
    }
    return true;
  });
  const activeItem = filteredPendingItems.find((item) => item.id === activeItemId) || filteredPendingItems[0] || null;
  const activeIndex = activeItem ? filteredPendingItems.findIndex((item) => item.id === activeItem.id) : -1;
  const activeContentItems = decisionContentItems(activeItem?.content || "");
  const activeTargetPath = decisionTargetPath(activeItem, workspace);
  const activeIsConflict = isConflictDecision(activeItem);
  const activeIsDeletion = isDeletionDecision(activeItem);
  const activeIsIntegration = isIntegrationDecision(activeItem);
  const activeIntegrationCandidate = integrationCandidateFromItem(activeItem);
  const activeAgeDays = decisionAgeDays(activeItem?.createdAt);
  const activeAgeBucket = decisionAgeBucket(activeAgeDays);
  const selectedStrategy = activeIsIntegration ? (overrideStrategy || activeIntegrationCandidate?.recommendedStrategy || "") : "";
  const promotionPreview = selectedStrategy === "promote_to_new_project"
    ? promoteProjectPreviewPaths(promotionProjectName || activeIntegrationCandidate?.groupKey || activeItem?.projectLabel || "Promoted Project", workspace)
    : null;
  const activeChangeTargets = activeIsIntegration
    ? integrationChangeTargetsForStrategy(activeIntegrationCandidate, workspace, selectedStrategy, promotionProjectName || activeIntegrationCandidate?.groupKey || "")
    : [];
  const activeStrategySteps = activeIsIntegration
    ? integrationStrategySteps(selectedStrategy, activeIntegrationCandidate?.preview?.steps || [])
    : [];
  const activeStrategySummary = activeIsIntegration
    ? integrationStrategySummary(activeIntegrationCandidate, selectedStrategy, workspace, promotionProjectName || activeIntegrationCandidate?.groupKey || "")
    : "";
  const activeStrategyReasons = [
    ...(selectedStrategy && selectedStrategy !== activeIntegrationCandidate?.recommendedStrategy
      ? [`사용자 override: ${integrationStrategyLabel(selectedStrategy)} 전략으로 재판정 중`]
      : []),
    ...(activeIntegrationCandidate?.reason || []),
  ];
  const activeRelatedWikis = activeIntegrationCandidate?.relatedWikis || [];
  const activeValidationInbox = activeIsIntegration
    ? integrationValidationInbox(activeIntegrationCandidate, selectedStrategy, activeChangeTargets, activeAgeDays)
    : null;
  const reflectionChecklist = activeIsIntegration
    ? (selectedStrategy === "promote_to_new_project"
      ? [
        ...activeChangeTargets,
        "승인 후 기존 intake 위키 Change_Log/account hub provenance 반영 확인",
      ]
      : activeChangeTargets)
    : [];
  const executionQueue: DecisionExecutionItem[] = filteredPendingItems
    .map((item) => {
      const candidate = integrationCandidateFromItem(item);
      if (!candidate) return null;
      const strategy = candidate.recommendedStrategy || "link_only";
      const targets = integrationChangeTargetsForStrategy(candidate, workspace, strategy, candidate.groupKey || "");
      const ageDays = decisionAgeDays(item.createdAt);
      const ageBucket = decisionAgeBucket(ageDays);
      const validation = integrationValidationInbox(candidate, strategy, targets, ageDays);
      return {
        id: item.id,
        title: item.title || candidate.groupKey || item.projectLabel || item.projectKey || "Decision",
        strategy,
        strategyLabel: integrationStrategyLabel(strategy),
        validationKey: validation.key,
        validationLabel: validation.label,
        targetCount: targets.length,
        projectLabel: item.projectLabel || item.projectKey || candidate.groupKey || "Decision",
        ageDays,
        ageLabel: ageBucket.label,
        staleLevel: ageBucket.staleLevel,
      };
    })
    .filter((item): item is DecisionExecutionItem => Boolean(item));
  const resolvedAuditQueue: DecisionAuditItem[] = resolvedItems
    .map((item) => {
      const docs = [...new Set([
        ...(item.operationalChangePaths || []),
        ...(item.reflectionDocs || []),
        item.appliedPath || "",
      ].filter(Boolean))];
      const diffPreview = (item.auditDiffs || [])
        .slice(0, 2)
        .map((diff) => `${diff.changeType}: ${diff.path} | ${diff.beforePreview || "empty"} -> ${diff.afterPreview || "empty"}`);
      return {
        id: item.id,
        title: item.title || item.projectLabel || item.projectKey || "Resolved decision",
        status: item.status || "",
        resolvedAt: item.resolvedAt || "",
        docCount: docs.length,
        docPreview: docs.slice(0, 3),
        summary: item.note || item.content || "감사 메모 없음",
        diffPreview,
        diffs: item.auditDiffs || [],
      };
    })
    .sort((left, right) => String(right.resolvedAt || "").localeCompare(String(left.resolvedAt || "")));
  const activeAuditItem = resolvedAuditQueue.find((item) => item.id === auditFocusId) || resolvedAuditQueue[0] || null;

  async function reload(preferredItemId = activeItemId) {
    setStatus({ phase: "loading", message: "통합 검토 큐를 동기화하는 중입니다." });
    try {
      const snapshot = await fetchDecisionQueue(workspace);
      const nextItems = snapshot.items || [];
      const nextPending = nextItems.filter((item) => item.status === "pending");
      const nextActive = nextPending.some((item) => item.id === preferredItemId)
        ? preferredItemId
        : nextPending[0]?.id || "";
      setItems(nextItems);
      setActiveItemId(nextActive);
      setStatus({ phase: "ready", message: `${nextPending.length}건의 통합 검토 카드가 있습니다.` });
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "통합 검토 큐 동기화 실패" });
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchDecisionQueue(workspace)
      .then((snapshot) => {
        if (cancelled) return;
        const nextItems = snapshot.items || [];
        const nextPending = nextItems.filter((item) => item.status === "pending");
        setItems(nextItems);
        setActiveItemId(nextPending[0]?.id || "");
        setStatus({ phase: "ready", message: `${nextPending.length}건의 통합 검토 카드가 있습니다.` });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus({ phase: "failed", message: String((error as Error)?.message || error) });
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  useEffect(() => {
    const candidate = integrationCandidateFromItem(activeItem);
    setOverrideStrategy(candidate?.recommendedStrategy || "");
    setOverrideReason("");
    setPromotionProjectName(candidate?.groupKey ? `${candidate.groupKey} Project` : activeItem?.projectLabel || "");
  }, [activeItem?.id]);

  useEffect(() => {
    if (!filteredPendingItems.length) {
      setActiveItemId("");
      return;
    }
    if (!filteredPendingItems.some((item) => item.id === activeItemId)) {
      setActiveItemId(filteredPendingItems[0]?.id || "");
    }
  }, [filteredPendingItems, activeItemId]);

  useEffect(() => {
    if (!resolvedAuditQueue.length) {
      setAuditFocusId("");
      return;
    }
    if (!resolvedAuditQueue.some((item) => item.id === auditFocusId)) {
      setAuditFocusId(resolvedAuditQueue[0]?.id || "");
    }
  }, [resolvedAuditQueue, auditFocusId]);

  const move = (direction: -1 | 1) => {
    if (!filteredPendingItems.length) return;
    const nextIndex = Math.min(Math.max(activeIndex + direction, 0), filteredPendingItems.length - 1);
    setActiveItemId(filteredPendingItems[nextIndex]?.id || "");
    setInference("");
    setResolutionNote("");
    setOverrideReason("");
    setCompare({ ...EMPTY_COMPARE });
  };

  const focusItem = (itemId: string) => {
    setActiveItemId(itemId);
    setInference("");
    setResolutionNote("");
    setOverrideReason("");
    setCompare({ ...EMPTY_COMPARE });
  };

  const resolveActive = async (
    action: "approve" | "hold" | "investigate",
    noteOverride = "",
    options: DecisionResolveOptions = {},
  ) => {
    if (!activeItem) return;
    setStatus({ phase: "saving", message: `${activeItem.title || "카드"}를 ${action} 처리 중입니다.` });
    notify("running", "Decision 처리 시작", `${activeItem.title || "카드"} · ${action}`, { durationMs: 2200 });
    try {
      const note = noteOverride || resolutionNote || inference || directive;
      await resolveDecisionItem(activeItem.id, action, note, workspace, {
        ...options,
        overrideReason: options.overrideReason || overrideReason,
      });
      setInference("");
      setResolutionNote("");
      setOverrideReason("");
      setCompare({ ...EMPTY_COMPARE });
      await reload("");
      notify("success", "Decision 처리 완료", `${activeItem.title || "카드"}를 ${action} 처리했습니다.`);
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "Decision 처리 실패" });
      notify("error", "Decision 처리 실패", error instanceof Error ? error.message : "Decision 처리 실패");
    }
  };

  const runInference = async () => {
    if (!activeItem) return;
    setStatus({ phase: "thinking", message: "GLM이 현재 통합 검토 카드를 검토 중입니다." });
    notify("running", "Decision 판정 보조 시작", activeItem.title || "카드", { durationMs: 2200 });
    try {
      const result = await inferDecisionItem(activeItem, directive, workspace);
      setInference(result);
      setStatus({ phase: "ready", message: "GLM 판정 보조가 완료되었습니다." });
      notify("success", "Decision 판정 보조 완료", `${activeItem.title || "카드"}에 대한 권장안을 생성했습니다.`);
    } catch (error) {
      setStatus({ phase: "failed", message: error instanceof Error ? error.message : "GLM 판정 실패" });
      notify("error", "Decision 판정 보조 실패", error instanceof Error ? error.message : "GLM 판정 실패");
    }
  };

  const fetchComparisonPayload = async (item: DecisionItem) => {
    const sourcePath = item.path || "";
    const targetPath = decisionTargetPath(item, workspace);
    const [source, target] = await Promise.all([
      sourcePath ? fetchWikiPage(sourcePath).catch((error) => ({ markdown: `근거 문서 로드 실패: ${String(error)}` })) : Promise.resolve({ markdown: "" }),
      targetPath ? fetchWikiPage(targetPath).catch(() => ({ markdown: "" })) : Promise.resolve({ markdown: "" }),
    ]);
    return {
      itemId: item.id,
      sourcePath,
      targetPath,
      sourceMarkdown: source.markdown || "",
      targetMarkdown: target.markdown || "",
    };
  };

  const loadComparison = async () => {
    if (!activeItem) return null;
    setCompare({
      ...EMPTY_COMPARE,
      phase: "loading",
      message: "근거 문서와 반영 대상 문서를 불러오는 중입니다.",
      itemId: activeItem.id,
      sourcePath: activeItem.path || "",
      targetPath: decisionTargetPath(activeItem, workspace),
    });
    try {
      const payload = await fetchComparisonPayload(activeItem);
      const nextCompare = {
        ...payload,
        phase: "ready" as const,
        message: payload.targetMarkdown ? "근거 비교가 준비되었습니다." : "대상 문서가 없거나 비어 있습니다. 우측 편집기에서 새로 작성할 수 있습니다.",
        suggestion: null,
      };
      setCompare(nextCompare);
      return nextCompare;
    } catch (error) {
      setCompare((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "근거 비교 로드 실패",
      }));
      return null;
    }
  };

  const requestMergeSuggestion = async () => {
    if (!activeItem) return;
    const readyCompare = compare.itemId === activeItem.id && compare.phase !== "idle"
      ? compare
      : await loadComparison();
    if (!readyCompare) return;
    setCompare((current) => ({ ...current, phase: "merging", message: "GLM 병합안을 생성하는 중입니다." }));
    notify("running", "근거 병합안 생성 시작", activeItem.title || "카드", { durationMs: 2200 });
    try {
      const suggestion = await suggestDecisionMerge({
        id: activeItem.id,
        title: activeItem.title,
        content: activeItem.content,
        projectKey: activeItem.projectKey,
        projectLabel: activeItem.projectLabel,
        sourcePath: readyCompare.sourcePath,
        targetPath: readyCompare.targetPath,
        sourceMarkdown: readyCompare.sourceMarkdown,
        targetMarkdown: readyCompare.targetMarkdown,
        workspace,
      });
      setCompare((current) => ({
        ...current,
        phase: "ready",
        message: "GLM 병합안이 준비되었습니다.",
        suggestion,
      }));
      notify("success", "근거 병합안 생성 완료", `${activeItem.title || "카드"} 병합안을 준비했습니다.`);
    } catch (error) {
      setCompare((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "GLM 병합안 생성 실패",
      }));
      notify("error", "근거 병합안 생성 실패", error instanceof Error ? error.message : "GLM 병합안 생성 실패");
    }
  };

  const applyMergeSuggestion = () => {
    const mergedMarkdown = compare.suggestion?.mergedMarkdown || "";
    if (!mergedMarkdown) return;
    setCompare((current) => ({
      ...current,
      targetMarkdown: mergedMarkdown,
      message: "병합 초안을 편집기에 반영했습니다. 검토 후 저장하세요.",
    }));
  };

  const saveCompareTarget = async () => {
    if (!compare.targetPath) {
      setCompare((current) => ({ ...current, phase: "failed", message: "대상 경로가 없어 저장할 수 없습니다." }));
      return false;
    }
    setCompare((current) => ({ ...current, phase: "saving", message: "대상 문서를 저장하는 중입니다." }));
    notify("running", "대상 문서 저장 시작", compare.targetPath, { durationMs: 2200 });
    try {
      await saveWikiPage(compare.targetPath, compare.targetMarkdown);
      setCompare((current) => ({ ...current, phase: "ready", message: "대상 문서를 저장했습니다." }));
      notify("success", "대상 문서 저장 완료", compare.targetPath);
      return true;
    } catch (error) {
      setCompare((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "대상 문서 저장 실패",
      }));
      notify("error", "대상 문서 저장 실패", error instanceof Error ? error.message : "대상 문서 저장 실패");
      return false;
    }
  };

  const saveCompareAndApprove = async () => {
    const saved = await saveCompareTarget();
    if (!saved) return;
    await resolveActive("approve", resolutionNote || compare.suggestion?.summary || "Decision Deck 비교 패널에서 저장 후 승인 처리");
  };

  const setCompareTargetMarkdown = (targetMarkdown: string) => {
    setCompare((current) => ({ ...current, targetMarkdown }));
  };

  const applyInferenceRecommendation = () => {
    if (!inference.trim()) return;
    resolveActive(recommendedActionFromInference(inference));
  };

  const approveWithSelectedStrategy = async () => {
    if (!activeItem) return;
    if (!activeIsIntegration) {
      await resolveActive("approve");
      return;
    }
    const options: DecisionResolveOptions = {};
    if (selectedStrategy && selectedStrategy !== activeIntegrationCandidate?.recommendedStrategy) {
      options.overrideStrategy = selectedStrategy;
      options.overrideReason = overrideReason || resolutionNote || "사용자 전략 override";
    }
    if (selectedStrategy === "promote_to_new_project") {
      options.overrideProjectName = promotionProjectName || promotionPreview?.projectLabel || "";
      options.overrideProjectLabel = promotionProjectName || promotionPreview?.projectLabel || "";
      options.overrideProjectKey = promotionPreview?.projectKey || "";
    }
    await resolveActive("approve", "", options);
  };

  const approvePromoteToProject = async () => {
    if (!activeItem) return;
    await resolveActive("approve", "", {
      overrideStrategy: "promote_to_new_project",
      overrideReason: overrideReason || resolutionNote || "기존 space 편입 대신 새 canonical project로 승격",
      overrideProjectName: promotionProjectName || promotionPreview?.projectLabel || "",
      overrideProjectLabel: promotionProjectName || promotionPreview?.projectLabel || "",
      overrideProjectKey: promotionPreview?.projectKey || "",
    });
  };

  const scanMergeCandidates = async () => {
    setMergeScan({ phase: "scanning", message: "전체 위키의 태그/키워드/그래프맵 기반 유사도를 계산하는 중입니다.", snapshot: mergeScan.snapshot });
    notify("running", "병합 후보 스캔 시작", "태그, 키워드, 그래프 연결을 분석합니다.", { durationMs: 2400 });
    try {
      const snapshot = await scanDecisionMergeCandidates(workspace, 24);
      setMergeScan({
        phase: "ready",
        message: `병합 후보 ${snapshot.candidates.length}건 · 충돌 위험 ${snapshot.summary.conflictRisk}건`,
        snapshot,
      });
      notify("success", "병합 후보 스캔 완료", `${snapshot.candidates.length}건의 전략 후보를 찾았습니다.`);
    } catch (error) {
      setMergeScan({
        phase: "failed",
        message: error instanceof Error ? error.message : "병합 후보 스캔 실패",
        snapshot: mergeScan.snapshot,
      });
      notify("error", "병합 후보 스캔 실패", error instanceof Error ? error.message : "병합 후보 스캔 실패");
    }
  };

  const enqueueMergeCandidate = async (candidate: DecisionMergeCandidate) => {
    setMergeScan((current) => ({ ...current, phase: "enqueuing", message: "병합 후보를 Decision Queue에 등록하는 중입니다." }));
    notify("running", "Decision Queue 등록", candidate.primary?.title || candidate.id, { durationMs: 2200 });
    try {
      await enqueueDecisionMergeCandidate(candidate, workspace);
      await reload("");
      setMergeScan((current) => ({ ...current, phase: "ready", message: "병합 후보를 Decision Queue에 등록했습니다." }));
      notify("success", "Decision Queue 등록 완료", candidate.primary?.title || candidate.id);
    } catch (error) {
      setMergeScan((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "Decision Queue 등록 실패",
      }));
      notify("error", "Decision Queue 등록 실패", error instanceof Error ? error.message : "Decision Queue 등록 실패");
    }
  };

  const scanAndEnqueueTopMergeCandidates = async () => {
    setMergeScan({ phase: "enqueuing", message: "병합 후보를 스캔하고 상위 후보를 Decision Queue에 등록하는 중입니다.", snapshot: mergeScan.snapshot });
    notify("running", "상위 병합 후보 등록", "스캔 후 상위 5건을 Decision Queue에 올립니다.", { durationMs: 2600 });
    try {
      const snapshot = await scanAndEnqueueDecisionMergeCandidates(workspace, 5, 24);
      await reload("");
      setMergeScan({
        phase: "ready",
        message: `상위 후보 ${snapshot.enqueued?.length || 0}건 등록 · 전체 후보 ${snapshot.candidates.length}건`,
        snapshot,
      });
      notify("success", "상위 병합 후보 등록 완료", `${snapshot.enqueued?.length || 0}건을 Decision Queue에 등록했습니다.`);
    } catch (error) {
      setMergeScan({
        phase: "failed",
        message: error instanceof Error ? error.message : "상위 병합 후보 등록 실패",
        snapshot: mergeScan.snapshot,
      });
      notify("error", "상위 병합 후보 등록 실패", error instanceof Error ? error.message : "상위 병합 후보 등록 실패");
    }
  };

  const scanIntegrationCandidates = async () => {
    setIntegrationScan({ phase: "scanning", message: "프로젝트/계정/Slack 성격과 연결 신호를 계산하는 중입니다.", snapshot: integrationScan.snapshot });
    notify("running", "통합 후보 스캔 시작", "고객/주제/문서 성격을 분석합니다.", { durationMs: 2400 });
    try {
      const snapshot = await scanWikiIntegrationCandidates(workspace, 20);
      setIntegrationScan({
        phase: "ready",
        message: `통합 후보 ${snapshot.candidates.length}건 · account rollup ${snapshot.summary.accountRollups || 0}건`,
        snapshot,
      });
      notify("success", "통합 후보 스캔 완료", `${snapshot.candidates.length}건의 통합 후보를 찾았습니다.`);
    } catch (error) {
      setIntegrationScan({
        phase: "failed",
        message: error instanceof Error ? error.message : "통합 후보 스캔 실패",
        snapshot: integrationScan.snapshot,
      });
      notify("error", "통합 후보 스캔 실패", error instanceof Error ? error.message : "통합 후보 스캔 실패");
    }
  };

  const enqueueIntegrationCandidate = async (candidate: WikiIntegrationCandidate) => {
    setIntegrationScan((current) => ({ ...current, phase: "enqueuing", message: "통합 후보를 Decision Queue에 등록하는 중입니다." }));
    notify("running", "통합 후보 등록", candidate.groupKey, { durationMs: 2200 });
    try {
      await enqueueWikiIntegrationDecisionCandidate(candidate, workspace);
      await reload("");
      setIntegrationScan((current) => ({ ...current, phase: "ready", message: "통합 후보를 Decision Queue에 등록했습니다." }));
      notify("success", "통합 후보 등록 완료", candidate.groupKey);
    } catch (error) {
      setIntegrationScan((current) => ({
        ...current,
        phase: "failed",
        message: error instanceof Error ? error.message : "통합 후보 등록 실패",
      }));
      notify("error", "통합 후보 등록 실패", error instanceof Error ? error.message : "통합 후보 등록 실패");
    }
  };

  const scanAndEnqueueTopIntegrationCandidates = async () => {
    setIntegrationScan({ phase: "enqueuing", message: "통합 후보를 스캔하고 상위 후보를 Decision Queue에 등록하는 중입니다.", snapshot: integrationScan.snapshot });
    notify("running", "상위 통합 후보 등록", "스캔 후 상위 5건을 Decision Queue에 올립니다.", { durationMs: 2600 });
    try {
      const snapshot = await scanAndEnqueueWikiIntegrationCandidates(workspace, 5, 20);
      await reload("");
      setIntegrationScan({
        phase: "ready",
        message: `상위 후보 ${snapshot.enqueued?.length || 0}건 등록 · 전체 후보 ${snapshot.candidates.length}건`,
        snapshot,
      });
      notify("success", "상위 통합 후보 등록 완료", `${snapshot.enqueued?.length || 0}건을 Decision Queue에 등록했습니다.`);
    } catch (error) {
      setIntegrationScan({
        phase: "failed",
        message: error instanceof Error ? error.message : "상위 통합 후보 등록 실패",
        snapshot: integrationScan.snapshot,
      });
      notify("error", "상위 통합 후보 등록 실패", error instanceof Error ? error.message : "상위 통합 후보 등록 실패");
    }
  };

  return {
    items,
    pendingItems,
    filteredPendingItems,
    resolvedItems,
    pendingFilterScopes,
    pendingAgeBuckets,
    pendingValidationBuckets,
    pendingStrategyBuckets,
    queueScope,
    queueInboxFilter,
    queueStrategyFilter,
    activeItem,
    activeIndex,
    activeContentItems,
    activeTargetPath,
    activeIsConflict,
    activeIsDeletion,
    activeIsIntegration,
    activeIntegrationCandidate,
    activeAgeDays,
    activeAgeBucket,
    selectedStrategy,
    activeStrategySummary,
    activeStrategyReasons,
    activeStrategySteps,
    activeChangeTargets,
    activeRelatedWikis,
    activeValidationInbox,
    reflectionChecklist,
    executionQueue,
    resolvedAuditQueue,
    activeAuditItem,
    promotionPreview,
    directive,
    inference,
    resolutionNote,
    overrideStrategy,
    overrideReason,
    promotionProjectName,
    compare,
    mergeScan,
    integrationScan,
    status,
    summary,
    setActiveItemId,
    focusItem,
    setDirective,
    setResolutionNote,
    setAuditFocusId,
    setQueueScope,
    setQueueInboxFilter,
    setQueueStrategyFilter,
    setOverrideStrategy,
    setOverrideReason,
    setPromotionProjectName,
    setCompareTargetMarkdown,
    move,
    reload,
    resolveActive,
    approveWithSelectedStrategy,
    approvePromoteToProject,
    runInference,
    loadComparison,
    requestMergeSuggestion,
    applyMergeSuggestion,
    saveCompareTarget,
    saveCompareAndApprove,
    applyInferenceRecommendation,
    scanMergeCandidates,
    enqueueMergeCandidate,
    scanAndEnqueueTopMergeCandidates,
    scanIntegrationCandidates,
    enqueueIntegrationCandidate,
    scanAndEnqueueTopIntegrationCandidates,
  };
}
