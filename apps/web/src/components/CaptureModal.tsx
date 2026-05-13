"use client";

import { useEffect, useRef, useState } from "react";
import { getClient } from "../lib/client";
import { IS_MAC } from "../lib/platform";
import { InboxIcon, XIcon } from "./icons";

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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[14vh] animate-fade-in"
      style={{ background: "rgba(7,8,13,0.6)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card-elevated w-full max-w-xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit}>
          <div className="flex items-center gap-2 px-6 pt-5">
            <InboxIcon className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
            <div className="text-lede">Capture a thought</div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto btn btn-ghost btn-icon"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="px-6 pb-6 pt-4">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={6}
              placeholder="Drop a thought — it lands as a clean atomic note in your Inbox."
              className="input resize-none text-[14px] leading-relaxed"
            />
            {error && <div className="mt-2 text-meta">{error}</div>}
            <div className="mt-6 flex items-center justify-between gap-4">
              <p className="text-caption">
                Saves to{" "}
                <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
                  Inbox/YYYY-MM-DD-slug.md
                </span>
              </p>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex items-center gap-1 text-caption">
                  <kbd className="kbd">{IS_MAC ? "⌘" : "Ctrl"}</kbd>
                  <kbd className="kbd">{IS_MAC ? "↵" : "Enter"}</kbd>
                </span>
                <button
                  type="submit"
                  disabled={!text.trim() || busy}
                  className="btn btn-primary btn-sm"
                >
                  {busy ? "Saving…" : "Capture"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
