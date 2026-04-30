import {
  AttachmentPrimitive,
  ComposerPrimitive,
  useComposer,
  useComposerRuntime,
  useThread,
  useThreadRuntime,
} from "@assistant-ui/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { stopChatProjectRun, type SkillCatalogItem } from "../api/chatWorkspaceApi";
import type { ChatContext } from "../constants";
import { ACCEPTED_ATTACHMENT_TYPES } from "../constants";

type BrowserFile = File & {
  path?: string;
  webkitRelativePath?: string;
};

type BrowserPathSelection = {
  kind: "file" | "directory";
  label: string;
  path: string;
  absolute: boolean;
};

const BROWSER_PATH_BLOCK_START = "[파일브라우징 경로]";
const BROWSER_PATH_BLOCK_END = "[/파일브라우징 경로]";

function normalizedBrowserPath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function browserPathBlock(selections: readonly BrowserPathSelection[]) {
  if (!selections.length) return "";
  return [
    BROWSER_PATH_BLOCK_START,
    "- source: composer_file_browser",
    ...selections.map((selection) => `- ${selection.kind}: ${selection.path}`),
    selections.some((selection) => !selection.absolute)
      ? "- note: browser security may expose only relative paths or filenames"
      : "",
    BROWSER_PATH_BLOCK_END,
  ].filter(Boolean).join("\n");
}

function stripBrowserPathBlock(text: string) {
  return text.replace(
    new RegExp(`\\n?${escapeRegex(BROWSER_PATH_BLOCK_START)}[\\s\\S]*?${escapeRegex(BROWSER_PATH_BLOCK_END)}\\n?`, "g"),
    "\n",
  ).replace(/\n{3,}/g, "\n\n").trim();
}

function buildPathSelectionText(baseText: string, selections: readonly BrowserPathSelection[]) {
  const stripped = stripBrowserPathBlock(baseText);
  const block = browserPathBlock(selections);
  return [stripped, block].filter(Boolean).join("\n\n").trim();
}

function browserSelectionsFromFiles(files: BrowserFile[], kind: "file" | "directory") {
  const seen = new Set<string>();
  const selections: BrowserPathSelection[] = [];

  for (const file of files) {
    const absolutePath = normalizedBrowserPath(file.path || "");
    const relativePath = normalizedBrowserPath(file.webkitRelativePath || file.name || "");
    const bestPath = absolutePath || relativePath;
    if (!bestPath || seen.has(`${kind}:${bestPath}`)) continue;
    seen.add(`${kind}:${bestPath}`);
    const pathSegments = bestPath.split("/");
    selections.push({
      kind,
      label: file.name || pathSegments[pathSegments.length - 1] || bestPath,
      path: bestPath,
      absolute: Boolean(absolutePath && absolutePath.startsWith("/")),
    });
  }

  return selections.sort((a, b) => a.path.localeCompare(b.path, "ko"));
}

function ComposerAttachments() {
  return (
    <div className="aui-composer-attachments">
      <ComposerPrimitive.Attachments>
        {() => (
          <AttachmentPrimitive.Root className="aui-attachment-chip">
            <AttachmentPrimitive.Name />
            <AttachmentPrimitive.Remove asChild>
              <button type="button" className="aui-attachment-remove" aria-label="첨부 제거">x</button>
            </AttachmentPrimitive.Remove>
          </AttachmentPrimitive.Root>
        )}
      </ComposerPrimitive.Attachments>
    </div>
  );
}

type ComposerProps = {
  chatContext: ChatContext;
  skills: readonly SkillCatalogItem[];
  selectedSkillTags: readonly string[];
  onSelectSkillTag: (skillId: string) => void;
  onRemoveSkillTag: (skillId: string) => void;
};

type SkillSuggestion = {
  id: string;
  label: string;
  description: string;
  searchText: string;
};

function skillLabel(skill: SkillCatalogItem) {
  return skill.name || skill.title || skill.id;
}

function skillDescription(skill: SkillCatalogItem) {
  return skill.description || skill.status || "이 스킬을 이번 메시지에 적용";
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value: string) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function tokenStartsWithScore(query: string, text: string) {
  const tokens = normalizeSearchText(text).split(" ").filter(Boolean);
  return tokens.some((token) => token.startsWith(query)) ? 1 : 0;
}

