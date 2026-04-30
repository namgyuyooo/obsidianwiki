import {
  AttachmentPrimitive,
  ComposerPrimitive,
  useComposer,
  useComposerRuntime,
  useThread,
  useThreadRuntime,
} from "@assistant-ui/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { stopChatProjectRun, type SkillCatalogItem, type WikiProjectOption } from "../api/chatWorkspaceApi";
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

type BrowserPendingFile = {
  key: string;
  selection: BrowserPathSelection;
  file: BrowserFile;
};

type BrowserImportAttachment = {
  id?: string;
  fileName?: string;
  route?: string;
  path?: string;
  mirrorPath?: string;
  originalPath?: string;
  analysis?: string;
  analysisPath?: string;
};

type BrowserImportResponse = {
  error?: string;
  contextBlock?: string;
  mirrorBatchPath?: string;
  attachments?: BrowserImportAttachment[];
};

type WikiMentionSelection = {
  projectKey: string;
  projectLabel: string;
  workspace: string;
  path?: string;
};

const BROWSER_PATH_BLOCK_START = "[파일브라우징 경로]";
const BROWSER_PATH_BLOCK_END = "[/파일브라우징 경로]";
const IMPORT_CONTEXT_BLOCK_START = "[파일 해석 컨텍스트]";
const IMPORT_CONTEXT_BLOCK_END = "[/파일 해석 컨텍스트]";
const WIKI_MENTION_BLOCK_START = "[위키프로젝트 멘션]";
const WIKI_MENTION_BLOCK_END = "[/위키프로젝트 멘션]";

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

function stripImportContextBlock(text: string) {
  return text.replace(
    new RegExp(`\\n?${escapeRegex(IMPORT_CONTEXT_BLOCK_START)}[\\s\\S]*?${escapeRegex(IMPORT_CONTEXT_BLOCK_END)}\\n?`, "g"),
    "\n",
  ).replace(/\n{3,}/g, "\n\n").trim();
}

function buildPathSelectionText(baseText: string, selections: readonly BrowserPathSelection[]) {
  const stripped = stripBrowserPathBlock(baseText);
  const block = browserPathBlock(selections);
  return [stripped, block].filter(Boolean).join("\n\n").trim();
}

function applyImportContextText(baseText: string, contextBlock: string) {
  const stripped = stripImportContextBlock(baseText);
  return [stripped, contextBlock.trim()].filter(Boolean).join("\n\n").trim();
}

function wikiMentionBlock(selections: readonly WikiMentionSelection[]) {
  if (!selections.length) return "";
  return [
    WIKI_MENTION_BLOCK_START,
    "- source: composer_project_mention",
    ...selections.map((selection) => [
      `- project_key: ${selection.projectKey}`,
      `  project_label: ${selection.projectLabel}`,
      `  workspace: ${selection.workspace}`,
      selection.path ? `  path: ${selection.path}` : "",
    ].filter(Boolean).join("\n")),
    WIKI_MENTION_BLOCK_END,
  ].join("\n");
}

function stripWikiMentionBlock(text: string) {
  return text.replace(
    new RegExp(`\\n?${escapeRegex(WIKI_MENTION_BLOCK_START)}[\\s\\S]*?${escapeRegex(WIKI_MENTION_BLOCK_END)}\\n?`, "g"),
    "\n",
  ).replace(/\n{3,}/g, "\n\n").trim();
}

