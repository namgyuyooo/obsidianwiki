import type { FormEvent, KeyboardEvent, PointerEvent, WheelEvent } from "react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ChatContext } from "../../chat/constants";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import { surfaceScope, writeLastWikiPath } from "../../../shared/surfaceHandoff";
import { continueAfterCollection, runTargetedRclone } from "../../mission/api/controlPlaneApi";
import {
  deleteWikiPage as deleteWikiPageApi,
  deleteWikiProjectPackage as deleteWikiProjectPackageApi,
  applyWikiManagementCommand,
  browseFilesystem,
  browseRemoteDrive,
  fetchCollectionStatus,
  fetchWikiDeletionCandidates,
  fetchWikiGraph,
  fetchWikiManagementCommands,
  refreshWikiGraph,
  runWikiManagementCommand,
  enqueueWikiDeletionCandidates as enqueueWikiDeletionCandidatesApi,
  type CollectionStatusPayload,
  type FilesystemBrowsePayload,
  type RemoteBrowserPayload,
  type WikiDeletionCandidate,
  type WikiDeletionCandidatesPayload,
  type WikiGraphNode,
  type WikiGraphPayload,
  type WikiManagementApplyResult,
  type WikiManagementCommand,
  type WikiPageIndexItem,
  type WikiSearchResult,
  type WikiStatusCatalog,
  saveWikiStatusBulk,
} from "../api/wikiApi";
import { useWikiEvidenceConsole } from "../hooks/useWikiEvidenceConsole";

type WikiWorkspaceProps = {
  chatContext: ChatContext;
  onOpenChatWithDraft: (text: string) => void;
  onReturnToChat: () => void;
};

type StatusEditorProps = {
  page: WikiPageIndexItem | null;
  catalog: WikiStatusCatalog;
  onSave: (input: { status: string; tags: string; highlight: string; note: string }) => void;
};

type WikiFolderGroup = {
  key: string;
  label: string;
  type: string;
  count: number;
  pages: WikiPageIndexItem[];
};

type WikiResultItem = WikiPageIndexItem | WikiSearchResult;
type WikiSortKey = "relevance" | "updated" | "title" | "kind" | "status" | "size";
type WikiSortDirection = "asc" | "desc";
type WikiDocumentMode = "preview" | "edit";
type CollectionQueueItem = {
  path: string;
  source: "manual" | "mirror";
  targetType: "directory" | "file";
  approved?: boolean;
  onHold?: boolean;
  lastAction?: "idle" | "dry-run" | "run" | "failed";
  lastError?: string;
};
type BrowseTypeFilter = "all" | "directory" | "file";
type CollectionPreset = {
  id: string;
  label: string;
  ext: string[];
  type?: BrowseTypeFilter;
};
type ReasonLogEntry = {
  id: string;
  title: string;
  detail: string;
};
type SavedQueueSnapshot = {
  id: string;
  name: string;
  updatedAt: string;
  items: CollectionQueueItem[];
};
type BulkStatusDraft = {
  status: string;
  tags: string;
  highlight: string;
  note: string;
};

type WikiGraphPlacedNode = WikiGraphNode & {
  x: number;
  y: number;
  r: number;
};

const ALL_FOLDER_KEY = "all";
const ALL_FILTER_VALUE = "all";
const FOLDER_TYPE_ORDER = ["Project", "Account", "Common", "Memory", "Folder"];
const WIKI_RESULT_LIMIT = 200;
const GRAPH_NODE_LIMIT = 64;
const GRAPH_EDGE_LIMIT = 120;
const GRAPH_WIDTH = 360;
const GRAPH_HEIGHT = 240;
const MIRROR_PREFIX = "automation/drive_wikify/runtime/mirror/";
const DEFAULT_COLLECTION_PATH = "automation/drive_wikify/runtime/mirror";
const EMPTY_BROWSE: FilesystemBrowsePayload = {
  targets: [],
  files: [],
  directories: [],
  blocked: [],
  entries: [],
};

function initialCollectionParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}
const EMPTY_GRAPH: WikiGraphPayload = {
  nodes: [],
  edges: [],
};
const EMPTY_REMOTE_BROWSE: RemoteBrowserPayload = {
  remote: "",
  root: "",
  currentPath: "",
  parentPath: "",
  blocked: false,
  error: "",
  items: [],
};
const EMPTY_COLLECTION_STATUS: CollectionStatusPayload = {
  manifestFolders: [],
  manifestFiles: [],
  processedFolders: [],
  processedFiles: [],
};
const EMPTY_DELETION_CANDIDATES: WikiDeletionCandidatesPayload = {
  generatedAt: "",
  workspace: "rtm",
  candidates: [],
  summary: {
    total: 0,
    high: 0,
    orphan: 0,
  },
};
const COLLECTION_QUEUE_STORAGE_KEY = "assistant-ui.collection-queue-snapshots";
const COLLECTION_PRESETS: CollectionPreset[] = [
  { id: "all", label: "전체", ext: [], type: "all" },
  { id: "documents", label: "문서", ext: [".pdf", ".docx", ".hwp", ".hwpx"], type: "file" },
  { id: "slides", label: "슬라이드", ext: [".pptx"], type: "file" },
  { id: "sheets", label: "시트", ext: [".xlsx", ".xls", ".csv"], type: "file" },
  { id: "office", label: "office", ext: [".pdf", ".docx", ".pptx", ".xlsx", ".hwp", ".hwpx"], type: "file" },
  { id: "folders", label: "폴더만", ext: [], type: "directory" },
];
const PROTECTED_DELETION_FILE_NAMES = new Set([
  "index.md",
  "hub.md",
  "Project_Overview.md",
  "Sources.md",
  "Evidence_Log.md",
  "Action_Items.md",
  "Risks.md",
  "Decisions.md",
  "Conflict_Register.md",
  "Change_Log.md",
  "KPI.md",
  "Next_Meeting_Prep.md",
  "Project_Relationships.md",
  "Reference_Register.md",
  "Expansion_Structure.md",
  "Document_Usage_Log.md",
]);

function folderKey(page: WikiPageIndexItem) {
  if (page.division === "project" || page.division === "account") {
    return `${page.division}:${page.projectKey || page.projectLabel || page.section || "Project"}`;
  }
  if (page.division === "memory") return "L1_memory";
  return `${page.division || "wiki"}:${page.section || page.division || "Wiki"}`;
}

function folderLabel(page: WikiPageIndexItem) {
  if (page.division === "project" || page.division === "account") return page.projectLabel || page.projectKey || page.section || "Project";
  if (page.division === "memory") return "L1 Memory";
  if (page.division === "common") return "Common";
  if (page.division === "log") return "Logs / Audit";
  return page.section || page.division || "Wiki";
}

function folderType(page: WikiPageIndexItem) {
  if (page.division === "project") return "Project";
  if (page.division === "account") return "Account";
  if (page.division === "memory") return "Memory";
  if (page.division === "common") return "Common";
  return page.division || "Folder";
}

function projectKeyFromWikiPath(path: string) {
  const normalized = String(path || "").trim().replace(/\\/g, "/");
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  const wikiIndex = parts.findIndex((part) => part === "Wiki");
  if (wikiIndex === -1) return "";
  return parts[wikiIndex + 1] || "";
}

function isAlreadyMissingProjectError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("삭제할 프로젝트 패키지를 찾지 못했습니다");
}

function folderSortRank(type: string) {
  const rank = FOLDER_TYPE_ORDER.indexOf(type);
  return rank === -1 ? FOLDER_TYPE_ORDER.length : rank;
}

function buildFolderGroups(pages: WikiPageIndexItem[]) {
  const groups = new Map<string, WikiFolderGroup>();
  for (const page of pages) {
    const key = folderKey(page);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.pages.push(page);
      continue;
    }
    groups.set(key, {
      key,
      label: folderLabel(page),
      type: folderType(page),
      count: 1,
      pages: [page],
    });
  }
  return [...groups.values()].sort((a, b) => {
    return folderSortRank(a.type) - folderSortRank(b.type) || a.label.localeCompare(b.label, "ko");
  });
}

function folderLatestUpdatedAt(folder: WikiFolderGroup) {
  return folder.pages.reduce<string | null>((latest, page) => {
    if (!page.updatedAt) return latest;
    if (!latest || page.updatedAt > latest) return page.updatedAt;
    return latest;
  }, null);
}

function isWikiPageIndexItem(item: WikiResultItem): item is WikiPageIndexItem {
  return "division" in item || "docKind" in item || "workflowStatus" in item || "updatedAt" in item;
}

function frontmatterText(item: WikiResultItem, key: string) {
  if (!("frontmatter" in item) || !item.frontmatter) return "";
  const value = item.frontmatter[key];
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
}

function itemMeta(item: WikiResultItem, pageIndexByPath: Map<string, WikiPageIndexItem>) {
  return pageIndexByPath.get(item.path) || (isWikiPageIndexItem(item) ? item : null);
}

function resultKind(item: WikiResultItem, meta: WikiPageIndexItem | null) {
  return meta?.docKind || meta?.nature || frontmatterText(item, "docKind") || frontmatterText(item, "nature") || meta?.division || "page";
}

function resultStatusKey(item: WikiResultItem, meta: WikiPageIndexItem | null) {
  return meta?.workflowStatus || frontmatterText(item, "workflowStatus") || "unknown";
}

function resultStatusLabel(item: WikiResultItem, meta: WikiPageIndexItem | null) {
  return meta?.workflowStatusLabel || resultStatusKey(item, meta);
}

function resultUpdatedAt(item: WikiResultItem, meta: WikiPageIndexItem | null) {
  return meta?.updatedAt || frontmatterText(item, "updatedAt") || "";
}

function resultSize(meta: WikiPageIndexItem | null) {
  return meta?.size || 0;
}

function resultProjectText(item: WikiResultItem, meta: WikiPageIndexItem | null) {
  return meta?.projectLabel || meta?.projectKey || frontmatterText(item, "projectLabel") || frontmatterText(item, "projectKey");
}

function itemMatchesQuery(item: WikiResultItem, meta: WikiPageIndexItem | null, query: string) {
  if (!query) return true;
  const haystack = [
    item.title,
    item.path,
    "snippet" in item ? item.snippet : "",
    resultProjectText(item, meta),
    resultKind(item, meta),
    resultStatusLabel(item, meta),
  ].join(" ");
  return haystack.toLowerCase().includes(query);
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "ko", { numeric: true, sensitivity: "base" });
}

function byUpdatedDesc(left: WikiPageIndexItem, right: WikiPageIndexItem) {
  return compareText(right.updatedAt || "", left.updatedAt || "") || compareText(left.title || "", right.title || "");
}

function isProtectedDeletionPage(page: WikiPageIndexItem | null) {
  if (!page) return false;
  const fileName = page.path.split("/").pop() || "";
  if (PROTECTED_DELETION_FILE_NAMES.has(fileName)) return true;
  if (page.docKind === "hub") return true;
  return false;
}

function isHubDeletionPage(page: WikiPageIndexItem | null) {
  if (!page) return false;
  const fileName = page.path.split("/").pop() || "";
  return fileName === "hub.md" || page.docKind === "hub";
}

function statusDraftForPage(page: WikiPageIndexItem | null): BulkStatusDraft {
  return {
    status: page?.workflowStatus || "unknown",
    tags: (page?.workflowTags || []).join(", "),
    highlight: page?.workflowStatusHighlight || "",
    note: page?.workflowNote || "",
  };
}