function subsequenceScore(query: string, text: string) {
  if (!query) return 0;
  let pointer = 0;
  let gaps = 0;
  for (const char of text) {
    if (char === query[pointer]) {
      pointer += 1;
      if (pointer === query.length) break;
    } else if (pointer > 0) {
      gaps += 1;
    }
  }
  if (pointer !== query.length) return 0;
  return Math.max(0.1, 1 - gaps / Math.max(text.length, 1));
}

function scoreSkillSuggestion(query: string, skill: SkillSuggestion) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 1;
  const normalizedLabel = normalizeSearchText(skill.label);
  const normalizedId = normalizeSearchText(skill.id);
  const normalizedDescription = normalizeSearchText(skill.description);
  const compactQuery = compactSearchText(query);
  const compactLabel = compactSearchText(skill.label);
  const compactId = compactSearchText(skill.id);
  const exactLabel = normalizedLabel === normalizedQuery ? 1000 : 0;
  const exactId = normalizedId === normalizedQuery ? 940 : 0;
  const prefixLabel = normalizedLabel.startsWith(normalizedQuery) ? 780 : 0;
  const prefixId = normalizedId.startsWith(normalizedQuery) ? 730 : 0;
  const tokenLabel = tokenStartsWithScore(normalizedQuery, normalizedLabel) ? 620 : 0;
  const tokenId = tokenStartsWithScore(normalizedQuery, normalizedId) ? 600 : 0;
  const includesLabel = normalizedLabel.includes(normalizedQuery) ? 520 : 0;
  const includesId = normalizedId.includes(normalizedQuery) ? 500 : 0;
  const includesDescription = normalizedDescription.includes(normalizedQuery) ? 280 : 0;
  const compactPrefix = compactLabel.startsWith(compactQuery) || compactId.startsWith(compactQuery) ? 460 : 0;
  const subsequence = Math.max(
    subsequenceScore(compactQuery, compactLabel),
    subsequenceScore(compactQuery, compactId),
  ) * 180;
  return exactLabel
    || exactId
    || prefixLabel
    || prefixId
    || tokenLabel
    || tokenId
    || includesLabel
    || includesId
    || compactPrefix
    || includesDescription
    || subsequence;
}

function activeMentionState(text: string, caret: number | null) {
  if (caret == null) return null;
  const prefix = text.slice(0, caret);
  const match = prefix.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match) return null;
  const query = match[1] || "";
  return {
    query,
    start: prefix.length - query.length - 1,
    end: caret,
  };
}

