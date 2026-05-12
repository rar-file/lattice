"use client";

import { useEffect, useRef, useState } from "react";
import { getClient } from "../lib/client";
import { useToast } from "../lib/toast";
import { XIcon } from "./icons";

interface Props {
  open: boolean;
  onClose(): void;
  onCreated(path: string): void;
}

/**
 * Inline-style new-note dialog. Always creates a Markdown file with an H1 of
 * the title; the user can immediately start editing in the main pane.
 */
export function NewNoteForm({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setTitle("");
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const slug = title
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 80);
      const dir = folder.trim().replace(/^\/+|\/+$/g, "");
      const path = `${dir ? `${dir}/` : ""}${slug}.md`;
      const body = `# ${title.trim()}\n\n`;
      const note = await getClient().putNote(path, body);
      toast.success(`Created ${note.path}`);
      onCreated(note.path);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("Couldn't create note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-fg-default/35 p-4 pt-[16vh] animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card-elevated w-full max-w-md animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
            <div className="text-[14px] font-medium tracking-tight">New note</div>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-xs"
              aria-label="Close"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <label className="block">
              <span className="block text-[12px] font-medium text-fg-default mb-2">Title</span>
              <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What is this note about?"
                className="input"
              />
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium text-fg-default mb-2">
                Folder <span className="text-fg-faint font-normal">(optional)</span>
              </span>
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="e.g. Projects/2026"
                className="input font-mono text-[13px]"
              />
            </label>
            {error && <div className="text-[12px] text-fg-muted px-1">{error}</div>}
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-fg-muted">
                Saved as <span className="font-mono">slug.md</span> from the title.
              </p>
              <button
                type="submit"
                disabled={!title.trim() || busy}
                className="btn btn-primary btn-sm"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