function buildWikiMentionText(baseText: string, selections: readonly WikiMentionSelection[]) {
  const stripped = stripWikiMentionBlock(baseText);
  const block = wikiMentionBlock(selections);
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

function pendingBrowserFilesFromFiles(files: BrowserFile[], kind: "file" | "directory") {
  return browserSelectionsFromFiles(files, kind).map((selection) => {
    const match = files.find((file) => {
      const absolutePath = normalizedBrowserPath(file.path || "");
      const relativePath = normalizedBrowserPath(file.webkitRelativePath || file.name || "");
      const bestPath = absolutePath || relativePath;
      return bestPath === selection.path;
    }) || files[0];
    return {
      key: `${selection.kind}:${selection.path}`,
      selection,
      file: match,
    };
  }).filter((item): item is BrowserPendingFile => Boolean(item.file));
}

async function importBrowserFilesToChat(input: {
  files: BrowserPendingFile[];
  workspace: string;
  projectId: string;
  projectHint: string;
  projectKey?: string;
}) {
  const form = new FormData();
  const browserManifest = input.files.map((item, index) => {
    const fieldName = `file_${index}`;
    form.append(fieldName, item.file);
    return {
      fieldName,
      originalPath: item.selection.path,
      relativePath: item.file.webkitRelativePath || item.file.name,
      kind: item.selection.kind,
    };
  });
  form.append("note", "assistant-ui browser import");
  form.append("source", "composer_file_browser_import");
  form.append("workspace", input.workspace);
  form.append("projectId", input.projectId);
  form.append("projectHint", input.projectHint);
  if (input.projectKey) form.append("projectKey", input.projectKey);
  form.append("batchId", `${Date.now()}-${input.projectKey || input.projectId || "chat"}`);
  form.append("browser_manifest", JSON.stringify(browserManifest));
  const response = await fetch("/api/chat/files", {
    method: "POST",
    body: form,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as BrowserImportResponse : {};
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
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
  wikiProjectOptions: readonly WikiProjectOption[];
  onSelectSkillTag: (skillId: string) => void;
  onRemoveSkillTag: (skillId: string) => void;
};

type MentionSuggestion = {
  id: string;
  kind: "skill" | "wiki-project";
  label: string;
  description: string;
  searchText: string;
  wikiProject?: WikiMentionSelection;
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

function scoreMentionSuggestion(query: string, skill: MentionSuggestion) {
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
  wikiProjectOptions,
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
  const [manualSuggestionScope, setManualSuggestionScope] = useState<"all" | "skill" | "wiki-project">("all");
  const [browseMenuOpen, setBrowseMenuOpen] = useState(false);
  const [browserSelections, setBrowserSelections] = useState<BrowserPathSelection[]>([]);
  const [pendingBrowserFiles, setPendingBrowserFiles] = useState<BrowserPendingFile[]>([]);
  const [browserSelectionsExpanded, setBrowserSelectionsExpanded] = useState(false);
  const [browserImportPhase, setBrowserImportPhase] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [browserImportMessage, setBrowserImportMessage] = useState("");
  const [wikiMentions, setWikiMentions] = useState<WikiMentionSelection[]>([]);

  const mentionSuggestions = useMemo<MentionSuggestion[]>(
    () => {
      const skillItems: MentionSuggestion[] = skills.map((skill) => ({
        id: skill.id,
        kind: "skill",
        label: skillLabel(skill),
        description: skillDescription(skill),
        searchText: [skill.id, skillLabel(skill), skillDescription(skill)].join(" "),
      }));
      const wikiProjectItems: MentionSuggestion[] = wikiProjectOptions.map((project) => ({
        id: project.projectKey,
        kind: "wiki-project",
        label: project.projectLabel || project.projectKey,
        description: project.path || "위키 프로젝트를 이번 질문의 우선 컨텍스트로 지정",
        searchText: [project.projectKey, project.projectLabel, project.path].filter(Boolean).join(" "),
        wikiProject: {
          projectKey: project.projectKey,
          projectLabel: project.projectLabel || project.projectKey,
          workspace: project.workspace,
          path: project.path,
        },
      }));
      return [...wikiProjectItems, ...skillItems];
    },
    [skills, wikiProjectOptions],
  );

  const mention = activeMentionState(composerText, caret);
  const filteredSuggestions = useMemo(() => {
    const query = (mention?.query || "").trim();
    const scopedSuggestions = manualSuggestionsOpen && manualSuggestionScope !== "all"
      ? mentionSuggestions.filter((suggestion) => suggestion.kind === manualSuggestionScope)
      : mentionSuggestions;
    if (!query) {
      return [...scopedSuggestions]
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === "wiki-project" ? -1 : 1;
          return a.label.localeCompare(b.label, "ko");
        })
        .slice(0, 8);
    }
    return scopedSuggestions
      .map((skill) => ({
        skill,
        score: scoreMentionSuggestion(query, skill),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.skill.label.localeCompare(b.skill.label, "ko");
      })
      .map((item) => item.skill)
      .slice(0, 8);
  }, [manualSuggestionScope, manualSuggestionsOpen, mention?.query, mentionSuggestions]);

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
    setPendingBrowserFiles([]);
    setBrowserImportPhase("idle");
    setBrowserImportMessage("");
  }, [composerText]);

  useEffect(() => {
    if (browserSelections.length <= 4) {
      setBrowserSelectionsExpanded(false);
    }
  }, [browserSelections.length]);

  const updateCaretFromElement = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    setCaret(element.selectionStart ?? 0);
  };

  const closeSuggestions = () => {
    setManualSuggestionsOpen(false);
    setManualSuggestionScope("all");
    setHighlightedIndex(0);
  };

  const clearImportedBrowserContext = () => {
    const currentText = composerRuntime.getState().text;
    const nextText = stripImportContextBlock(currentText);
    if (nextText !== currentText) composerRuntime.setText(nextText);
    setBrowserImportPhase("idle");
    setBrowserImportMessage("");
  };

  const syncBrowserSelections = (nextSelections: BrowserPathSelection[]) => {
    const currentText = composerRuntime.getState().text;
    const nextText = buildPathSelectionText(currentText, nextSelections);
    composerRuntime.setText(nextText);
    setBrowserSelections(nextSelections);
  };

  const syncWikiMentions = (nextMentions: WikiMentionSelection[], baseText = composerRuntime.getState().text) => {
    const nextText = buildWikiMentionText(baseText, nextMentions);
    composerRuntime.setText(nextText);
    setWikiMentions(nextMentions);
  };

  const replaceActiveMention = (insertLabel: string) => {
    const textarea = inputRef.current;
    const currentText = composerRuntime.getState().text;
    const nextMention = activeMentionState(currentText, textarea?.selectionStart ?? caret ?? currentText.length);
    let nextText = `${currentText}${insertLabel}`;
    let nextCaret = nextText.length;

    if (nextMention) {
      nextText = `${currentText.slice(0, nextMention.start)}${insertLabel}${currentText.slice(nextMention.end)}`;
      nextCaret = nextMention.start + insertLabel.length;
    }

    return { nextText, nextCaret };
  };

  const insertSkillMention = (skillId: string) => {
    const { nextText, nextCaret } = replaceActiveMention(`@${skillId} `);

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

  const insertWikiProjectMention = (suggestion: MentionSuggestion) => {
    if (!suggestion.wikiProject) return;
    const { nextText, nextCaret } = replaceActiveMention(`@${suggestion.label} `);
    const nextMentions = [...wikiMentions];
    const exists = nextMentions.some((item) => item.projectKey === suggestion.wikiProject?.projectKey);
    if (!exists) nextMentions.push(suggestion.wikiProject);
    syncWikiMentions(nextMentions, nextText);
    closeSuggestions();

    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  };

  const insertMentionSuggestion = (suggestion: MentionSuggestion) => {
    if (suggestion.kind === "wiki-project") {
      insertWikiProjectMention(suggestion);
      return;
    }
    insertSkillMention(suggestion.id);
  };

  const handleOpenMentionPicker = (scope: "skill" | "wiki-project" | "all") => {
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
    setManualSuggestionScope(scope);
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
    clearImportedBrowserContext();
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

  const mergePendingBrowserFiles = (incoming: BrowserPendingFile[]) => {
    if (!incoming.length) return;
    setPendingBrowserFiles((current) => {
      const merged = [...current];
      const seen = new Set(merged.map((item) => item.key));
      for (const item of incoming) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        merged.push(item);
      }
      return merged.sort((a, b) => a.selection.path.localeCompare(b.selection.path, "ko"));
    });
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
    mergePendingBrowserFiles(pendingBrowserFilesFromFiles(files, "file"));
    mergeBrowserSelections(browserSelectionsFromFiles(files, "file"));
    event.target.value = "";
  };

  const handleDirectoryBrowseChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as BrowserFile[];
    mergePendingBrowserFiles(pendingBrowserFilesFromFiles(files, "directory"));
    mergeBrowserSelections(browserSelectionsFromFiles(files, "directory"));
    event.target.value = "";
  };

  const handleRemoveBrowserSelection = (target: BrowserPathSelection) => {
    clearImportedBrowserContext();
    setPendingBrowserFiles((current) => current.filter((item) => !(item.selection.kind === target.kind && item.selection.path === target.path)));
    const nextSelections = browserSelections.filter((item) => !(item.kind === target.kind && item.path === target.path));
    syncBrowserSelections(nextSelections);
  };

  const handleImportBrowserSelections = async () => {
    if (!pendingBrowserFiles.length) {
      setBrowserImportPhase("error");
      setBrowserImportMessage("브라우징으로 고른 실제 파일이 없어 미러 복사를 실행할 수 없습니다.");
      return;
    }
    setBrowserImportPhase("loading");
    setBrowserImportMessage("선택 파일을 managed mirror로 복사하고 해석 중입니다.");
    try {
      const primaryProject = wikiMentions[0];
      const result = await importBrowserFilesToChat({
        files: pendingBrowserFiles,
        workspace: chatContext.workspace,
        projectId: chatContext.projectId,
        projectHint: primaryProject?.projectLabel || chatContext.projectId || "chat_project",
        projectKey: primaryProject?.projectKey,
      });
      const mirrorSelections: BrowserPathSelection[] = (result.attachments || [])
        .flatMap((item) => {
          const path = String(item.mirrorPath || "").trim();
          if (!path) return [];
          const parts = path.split("/");
          return [{
            kind: "file" as const,
            label: item.fileName || parts[parts.length - 1] || path,
            path,
            absolute: path.startsWith("/"),
          }];
        });
      if (mirrorSelections.length) syncBrowserSelections(mirrorSelections);
      if (result.contextBlock) {
        const currentText = composerRuntime.getState().text;
        composerRuntime.setText(applyImportContextText(currentText, result.contextBlock));
      }
      setPendingBrowserFiles([]);
      setBrowserImportPhase("success");
      setBrowserImportMessage(result.mirrorBatchPath
        ? `미러 복사 및 해석 완료 · ${result.attachments?.length || 0} files · ${result.mirrorBatchPath}`
        : `미러 복사 및 해석 완료 · ${result.attachments?.length || 0} files`);
    } catch (error) {
      setBrowserImportPhase("error");
      setBrowserImportMessage(error instanceof Error ? error.message : "브라우징 파일 가져오기에 실패했습니다.");
    }
  };

  const handleRemoveWikiMention = (target: WikiMentionSelection) => {
    const nextMentions = wikiMentions.filter((item) => item.projectKey !== target.projectKey);
    syncWikiMentions(nextMentions);
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
      const activeSuggestion = filteredSuggestions[highlightedIndex];
      if (activeSuggestion) insertMentionSuggestion(activeSuggestion);
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
          <div className={`aui-browse-tool-wrap ${browseMenuOpen ? "open" : ""}`}>
            <button
              type="button"
              className="aui-mini-tool"
              aria-expanded={browseMenuOpen}
              aria-haspopup="menu"
              onClick={() => setBrowseMenuOpen((current) => !current)}
            >
              파일 추가 {browserSelections.length}
            </button>
            {browseMenuOpen ? (
              <div className="aui-browse-menu" role="menu" aria-label="파일 추가 메뉴">
                <button type="button" role="menuitem" className="aui-browse-menu-item" onClick={handleBrowseFiles}>
                  파일 선택
                </button>
                <button type="button" role="menuitem" className="aui-browse-menu-item" onClick={handleBrowseDirectories}>
                  폴더 선택
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="aui-mini-tool" onClick={() => handleOpenMentionPicker("skill")}>
            @스킬 {selectedSkillTags.length}
          </button>
          <button type="button" className="aui-mini-tool" onClick={() => handleOpenMentionPicker("wiki-project")}>
            @프로젝트 {wikiMentions.length}
          </button>
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
              const skill = mentionSuggestions.find((item) => item.kind === "skill" && item.id === skillTag);
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
        {wikiMentions.length ? (
          <div className="aui-selected-tags" aria-label="selected wiki project mentions">
            {wikiMentions.map((mentionItem) => (
              <button
                key={mentionItem.projectKey}
                type="button"
                className="aui-selected-tag context"
                onClick={() => handleRemoveWikiMention(mentionItem)}
                aria-label={`@${mentionItem.projectLabel} 제거`}
              >
                <span>@{mentionItem.projectLabel}</span>
                <strong>x</strong>
              </button>
            ))}
          </div>
        ) : null}
        {browserSelections.length ? (
          <div className="aui-browser-paths" aria-label="selected browser paths">
            {(browserSelectionsExpanded ? browserSelections : browserSelections.slice(0, 4)).map((selection) => (
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
            {browserSelections.length > 4 ? (
              <button
                type="button"
                className="aui-browser-path-summary"
                onClick={() => setBrowserSelectionsExpanded((current) => !current)}
              >
                {browserSelectionsExpanded
                  ? `파일 선택 ${browserSelections.length}건 접기`
                  : `파일 선택 ${browserSelections.length}건 펼치기`}
              </button>
            ) : null}
            <div className="aui-browser-path-actions">
              <button
                type="button"
                className="aui-browser-path-summary"
                disabled={!pendingBrowserFiles.length || browserImportPhase === "loading"}
                onClick={handleImportBrowserSelections}
              >
                {browserImportPhase === "loading"
                  ? "미러 복사 + 해석 중"
                  : `미러 복사 + 해석 ${pendingBrowserFiles.length}`}
              </button>
            </div>
            {browserImportMessage ? (
              <p className={`aui-browser-import-status ${browserImportPhase}`}>{browserImportMessage}</p>
            ) : null}
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
                  onClick={() => insertMentionSuggestion(skill)}
                >
                  <strong>{skill.kind === "wiki-project" ? "@프로젝트" : "@스킬"} · {skill.label}</strong>
                  <span>{skill.description}</span>
                  <small>{skill.kind === "wiki-project" ? skill.wikiProject?.path || skill.id : skill.id}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="aui-composer-footer">
          <div className="aui-composer-left">
            <button
              type="button"
              className="aui-icon-button secondary"
              aria-label="파일 추가"
              aria-expanded={browseMenuOpen}
              aria-haspopup="menu"
              onClick={() => setBrowseMenuOpen((current) => !current)}
            >
              +
            </button>
            <span className="aui-composer-hint">Enter 전송 · Shift+Enter 줄바꿈 · @스킬/@프로젝트 자동완성</span>
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
