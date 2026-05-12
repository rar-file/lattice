"use client";

import { useEffect, useRef, useState } from "react";
import { getClient } from "../lib/client";
import { IS_MAC } from "../lib/platform";
import { SparkleIcon, XIcon } from "./icons";

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-fg-default/40 backdrop-blur-sm p-4 pt-[16vh] animate-fade-in"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <dialog
        open
        className="card-elevated w-full max-w-xl m-0 p-0 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <form onSubmit={submit}>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border-subtle">
            <SparkleIcon className="h-4 w-4 text-accent" />
            <div className="text-[13.5px] font-semibold tracking-tight">Capture a thought</div>
            <div className="ml-auto text-[11px] text-fg-muted flex items-center gap-1.5">
              <kbd className="kbd">{IS_MAC ? "⌘" : "Ctrl"}</kbd>
              <kbd className="kbd">{IS_MAC ? "↵" : "Enter"}</kbd>
              <span>to save</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-xs"
              aria-label="Close"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="p-5 space-y-3">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={5}
              placeholder="Dump your thought — Claude will reshape it into a clean atomic note in your Inbox."
              className="input resize-none text-[14px] leading-relaxed"
            />
            {error && (
              <div className="rounded-md bg-danger-soft text-danger px-3 py-2 text-[12px]">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-[11.5px] text-fg-muted">
                Gets a frontmatter title, tags, and lives at{" "}
                <span className="font-mono">Inbox/YYYY-MM-DD-slug.md</span>.
              </p>
              <button
                type="submit"
                disabled={!text.trim() || busy}
                className="btn btn-primary btn-sm"
              >
                {busy ? "Drafting…" : "Capture"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </div>
  );
}
