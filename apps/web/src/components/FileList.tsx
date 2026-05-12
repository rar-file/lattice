"use client";

import type { NoteSummary } from "@lattice/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { getClient } from "../lib/client";
import { formatShortcut } from "../lib/platform";
import { useToast } from "../lib/toast";
import { FileIcon, InboxIcon, LayersIcon, PlusIcon, SearchIcon, XIcon } from "./icons";

interface Props {
  notes: NoteSummary[];
  selected: string | null;
  onSelect: (path: string) => void;
  onCapture?: () => void;
  onNewNote?: () => void;
  onChanged?: () => Promise<void> | void;
}

/**
 * Sidebar file list.
 *
 * Notes are grouped by top-level folder (Inbox, Synthesis, everything else),
 * and a built-in filter lets the user type to narrow. Each row has a kebab
 * menu with Rename + Delete actions.
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
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <div className="relative flex-1">
          <SearchIcon
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-faint"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter notes…"
            className="input pl-8 h-8 text-[12.5px]"
            disabled={!notes.length}
          />
        </div>
        {onNewNote && (
          <button
            type="button"
            onClick={onNewNote}
            className="btn btn-secondary btn-xs h-8 shrink-0"
            title={`New note (${formatShortcut("⌘N")})`}
            aria-label="New note"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!notes.length ? (
        <div className="flex flex-col items-center text-center px-6 py-10 gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sunken">
            <FileIcon className="h-5 w-5 text-fg-muted" />
          </div>
          <div className="text-[13.5px] font-medium text-fg-default">No notes yet</div>
          <p className="text-[12px] text-fg-muted leading-relaxed">
            Create a fresh note, capture a thought, or drop Markdown files into the vault folder.
          </p>
          <div className="flex gap-2 mt-1">
            {onNewNote && (
              <button type="button" onClick={onNewNote} className="btn btn-secondary btn-xs">
                <PlusIcon className="h-3 w-3" /> New note
              </button>
            )}
            {onCapture && (
              <button type="button" onClick={onCapture} className="btn btn-secondary btn-xs">
                Capture
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {groups.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-fg-muted">
              No notes match "{query}".
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.label} className="pb-2">
                <div className="flex items-center gap-2 px-3 py-1.5 text-fg-faint">
                  {iconFor(g.label)}
                  <span className="section-label">{g.label}</span>
                  <span className="ml-auto text-[10.5px] text-fg-faint">{g.items.length}</span>
                </div>
                <ul>
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

  return (
    <div
      className={`group relative mx-1 rounded-md transition-colors duration-100 ${
        selected ? "bg-accent-soft/60 text-fg-default" : "hover:bg-sunken"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left px-3 py-1.5 pr-9 focus-ring rounded-md"
        title={note.path}
      >
        <div className="text-[13px] font-medium truncate leading-snug">
          {note.title?.trim() || stripMd(basename(note.path))}
        </div>
        <div className="text-[11px] text-fg-faint truncate font-mono mt-0.5 group-hover:text-fg-muted">
          {note.path}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu();
        }}
        className={`absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-fg-faint
          ${
            menuOpen
              ? "bg-sunken text-fg-default"
              : "opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-fg-default focus:opacity-100"
          }
          transition-opacity focus-ring`}
        aria-label="Note actions"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden role="img" focusable="false">
          <title>Note actions</title>
          <circle cx="6" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="18" cy="12" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-1 top-full mt-1 z-30 w-44 card-elevated p-1 animate-scale-in"
        >
          <button
            type="button"
            onClick={onRename}
            className="block w-full text-left px-3 py-1.5 rounded text-[13px] hover:bg-sunken focus-ring"
          >
            Rename…
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="block w-full text-left px-3 py-1.5 rounded text-[13px] text-danger hover:bg-danger-soft focus-ring"
          >
            Delete…
          </button>
        </div>
      )}
    </div>
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-fg-default/40 backdrop-blur-sm p-4 pt-[20vh] animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <dialog
        open
        className="card-elevated w-full max-w-md m-0 p-0 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={submit}>
          <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
            <div className="text-[13.5px] font-semibold tracking-tight">Rename note</div>
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
            <label className="block">
              <span className="block text-[12px] font-medium text-fg-default mb-1.5">
                New path (without .md)
              </span>
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="input font-mono text-[12.5px]"
              />
            </label>
            {error && (
              <div className="rounded-md bg-danger-soft text-danger px-3 py-2 text-[12px]">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!value.trim() || busy}
                className="btn btn-primary btn-sm"
              >
                {busy ? "Renaming…" : "Rename"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </div>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg-default/40 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <dialog
        open
        className="card-elevated w-full max-w-md m-0 p-0 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="text-[14px] font-semibold tracking-tight text-fg-default">
            Delete this note?
          </div>
          <p className="mt-1.5 text-[12.5px] text-fg-muted leading-relaxed">
            <span className="font-mono">{note.path}</span> will be removed from the vault folder and
            the index. This action cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={go}
              disabled={busy}
              className="btn btn-sm bg-danger text-white hover:opacity-90"
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </dialog>
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

function iconFor(label: string) {
  if (label === "Inbox") return <InboxIcon className="h-3.5 w-3.5" />;
  if (label === "Synthesis") return <LayersIcon className="h-3.5 w-3.5" />;
  return <FileIcon className="h-3.5 w-3.5" />;
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function stripMd(s: string): string {
  return s.replace(/\.md$/i, "");
}
