"use client";

import { useEffect, useRef, useState } from "react";
import { getClient } from "../lib/client";

interface Props {
  open: boolean;
  onClose: () => void;
  onCaptured?: (path: string) => void;
}

export function CaptureModal({ open, onClose, onCaptured }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText("");
      setError(null);
      // Focus on next tick so animations / layout settle first.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await getClient().capture(text.trim(), { source: "web" });
      onCaptured?.(resp.path);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24">
      <dialog
        open
        className="w-full max-w-xl rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl m-0 p-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Capture</div>
            <div className="text-[11px] text-neutral-500">⌘↵ to save · esc to cancel</div>
          </div>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={4}
            placeholder="dump your thought — Claude will reshape it into a clean note"
            className="w-full resize-none rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          {error && (
            <div className="rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 text-xs px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="text-xs px-3 py-1.5 rounded bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 disabled:opacity-50"
            >
              {busy ? "drafting…" : "capture"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
