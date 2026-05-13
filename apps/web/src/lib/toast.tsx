"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckIcon, XIcon } from "../components/icons";

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
  const color =
    toast.kind === "success"
      ? "rgb(var(--success))"
      : toast.kind === "error"
        ? "rgb(var(--danger))"
        : "var(--text-default)";

  return (
    <div className="card-elevated pointer-events-auto animate-fade-in">
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="mt-0.5 shrink-0" style={{ color }}>
          {toast.kind === "success" ? (
            <CheckIcon className="h-4 w-4" />
          ) : toast.kind === "error" ? (
            <XIcon className="h-4 w-4" />
          ) : (
            <span
              className="block h-2 w-2 rounded-full"
              style={{ background: "var(--text-secondary)" }}
            />
          )}
        </div>
        <div
          className="flex-1 text-[13px] leading-relaxed"
          style={{ color: "var(--text-default)" }}
        >
          {toast.message}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="focus-ring rounded p-1 -mt-1 transition-colors"
          style={{ color: "var(--text-tertiary)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-emphasis)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
          }}
          aria-label="Dismiss"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
