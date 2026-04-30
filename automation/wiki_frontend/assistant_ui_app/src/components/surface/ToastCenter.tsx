import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ToastTone = "running" | "success" | "error" | "info";

export type AppToast = {
  id: string;
  tone: ToastTone;
  title: string;
  body: string;
  durationMs?: number;
};

type ToastCenterValue = {
  toasts: AppToast[];
  notify: (tone: ToastTone, title: string, body: string, options?: { durationMs?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastCenterContext = createContext<ToastCenterValue | null>(null);

function nextToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastCenterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<AppToast[]>([]);

  const value = useMemo<ToastCenterValue>(() => ({
    toasts,
    notify: (tone, title, body, options) => {
      const id = nextToastId();
      setToasts((current) => [...current, { id, tone, title, body, durationMs: options?.durationMs }].slice(-5));
      return id;
    },
    dismiss: (id) => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    },
    clear: () => {
      setToasts([]);
    },
  }), [toasts]);

  return (
    <ToastCenterContext.Provider value={value}>
      {children}
      <GlobalToastViewport />
    </ToastCenterContext.Provider>
  );
}

export function useToastCenter() {
  const value = useContext(ToastCenterContext);
  if (!value) throw new Error("useToastCenter must be used inside ToastCenterProvider");
  return value;
}

function ToastCard({ toast, onDismiss }: { toast: AppToast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.tone === "running") return undefined;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs ?? 5200);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.durationMs, toast.id, toast.tone]);

  return (
    <article aria-live="polite" className={`aui-global-toast ${toast.tone}`} role="status">
      <strong>{toast.title}</strong>
      <span>{toast.body}</span>
      <button onClick={() => onDismiss(toast.id)} type="button">닫기</button>
    </article>
  );
}

function GlobalToastViewport() {
  const toastCenter = useToastCenter();
  if (!toastCenter.toasts.length) return null;
  return (
    <aside className="aui-global-toast-stack" aria-label="service notifications">
      {toastCenter.toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={toastCenter.dismiss} />
      ))}
    </aside>
  );
}