function compareWikiResults(
  left: WikiResultItem,
  right: WikiResultItem,
  pageIndexByPath: Map<string, WikiPageIndexItem>,
  sortKey: WikiSortKey,
  direction: WikiSortDirection,
) {
  const leftMeta = itemMeta(left, pageIndexByPath);
  const rightMeta = itemMeta(right, pageIndexByPath);
  const multiplier = direction === "asc" ? 1 : -1;
  const comparison = (() => {
    if (sortKey === "relevance") return (("score" in left ? left.score || 0 : 0) - ("score" in right ? right.score || 0 : 0)) || compareText(resultTitle(left), resultTitle(right));
    if (sortKey === "updated") return compareText(resultUpdatedAt(left, leftMeta), resultUpdatedAt(right, rightMeta));
    if (sortKey === "kind") return compareText(resultKind(left, leftMeta), resultKind(right, rightMeta)) || compareText(resultTitle(left), resultTitle(right));
    if (sortKey === "status") return compareText(resultStatusLabel(left, leftMeta), resultStatusLabel(right, rightMeta)) || compareText(resultTitle(left), resultTitle(right));
    if (sortKey === "size") return resultSize(leftMeta) - resultSize(rightMeta);
    return compareText(resultTitle(left), resultTitle(right));
  })();
  return comparison * multiplier;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="aui-wiki-link" data-wiki-link="$1" title="$1">$2</span>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="aui-wiki-link" data-wiki-link="$1">$1</span>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" data-preview-link="$2">$1</a>');
}

function normalizeWikiLinkValue(value = "") {
  return value.trim().replace(/\\/g, "/");
}

function basenameWithoutExtension(value = "") {
  const normalized = normalizeWikiLinkValue(value);
  const leaf = normalized.split("/").pop() || normalized;
  return leaf.replace(/\.[^.]+$/, "");
}

function resolveWikiLinkTarget(target: string, activePath: string, pages: WikiPageIndexItem[]) {
  const normalizedTarget = normalizeWikiLinkValue(target).replace(/^\/+/, "");
  if (!normalizedTarget) return "";
  const lowerTarget = normalizedTarget.toLowerCase();
  const currentDir = normalizeWikiLinkValue(activePath).split("/").slice(0, -1).join("/");
  const candidates = new Set<string>();
  const pushCandidate = (value = "") => {
    const cleaned = normalizeWikiLinkValue(value).replace(/^\/+/, "");
    if (!cleaned) return;
    candidates.add(cleaned);
    if (!cleaned.toLowerCase().endsWith(".md")) candidates.add(`${cleaned}.md`);
  };

  pushCandidate(normalizedTarget);
  if (currentDir) pushCandidate(`${currentDir}/${normalizedTarget}`);

  for (const page of pages) {
    const pagePath = normalizeWikiLinkValue(page.path).replace(/^\/+/, "");
    const lowerPath = pagePath.toLowerCase();
    for (const candidate of candidates) {
      const lowerCandidate = candidate.toLowerCase();
      if (lowerPath === lowerCandidate || lowerPath.endsWith(`/${lowerCandidate}`)) return page.path;
    }
  }

  const normalizedTitle = basenameWithoutExtension(normalizedTarget).toLowerCase();
  const titleMatch = pages.find((page) => {
    const byTitle = String(page.title || "").trim().toLowerCase() === normalizedTitle;
    const byBasename = basenameWithoutExtension(page.path).toLowerCase() === normalizedTitle;
    return byTitle || byBasename;
  });
  return titleMatch?.path || "";
}

function isTableDivider(value = "") {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(value);
}

