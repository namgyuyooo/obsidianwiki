import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import type { ChatContext } from "../../chat/constants";
import type { WikiPageIndexItem, WikiSearchResult, WikiStatusCatalog } from "../api/wikiApi";
import { useWikiEvidenceConsole } from "../hooks/useWikiEvidenceConsole";

type WikiWorkspaceProps = {
  chatContext: ChatContext;
};

type StatusEditorProps = {
  page: WikiPageIndexItem | null;
  catalog: WikiStatusCatalog;
  onSave: (input: { status: string; tags: string; highlight: string; note: string }) => void;
};

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
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="aui-wiki-link" title="$1">$2</span>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="aui-wiki-link">$1</span>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
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

export function WikiWorkspace({ chatContext }: WikiWorkspaceProps) {
  const wiki = useWikiEvidenceConsole(chatContext.workspace);
  const selectedTitle = wiki.activePage?.title || wiki.activeIndexItem?.title || "문서를 선택하세요";
  const previewHtml = markdownPreview(wiki.markdownDraft || "");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    wiki.runSearch();
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      wiki.saveActivePage();
    }
  };

  return (
    <main className="aui-wiki-console">
      <aside className="aui-wiki-sidebar" aria-label="wiki search and documents">
        <div className="aui-wiki-brand">
          <span className="aui-kicker">wiki related / evidence ide</span>
          <h1>Wiki</h1>
          <p>검색, 조회, Markdown 수정, 상태 관리를 새 프론트에서 바로 수행합니다.</p>
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
          <div>
            <button type="submit">검색</button>
            <button onClick={wiki.clearSearch} type="button">초기화</button>
          </div>
        </form>

        <div className="aui-wiki-list-meta">
          <strong>{wiki.searchResults.length ? "검색 결과" : "위키 인덱스"}</strong>
          <span>{wiki.visiblePages.length}건</span>
        </div>

        <div className="aui-wiki-result-list">
          {wiki.visiblePages.map((item) => (
            <button
              className={wiki.isActiveResult(item.path) ? "active" : ""}
              key={item.path}
              onClick={() => wiki.openPage(item.path)}
              type="button"
            >
              <strong>{resultTitle(item)}</strong>
              <span>{item.path}</span>
              {"snippet" in item && item.snippet ? <small>{item.snippet}</small> : null}
            </button>
          ))}
        </div>
      </aside>

      <section className="aui-wiki-main" aria-label="wiki document editor">
        <div className="aui-wiki-cover">
          <span>Evidence Console</span>
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
          <label className="aui-wiki-editor">
            <span>Markdown 편집</span>
            <textarea
              disabled={!wiki.activePage}
              onChange={(event) => wiki.setMarkdownDraft(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              placeholder="문서를 선택하면 Markdown 원문을 수정할 수 있습니다."
              value={wiki.markdownDraft}
            />
          </label>
          <section className="aui-wiki-preview" aria-label="live markdown preview">
            <div className="aui-wiki-preview-head">
              <span>Live preview</span>
              <strong>Notion-style 읽기 화면</strong>
            </div>
            <div className="aui-wiki-preview-body" dangerouslySetInnerHTML={{ __html: previewHtml || "<p>미리보기 내용 없음</p>" }} />
          </section>
        </div>
      </section>

      <aside className="aui-wiki-inspector" aria-label="wiki document properties">
        <section className="aui-wiki-card">
          <span>상태</span>
          <strong>{wiki.phase}</strong>
          <p>{wiki.message}</p>
        </section>

        <section className="aui-wiki-card">
          <span>문서 속성</span>
          <dl className="aui-wiki-properties">
            <div><dt>Project</dt><dd>{wiki.activeIndexItem?.projectLabel || wiki.activeIndexItem?.projectKey || "-"}</dd></div>
            <div><dt>Kind</dt><dd>{wiki.activeIndexItem?.docKind || "-"}</dd></div>
            <div><dt>Workflow</dt><dd>{wiki.activeIndexItem?.workflowStatusLabel || "-"}</dd></div>
            <div><dt>Updated</dt><dd>{shortDate(wiki.activeIndexItem?.updatedAt)}</dd></div>
            <div><dt>Size</dt><dd>{wiki.activeIndexItem?.size ? `${wiki.activeIndexItem.size.toLocaleString()} bytes` : "-"}</dd></div>
          </dl>
        </section>

        <section className="aui-wiki-card">
          <span>상태 관리</span>
          <StatusEditor page={wiki.activeIndexItem} catalog={wiki.statusCatalog} onSave={wiki.saveActiveStatus} />
        </section>
      </aside>
    </main>
  );
}