export function Composer({
  chatContext,
  skills,
  selectedSkillTags,
  onSelectSkillTag,
  onRemoveSkillTag,
}: ComposerProps) {
  const isRunning = useThread((state: any) => state.isRunning);
  const threadRuntime = useThreadRuntime();
  const composerText = useComposer((state) => state.text);
  const composerRuntime = useComposerRuntime();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileBrowseInputRef = useRef<HTMLInputElement | null>(null);
  const directoryBrowseInputRef = useRef<HTMLInputElement | null>(null);
  const [caret, setCaret] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [manualSuggestionsOpen, setManualSuggestionsOpen] = useState(false);
  const [browseMenuOpen, setBrowseMenuOpen] = useState(false);
  const [browserSelections, setBrowserSelections] = useState<BrowserPathSelection[]>([]);

  const skillSuggestions = useMemo<SkillSuggestion[]>(
    () => skills.map((skill) => ({
      id: skill.id,
      label: skillLabel(skill),
      description: skillDescription(skill),
      searchText: [skill.id, skillLabel(skill), skillDescription(skill)].join(" "),
    })),
    [skills],
  );

  const mention = activeMentionState(composerText, caret);
  const filteredSuggestions = useMemo(() => {
    const query = (mention?.query || "").trim();
    if (!query) {
      return [...skillSuggestions]
        .sort((a, b) => a.label.localeCompare(b.label, "ko"))
        .slice(0, 8);
    }
    return skillSuggestions
      .map((skill) => ({
        skill,
        score: scoreSkillSuggestion(query, skill),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.skill.label.localeCompare(b.skill.label, "ko");
      })
      .map((item) => item.skill)
      .slice(0, 8);
  }, [mention?.query, skillSuggestions]);

  const showSuggestions = Boolean((mention || manualSuggestionsOpen) && filteredSuggestions.length);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [mention?.query, manualSuggestionsOpen]);

  useEffect(() => {
    if (!mention && manualSuggestionsOpen) {
      setManualSuggestionsOpen(false);
    }
  }, [manualSuggestionsOpen, mention]);

  useEffect(() => {
    if (composerText.trim()) return;
    setBrowserSelections([]);
  }, [composerText]);

  const updateCaretFromElement = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    setCaret(element.selectionStart ?? 0);
  };

  const closeSuggestions = () => {
    setManualSuggestionsOpen(false);
    setHighlightedIndex(0);
  };

  const syncBrowserSelections = (nextSelections: BrowserPathSelection[]) => {
    const currentText = composerRuntime.getState().text;
    const nextText = buildPathSelectionText(currentText, nextSelections);
    composerRuntime.setText(nextText);
    setBrowserSelections(nextSelections);
    if (nextSelections.length) onSelectSkillTag("os-file-browser");
  };

  const insertSkillMention = (skillId: string) => {
    const textarea = inputRef.current;
    const currentText = composerRuntime.getState().text;
    const nextMention = activeMentionState(currentText, textarea?.selectionStart ?? caret ?? currentText.length);
    const insertLabel = `@${skillId} `;
    let nextText = `${currentText}${insertLabel}`;
    let nextCaret = nextText.length;

    if (nextMention) {
      nextText = `${currentText.slice(0, nextMention.start)}${insertLabel}${currentText.slice(nextMention.end)}`;
      nextCaret = nextMention.start + insertLabel.length;
    }

    composerRuntime.setText(nextText);
    onSelectSkillTag(skillId);
    closeSuggestions();

    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  };

  const handleOpenSkillPicker = () => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const text = composerRuntime.getState().text;
    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? start;
    const needsSpacer = start > 0 && /\S/.test(text[start - 1] || "");
    const insertLabel = `${needsSpacer ? " " : ""}@`;
    const nextText = `${text.slice(0, start)}${insertLabel}${text.slice(end)}`;
    const nextCaret = start + insertLabel.length;
    composerRuntime.setText(nextText);
    setManualSuggestionsOpen(true);
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  };

  const mergeBrowserSelections = (incoming: BrowserPathSelection[]) => {
    if (!incoming.length) return;
    const merged = [...browserSelections];
    const seen = new Set(merged.map((item) => `${item.kind}:${item.path}`));
    for (const item of incoming) {
      const key = `${item.kind}:${item.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
    syncBrowserSelections(merged.sort((a, b) => a.path.localeCompare(b.path, "ko")));
    setBrowseMenuOpen(false);
  };

  const handleBrowseFiles = () => {
    setBrowseMenuOpen(false);
    fileBrowseInputRef.current?.click();
  };

  const handleBrowseDirectories = () => {
    setBrowseMenuOpen(false);
    directoryBrowseInputRef.current?.click();
  };

  const handleFileBrowseChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as BrowserFile[];
    mergeBrowserSelections(browserSelectionsFromFiles(files, "file"));
    event.target.value = "";
  };

  const handleDirectoryBrowseChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as BrowserFile[];
    mergeBrowserSelections(browserSelectionsFromFiles(files, "directory"));
    event.target.value = "";
  };

  const handleRemoveBrowserSelection = (target: BrowserPathSelection) => {
    const nextSelections = browserSelections.filter((item) => !(item.kind === target.kind && item.path === target.path));
    syncBrowserSelections(nextSelections);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % filteredSuggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => (current - 1 + filteredSuggestions.length) % filteredSuggestions.length);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const activeSkill = filteredSuggestions[highlightedIndex];
      if (activeSkill) insertSkillMention(activeSkill.id);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeSuggestions();
    }
  };

  const handleStopRun = async () => {
    threadRuntime.cancelRun();
    if (!chatContext.projectId) return;
    try {
      await stopChatProjectRun(chatContext.projectId);
    } catch (error) {
      console.error("Failed to stop backend chat run", error);
    }
  };

  return (
    <ComposerPrimitive.Root className="aui-composer-root">
      <div className="aui-composer-shell">
        <div className="aui-composer-tools" aria-label="composer skill tags">
          <ComposerPrimitive.AddAttachment asChild>
            <button type="button" className="aui-mini-tool">파일</button>
          </ComposerPrimitive.AddAttachment>
          <div className={`aui-browse-tool-wrap ${browseMenuOpen ? "open" : ""}`}>
            <button
              type="button"
              className="aui-mini-tool"
              aria-expanded={browseMenuOpen}
              aria-haspopup="menu"
              onClick={() => setBrowseMenuOpen((current) => !current)}
            >
              파일브라우징 {browserSelections.length}
            </button>
            {browseMenuOpen ? (
              <div className="aui-browse-menu" role="menu" aria-label="파일브라우징 메뉴">
                <button type="button" role="menuitem" className="aui-browse-menu-item" onClick={handleBrowseFiles}>
                  파일 선택
                </button>
                <button type="button" role="menuitem" className="aui-browse-menu-item" onClick={handleBrowseDirectories}>
                  폴더 선택
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="aui-mini-tool" onClick={handleOpenSkillPicker}>
            @스킬 {selectedSkillTags.length}
          </button>
          <button type="button" className="aui-mini-tool">위키 근거</button>
        </div>
        <input
          ref={fileBrowseInputRef}
          type="file"
          accept={ACCEPTED_ATTACHMENT_TYPES}
          multiple
          className="aui-hidden-input"
          onChange={handleFileBrowseChange}
        />
        <input
          ref={directoryBrowseInputRef}
          type="file"
          multiple
          className="aui-hidden-input"
          onChange={handleDirectoryBrowseChange}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
        {selectedSkillTags.length ? (
          <div className="aui-selected-tags" aria-label="selected skill tags">
            {selectedSkillTags.map((skillTag) => {
              const skill = skillSuggestions.find((item) => item.id === skillTag);
              return (
                <button
                  key={skillTag}
                  type="button"
                  className="aui-selected-tag"
                  onClick={() => onRemoveSkillTag(skillTag)}
                  aria-label={`@${skill?.label || skillTag} 제거`}
                >
                  <span>@{skill?.label || skillTag}</span>
                  <strong>x</strong>
                </button>
              );
            })}
          </div>
        ) : null}
        {browserSelections.length ? (
          <div className="aui-browser-paths" aria-label="selected browser paths">
            {browserSelections.map((selection) => (
              <button
                key={`${selection.kind}:${selection.path}`}
                type="button"
                className="aui-browser-path-chip"
                onClick={() => handleRemoveBrowserSelection(selection)}
                aria-label={`${selection.path} 제거`}
              >
                <span>{selection.kind === "directory" ? "폴더" : "파일"}</span>
                <strong>{selection.label}</strong>
                <small>{selection.path}</small>
              </button>
            ))}
          </div>
        ) : null}
        <ComposerAttachments />
        <div className="aui-composer-input-wrap">
          <ComposerPrimitive.Input
            ref={inputRef}
            rows={1}
            submitOnEnter
            placeholder="Decision Deck, 위키 근거, 첨부 파일 또는 파일브라우징 경로에 대해 지시하세요. @를 입력하면 스킬 후보가 뜹니다."
            className="aui-composer-input"
            onChange={(event) => {
              updateCaretFromElement(event.currentTarget);
              if (event.currentTarget.value.includes("@")) return;
              setManualSuggestionsOpen(false);
            }}
            onClick={(event) => updateCaretFromElement(event.currentTarget)}
            onKeyUp={(event) => updateCaretFromElement(event.currentTarget)}
            onSelect={(event) => updateCaretFromElement(event.currentTarget)}
            onKeyDown={handleInputKeyDown}
          />
          {showSuggestions ? (
            <div className="aui-skill-suggestions" role="listbox" aria-label="스킬 추천">
              {filteredSuggestions.map((skill, index) => (
                <button
                  key={skill.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className={`aui-skill-suggestion ${index === highlightedIndex ? "active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertSkillMention(skill.id)}
                >
                  <strong>@{skill.label}</strong>
                  <span>{skill.description}</span>
                  <small>{skill.id}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="aui-composer-footer">
          <div className="aui-composer-left">
            <ComposerPrimitive.AddAttachment asChild>
              <button type="button" className="aui-icon-button secondary" aria-label="첨부 추가">
                +
              </button>
            </ComposerPrimitive.AddAttachment>
            <span className="aui-composer-hint">Enter 전송 · Shift+Enter 줄바꿈 · @스킬 자동완성</span>
          </div>
          {!isRunning ? (
            <ComposerPrimitive.Send asChild>
              <button type="button" className="aui-icon-button primary" aria-label="전송">
                ↑
              </button>
            </ComposerPrimitive.Send>
          ) : (
            <button type="button" className="aui-icon-button stop" aria-label="중지" onClick={handleStopRun}>
              ■
            </button>
          )}
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