function tableCells(value = "") {
  return value
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function markdownPreview(markdown: string) {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let listMode: "ul" | "ol" | "" = "";

  const closeList = () => {
    if (!listMode) return;
    html.push(`</${listMode}>`);
    listMode = "";
  };

  const openList = (mode: "ul" | "ol") => {
    if (listMode === mode) return;
    closeList();
    html.push(`<${mode}>`);
    listMode = mode;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const nextLine = lines[index + 1] || "";
    if (line.includes("|") && isTableDivider(nextLine)) {
      closeList();
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      index -= 1;
      html.push([
        "<table>",
        `<thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead>`,
        `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`,
        "</table>",
      ].join(""));
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const blockquote = line.match(/^>\s?(.*)$/);
    if (blockquote) {
      closeList();
      html.push(`<blockquote>${inlineMarkdown(blockquote[1] || "")}</blockquote>`);
      continue;
    }

    const checklist = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checklist) {
      openList("ul");
      const checked = checklist[1].toLowerCase() === "x" ? " checked" : "";
      html.push(`<li class="aui-wiki-check"><input type="checkbox"${checked} disabled /> <span>${inlineMarkdown(checklist[2])}</span></li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      openList("ol");
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      openList("ul");
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) {
      html.push("<br />");
      continue;
    }
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  if (codeLines.length) html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return html.join("");
}

function shortDate(value = "") {
  return value ? value.slice(0, 10) : "-";
}

function resultTitle(item: WikiPageIndexItem | WikiSearchResult) {
  return item.title || item.path.split("/").pop() || item.path;
}

function treeLabel(path = "") {
  return path.split("/").pop() || path;
}

function remotePathFromMirror(path = "") {
  if (!path.startsWith(MIRROR_PREFIX)) return "";
  return path.slice(MIRROR_PREFIX.length).replace(/^\/+/, "");
}

function tokenSet(value: string) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .split(/[^가-힣a-z0-9]+/i)
      .filter((item) => item.length >= 2 && !["project", "account", "wiki", "drive", "mirror"].includes(item)),
  );
}

function overlapScore(a: string, b: string) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  let score = 0;
  for (const token of left) if (right.has(token)) score += 1;
  return score;
}

function projectRouteHint(path: string, pages: WikiPageIndexItem[]) {
  const candidates = pages
    .filter((page) => page.division === "project" || page.division === "account")
    .map((page) => ({
      projectKey: page.projectKey || "",
      projectLabel: page.projectLabel || page.projectKey || "",
      path: page.path,
      score: Math.max(overlapScore(path, page.projectKey || ""), overlapScore(path, page.projectLabel || "")),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.projectLabel.localeCompare(b.projectLabel, "ko"));
  return candidates[0] || null;
}

function projectRouteCandidates(path: string, pages: WikiPageIndexItem[]) {
  return pages
    .filter((page) => page.division === "project" || page.division === "account")
    .map((page) => ({
      projectKey: page.projectKey || "",
      projectLabel: page.projectLabel || page.projectKey || "",
      path: page.path,
      score: Math.max(overlapScore(path, page.projectKey || ""), overlapScore(path, page.projectLabel || "")),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.projectLabel.localeCompare(b.projectLabel, "ko"))
    .slice(0, 3);
}

function normalizedCollectionPath(path = "") {
  return String(path || "").replace(/^\/+|\/+$/g, "");
}

function pathMatchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function queueStatusForPath(path: string, status: CollectionStatusPayload, targetType: "directory" | "file" = "directory") {
  const normalized = normalizedCollectionPath(path);
  if (!normalized) return "unknown";
  if (targetType === "file") {
    if ((status.processedFiles || []).includes(normalized)) return "processed";
    if ((status.manifestFiles || []).includes(normalized)) return "manifested";
    return "queued";
  }
  const processed = (status.processedFolders || []).some((item) => pathMatchesPrefix(item, normalized));
  if (processed) return "processed";
  const manifested = (status.manifestFolders || []).some((item) => pathMatchesPrefix(item, normalized));
  if (manifested) return "manifested";
  return "queued";
}

function collectionStatusDetail(path: string, status: CollectionStatusPayload, targetType: "directory" | "file" = "directory") {
  const normalized = normalizedCollectionPath(path);
  const queueStatus = queueStatusForPath(normalized, status, targetType);
  const detail = [
    `path: ${normalized || "-"}`,
    `target: ${targetType}`,
    `status: ${queueStatus}`,
    `manifest: ${status.manifestPath || "-"}`,
    `run output: ${status.runOutputPath || "-"}`,
  ];
  if (targetType === "file") {
    detail.push(`manifested file: ${(status.manifestFiles || []).includes(normalized) ? "yes" : "no"}`);
    detail.push(`processed file: ${(status.processedFiles || []).includes(normalized) ? "yes" : "no"}`);
  } else {
    detail.push(`manifested subtree: ${(status.manifestFolders || []).some((item) => pathMatchesPrefix(item, normalized)) ? "yes" : "no"}`);
    detail.push(`processed subtree: ${(status.processedFolders || []).some((item) => pathMatchesPrefix(item, normalized)) ? "yes" : "no"}`);
  }
  return detail.join("\n");
}

function collectionReasoningSummary(input: {
  path: string;
  targetType: "directory" | "file";
  queueStatus: string;
  routeHint?: { projectLabel?: string; score?: number } | null;
  sourceLabel?: string;
  status?: CollectionStatusPayload;
  pages?: WikiPageIndexItem[];
}) {
  const normalized = normalizedCollectionPath(input.path);
  const tokens = [...tokenSet(normalized)];
  const pathTokens = tokens.join(", ") || "-";
  const candidates = input.pages ? projectRouteCandidates(normalized, input.pages) : [];
  const lines = [
    "Step 1. Input Signals",
    `- path: ${normalized}`,
    `- source: ${input.sourceLabel || "-"}`,
    `- target_type: ${input.targetType}`,
    `- queue_status: ${input.queueStatus}`,
    "",
    "Step 2. Tokenization",
    `- tokens: ${pathTokens}`,
    `- token_count: ${tokens.length}`,
    "",
    "Step 3. Candidate Comparison",
  ];
  if (input.routeHint?.projectLabel) {
    lines.push(`- top_match: ${input.routeHint.projectLabel}`);
    lines.push(`- top_score: ${input.routeHint.score || 0}`);
  } else {
    lines.push("- top_match: none");
    lines.push("- top_score: 0");
  }
  if (candidates.length) lines.push(`- top3: ${candidates.map((item) => `${item.projectLabel}(${item.score})`).join(" | ")}`);
  else lines.push("- top3: none");
  lines.push("", "Step 4. Status Checks");
  if (input.status) {
    if (input.targetType === "file") {
      lines.push(`- manifest_hit: ${(input.status.manifestFiles || []).includes(normalized) ? "yes" : "no"}`);
      lines.push(`- run_output_hit: ${(input.status.processedFiles || []).includes(normalized) ? "yes" : "no"}`);
    } else {
      lines.push(`- manifest_subtree_hit: ${(input.status.manifestFolders || []).some((item) => pathMatchesPrefix(item, normalized)) ? "yes" : "no"}`);
      lines.push(`- run_output_subtree_hit: ${(input.status.processedFolders || []).some((item) => pathMatchesPrefix(item, normalized)) ? "yes" : "no"}`);
    }
  }
  lines.push("", "Step 5. Rule Hits");
  if (input.routeHint?.projectLabel) lines.push("- rule: project_route_hint_detected");
  else lines.push("- rule: no_project_route_hint");
  if (input.queueStatus === "processed") lines.push("- rule: already_processed_hold");
  else if (input.queueStatus === "manifested") lines.push("- rule: manifested_but_not_fully_processed");
  else lines.push("- rule: queue_candidate_open");
  lines.push("", "Step 6. Final Decision");
  if (input.queueStatus === "processed") lines.push("- decision: keep visible, avoid duplicate run unless forced");
  else if (input.queueStatus === "manifested") lines.push("- decision: eligible for continue-after-collection or selective rerun");
  else lines.push("- decision: eligible for queue/run");
  return lines.join("\n");
}

function collectionImpactPreview(path: string, targetType: "directory" | "file", queueStatus: string, routeHint?: { projectLabel?: string } | null) {
  const lines = [];
  if (routeHint?.projectLabel) lines.push(`target wiki: ${routeHint.projectLabel}`);
  else lines.push("target wiki: unresolved");
  if (queueStatus === "processed") lines.push("impact: duplicate processing risk if run again");
  else if (queueStatus === "manifested") lines.push("impact: manifest exists, likely continue/refresh path");
  else lines.push("impact: new ingest candidate");
  lines.push(`unit: ${targetType}`);
  return lines.join(" · ");
}

function graphLayout(nodes: WikiGraphNode[]) {
  const groups = [...new Set(nodes.map((node) => node.section || "Wiki"))];
  const groupAngles = new Map(groups.map((group, index) => [group, (Math.PI * 2 * index) / Math.max(groups.length, 1)]));
  return nodes.map<WikiGraphPlacedNode>((node, index) => {
    const angle = (groupAngles.get(node.section || "Wiki") || 0) + index * 0.47;
    const radius = 34 + Math.min(82, (index % 28) * 3.4) + (node.degree || 0) * 1.8;
    return {
      ...node,
      x: GRAPH_WIDTH / 2 + Math.cos(angle) * radius,
      y: GRAPH_HEIGHT / 2 + Math.sin(angle) * radius,
      r: Math.max(5, Math.min(15, 5 + (node.degree || 0) * 0.85)),
    };
  });
}

function summarizeOperation(operation: { type?: string; rationale?: string; applyMode?: string; proposedChanges?: unknown; pairs?: unknown }) {
  return operation.rationale || operation.applyMode || JSON.stringify(operation.proposedChanges || operation.pairs || "").slice(0, 120);
}

function markdownListLines(markdown = "") {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s?/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function StatusEditor({ page, catalog, onSave }: StatusEditorProps) {
  const [status, setStatus] = useState("unknown");
  const [tags, setTags] = useState("");
  const [highlight, setHighlight] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setStatus(page?.workflowStatus || "unknown");
    setTags((page?.workflowTags || []).join(", "));
    setHighlight(page?.workflowStatusHighlight || "");
    setNote(page?.workflowNote || "");
  }, [page?.path]);

  if (!page) {
    return <p className="aui-wiki-muted">선택된 문서가 없습니다.</p>;
  }
  if (page.statusManaged === false) {
    return <p className="aui-wiki-muted">이 문서는 L1/보조 메모리라 업무 상태 관리 대상에서 제외됩니다.</p>;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ status, tags, highlight, note });
  };

  return (
    <form className="aui-wiki-status-form" onSubmit={handleSubmit}>
      <label>
        <span>상태</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {Object.entries(catalog).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>태그</span>
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="고객대응, 이번주, 보고서" />
      </label>
      <label>
        <span>하이라이트</span>
        <input value={highlight} onChange={(event) => setHighlight(event.target.value)} placeholder="운영 상태 한 줄" />
      </label>
      <label>
        <span>메모</span>
        <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button type="submit">상태 저장</button>
    </form>
  );
}

function WikiGraphPanel({
  activePath,
  graph,
  message,
  onExpand,
  onOpenPage,
  onRefreshGraph,
  phase,
}: {
  activePath: string;
  graph: WikiGraphPayload;
  message: string;
  onExpand?: () => void;
  onOpenPage: (path: string) => void;
  onRefreshGraph: () => void;
  phase: string;
}) {
  const nodes = graph.nodes.slice(0, GRAPH_NODE_LIMIT);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).slice(0, GRAPH_EDGE_LIMIT);
  const placed = graphLayout(nodes);
  const nodeById = new Map(placed.map((node) => [node.id, node]));
  const [hoveredNodeId, setHoveredNodeId] = useState("");
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: onExpand ? 1 : 0.9 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number | null; startX: number; startY: number; originX: number; originY: number }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const focusNodeId = hoveredNodeId || activePath;
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    edges.forEach((edge) => {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)?.add(edge.target);
      map.get(edge.target)?.add(edge.source);
    });
    return map;
  }, [edges]);
  const neighborIds = focusNodeId ? adjacency.get(focusNodeId) || new Set<string>() : new Set<string>();
  const focusedLinkCount = focusNodeId
    ? edges.filter((edge) => edge.source === focusNodeId || edge.target === focusNodeId).length
    : 0;
  const clampScale = (value: number) => Math.max(0.55, Math.min(2.4, Number(value.toFixed(3))));
  const handleGraphPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleGraphPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    setViewport((current) => ({ ...current, x: dragRef.current.originX + dx, y: dragRef.current.originY + dy }));
  };
  const endGraphDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.pointerId !== event.pointerId) return;
    dragRef.current.pointerId = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleGraphWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    setViewport((current) => {
      const nextScale = clampScale(current.scale * (event.deltaY > 0 ? 0.92 : 1.08));
      const ratio = nextScale / current.scale;
      return {
        scale: nextScale,
        x: pointerX - (pointerX - current.x) * ratio,
        y: pointerY - (pointerY - current.y) * ratio,
      };
    });
  };
  const zoomGraph = (factor: number) => {
    setViewport((current) => ({ ...current, scale: clampScale(current.scale * factor) }));
  };
  const resetGraphViewport = () => {
    setViewport({ x: 0, y: 0, scale: onExpand ? 1 : 0.9 });
  };

  return (
    <section className="aui-wiki-card aui-wiki-graph-card">
      <div className="aui-wiki-card-head">
        <span>Graph Map</span>
        <strong>{nodes.length} nodes · {edges.length} links</strong>
      </div>
      <div className="aui-wiki-graph-toolbar">
        <button onClick={() => zoomGraph(1.12)} type="button">확대 +</button>
        <button onClick={() => zoomGraph(0.9)} type="button">축소 -</button>
        <button onClick={resetGraphViewport} type="button">리셋</button>
        <span>{Math.round(viewport.scale * 100)}%</span>
        <span>{focusNodeId ? `focus ${focusedLinkCount} links` : "노드 hover 또는 선택 시 연결 강조"}</span>
      </div>
      <div
        aria-label="wiki graph map"
        className="aui-wiki-graph-canvas"
        data-has-focus={focusNodeId ? "true" : "false"}
        onPointerCancel={endGraphDrag}
        onPointerDown={handleGraphPointerDown}
        onPointerMove={handleGraphPointerMove}
        onPointerUp={endGraphDrag}
        onWheel={handleGraphWheel}
      >
        <div
          className={`aui-wiki-graph-stage ${isDragging ? "dragging" : ""}`}
          style={{
            height: `${GRAPH_HEIGHT}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            width: `${GRAPH_WIDTH}px`,
          }}
        >
          <svg viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="img">
            <title>Wiki graph links</title>
            {edges.map((edge) => {
              const source = nodeById.get(edge.source);
              const target = nodeById.get(edge.target);
              if (!source || !target) return null;
              const isFocused = !!focusNodeId && (edge.source === focusNodeId || edge.target === focusNodeId);
              const isNeighbor = !!focusNodeId && (neighborIds.has(edge.source) || neighborIds.has(edge.target));
              return (
                <line
                  className={isFocused ? "active" : isNeighbor ? "related" : ""}
                  key={`${edge.source}-${edge.target}-${edge.label || ""}`}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                />
              );
            })}
          </svg>
          {placed.map((node) => (
            <button
              className={[
                node.id === activePath ? "active" : "",
                node.id === hoveredNodeId ? "hovered" : "",
                focusNodeId && neighborIds.has(node.id) ? "related" : "",
              ].filter(Boolean).join(" ")}
              key={node.id}
              onBlur={() => setHoveredNodeId((current) => (current === node.id ? "" : current))}
              onClick={() => onOpenPage(node.id)}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? "" : current))}
              onFocus={() => setHoveredNodeId(node.id)}
              style={{
                height: `${node.r * 2}px`,
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${node.r * 2}px`,
              }}
              title={`${node.title} · degree ${node.degree || 0}`}
              type="button"
            >
              <span>{node.title}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="aui-wiki-graph-list">
        {nodes.slice(0, 5).map((node) => (
          <button key={node.id} onClick={() => onOpenPage(node.id)} type="button">
            <strong>{node.title}</strong>
            <span>{node.section || "Wiki"} · degree {node.degree || 0}</span>
          </button>
        ))}
        {!nodes.length ? <p className="aui-wiki-muted">그래프 스냅샷을 불러오면 연결 문서가 표시됩니다.</p> : null}
      </div>
      {focusNodeId ? (
        <p className="aui-wiki-graph-focus-summary">
          현재 포커스: <strong>{nodeById.get(focusNodeId)?.title || focusNodeId}</strong> · 직접 연결 {focusedLinkCount}개 · 이웃 노드 {neighborIds.size}개
        </p>
      ) : null}
      <div className="aui-wiki-toolbar-actions">
        {onExpand ? <button onClick={onExpand} type="button">확대</button> : null}
        <button onClick={onRefreshGraph} type="button">그래프맵 업데이트</button>
      </div>
      <p className={`aui-wiki-inline-state ${phase}`}>{message}</p>
    </section>
  );
}

function WikiManagementConsole({
  onOpenPage,
  onReloadIndex,
}: {
  onOpenPage: (path: string) => void;
  onReloadIndex: () => Promise<void>;
}) {
  const [command, setCommand] = useState("");
  const [commands, setCommands] = useState<WikiManagementCommand[]>([]);
  const [activeCommand, setActiveCommand] = useState<WikiManagementCommand | null>(null);
  const [applyResult, setApplyResult] = useState<WikiManagementApplyResult | null>(null);
  const [phase, setPhase] = useState<"loading" | "idle" | "planning" | "applying" | "error">("loading");
  const [message, setMessage] = useState("위키 관리 명령 히스토리를 불러오는 중입니다.");

  const loadCommands = async () => {
    setPhase("loading");
    try {
      const payload = await fetchWikiManagementCommands();
      const nextCommands = payload.commands || [];
      setCommands(nextCommands);
      setActiveCommand((current) => current || nextCommands[0] || null);
      setPhase("idle");
      setMessage(nextCommands.length ? `${nextCommands.length}개 관리 명령을 불러왔습니다.` : "아직 관리 명령이 없습니다.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "관리 명령 로드 실패");
    }
  };

  useEffect(() => {
    loadCommands();
  }, []);

  const runCommand = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return;
    setPhase("planning");
    setApplyResult(null);
    try {
      const planned = await runWikiManagementCommand(trimmed);
      setCommands((current) => [planned, ...current.filter((item) => item.id !== planned.id)]);
      setActiveCommand(planned);
      setCommand("");
      setPhase("idle");
      setMessage(`계획 생성 완료 · 대상 ${planned.plan?.targetPages?.length || 0}개 · 작업 ${planned.plan?.operations?.length || 0}개`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "관리 명령 계획 실패");
    }
  };

  const applyCommand = async (dryRun: boolean) => {
    if (!activeCommand?.id) return;
    if (!dryRun && !window.confirm("검토한 계획을 로컬 위키 Markdown에 적용합니다. 원본 Drive는 변경하지 않습니다. 계속할까요?")) return;
    setPhase("applying");
    try {
      const result = await applyWikiManagementCommand(activeCommand.id, dryRun);
      setApplyResult(result);
      setPhase("idle");
      setMessage(`${dryRun ? "Dry-run" : "실행"} 완료 · 변경 ${result.changedFiles?.length || 0}개 · 제외 ${result.skippedOperations?.length || 0}개`);
      if (!dryRun) await onReloadIndex();
      await loadCommands();
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "관리 명령 실행 실패");
    }
  };

  const summaryLines = markdownListLines(activeCommand?.plan?.summaryMarkdown);
  const quickCommands = [
    "기존 자료를 운영형 위키로 컨버팅해줘. 프로젝트 허브를 연결하고 중복/충돌을 막아줘. 파일 원문은 요약으로 대체하지 말고 Raw_Evidence_Index와 Evidence_Log에 보존하는 전제로 Status, Business_Flow, CEO_Brief, PM_Action_Plan, Customer_Followup 후보를 만들어줘.",
    "이 프로젝트의 현재 상태를 CEO/PM이 의사결정할 수 있게 허브 중심으로 재정리하는 계획을 세워줘. 원문 보존, 충돌 후보, 다음 액션, 고객 후속을 분리해줘.",
  ];

  return (
    <section className="aui-wiki-card aui-wiki-command-card">
      <div className="aui-wiki-card-head">
        <span>Management Commands</span>
        <strong>{activeCommand?.status || phase}</strong>
      </div>
      <form className="aui-wiki-status-form" onSubmit={runCommand}>
        <label>
          <span>LLM 처리 지시</span>
          <textarea
            rows={4}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="예: 기존 자료를 운영형 위키로 컨버팅하고 프로젝트 허브를 연결해줘. 파일 원문은 요약 대체 금지."
          />
        </label>
        <div className="aui-wiki-command-chips">
          {quickCommands.map((item) => (
            <button key={item.slice(0, 32)} onClick={() => setCommand(item)} type="button">
              {item.includes("CEO/PM") ? "CEO/PM 운영 전환" : "운영형 허브 연결"}
            </button>
          ))}
        </div>
        <button disabled={phase === "planning" || phase === "applying"} type="submit">계획 생성</button>
      </form>
      <p className={`aui-wiki-inline-state ${phase}`}>{message}</p>
      <div className="aui-wiki-command-history">
        {commands.slice(0, 4).map((item) => (
          <button
            className={item.id === activeCommand?.id ? "active" : ""}
            key={item.id}
            onClick={() => {
              setActiveCommand(item);
              setApplyResult(null);
            }}
            type="button"
          >
            <strong>{item.command}</strong>
            <span>{item.provider || "local"} · {item.createdAt?.slice(0, 10) || "no date"}</span>
          </button>
        ))}
      </div>
      {activeCommand ? (
        <article className="aui-wiki-command-plan">
          {summaryLines.length ? (
            <ul>
              {summaryLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : <p className="aui-wiki-muted">계획 요약이 없습니다.</p>}
          {activeCommand.hints?.renamePairs?.length ? (
            <div className="aui-wiki-command-chips">
              {activeCommand.hints.renamePairs.map((pair) => <span key={`${pair.from}-${pair.to}`}>{pair.from} -&gt; {pair.to}</span>)}
            </div>
          ) : null}
          <div className="aui-wiki-command-targets">
            {(activeCommand.plan?.targetPages || []).slice(0, 6).map((page) => (
              <button key={page.path} onClick={() => onOpenPage(page.path)} type="button">
                <strong>{page.title || page.path}</strong>
                <span>{page.path}</span>
              </button>
            ))}
          </div>
          {(activeCommand.plan?.operations || []).length ? (
            <div className="aui-wiki-command-ops">
              {activeCommand.plan?.operations?.slice(0, 5).map((operation, index) => (
                <p key={`${operation.type || "op"}-${index}`}><strong>{operation.type || "operation"}</strong>: {summarizeOperation(operation)}</p>
              ))}
            </div>
          ) : null}
          <div className="aui-wiki-toolbar-actions">
            <button disabled={phase === "applying"} onClick={() => applyCommand(true)} type="button">Dry-run</button>
            <button disabled={phase === "applying"} onClick={() => applyCommand(false)} type="button">로컬 위키 적용</button>
          </div>
        </article>
      ) : null}
      {applyResult ? (
        <article className="aui-wiki-command-result">
          <strong>{applyResult.status || "result"}</strong>
          <span>changed {applyResult.changedFiles?.length || 0} · skipped {applyResult.skippedOperations?.length || 0}</span>
          {(applyResult.changedFiles || []).slice(0, 5).map((file) => (
            <button key={`${file.path}-${file.operation}`} onClick={() => onOpenPage(file.path)} type="button">
              <strong>{file.title || file.path}</strong>
              <span>{file.replacements?.map((pair) => `${pair.from}->${pair.to} ${pair.count}`).join(", ") || file.operation || file.action}</span>
            </button>
          ))}
        </article>
      ) : null}
    </section>
  );
}

export function WikiWorkspace({ chatContext, onOpenChatWithDraft, onReturnToChat }: WikiWorkspaceProps) {
  const { notify } = useToastCenter();
  const wiki = useWikiEvidenceConsole(chatContext.workspace);
  const sidebarExpanded = true;
  const [bulkPanelOpen, setBulkPanelOpen] = useState(false);
  const [inspectorSummaryCollapsed, setInspectorSummaryCollapsed] = useState(false);
  const [inspectorPanels, setInspectorPanels] = useState({
    status: false,
    delete: false,
    ops: false,
    log: false,
  });
  const [activeFolderKey, setActiveFolderKey] = useState(ALL_FOLDER_KEY);
  const [expandedFolderKeys, setExpandedFolderKeys] = useState<string[]>([]);
  const [selectedWikiPaths, setSelectedWikiPaths] = useState<string[]>([]);
  const [documentMode, setDocumentMode] = useState<WikiDocumentMode>("preview");
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER_VALUE);
  const [kindFilter, setKindFilter] = useState(ALL_FILTER_VALUE);
  const [sortKey, setSortKey] = useState<WikiSortKey>("updated");
  const [sortDirection, setSortDirection] = useState<WikiSortDirection>("desc");
  const [collectionPath, setCollectionPath] = useState(() => initialCollectionParam("collectionPath") || DEFAULT_COLLECTION_PATH);
  const [collectionNote, setCollectionNote] = useState("");
  const [collectionPhase, setCollectionPhase] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [collectionMessage, setCollectionMessage] = useState("로컬/미러 경로를 탐색해 remote path 수집 큐로 넘길 수 있습니다.");
  const [collectionResult, setCollectionResult] = useState<FilesystemBrowsePayload>(EMPTY_BROWSE);
  const [remoteBrowser, setRemoteBrowser] = useState<RemoteBrowserPayload>(EMPTY_REMOTE_BROWSE);
  const [remoteBrowsePath, setRemoteBrowsePath] = useState("");
  const [remotePathDraft, setRemotePathDraft] = useState("");
  const [collectionQueue, setCollectionQueue] = useState<CollectionQueueItem[]>([]);
  const [collectionTypeFilter, setCollectionTypeFilter] = useState<BrowseTypeFilter>("all");
  const [collectionExtFilter, setCollectionExtFilter] = useState("all");
  const [collectionPresetId, setCollectionPresetId] = useState("all");
  const [collectionPathQuery, setCollectionPathQuery] = useState("");
  const [queueRunMode, setQueueRunMode] = useState<"idle" | "dry-run" | "run">("idle");
  const [queueActionPath, setQueueActionPath] = useState("");
  const [queueSnapshotName, setQueueSnapshotName] = useState("");
  const [savedQueues, setSavedQueues] = useState<SavedQueueSnapshot[]>([]);
  const [selectedQueueSnapshotId, setSelectedQueueSnapshotId] = useState("");
  const [collectionStatus, setCollectionStatus] = useState<CollectionStatusPayload>(EMPTY_COLLECTION_STATUS);
  const [reasonLog, setReasonLog] = useState<ReasonLogEntry[]>([]);
  const [wikiGraph, setWikiGraph] = useState<WikiGraphPayload>(EMPTY_GRAPH);
  const [graphPhase, setGraphPhase] = useState<"loading" | "idle" | "running" | "error">("loading");
  const [graphMessage, setGraphMessage] = useState("위키 그래프맵을 불러오는 중입니다.");
  const [deletionCandidates, setDeletionCandidates] = useState<WikiDeletionCandidatesPayload>(EMPTY_DELETION_CANDIDATES);
  const [deletionPhase, setDeletionPhase] = useState<"idle" | "loading" | "running" | "error">("idle");
  const [deletionMessage, setDeletionMessage] = useState("삭제 추천을 분석해 디시전 큐 또는 직접 삭제로 보낼 수 있습니다.");
  const [deletionReason, setDeletionReason] = useState("위키 정리: 불필요 자료 삭제");
  const [bulkStatusDraft, setBulkStatusDraft] = useState<BulkStatusDraft>(statusDraftForPage(null));
  const [graphModalOpen, setGraphModalOpen] = useState(false);
  const [requestedWikiPath, setRequestedWikiPath] = useState(() => initialCollectionParam("wikiPath"));
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [pageFuture, setPageFuture] = useState<string[]>([]);
  const navModeRef = useRef<"idle" | "push" | "back" | "forward">("idle");
  const historyRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const handoffScope = surfaceScope(chatContext.projectId, chatContext.workspace);
  const selectedTitle = wiki.activePage?.title || wiki.activeIndexItem?.title || "문서를 선택하세요";
  const previewHtml = markdownPreview(wiki.markdownDraft || "");
  const activeDeleteProtected = isProtectedDeletionPage(wiki.activeIndexItem);
  const activeDeleteHub = isHubDeletionPage(wiki.activeIndexItem);
  const activeProjectDeleteEligible = ["project", "account"].includes(wiki.activeIndexItem?.division || "") && Boolean(wiki.activeIndexItem?.projectKey);
  useEffect(() => {
    historyRef.current = pageHistory;
  }, [pageHistory]);
  useEffect(() => {
    futureRef.current = pageFuture;
  }, [pageFuture]);
  useEffect(() => {
    if (!wiki.activePath) return;
    if (navModeRef.current === "back" || navModeRef.current === "forward") {
      navModeRef.current = "idle";
      return;
    }
    setPageHistory((current) => current[current.length - 1] === wiki.activePath ? current : [...current, wiki.activePath]);
    if (navModeRef.current === "push") setPageFuture([]);
    navModeRef.current = "idle";
  }, [wiki.activePath]);
  const openWikiPage = (path: string) => {
    if (!path || path === wiki.activePath) return;
    navModeRef.current = "push";
    void wiki.openPage(path);
  };
  const goBackPage = () => {
    const currentHistory = historyRef.current;
    if (currentHistory.length < 2) return;
    const currentPath = currentHistory[currentHistory.length - 1];
    const previousPath = currentHistory[currentHistory.length - 2];
    setPageHistory(currentHistory.slice(0, -1));
    setPageFuture([currentPath, ...futureRef.current]);
    navModeRef.current = "back";
    void wiki.openPage(previousPath);
  };
  const goForwardPage = () => {
    const [nextPath, ...rest] = futureRef.current;
    if (!nextPath) return;
    setPageFuture(rest);
    setPageHistory([...historyRef.current, nextPath]);
    navModeRef.current = "forward";
    void wiki.openPage(nextPath);
  };
  const askChatAboutCurrentPage = () => {
    const activePath = wiki.activePage?.path || wiki.activePath || wiki.activeIndexItem?.path || "";
    if (!activePath) {
      notify("info", "문서 없음", "먼저 질문할 위키 문서를 선택하세요.");
      return;
    }
    writeLastWikiPath(handoffScope, activePath);
    onOpenChatWithDraft(`[[${activePath}]] 문서를 기준으로 현재 상태와 다음 액션을 이어서 설명해줘.`);
  };
  const handlePreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const wikiLink = target.closest<HTMLElement>("[data-wiki-link]");
    if (wikiLink) {
      event.preventDefault();
      const nextPath = resolveWikiLinkTarget(wikiLink.dataset.wikiLink || wikiLink.textContent || "", wiki.activePath, wiki.pages);
      if (nextPath) openWikiPage(nextPath);
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>("a[data-preview-link]");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || anchor.dataset.previewLink || "";
    if (!href) return;
    const normalizedHref = href.trim();
    if (/^(https?:|mailto:|tel:)/i.test(normalizedHref)) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noreferrer noopener");
      return;
    }
    event.preventDefault();
    const nextPath = resolveWikiLinkTarget(normalizedHref, wiki.activePath, wiki.pages);
    if (nextPath) {
      openWikiPage(nextPath);
      return;
    }
    window.open(normalizedHref, "_blank", "noopener,noreferrer");
  };
  const folderGroups = useMemo(() => buildFolderGroups(wiki.pages), [wiki.pages]);
  const activeFolder = folderGroups.find((folder) => folder.key === activeFolderKey) || null;
  const pageIndexByPath = useMemo(() => new Map(wiki.pages.map((page) => [page.path, page])), [wiki.pages]);
  const statusOptions = useMemo(() => {
    const options = new Map<string, string>();
    Object.entries(wiki.statusCatalog as WikiStatusCatalog).forEach(([key, meta]) => options.set(key, meta.label));
    wiki.pages.forEach((page) => {
      if (page.workflowStatus) options.set(page.workflowStatus, page.workflowStatusLabel || page.workflowStatus);
    });
    return [...options.entries()].sort((a, b) => compareText(a[1], b[1]));
  }, [wiki.pages, wiki.statusCatalog]);
  const kindOptions = useMemo(() => {
    const kinds = new Set<string>();
    wiki.pages.forEach((page) => kinds.add(resultKind(page, page)));
    return [...kinds].sort(compareText);
  }, [wiki.pages]);
  const baseItems = useMemo<WikiResultItem[]>(() => {
    if (wiki.searchResults.length) return wiki.searchResults;
    const normalizedQuery = wiki.query.trim().toLowerCase();
    return wiki.pages.filter((page) => itemMatchesQuery(page, page, normalizedQuery));
  }, [wiki.pages, wiki.query, wiki.searchResults]);
  const filteredItems = useMemo(() => {
    return baseItems
      .filter((item) => {
        const meta = itemMeta(item, pageIndexByPath);
        const isInFolder = activeFolderKey === ALL_FOLDER_KEY || Boolean(meta && folderKey(meta) === activeFolderKey);
        const isMatchingStatus = statusFilter === ALL_FILTER_VALUE || resultStatusKey(item, meta) === statusFilter;
        const isMatchingKind = kindFilter === ALL_FILTER_VALUE || resultKind(item, meta) === kindFilter;
        return isInFolder && isMatchingStatus && isMatchingKind;
      })
      .sort((left, right) => compareWikiResults(left, right, pageIndexByPath, sortKey, sortDirection));
  }, [activeFolderKey, baseItems, kindFilter, pageIndexByPath, sortDirection, sortKey, statusFilter]);
  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, WIKI_RESULT_LIMIT);
  }, [filteredItems]);
  const visiblePages = useMemo(() => visibleItems.map((item) => itemMeta(item, pageIndexByPath)).filter(Boolean) as WikiPageIndexItem[], [pageIndexByPath, visibleItems]);
  const visibleFolderGroups = useMemo(() => {
    const grouped = new Map<string, WikiFolderGroup>();
    visiblePages.forEach((page) => {
      const key = folderKey(page);
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        existing.pages.push(page);
        return;
      }
      grouped.set(key, {
        key,
        label: folderLabel(page),
        type: folderType(page),
        count: 1,
        pages: [page],
      });
    });
    return [...grouped.values()].sort((a, b) => folderSortRank(a.type) - folderSortRank(b.type) || a.label.localeCompare(b.label, "ko"));
  }, [visiblePages]);
  const selectedWikiPages = useMemo(() => selectedWikiPaths.map((path) => pageIndexByPath.get(path)).filter(Boolean) as WikiPageIndexItem[], [pageIndexByPath, selectedWikiPaths]);
  const selectedProjectHubPages = useMemo(() => (
    selectedWikiPages.filter((page) => ["project", "account"].includes(page.division || "") && page.docKind === "hub" && (page.projectKey || projectKeyFromWikiPath(page.path)))
  ), [selectedWikiPages]);
  const resultCountLabel = filteredItems.length > visibleItems.length ? `${visibleItems.length}/${filteredItems.length}건` : `${visibleItems.length}건`;
  const loadGraph = async () => {
    setGraphPhase("loading");
    try {
      const graph = await fetchWikiGraph();
      setWikiGraph(graph);
      setGraphPhase("idle");
      setGraphMessage(`${graph.nodes.length}개 노드와 ${graph.edges.length}개 링크를 불러왔습니다.`);
    } catch (error) {
      setGraphPhase("error");
      setGraphMessage(error instanceof Error ? error.message : "그래프 로드 실패");
    }
  };
  const collectionExtOptions = useMemo(() => {
    const values = new Set<string>();
    collectionResult.entries.forEach((entry) => {
      if (entry.ext) values.add(entry.ext);
    });
    remoteBrowser.items.forEach((item) => {
      const name = item.name || "";
      const idx = name.lastIndexOf(".");
      if (idx > -1) values.add(name.slice(idx).toLowerCase());
    });
    return [...values].sort(compareText);
  }, [collectionResult.entries, remoteBrowser.items]);
  const visibleCollectionEntries = useMemo(() => {
    const query = collectionPathQuery.trim().toLowerCase();
    const activePreset = COLLECTION_PRESETS.find((preset) => preset.id === collectionPresetId);
    return collectionResult.entries.filter((entry) => {
      if (collectionTypeFilter !== "all" && entry.type !== collectionTypeFilter) return false;
      if (collectionExtFilter !== "all" && (entry.ext || "") !== collectionExtFilter) return false;
      if (activePreset?.ext.length && !activePreset.ext.includes(entry.ext || "")) return false;
      if (query && !`${entry.path} ${entry.type}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [collectionExtFilter, collectionPathQuery, collectionPresetId, collectionResult.entries, collectionTypeFilter]);
  const visibleRemoteItems = useMemo(() => {
    const query = collectionPathQuery.trim().toLowerCase();
    const activePreset = COLLECTION_PRESETS.find((preset) => preset.id === collectionPresetId);
    return remoteBrowser.items.filter((item) => {
      if (collectionTypeFilter !== "all" && item.type !== collectionTypeFilter) return false;
      const ext = item.name.includes(".") ? item.name.slice(item.name.lastIndexOf(".")).toLowerCase() : "";
      if (collectionExtFilter !== "all" && ext !== collectionExtFilter) return false;
      if (activePreset?.ext.length && !activePreset.ext.includes(ext)) return false;
      if (query && !`${item.remotePath} ${item.name}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [collectionExtFilter, collectionPathQuery, collectionPresetId, collectionTypeFilter, remoteBrowser.items]);

  const queuedCount = useMemo(() => collectionQueue.filter((item) => queueStatusForPath(item.path, collectionStatus, item.targetType) === "queued").length, [collectionQueue, collectionStatus]);
  const manifestedCount = useMemo(() => collectionQueue.filter((item) => queueStatusForPath(item.path, collectionStatus, item.targetType) === "manifested").length, [collectionQueue, collectionStatus]);
  const processedCount = useMemo(() => collectionQueue.filter((item) => queueStatusForPath(item.path, collectionStatus, item.targetType) === "processed").length, [collectionQueue, collectionStatus]);
  const eligibleQueueCount = useMemo(() => collectionQueue.filter((item) => !item.onHold && item.approved !== false).length, [collectionQueue]);

  useEffect(() => {
    loadGraph();
  }, []);

  useEffect(() => {
    const syncRequestedWikiPath = () => setRequestedWikiPath(initialCollectionParam("wikiPath"));
    window.addEventListener("popstate", syncRequestedWikiPath);
    return () => window.removeEventListener("popstate", syncRequestedWikiPath);
  }, []);

  useEffect(() => {
    if (!requestedWikiPath || requestedWikiPath === wiki.activePath) return;
    if (!wiki.pages.length || wiki.phase === "loading") return;
    if (!wiki.pages.some((page) => page.path === requestedWikiPath)) return;
    void wiki.openPage(requestedWikiPath);
  }, [requestedWikiPath, wiki.activePath, wiki.pages, wiki.phase]);

  useEffect(() => {
    if (!wiki.activePath) return;
    writeLastWikiPath(handoffScope, wiki.activePath);
  }, [handoffScope, wiki.activePath]);

  useEffect(() => {
    const loadCollectionStatus = async () => {
      try {
        setCollectionStatus(await fetchCollectionStatus());
      } catch {
        setCollectionStatus(EMPTY_COLLECTION_STATUS);
      }
    };
    loadCollectionStatus();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(COLLECTION_QUEUE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setSavedQueues(parsed);
    } catch {
      setSavedQueues([]);
    }
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    wiki.runSearch();
  };

  const resetFilters = () => {
    setStatusFilter(ALL_FILTER_VALUE);
    setKindFilter(ALL_FILTER_VALUE);
    setSortKey("updated");
    setSortDirection("desc");
  };

  const resetSearchAndFilters = () => {
    wiki.clearSearch();
    setActiveFolderKey(ALL_FOLDER_KEY);
    resetFilters();
  };

  const selectFolder = (folder: WikiFolderGroup | null) => {
    wiki.clearSearch();
    setActiveFolderKey(folder?.key || ALL_FOLDER_KEY);
    if (folder?.pages[0]?.path) openWikiPage(folder.pages[0].path);
  };

  useEffect(() => {
    setSelectedWikiPaths((current) => current.filter((path) => pageIndexByPath.has(path)));
  }, [pageIndexByPath]);

  useEffect(() => {
    if (!selectedWikiPaths.length) {
      setBulkStatusDraft(statusDraftForPage(wiki.activeIndexItem));
    }
  }, [selectedWikiPaths.length, wiki.activeIndexItem?.path]);

  useEffect(() => {
    if (selectedWikiPaths.length) {
      setBulkPanelOpen(true);
      return;
    }
    setBulkPanelOpen(false);
  }, [selectedWikiPaths.length]);

  const toggleFolderExpanded = (folderKeyValue: string) => {
    setExpandedFolderKeys((current) => current.includes(folderKeyValue)
      ? current.filter((key) => key !== folderKeyValue)
      : [...current, folderKeyValue]);
  };

  const toggleInspectorPanel = (key: keyof typeof inspectorPanels) => {
    setInspectorPanels((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleWikiPathSelected = (path: string) => {
    setSelectedWikiPaths((current) => current.includes(path)
      ? current.filter((item) => item !== path)
      : [...current, path]);
  };

  const replaceSelectedWikiPaths = (paths: string[]) => {
    setSelectedWikiPaths([...new Set(paths.filter((path) => pageIndexByPath.has(path)))]);
  };

  const toggleFolderSelection = (folder: WikiFolderGroup) => {
    const folderPaths = folder.pages.map((page) => page.path);
    const allSelected = folderPaths.every((path) => selectedWikiPaths.includes(path));
    replaceSelectedWikiPaths(allSelected
      ? selectedWikiPaths.filter((path) => !folderPaths.includes(path))
      : [...selectedWikiPaths, ...folderPaths]);
  };

  const clearSelectedWikiPages = () => {
    setSelectedWikiPaths([]);
  };

  const applyBulkStatusChange = async () => {
    if (!selectedWikiPages.length) {
      notify("info", "선택 항목 없음", "일괄 상태변경할 문서를 먼저 선택하세요.");
      return;
    }
    const items = selectedWikiPages.map((page) => (
      ["project", "account"].includes(page.division || "") && page.docKind === "hub"
        ? {
            scope: "project" as const,
            projectKey: page.projectKey,
            status: bulkStatusDraft.status,
            tags: bulkStatusDraft.tags,
            highlight: bulkStatusDraft.highlight,
            note: bulkStatusDraft.note,
          }
        : {
            scope: "page" as const,
            path: page.path,
            projectKey: page.projectKey,
            status: bulkStatusDraft.status,
            tags: bulkStatusDraft.tags,
            highlight: bulkStatusDraft.highlight,
            note: bulkStatusDraft.note,
          }
    ));
    notify("running", "일괄 상태변경 시작", `${selectedWikiPages.length}개 문서`, { durationMs: 2200 });
    try {
      await saveWikiStatusBulk(items);
      await wiki.reloadIndex();
      setBulkStatusDraft(statusDraftForPage(wiki.activeIndexItem));
      notify("success", "일괄 상태변경 완료", `${selectedWikiPages.length}개 문서를 업데이트했습니다.`);
    } catch (error) {
      notify("error", "일괄 상태변경 실패", error instanceof Error ? error.message : "일괄 상태변경 실패");
    }
  };

  const runBulkDelete = async () => {
    if (!selectedWikiPages.length) {
      notify("info", "선택 항목 없음", "삭제할 문서를 먼저 선택하세요.");
      return;
    }
    const selectedCount = selectedWikiPages.length;
    setDeletionPhase("running");
    notify("running", "일괄 삭제 시작", `${selectedCount}개 문서`, { durationMs: 2400 });
    try {
      const projectPages = selectedProjectHubPages;
      const nonProjectPages = selectedWikiPages.filter((page) => !(["project", "account"].includes(page.division || "") && page.docKind === "hub" && (page.projectKey || projectKeyFromWikiPath(page.path))));
      const handledProjectKeys = new Set<string>();
      let alreadyMissingProjects = 0;
      for (const page of projectPages) {
        const projectKey = page.projectKey || projectKeyFromWikiPath(page.path);
        if (!projectKey || handledProjectKeys.has(projectKey)) continue;
        handledProjectKeys.add(projectKey);
        try {
          await deleteWikiProjectPackageApi(projectKey, deletionReason, chatContext.workspace, page.path);
        } catch (error) {
          if (isAlreadyMissingProjectError(error)) {
            alreadyMissingProjects += 1;
            continue;
          }
          throw error;
        }
      }
      for (const page of nonProjectPages) {
        await deleteWikiPageApi(page.path, deletionReason, chatContext.workspace, false);
      }
      await Promise.all([wiki.reloadIndex(), loadGraph()]);
      clearSelectedWikiPages();
      setDeletionPhase("idle");
      notify(
        "success",
        "일괄 삭제 완료",
        alreadyMissingProjects
          ? `${selectedCount}개 선택 항목을 정리했습니다. 이미 없던 프로젝트 ${alreadyMissingProjects}개는 화면에서 동기화했습니다.`
          : `${selectedCount}개 선택 항목을 정리했습니다.`,
      );
    } catch (error) {
      await Promise.all([wiki.reloadIndex(), loadGraph()]);
      setDeletionPhase("error");
      notify("error", "일괄 삭제 실패", error instanceof Error ? error.message : "일괄 삭제 실패");
    }
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      wiki.saveActivePage();
    }
  };

  const runCollectionBrowse = async (event?: FormEvent) => {
    event?.preventDefault();
    setCollectionPhase("loading");
    try {
      const result = await browseFilesystem({
        path: collectionPath.trim(),
        note: collectionNote.trim(),
        maxDepth: 4,
        maxFiles: 80,
        maxEntriesPerDirectory: 60,
        maxTreeEntries: 160,
      });
      setCollectionResult(result);
      setCollectionPhase("idle");
      setCollectionMessage(`filesystem browse 완료: ${result.entries.length} entries, blocked ${result.blocked.length}건`);
    } catch (error) {
      setCollectionPhase("error");
      setCollectionMessage(error instanceof Error ? error.message : "filesystem browse 실패");
    }
  };

  useEffect(() => {
    const autoBrowse = initialCollectionParam("collectionAutoBrowse") === "1";
    const initialPath = initialCollectionParam("collectionPath");
    if (!autoBrowse || !initialPath) return;
    runCollectionBrowse();
  }, []);

  const runRemoteBrowse = async (path = remoteBrowsePath) => {
    setCollectionPhase("loading");
    try {
      const result = await browseRemoteDrive(path.trim());
      setRemoteBrowser(result);
      setRemoteBrowsePath(result.currentPath || "");
      setCollectionPhase("idle");
      setCollectionMessage(result.error
        ? `remote browse 경고: ${result.error}`
        : `remote browse 완료: ${result.items.length} items @ ${result.currentPath || "root"}`);
    } catch (error) {
      setCollectionPhase("error");
      setCollectionMessage(error instanceof Error ? error.message : "remote browse 실패");
    }
  };

  const pushQueue = (path: string, source: "manual" | "mirror", targetType: "directory" | "file" = "directory") => {
    const trimmed = path.trim().replace(/^\/+/, "");
    if (!trimmed) return;
    setCollectionQueue((current) => {
      if (current.some((item) => item.path === trimmed)) return current;
      return [...current, { path: trimmed, source, targetType, approved: true, onHold: false, lastAction: "idle", lastError: "" }];
    });
  };

  const addManualQueuePath = () => {
    pushQueue(remotePathDraft, "manual", remotePathDraft.trim().includes(".") ? "file" : "directory");
    setRemotePathDraft("");
  };

  const removeQueuePath = (path: string) => {
    setCollectionQueue((current) => current.filter((item) => item.path !== path));
  };

  const updateQueueItem = (path: string, updater: (item: CollectionQueueItem) => CollectionQueueItem) => {
    setCollectionQueue((current) => current.map((item) => (item.path === path ? updater(item) : item)));
  };

  const persistSnapshots = (next: SavedQueueSnapshot[]) => {
    setSavedQueues(next);
    if (typeof window !== "undefined") window.localStorage.setItem(COLLECTION_QUEUE_STORAGE_KEY, JSON.stringify(next));
  };

  const saveCurrentQueueSnapshot = () => {
    const name = queueSnapshotName.trim() || `queue-${new Date().toISOString().slice(0, 16)}`;
    const snapshot: SavedQueueSnapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      updatedAt: new Date().toISOString(),
      items: collectionQueue,
    };
    const next = [snapshot, ...savedQueues.filter((item) => item.name !== name)].slice(0, 12);
    persistSnapshots(next);
    setSelectedQueueSnapshotId(snapshot.id);
    setQueueSnapshotName(name);
    appendReasonLog(`Queue saved · ${name}`, `${collectionQueue.length} targets saved for reuse.`);
    setCollectionMessage(`큐 스냅샷 저장 완료 · ${name}`);
  };

  const loadQueueSnapshot = () => {
    const snapshot = savedQueues.find((item) => item.id === selectedQueueSnapshotId);
    if (!snapshot) return;
    setCollectionQueue(snapshot.items);
    setQueueSnapshotName(snapshot.name);
    appendReasonLog(`Queue loaded · ${snapshot.name}`, `${snapshot.items.length} targets restored from saved queue.`);
    setCollectionMessage(`큐 스냅샷 불러오기 완료 · ${snapshot.name}`);
  };

  const deleteQueueSnapshot = () => {
    if (!selectedQueueSnapshotId) return;
    const snapshot = savedQueues.find((item) => item.id === selectedQueueSnapshotId);
    const next = savedQueues.filter((item) => item.id !== selectedQueueSnapshotId);
    persistSnapshots(next);
    setSelectedQueueSnapshotId("");
    if (snapshot) {
      appendReasonLog(`Queue deleted · ${snapshot.name}`, "saved queue snapshot removed.");
      setCollectionMessage(`큐 스냅샷 삭제 완료 · ${snapshot.name}`);
    }
  };

  const appendReasonLog = (title: string, detail: string) => {
    setReasonLog((current) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, detail },
      ...current,
    ].slice(0, 8));
  };

  const applyCollectionPreset = (preset: CollectionPreset) => {
    setCollectionPresetId(preset.id);
    setCollectionTypeFilter(preset.type || "all");
    if (!preset.ext.length) {
      setCollectionExtFilter("all");
      return;
    }
    if (preset.ext.length === 1) {
      setCollectionExtFilter(preset.ext[0]);
      return;
    }
    setCollectionExtFilter("all");
  };

  const runSingleQueueItem = async (item: CollectionQueueItem, dryRun: boolean) => {
    if (item.onHold || item.approved === false) {
      setCollectionMessage(`${item.path} 는 hold 또는 미승인 상태라 실행하지 않았습니다.`);
      return;
    }
    setCollectionPhase("running");
    setQueueActionPath(item.path);
    try {
      await runTargetedRclone(item.path, dryRun);
      setCollectionStatus(await fetchCollectionStatus());
      updateQueueItem(item.path, (current) => ({ ...current, lastAction: dryRun ? "dry-run" : "run", lastError: "" }));
      setCollectionPhase("idle");
      setQueueActionPath("");
      setCollectionMessage(`${item.path} ${dryRun ? "dry-run" : "run"} 실행 완료`);
      appendReasonLog(
        `${dryRun ? "Dry-run" : "Run"} · ${item.path}`,
        [
          `대상: ${item.path}`,
          `타입: ${item.targetType}`,
          `실행: ${dryRun ? "dry-run" : "run"}`,
          "사유: 사용자가 큐 항목 단위 실행을 선택했습니다.",
        ].join("\n"),
      );
    } catch (error) {
      updateQueueItem(item.path, (current) => ({ ...current, lastAction: "failed", lastError: error instanceof Error ? error.message : "queue item failed" }));
      setCollectionPhase("error");
      setQueueActionPath("");
      setCollectionMessage(error instanceof Error ? error.message : "큐 단건 실행 실패");
    }
  };

  const runCollectionQueue = async (dryRun: boolean) => {
    const eligibleItems = collectionQueue.filter((item) => !item.onHold && item.approved !== false);
    if (!eligibleItems.length) {
      setCollectionMessage("실행 가능한 큐 항목이 없습니다. hold 해제 또는 승인 후 다시 시도하세요.");
      return;
    }
    setCollectionPhase("running");
    setQueueActionPath("");
    setQueueRunMode(dryRun ? "dry-run" : "run");
    try {
      const failures: string[] = [];
      for (const item of eligibleItems) {
        try {
          await runTargetedRclone(item.path, dryRun);
          updateQueueItem(item.path, (current) => ({ ...current, lastAction: dryRun ? "dry-run" : "run", lastError: "" }));
        } catch (error) {
          failures.push(item.path);
          updateQueueItem(item.path, (current) => ({ ...current, lastAction: "failed", lastError: error instanceof Error ? error.message : "batch item failed" }));
        }
      }
      setCollectionPhase("idle");
      setQueueRunMode("idle");
      setCollectionStatus(await fetchCollectionStatus());
      setCollectionMessage(
        failures.length
          ? `${eligibleItems.length}건 중 ${failures.length}건 실패`
          : dryRun
            ? `수집 큐 ${eligibleItems.length}건 dry-run 실행 완료`
            : `수집 큐 ${eligibleItems.length}건 로컬 mirror 수집 실행 완료`,
      );
      appendReasonLog(
        `${dryRun ? "Batch dry-run" : "Batch run"} · ${eligibleItems.length} targets`,
        eligibleItems
          .slice(0, 5)
          .map((item) => `${item.path} · ${item.targetType}`)
          .concat(failures.length ? [`failures: ${failures.join(", ")}`] : [])
          .concat(eligibleItems.length > 5 ? [`외 ${eligibleItems.length - 5}건`] : [])
          .join("\n"),
      );
    } catch (error) {
      setCollectionPhase("error");
      setQueueActionPath("");
      setQueueRunMode("idle");
      setCollectionMessage(error instanceof Error ? error.message : "수집 큐 실행 실패");
    }
  };

  const runQueueContinue = async () => {
    setCollectionPhase("running");
    setQueueActionPath("");
    try {
      await continueAfterCollection();
      setCollectionStatus(await fetchCollectionStatus());
      setCollectionPhase("idle");
      setCollectionMessage("manifest -> run -> refresh-global 후속 체인을 실행했습니다.");
      appendReasonLog(
        "Continue-after-collection",
        "manifest 생성 이후 run, refresh-global까지 후속 체인을 이어 실행했습니다.",
      );
    } catch (error) {
      setCollectionPhase("error");
      setCollectionMessage(error instanceof Error ? error.message : "수집 후 계속 실행 실패");
    }
  };

  const runGraphRefresh = async () => {
    setGraphPhase("running");
    try {
      const result = await refreshWikiGraph();
      if (result.error || result.status === "failed") {
        throw new Error(result.error || result.stderr || "그래프맵 업데이트 실패");
      }
      await Promise.all([wiki.reloadIndex(), loadGraph()]);
      setGraphPhase("idle");
      setGraphMessage(`그래프맵 업데이트 완료: ${result.command || "refresh-global"}`);
    } catch (error) {
      setGraphPhase("error");
      setGraphMessage(error instanceof Error ? error.message : "그래프맵 업데이트 실패");
    }
  };

  const refreshDeletionCandidates = async () => {
    setDeletionPhase("loading");
    notify("running", "삭제 추천 분석 시작", "후보 문서와 보호 규칙을 다시 계산하고 있습니다.", { durationMs: 2200 });
    try {
      const payload = await fetchWikiDeletionCandidates(chatContext.workspace, 24);
      setDeletionCandidates(payload);
      setDeletionPhase("idle");
      setDeletionMessage(
        payload.candidates.length
          ? `${payload.candidates.length}건의 삭제 추천 후보를 계산했습니다.`
          : "현재 규칙 기준으로 삭제 추천 후보가 없습니다.",
      );
      notify(
        "success",
        "삭제 추천 분석 완료",
        payload.candidates.length ? `${payload.candidates.length}건의 후보를 찾았습니다.` : "현재 삭제 추천 후보가 없습니다.",
      );
    } catch (error) {
      setDeletionPhase("error");
      setDeletionMessage(error instanceof Error ? error.message : "삭제 추천 분석 실패");
      notify("error", "삭제 추천 분석 실패", error instanceof Error ? error.message : "삭제 추천 분석 실패");
    }
  };

  const runDeletePage = async (path: string, title?: string, force = false) => {
    if (!path) return;
    const selectedPage = wiki.pages.find((page) => page.path === path) || null;
    if (isProtectedDeletionPage(selectedPage) && !(force && isHubDeletionPage(selectedPage))) {
      setDeletionPhase("idle");
      setDeletionMessage("이 문서는 핵심 운영 문서라 직접 삭제 대상이 아닙니다. hub.md만 강제 삭제 예외를 허용합니다.");
      notify("info", "삭제 차단", "이 문서는 보호 규칙에 걸려 있습니다. hub.md만 강제 삭제 예외를 허용합니다.");
      return;
    }
    setDeletionPhase("running");
    notify("running", force ? "강제 삭제 시작" : "문서 삭제 시작", title || path, { durationMs: 2200 });
    try {
      const result = await deleteWikiPageApi(path, deletionReason, chatContext.workspace, force);
      await Promise.all([wiki.reloadIndex(), loadGraph()]);
      setDeletionCandidates((current) => ({
        ...current,
        candidates: current.candidates.filter((candidate) => candidate.path !== path),
      }));
      setDeletionPhase("idle");
      setDeletionMessage(`${force ? "강제 " : ""}삭제 완료 · ${title || result.title || path}`);
      appendReasonLog(`${force ? "Force delete" : "Delete"} · ${title || result.title || path}`, [path, deletionReason].filter(Boolean).join("\n"));
      notify("success", force ? "허브 강제 삭제 완료" : "문서 삭제 완료", title || result.title || path);
    } catch (error) {
      setDeletionPhase("error");
      setDeletionMessage(error instanceof Error ? error.message : "문서 삭제 실패");
      notify("error", force ? "허브 강제 삭제 실패" : "문서 삭제 실패", error instanceof Error ? error.message : "문서 삭제 실패");
    }
  };

  const runDeleteProjectPackage = async () => {
    const projectKey = wiki.activeIndexItem?.projectKey || "";
    if (!projectKey) {
      setDeletionMessage("현재 문서에서 projectKey를 찾지 못했습니다.");
      notify("error", "프로젝트 전체 삭제 실패", "현재 문서에서 projectKey를 찾지 못했습니다.");
      return;
    }
    setDeletionPhase("running");
    notify("running", "프로젝트 전체 삭제 시작", projectKey, { durationMs: 2400 });
    try {
      const result = await deleteWikiProjectPackageApi(projectKey, deletionReason, chatContext.workspace, wiki.activeIndexItem?.path);
      await Promise.all([wiki.reloadIndex(), loadGraph()]);
      setDeletionCandidates((current) => ({
        ...current,
        candidates: current.candidates.filter((candidate) => candidate.projectKey !== projectKey),
      }));
      setDeletionPhase("idle");
      setDeletionMessage(`프로젝트 전체 삭제 완료 · ${projectKey} · ${result.removedCount}개 항목 정리`);
      appendReasonLog(`Delete project · ${projectKey}`, [deletionReason, `removed: ${result.removedCount}`].join("\n"));
      notify("success", "프로젝트 전체 삭제 완료", `${projectKey} · ${result.removedCount}개 항목 정리`);
    } catch (error) {
      await Promise.all([wiki.reloadIndex(), loadGraph()]);
      if (isAlreadyMissingProjectError(error)) {
        setDeletionPhase("idle");
        setDeletionMessage(`이미 없는 프로젝트를 화면에서 정리했습니다 · ${projectKey}`);
        notify("info", "프로젝트 전체 삭제 정리", `${projectKey} 는 이미 없어 인덱스만 다시 맞췄습니다.`);
        return;
      }
      setDeletionPhase("error");
      setDeletionMessage(error instanceof Error ? error.message : "프로젝트 전체 삭제 실패");
      notify("error", "프로젝트 전체 삭제 실패", error instanceof Error ? error.message : "프로젝트 전체 삭제 실패");
    }
  };

  const enqueueDeletionRecommendations = async (paths?: string[]) => {
    setDeletionPhase("running");
    notify("running", "삭제 추천 디시전 등록 시작", "삭제 후보를 decision queue에 넣고 있습니다.", { durationMs: 2200 });
    try {
      const result = await enqueueWikiDeletionCandidatesApi({
        workspace: chatContext.workspace,
        paths,
        limit: 24,
      });
      setDeletionPhase("idle");
      setDeletionMessage(`삭제 추천 ${result.count}건을 디시전 큐로 보냈습니다.`);
      appendReasonLog(
        `Deletion decisions queued · ${result.count}건`,
        (paths && paths.length ? paths : deletionCandidates.candidates.map((candidate) => candidate.path)).slice(0, 6).join("\n"),
      );
      notify("success", "삭제 추천 디시전 등록 완료", `${result.count}건을 decision queue로 보냈습니다.`);
    } catch (error) {
      setDeletionPhase("error");
      setDeletionMessage(error instanceof Error ? error.message : "삭제 추천 큐 등록 실패");
      notify("error", "삭제 추천 디시전 등록 실패", error instanceof Error ? error.message : "삭제 추천 큐 등록 실패");
    }
  };

  return (
    <main className={`aui-wiki-console aui-work-surface ${sidebarExpanded ? "wiki-sidebar-expanded" : ""}`}>
      <aside className={`aui-wiki-sidebar ${sidebarExpanded ? "expanded" : ""}`} aria-label="wiki search and documents">
        <div className="aui-wiki-brand">
          <span className="aui-kicker">위키 문서</span>
          <h1>문서함</h1>
        </div>

        <form className="aui-wiki-search" onSubmit={handleSubmit}>
          <label>
            <span>위키 검색</span>
            <input
              value={wiki.query}
              onChange={(event) => wiki.setQuery(event.target.value)}
              placeholder="프로젝트, 수치, 파일명, 고객명 검색"
            />
          </label>
          <div className="aui-wiki-filter-grid">
            <label>
              <span>상태</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value={ALL_FILTER_VALUE}>전체 상태</option>
                {statusOptions.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>문서 유형</span>
              <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
                <option value={ALL_FILTER_VALUE}>전체 유형</option>
                {kindOptions.map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <label>
              <span>정렬</span>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as WikiSortKey)}>
                <option value="updated">업데이트</option>
                <option value="title">제목</option>
                <option value="kind">문서 유형</option>
                <option value="status">상태</option>
                <option value="size">크기</option>
                <option value="relevance">검색 점수</option>
              </select>
            </label>
            <label>
              <span>방향</span>
              <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as WikiSortDirection)}>
                <option value="desc">내림차순</option>
                <option value="asc">오름차순</option>
              </select>
            </label>
          </div>
          <div>
            <button type="submit">검색</button>
            <button className="ghost" onClick={resetSearchAndFilters} type="button">전체 초기화</button>
            <button className="ghost" onClick={resetFilters} type="button">필터 리셋</button>
          </div>
        </form>

        <div className="aui-wiki-folder-tree" aria-label="project folders">
          <button
            className={activeFolderKey === ALL_FOLDER_KEY ? "active" : ""}
            onClick={() => selectFolder(null)}
            type="button"
          >
            <span>▾ 전체 Wiki</span>
            <small>{wiki.pages.length} pages</small>
          </button>
          {(sidebarExpanded ? visibleFolderGroups : folderGroups).map((folder) => {
            const folderExpanded = expandedFolderKeys.includes(folder.key);
            const folderSelected = folder.pages.every((page) => selectedWikiPaths.includes(page.path));
            return (
              <div className={`aui-wiki-tree-node ${activeFolderKey === folder.key ? "active" : ""}`} key={folder.key}>
                <div className="aui-wiki-tree-row">
                  <label className="aui-wiki-tree-check">
                    <input
                      checked={folderSelected}
                      onChange={() => toggleFolderSelection(folder)}
                      onClick={(event) => event.stopPropagation()}
                      type="checkbox"
                    />
                  </label>
                  <button className="aui-wiki-tree-toggle" onClick={() => toggleFolderExpanded(folder.key)} type="button">
                    {folderExpanded ? "▾" : "▸"}
                  </button>
                  <button
                    className={`aui-wiki-tree-label ${activeFolderKey === folder.key ? "active" : ""}`}
                    onClick={() => selectFolder(folder)}
                    type="button"
                  >
                    <strong>{folder.label}</strong>
                    <small>{folder.type} · {folder.count}개 · 최근 {shortDate(folderLatestUpdatedAt(folder))}</small>
                  </button>
                </div>
                {sidebarExpanded && folderExpanded ? (
                  <div className="aui-wiki-tree-children">
                    {folder.pages
                      .slice()
                      .sort(byUpdatedDesc)
                      .map((page) => (
                        <div className={`aui-wiki-tree-child ${wiki.isActiveResult(page.path) ? "active" : ""}`} key={page.path}>
                          <label className="aui-wiki-tree-check">
                            <input
                              checked={selectedWikiPaths.includes(page.path)}
                              onChange={() => toggleWikiPathSelected(page.path)}
                              onClick={(event) => event.stopPropagation()}
                              type="checkbox"
                            />
                          </label>
                          <button className="aui-wiki-tree-child-button" onClick={() => openWikiPage(page.path)} type="button">
                            <strong>{page.title}</strong>
                            <span>{page.docKind} · {page.workflowStatusLabel || page.workflowStatus || "-"} · {shortDate(page.updatedAt)}</span>
                          </button>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

      </aside>

      <section className="aui-wiki-main" aria-label="wiki document editor">
        <div className="aui-wiki-cover">
          <span>Record body</span>
          <strong>{chatContext.workspace.toUpperCase()} workspace</strong>
        </div>
        <header className="aui-wiki-toolbar">
          <div className="aui-wiki-title-block">
            <div className="aui-wiki-breadcrumb">{chatContext.workspace.toUpperCase()} / {wiki.activeIndexItem?.division || "wiki"}</div>
            <div className="aui-wiki-title-row">
              <span className="aui-wiki-page-icon">#</span>
              <h2>{selectedTitle}</h2>
            </div>
            <code>{wiki.activePage?.path || wiki.activePath || "path 없음"}</code>
          </div>
          <div className="aui-wiki-toolbar-actions">
            <button onClick={onReturnToChat} type="button">채팅으로</button>
            <button disabled={!wiki.activePath} onClick={askChatAboutCurrentPage} type="button">문서로 질문</button>
            <button disabled={pageHistory.length < 2} onClick={goBackPage} type="button">뒤로</button>
            <button disabled={!pageFuture.length} onClick={goForwardPage} type="button">앞으로</button>
            <span className={`aui-wiki-save-state ${wiki.dirty ? "dirty" : "saved"}`}>
              {wiki.dirty ? "수정됨" : "저장됨"}
            </span>
            <button onClick={wiki.reloadIndex} type="button">인덱스 새로고침</button>
            <button disabled={!wiki.activePage || !wiki.dirty || wiki.phase === "saving"} onClick={wiki.saveActivePage} type="button">
              Markdown 저장
            </button>
          </div>
        </header>

        <div className="aui-wiki-page-properties" aria-label="notion style page properties">
          <div><span>Project</span><strong>{wiki.activeIndexItem?.projectLabel || wiki.activeIndexItem?.projectKey || "-"}</strong></div>
          <div><span>Kind</span><strong>{wiki.activeIndexItem?.docKind || "-"}</strong></div>
          <div><span>Status</span><strong>{wiki.activeIndexItem?.workflowStatusLabel || "-"}</strong></div>
          <div><span>Updated</span><strong>{shortDate(wiki.activeIndexItem?.updatedAt)}</strong></div>
        </div>

        <div className="aui-wiki-editor-grid">
          <section className={`aui-wiki-document-pane ${documentMode}`} aria-label="wiki document body">
            <div className="aui-wiki-document-head">
              <div>
                <span>{documentMode === "preview" ? "조회 모드" : "수정 모드"}</span>
                <strong>문서 본문</strong>
              </div>
              <div className="aui-wiki-mode-toggle" role="group" aria-label="문서 조회 수정 모드">
                <button
                  className={documentMode === "preview" ? "active" : ""}
                  onClick={() => setDocumentMode("preview")}
                  type="button"
                >
                  조회
                </button>
                <button
                  className={documentMode === "edit" ? "active" : ""}
                  onClick={() => setDocumentMode("edit")}
                  type="button"
                >
                  수정
                </button>
              </div>
            </div>
            {documentMode === "preview" ? (
              <div
                className="aui-wiki-preview-body"
                dangerouslySetInnerHTML={{ __html: previewHtml || "<p>미리보기 내용 없음</p>" }}
                onClick={handlePreviewClick}
              />
            ) : (
              <label className="aui-wiki-editor">
                <span>Markdown 원문</span>
                <textarea
                  disabled={!wiki.activePage}
                  onChange={(event) => wiki.setMarkdownDraft(event.target.value)}
                  onKeyDown={handleEditorKeyDown}
                  placeholder="문서를 선택하면 Markdown 원문을 수정할 수 있습니다."
                  value={wiki.markdownDraft}
                />
              </label>
            )}
          </section>
        </div>
      </section>

      <aside className="aui-wiki-inspector" aria-label="wiki document properties">
        <section className={`aui-wiki-card aui-wiki-inspector-summary ${inspectorSummaryCollapsed ? "collapsed" : ""}`}>
          <button className="aui-wiki-summary-toggle" onClick={() => setInspectorSummaryCollapsed((current) => !current)} type="button">
            <span>{wiki.phase}</span>
            <small>{inspectorSummaryCollapsed ? "열기" : "닫기"}</small>
          </button>
          <strong>{selectedTitle}</strong>
          {!inspectorSummaryCollapsed ? <p>{wiki.message}</p> : null}
          {!inspectorSummaryCollapsed ? (
            <dl className="aui-wiki-properties">
              <div><dt>Project</dt><dd>{wiki.activeIndexItem?.projectLabel || wiki.activeIndexItem?.projectKey || "-"}</dd></div>
              <div><dt>Kind</dt><dd>{wiki.activeIndexItem?.docKind || "-"}</dd></div>
              <div><dt>Workflow</dt><dd>{wiki.activeIndexItem?.workflowStatusLabel || "-"}</dd></div>
              <div><dt>Updated</dt><dd>{shortDate(wiki.activeIndexItem?.updatedAt)}</dd></div>
            </dl>
          ) : null}
        </section>

        <section className="aui-wiki-card aui-wiki-index-card">
          <div className="aui-wiki-list-meta">
            <strong>{sidebarExpanded ? "선택/필터 결과" : wiki.searchResults.length ? "검색 결과" : activeFolder?.label || "위키 인덱스"}</strong>
            <span>{resultCountLabel}</span>
          </div>
          <div className="aui-wiki-result-list inspector-list">
            {visibleItems.map((item) => {
              const meta = itemMeta(item, pageIndexByPath);
              return (
                <div className={`aui-wiki-result-row ${wiki.isActiveResult(item.path) ? "active" : ""}`} key={item.path}>
                  <button
                    className={wiki.isActiveResult(item.path) ? "active" : ""}
                    onClick={() => openWikiPage(item.path)}
                    type="button"
                  >
                    <strong>{resultTitle(item)}</strong>
                    <span>{item.path}</span>
                    <em>{resultKind(item, meta)} · {resultStatusLabel(item, meta)} · {shortDate(resultUpdatedAt(item, meta))}</em>
                    {"snippet" in item && item.snippet ? <small>{item.snippet}</small> : null}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`aui-wiki-fold-card ${inspectorPanels.status ? "open" : ""}`}>
          <button className="aui-wiki-fold-trigger" onClick={() => toggleInspectorPanel("status")} type="button">문서 상태 관리</button>
          {inspectorPanels.status ? <div className="aui-wiki-fold-body">
            <StatusEditor page={wiki.activeIndexItem} catalog={wiki.statusCatalog} onSave={wiki.saveActiveStatus} />
          </div> : null}
        </section>

        <section className={`aui-wiki-fold-card ${inspectorPanels.delete ? "open" : ""}`}>
          <button className="aui-wiki-fold-trigger" onClick={() => toggleInspectorPanel("delete")} type="button">삭제 정리와 프로젝트 제거</button>
          {inspectorPanels.delete ? <div className="aui-wiki-fold-body">
            <section className="aui-wiki-card">
              <span>삭제 정리</span>
              <strong>{deletionCandidates.summary?.total || 0} candidate pages</strong>
              <p>{deletionMessage}</p>
              <label className="aui-field">
                <span>삭제 사유</span>
                <textarea rows={3} value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} />
              </label>
              <div className="aui-decision-compare-actions">
                <button className="aui-wide-action" disabled={deletionPhase === "loading" || deletionPhase === "running"} onClick={refreshDeletionCandidates} type="button">삭제 추천 분석</button>
                <button
                  className="aui-wide-action"
                  disabled={deletionPhase === "loading" || deletionPhase === "running" || !deletionCandidates.candidates.length}
                  onClick={() => enqueueDeletionRecommendations()}
                  type="button"
                >
                  추천을 디시전으로
                </button>
              </div>
              <div className="aui-wiki-queue-list">
                {wiki.activeIndexItem?.path ? (
                  <>
                    {activeProjectDeleteEligible ? (
                      <button
                        className="aui-wide-action danger"
                        disabled={deletionPhase === "running"}
                        onClick={runDeleteProjectPackage}
                        type="button"
                      >
                        프로젝트 전체 삭제
                      </button>
                    ) : null}
                    <button
                      className="aui-wide-action danger"
                      disabled={deletionPhase === "running" || wiki.activeIndexItem.statusManaged === false || activeDeleteProtected}
                      onClick={() => runDeletePage(wiki.activeIndexItem?.path || "", wiki.activeIndexItem?.title, false)}
                      type="button"
                    >
                      현재 문서 바로 삭제
                    </button>
                    {activeDeleteHub ? (
                      <button
                        className="aui-wide-action danger"
                        disabled={deletionPhase === "running" || wiki.activeIndexItem.statusManaged === false}
                        onClick={() => runDeletePage(wiki.activeIndexItem?.path || "", wiki.activeIndexItem?.title, true)}
                        type="button"
                      >
                        현재 허브 강제 삭제
                      </button>
                    ) : null}
                    {activeDeleteProtected && !activeDeleteHub ? <p className="aui-wiki-muted">현재 문서는 핵심 운영 문서라 직접 삭제가 막혀 있습니다.</p> : null}
                    {activeProjectDeleteEligible ? <p className="aui-wiki-muted">불필요한 프로젝트를 정리하려면 `프로젝트 전체 삭제`를 사용하세요. 프로젝트 폴더와 대응 L1 메모리를 함께 제거합니다.</p> : null}
                    {activeDeleteHub ? <p className="aui-wiki-muted">`현재 허브 강제 삭제`는 `hub.md` 한 장만 지웁니다. 연관 문서까지 없애려면 `프로젝트 전체 삭제`를 사용하세요.</p> : null}
                  </>
                ) : null}
                {deletionCandidates.candidates.slice(0, 6).map((candidate: WikiDeletionCandidate) => (
                  <div className="aui-wiki-thinking" key={candidate.path}>
                    <strong>{candidate.title}</strong>
                    <pre>{[`score ${candidate.score}`, candidate.path, ...candidate.reasons.slice(0, 3)].join("\n")}</pre>
                    <div className="aui-decision-compare-actions">
                      <button className="aui-wide-action" onClick={() => openWikiPage(candidate.path)} type="button">열기</button>
                      <button className="aui-wide-action" onClick={() => enqueueDeletionRecommendations([candidate.path])} type="button">디시전 등록</button>
                      <button className="aui-wide-action danger" onClick={() => runDeletePage(candidate.path, candidate.title)} type="button">바로 삭제</button>
                    </div>
                  </div>
                ))}
                {!deletionCandidates.candidates.length ? <p className="aui-wiki-muted">삭제 추천 분석을 실행하면 고아/임시/보관 문서 후보를 보여줍니다.</p> : null}
              </div>
            </section>
          </div> : null}
        </section>

        <section className={`aui-wiki-fold-card ${inspectorPanels.ops ? "open" : ""}`}>
          <button className="aui-wiki-fold-trigger" onClick={() => toggleInspectorPanel("ops")} type="button">운영 패널</button>
          {inspectorPanels.ops ? <div className="aui-wiki-fold-body">
            <WikiGraphPanel
              activePath={wiki.activePath}
              graph={wikiGraph}
              message={graphMessage}
              onExpand={() => setGraphModalOpen(true)}
              onOpenPage={openWikiPage}
              onRefreshGraph={runGraphRefresh}
              phase={graphPhase}
            />
            <WikiManagementConsole onOpenPage={openWikiPage} onReloadIndex={wiki.reloadIndex} />
          </div> : null}
        </section>

        <section className={`aui-wiki-fold-card ${inspectorPanels.log ? "open" : ""}`}>
          <button className="aui-wiki-fold-trigger" onClick={() => toggleInspectorPanel("log")} type="button">Thinking Log</button>
          {inspectorPanels.log ? <div className="aui-wiki-fold-body">
            <section className="aui-wiki-card">
              <strong>{reasonLog.length} recent decisions</strong>
              <div className="aui-wiki-queue-list">
                {reasonLog.map((entry) => (
                  <div className="aui-wiki-thinking" key={entry.id}>
                    <strong>{entry.title}</strong>
                    <pre>{entry.detail}</pre>
                  </div>
                ))}
                {!reasonLog.length ? <p className="aui-wiki-muted">큐 추가, 단건 실행, batch 실행, 후속 체인을 시작하면 판단 로그가 쌓입니다.</p> : null}
              </div>
            </section>
          </div> : null}
        </section>
      </aside>
      {selectedWikiPaths.length ? (
        <div className={`aui-wiki-selection-anchor ${bulkPanelOpen ? "open" : ""}`} role="dialog" aria-label="선택 문서 일괄 작업">
          <div className="aui-wiki-selection-anchor-bar">
            <div>
              <strong>{selectedWikiPaths.length}개 선택</strong>
              <span>{selectedProjectHubPages.length ? `허브 ${selectedProjectHubPages.length}개 포함 · 삭제 시 프로젝트 전체 삭제` : "선택한 문서를 상태 변경하거나 삭제할 수 있습니다."}</span>
            </div>
            <div className="aui-wiki-selection-anchor-actions">
              <button className="ghost" onClick={clearSelectedWikiPages} type="button">선택 해제</button>
              <button onClick={() => setBulkPanelOpen((current) => !current)} type="button">{bulkPanelOpen ? "접기" : "작업 열기"}</button>
            </div>
          </div>
          {bulkPanelOpen ? (
            <div className="aui-wiki-selection-sheet">
              <label className="aui-field">
                <span>일괄 상태</span>
                <select value={bulkStatusDraft.status} onChange={(event) => setBulkStatusDraft((current) => ({ ...current, status: event.target.value }))}>
                  {Object.entries(wiki.statusCatalog).map(([key, meta]) => (
                    <option key={key} value={key}>{meta.label}</option>
                  ))}
                </select>
              </label>
              <label className="aui-field">
                <span>일괄 태그</span>
                <input value={bulkStatusDraft.tags} onChange={(event) => setBulkStatusDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="고객대응, 이번주, 보고서" />
              </label>
              <label className="aui-field">
                <span>일괄 메모</span>
                <textarea rows={2} value={bulkStatusDraft.note} onChange={(event) => setBulkStatusDraft((current) => ({ ...current, note: event.target.value }))} />
              </label>
              <div className="aui-decision-compare-actions">
                <button className="aui-wide-action" onClick={applyBulkStatusChange} type="button">일괄 상태변경</button>
                <button className="aui-wide-action danger" onClick={runBulkDelete} type="button">{selectedProjectHubPages.length ? "일괄 삭제 · 프로젝트 포함" : "일괄 삭제"}</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {graphModalOpen ? (
        <div className="aui-settings-overlay" role="dialog" aria-label="그래프맵 확대 보기" aria-modal="true">
          <button className="aui-settings-scrim" onClick={() => setGraphModalOpen(false)} type="button" aria-label="그래프맵 닫기" />
          <section className="aui-wiki-graph-modal">
            <header className="aui-wiki-graph-modal-head">
              <div>
                <span>Graph Map</span>
                <strong>{wikiGraph.nodes.length} nodes · {wikiGraph.edges.length} links</strong>
              </div>
              <div className="aui-wiki-toolbar-actions">
                <button onClick={runGraphRefresh} type="button">그래프맵 업데이트</button>
                <button onClick={() => setGraphModalOpen(false)} type="button">닫기</button>
              </div>
            </header>
            <WikiGraphPanel
              activePath={wiki.activePath}
              graph={wikiGraph}
              message={graphMessage}
              onOpenPage={openWikiPage}
              onRefreshGraph={runGraphRefresh}
              phase={graphPhase}
            />
          </section>
        </div>
      ) : null}
    </main>
  );
}
