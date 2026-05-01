import { useEffect, useState } from "react";
import { useToastCenter } from "../../../components/surface/ToastCenter";
import {
  createPaperclipTask,
  fetchPaperclipSnapshot,
  triggerExistingPaperclipTask,
  triggerPaperclipTemplate,
  type PaperclipSnapshot,
  type PaperclipTask,
  type PaperclipTemplate,
} from "../api/paperclipApi";

type PaperclipPhase = "idle" | "loading" | "saving" | "triggering" | "error";

const EMPTY_SNAPSHOT: PaperclipSnapshot = {
  available: false,
  url: "",
  status: "loading",
  recommendedAgents: [],
  templates: [],
  tasks: [],
  events: [],
  runs: [],
};

function parsePayloadText(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  return { input: trimmed };
}

export function usePaperclipStudio() {
  const { notify } = useToastCenter();
  const [snapshot, setSnapshot] = useState<PaperclipSnapshot>(EMPTY_SNAPSHOT);
  const [activeTemplateId, setActiveTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [projectHint, setProjectHint] = useState("");
  const [payloadText, setPayloadText] = useState("");
  const [phase, setPhase] = useState<PaperclipPhase>("loading");
  const [message, setMessage] = useState("Paperclip 상태를 불러오는 중입니다.");

  const activeTemplate = snapshot.templates.find((template) => template.id === activeTemplateId) || snapshot.templates[0];

  const reload = async () => {
    setPhase("loading");
    try {
      const next = await fetchPaperclipSnapshot();
      setSnapshot(next);
      setActiveTemplateId((current) => current || next.templates[0]?.id || "");
      setMessage(next.status || (next.available ? "Paperclip available" : "Paperclip unavailable"));
      setPhase("idle");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Paperclip 상태 조회 실패");
    }
  };

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!activeTemplate) return;
    setTitle((current) => current || activeTemplate.title || "");
  }, [activeTemplate?.id]);

  const runWithPayload = async (
    operation: (template: PaperclipTemplate, payload: Record<string, unknown>) => Promise<unknown>,
    nextPhase: PaperclipPhase,
    successMessage: string,
    ) => {
    if (!activeTemplate) return;
    setPhase(nextPhase);
    notify("running", successMessage.includes("실행") ? "Paperclip 실행 시작" : "Paperclip 큐 저장 시작", title || activeTemplate.title, { durationMs: 2200 });
    try {
      const payload = parsePayloadText(payloadText);
      if (projectHint.trim()) payload.projectHint = projectHint.trim();
      await operation(activeTemplate, payload);
      setMessage(successMessage);
      setPayloadText("");
      await reload();
      notify("success", "Paperclip 작업 완료", successMessage);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Paperclip 작업 실패");
      notify("error", "Paperclip 작업 실패", error instanceof Error ? error.message : "Paperclip 작업 실패");
    }
  };

  const queueTask = () =>
    runWithPayload(
      (template, payload) => createPaperclipTask({ templateId: template.id, title: title || template.title, dryRun: template.dryRun, payload }),
      "saving",
      "Paperclip task를 큐에 추가했습니다.",
    );

  const queueAndTrigger = () =>
    runWithPayload(
      (template, payload) => triggerPaperclipTemplate({
        templateId: template.id,
        title: title || template.title,
        dryRun: template.dryRun,
        payload,
        async: true,
      }),
      "triggering",
      "Paperclip task를 생성하고 비동기 실행을 요청했습니다.",
    );

  const triggerTask = async (task: PaperclipTask) => {
    setPhase("triggering");
    notify("running", "Paperclip task 실행 시작", task.title || task.id, { durationMs: 2200 });
    try {
      await triggerExistingPaperclipTask(task.id, { async: true });
      setMessage(`${task.title || task.id} 비동기 실행을 요청했습니다.`);
      await reload();
      notify("success", "Paperclip task 실행 요청 완료", task.title || task.id);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Paperclip task 실행 실패");
      notify("error", "Paperclip task 실행 실패", error instanceof Error ? error.message : "Paperclip task 실행 실패");
    }
  };

  return {
    snapshot,
    activeTemplate,
    activeTemplateId,
    setActiveTemplateId,
    title,
    setTitle,
    projectHint,
    setProjectHint,
    payloadText,
    setPayloadText,
    phase,
    message,
    reload,
    queueTask,
    queueAndTrigger,
    triggerTask,
  };
}
