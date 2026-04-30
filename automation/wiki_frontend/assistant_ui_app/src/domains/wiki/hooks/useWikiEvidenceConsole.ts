import { useEffect, useMemo, useState } from "react";
import {
  fetchWikiIndex,
  fetchWikiPage,
  fetchWikiStatusCatalog,
  saveWikiPage,
  saveWikiStatus,
  searchWiki,
  type WikiPageIndexItem,
  type WikiPagePayload,
  type WikiSearchResult,
  type WikiStatusCatalog,
} from "../api/wikiApi";

type WikiPhase = "loading" | "idle" | "searching" | "opening" | "saving" | "error";

const DEFAULT_QUERY = "";

function samePath(item: { path?: string }, path: string) {
  return item.path === path;
}

function pageKindScore(page: WikiPageIndexItem) {
  const kind = page.docKind || page.nature || "";
  if (kind === "hub") return 0;
  if (["sources", "evidence", "conflict", "changelog"].includes(kind)) return 1;
  return 2;
}

export function useWikiEvidenceConsole(workspace: string) {
  const [pages, setPages] = useState<WikiPageIndexItem[]>([]);
  const [searchResults, setSearchResults] = useState<WikiSearchResult[]>([]);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [activePath, setActivePath] = useState("");
  const [activePage, setActivePage] = useState<WikiPagePayload | null>(null);
  const [markdownDraft, setMarkdownDraft] = useState("");
  const [statusCatalog, setStatusCatalog] = useState<WikiStatusCatalog>({});
  const [phase, setPhase] = useState<WikiPhase>("loading");
  const [message, setMessage] = useState("위키 인덱스를 불러오는 중입니다.");

  const activeIndexItem = pages.find((page) => page.path === activePath) || null;
  const dirty = Boolean(activePage && markdownDraft !== activePage.markdown);

  const visiblePages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (searchResults.length) return searchResults;
    return pages
      .filter((page) => {
        if (!normalizedQuery) return true;
        return `${page.title} ${page.path} ${page.projectLabel || ""}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => pageKindScore(a) - pageKindScore(b) || a.title.localeCompare(b.title, "ko"))
      .slice(0, 120);
  }, [pages, query, searchResults]);

  const reloadIndex = async () => {
    setPhase("loading");
    try {
      const [index, status] = await Promise.all([fetchWikiIndex(workspace), fetchWikiStatusCatalog()]);
      setPages(index.pages || []);
      setStatusCatalog(status.catalog || {});
      setMessage(`${index.pages?.length || 0}개 위키 문서를 불러왔습니다.`);
      setPhase("idle");
      const firstPath = activePath || index.pages?.find((page) => page.docKind === "hub")?.path || index.pages?.[0]?.path || "";
      if (firstPath) await openPage(firstPath);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "위키 인덱스 로드 실패");
    }
  };

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setMessage("검색어가 비어 있어 인덱스 목록을 표시합니다.");
      return;
    }
    setPhase("searching");
    try {
      const results = await searchWiki(trimmed, workspace);
      setSearchResults(results);
      setMessage(`${results.length}개 검색 결과를 찾았습니다.`);
      setPhase("idle");
      if (results[0]?.path) await openPage(results[0].path);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "위키 검색 실패");
    }
  };

  const openPage = async (path: string) => {
    if (!path) return;
    setPhase("opening");
    setActivePath(path);
    try {
      const page = await fetchWikiPage(path);
      setActivePage(page);
      setMarkdownDraft(page.markdown || "");
      setMessage(`${page.title || page.path} 문서를 열었습니다.`);
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "문서 열기 실패");
    }
  };

  const saveActivePage = async () => {
    if (!activePage) return;
    setPhase("saving");
    try {
      const saved = await saveWikiPage(activePage.path, markdownDraft);
      const page = await fetchWikiPage(saved.path || activePage.path);
      setActivePage(page);
      setMarkdownDraft(page.markdown || "");
      setMessage(saved.projectKeyAutofixed ? "Markdown 저장 완료. projectKey frontmatter가 자동 보정되었습니다." : "Markdown 저장 완료.");
      await reloadIndex();
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Markdown 저장 실패");
    }
  };

  const saveActiveStatus = async (input: { status: string; tags: string; highlight: string; note: string }) => {
    if (!activeIndexItem) return;
    setPhase("saving");
    try {
      await saveWikiStatus({
        scope: activeIndexItem.isProjectHub || ["project", "account"].includes(activeIndexItem.division || "") ? "project" : "page",
        path: activeIndexItem.path,
        projectKey: activeIndexItem.projectKey,
        ...input,
      });
      setMessage("문서 상태를 저장했습니다.");
      await reloadIndex();
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "상태 저장 실패");
    }
  };

  useEffect(() => {
    reloadIndex();
  }, [workspace]);

  return {
    pages,
    visiblePages,
    searchResults,
    query,
    setQuery,
    activePath,
    activePage,
    activeIndexItem,
    markdownDraft,
    setMarkdownDraft,
    statusCatalog,
    phase,
    message,
    dirty,
    runSearch,
    openPage,
    saveActivePage,
    saveActiveStatus,
    reloadIndex,
    clearSearch: () => {
      setSearchResults([]);
      setQuery("");
    },
    isActiveResult: (path: string) => samePath({ path: activePath }, path),
  };
}
