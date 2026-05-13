"use client";

import type { NoteSummary } from "@lattice/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { getClient } from "../lib/client";
import { formatShortcut } from "../lib/platform";
import { useToast } from "../lib/toast";
import { PlusIcon, SearchIcon, XIcon } from "./icons";

interface Props {
  notes: NoteSummary[];
  selected: string | null;
  onSelect: (path: string) => void;
  onCapture?: () => void;
  onNewNote?: () => void;
  onChanged?: () => Promise<void> | void;
}

/**
 * Left rail file list — the highest-frequency component in the workspace.
 *
 * Filename in mono (chrome speaks slugs); titles in the body face. Six row
 * states are implemented in {@link FileRow}: default / hover / focus-visible /
 * active / disabled / selected. Selected gets the live-state treatment
 * (accent-bg + soft accent-glow) — it is the active rail item, one of the
 * design-locked accent surfaces.
 */
export function FileList({ notes, selected, onSelect, onCapture, onNewNote, onChanged }: Props) {
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<NoteSummary | null>(null);
  const [confirming, setConfirming] = useState<NoteSummary | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return notes;
    const q = query.toLowerCase();
    return notes.filter(
      (n) => n.path.toLowerCase().includes(q) || (n.title ?? "").toLowerCase().includes(q),
    );
  }, [notes, query]);

  const groups = useMemo(() => groupByFolder(filtered), [filtered]);

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="relative flex-1">
          <SearchIcon
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
            style={{ color: "var(--text-tertiary)" }}
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter notes"
            className="input pl-8 h-8 text-[13px]"
            disabled={!notes.length}
          />
        </div>
        {onNewNote && (
          <button
            type="button"
            onClick={onNewNote}
            className="btn btn-ghost btn-icon shrink-0"
            title={`New note (${formatShortcut("⌘N")})`}
            aria-label="New note"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {!notes.length ? (
        <div className="flex flex-col items-start px-4 pt-8 pb-12 gap-2">
          <div className="text-lede">No notes yet</div>
          <p className="text-meta max-w-[220px]">
            Create a note, capture a thought, or drop Markdown into the vault folder.
          </p>
          <div className="flex gap-2 mt-3">
            {onNewNote && (
              <button type="button" onClick={onNewNote} className="btn btn-secondary btn-xs">
                <PlusIcon className="h-3.5 w-3.5" /> New note
              </button>
            )}
            {onCapture && (
              <button type="button" onClick={onCapture} className="btn btn-ghost btn-xs">
                Capture
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin pb-4">
          {groups.length === 0 ? (
            <div className="px-4 pt-8 text-meta">No notes match “{query}”.</div>
          ) : (
            groups.map((g, gi) => (
              <section key={g.label} className={gi === 0 ? "pt-2" : "pt-5"}>
                <div className="flex items-center gap-2 px-4 pb-1.5">
                  <span className="text-eyebrow">{g.label}</span>
                  <span
                    className="ml-auto text-[11px] font-mono"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {g.items.length}
                  </span>
                </div>
                <ul className="px-1.5">
                  {g.items.map((n) => (
                    <li key={n.path}>
                      <FileRow
                        note={n}
                        selected={selected === n.path}
                        menuOpen={menuFor === n.path}
                        onOpenMenu={() => setMenuFor(menuFor === n.path ? null : n.path)}
                        onCloseMenu={() => setMenuFor(null)}
                        onSelect={() => onSelect(n.path)}
                        onRename={() => {
                          setMenuFor(null);
                          setRenaming(n);
                        }}
                        onDelete={() => {
                          setMenuFor(null);
                          setConfirming(n);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}

      <RenameDialog
        note={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={async (newPath) => {
          setRenaming(null);
          await onChanged?.();
          onSelect(newPath);
        }}
      />
      <ConfirmDelete
        note={confirming}
        onClose={() => setConfirming(null)}
        onDeleted={async () => {
          setConfirming(null);
          await onChanged?.();
        }}
      />
    </div>
  );
}

interface FileRowProps {
  note: NoteSummary;
  selected: boolean;
  menuOpen: boolean;
  onOpenMenu(): void;
  onCloseMenu(): void;
  onSelect(): void;
  onRename(): void;
  onDelete(): void;
}

/**
 * The six states, in implementation order:
 *   default        — surface-base background (transparent), text-default
 *   hover          — surface-hover, text-emphasis on the title
 *   focus-visible  — 1px accent ring (.focus-ring)
 *   active (press) — surface-active background
 *   disabled       — opacity 0.4 (handled by the .btn class on dialogs)
 *   selected       — accent-bg + accent-glow (the live rail item)
 */
function FileRow({
  note,
  selected,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onSelect,
  onRename,
  onDelete,
}: FileRowProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onCloseMenu();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseMenu();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, onCloseMenu]);

  const slug = basename(note.path);
  const title = note.title?.trim() || stripMd(slug);

  return (
    <div
      className={`group relative my-px rounded-md transition-colors ${selected ? "live-bg" : ""}`}
      onMouseEnter={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }
      }}
      onMouseDown={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-active)";
        }
      }}
      onMouseUp={(e) => {
        if (!selected) {
          (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
        }
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left pl-3 pr-9 py-2 focus-ring rounded-md"
        title={note.path}
      >
        <div
          className="truncate text-[13px] leading-snug"
          style={{
            color: selected ? "var(--text-emphasis)" : "var(--text-default)",
            fontWeight: selected ? 500 : 400,
          }}
        >
          {title}
        </div>
        <div
          className="text-[11px] truncate font-mono mt-1 leading-snug"
          style={{ color: "var(--text-tertiary)" }}
        >
          {slug}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu();
        }}
        className={`absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded flex items-center justify-center focus-ring
          transition-opacity ${menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
        style={{ color: "var(--text-tertiary)" }}
        aria-label="Note actions"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden role="img" focusable="false">
          <title>Note actions</title>
          <circle cx="5.5" cy="12" r="1.25" fill="currentColor" />
          <circle cx="12" cy="12" r="1.25" fill="currentColor" />
          <circle cx="18.5" cy="12" r="1.25" fill="currentColor" />
        </svg>
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-1 top-full mt-1 z-30 w-44 card-elevated p-1 animate-fade-in"
        >
          <MenuItem onClick={onRename}>Rename</MenuItem>
          <MenuItem onClick={onDelete} danger>
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left px-3 h-8 rounded text-[13px] focus-ring transition-colors"
      style={{ color: danger ? "rgb(var(--danger))" : "var(--text-default)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = danger
          ? "rgba(244,134,134,0.08)"
          : "var(--surface-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function RenameDialog({
  note,
  onClose,
  onRenamed,
}: {
  note: NoteSummary | null;
  onClose: () => void;
  onRenamed: (newPath: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (note) {
      setValue(stripMd(note.path));
      setError(null);
    }
  }, [note]);

  if (!note) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || busy || !note) return;
    setBusy(true);
    setError(null);
    try {
      const r = await getClient().renameNote(note.path, value.trim());
      toast.success(`Renamed to ${r.path}`);
      await onRenamed(r.path);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setError(m);
      toast.error("Rename failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell onClose={onClose} title="Rename note">
      <form onSubmit={submit}>
        <label className="block">
          <span className="block text-meta mb-2">New path (without .md)</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="input font-mono text-[13px]"
          />
        </label>
        {error && <div className="mt-2 text-meta">{error}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            Cancel
          </button>
          <button type="submit" disabled={!value.trim() || busy} className="btn btn-primary btn-sm">
            {busy ? "Renaming…" : "Rename"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function ConfirmDelete({
  note,
  onClose,
  onDeleted,
}: {
  note: NoteSummary | null;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (note && e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [note, onClose]);

  if (!note) return null;
  const target = note;

  async function go() {
    setBusy(true);
    try {
      await getClient().deleteNote(target.path);
      toast.success(`Deleted ${target.path}`);
      await onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell onClose={onClose} title="Delete this note?">
      <p className="text-meta">
        <span className="font-mono">{note.path}</span> will be removed from the vault folder and the
        index. This action cannot be undone.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="btn btn-sm"
          style={{ background: "rgb(var(--danger))", color: "var(--surface-base)" }}
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </DialogShell>
  );
}

function DialogShell({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 animate-fade-in"
      style={{ background: "rgba(7,8,13,0.6)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card-elevated w-full max-w-md animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="text-lede">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 pb-6 pt-4">{children}</div>
      </div>
    </div>
  );
}

interface Group {
  label: string;
  items: NoteSummary[];
}

function groupByFolder(notes: NoteSummary[]): Group[] {
  const inbox: NoteSummary[] = [];
  const synth: NoteSummary[] = [];
  const rest: NoteSummary[] = [];
  for (const n of notes) {
    const top = n.path.split("/")[0]?.toLowerCase() ?? "";
    if (top === "inbox") inbox.push(n);
    else if (top === "synthesis") synth.push(n);
    else rest.push(n);
  }
  const out: Group[] = [];
  if (inbox.length) out.push({ label: "Inbox", items: inbox });
  if (rest.length) out.push({ label: "Notes", items: rest });
  if (synth.length) out.push({ label: "Synthesis", items: synth });
  return out;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function stripMd(s: string): string {
  return s.replace(/\.md$/i, "");
}
