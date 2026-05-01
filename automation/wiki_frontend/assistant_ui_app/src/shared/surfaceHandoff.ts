export const CHAT_HANDOFF_EVENT = "assistant-ui:chat-handoff";
export const LAST_WIKI_PATH_EVENT = "assistant-ui:last-wiki-path";

type ChatHandoffMode = "replace" | "append";

export type ChatSurfaceHandoff = {
  text: string;
  mode?: ChatHandoffMode;
  sourcePath?: string;
  createdAt: string;
};

function readStorage(key: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) || "";
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function removeStorage(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function chatHandoffStorageKey(scope: string) {
  return `assistant-ui:chat-handoff:${scope}`;
}

function wikiPathStorageKey(scope: string) {
  return `assistant-ui:last-wiki-path:${scope}`;
}

export function surfaceScope(projectId = "", workspace = "") {
  return projectId || workspace || "default";
}

export function queueChatSurfaceHandoff(scope: string, payload: Omit<ChatSurfaceHandoff, "createdAt"> & { createdAt?: string }) {
  if (!scope || !payload.text.trim()) return;
  writeStorage(chatHandoffStorageKey(scope), JSON.stringify({
    ...payload,
    createdAt: payload.createdAt || new Date().toISOString(),
  }));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHAT_HANDOFF_EVENT, { detail: { scope } }));
  }
}

export function consumeChatSurfaceHandoff(scope: string) {
  if (!scope) return null;
  const raw = readStorage(chatHandoffStorageKey(scope));
  removeStorage(chatHandoffStorageKey(scope));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.text || typeof parsed.text !== "string") return null;
    return parsed as ChatSurfaceHandoff;
  } catch {
    return null;
  }
}

export function readLastWikiPath(scope: string) {
  if (!scope) return "";
  return readStorage(wikiPathStorageKey(scope)).trim();
}

export function writeLastWikiPath(scope: string, path: string) {
  if (!scope || !path.trim()) return;
  writeStorage(wikiPathStorageKey(scope), path.trim());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LAST_WIKI_PATH_EVENT, { detail: { scope, path: path.trim() } }));
  }
}
