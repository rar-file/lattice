"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckIcon, XIcon } from "../components/icons";

/**
 * Minimal toast system — no dependency, designed-system styled.
 *
 *   const toast = useToast();
 *   toast.success("Saved");
 *   toast.error("Couldn't reach the vault");
 *
 * Mount <ToastProvider> once near the root; <ToastViewport> is rendered
 * inside the provider so it gets pushed to the top of the DOM stacking
 * order via fixed positioning.
 */

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContext {
  push(kind: ToastKind, message: string): void;
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

const Ctx = createContext<ToastContext | null>(null);

export function useToast(): ToastContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = ++idRef.current;
    setToasts((cur) => [...cur, { id, kind, message }]);
    // Auto-dismiss after 3.5s.
    setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const value = useMemo<ToastContext>(
    () => ({
      push,
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <ToastViewport
        toasts={toasts}
        onDismiss={(id) => setToasts((cur) => cur.filter((t) => t.id !== id))}
      />
    </Ctx.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none w-[320px] max-w-[calc(100vw-32px)]">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Tiny progress-bar that drains over the toast's lifetime, for visual
  // confirmation that auto-dismiss is happening.
  const [progress, setProgress] = useState(100);
  useEffect(() => {
    const start = Date.now();
    const duration = 3500;
    const id = setInterval(() => {
      const left = Math.max(0, 100 - ((Date.now() - start) / duration) * 100);
      setProgress(left);
    }, 60);
    return () => clearInterval(id);
  }, []);

  const tone =
    toast.kind === "success"
      ? "border-success/30 text-success"
      : toast.kind === "error"
        ? "border-danger/30 text-danger"
        : "border-border-default text-fg-default";

  return (
    <div
      className={`relative overflow-hidden card-elevated pointer-events-auto animate-slide-up ${tone}`}
    >
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="mt-1 shrink-0">
          {toast.kind === "success" ? (
            <CheckIcon className="h-4 w-4" />
          ) : toast.kind === "error" ? (
            <XIcon className="h-4 w-4" />
          ) : (
            <div className="h-4 w-4 rounded-full bg-accent" />
          )}
        </div>
        <div className="flex-1 text-[13px] text-fg-default leading-relaxed">{toast.message}</div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-fg-faint hover:text-fg-default focus-ring rounded p-1 -mt-1"
          aria-label="Dismiss"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div
        className="absolute bottom-0 left-0 h-[2px] bg-current opacity-30"
        style={{ width: `${progress}%`, transition: "width 60ms linear" }}
      />
    </div>
  );
}
