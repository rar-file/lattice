"use client";

import type { NoteSummary } from "@lattice/sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, FileIcon, PlusIcon, SearchIcon, XIcon } from "./icons";

export interface CommandAction {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  run(): void;
}

interface Props {
  open: boolean;
  onClose(): void;
  notes: NoteSummary[];
  onJumpToNote(path: string): void;
  actions: CommandAction[];
}

/**
 * Command Palette — ⌘P. Fuzzy-matches across notes (by title and path) and
 * registered actions. Up/Down navigate, Enter executes.
 */
export function CommandPalette({ open, onClose, notes, onJumpToNote, actions }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const noteItems = notes
      .map((n) => ({
        kind: "note" as const,
        note: n,
        text: `${n.title ?? ""} ${n.path}`.toLowerCase(),
      }))
      .filter((it) => (q ? scoreMatch(it.text, q) > 0 : true))
      .map((it) => ({ ...it, score: q ? scoreMatch(it.text, q) : 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);

    const actionItems = actions
      .map((a) => ({
        kind: "action" as const,
        action: a,
        text: `${a.label} ${a.hint ?? ""}`.toLowerCase(),
      }))
      .filter((it) => (q ? scoreMatch(it.text, q) > 0 : true));

    // Show actions first when there's no query, mixed when there is one.
    if (!q) return [...actionItems, ...noteItems];
    return [...actionItems, ...noteItems];
  }, [query, notes, actions]);

  // Reset cursor whenever the query changes. Biome can't tell that `query`
  // is a meaningful trigger (the body doesn't read it) so we silence the rule.
  // biome-ignore lint/correctness/useExhaustiveDependencies: query is the trigger, not a read
  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
    // Scroll the cursor into view as it moves.
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cursor="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(items.length - 1, c + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = items[cursor];
        if (!it) return;
        if (it.kind === "note") {
          onJumpToNote(it.note.path);
        } else {
          it.action.run();
        }
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, items, cursor, onJumpToNote]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-fg-default/35 p-4 pt-[14vh] animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card-elevated w-full max-w-xl animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
          <SearchIcon className="h-4 w-4 text-fg-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a note or run a command…"
            className="flex-1 bg-transparent outline-none text-[14px] text-fg-default placeholder:text-fg-faint"
          />
          <kbd className="kbd">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto scrollbar-thin py-1">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-fg-muted">
              No matches. Try a different query.
            </div>
          ) : (
            items.map((it, i) => {
              const active = i === cursor;
              if (it.kind === "action") {
                const a = it.action;
                return (
                  <button
                    key={`a-${a.id}`}
                    type="button"
                    data-cursor={i}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      a.run();
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                      active ? "bg-sunken" : ""
                    }`}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sunken text-fg-muted shrink-0">
                      {a.icon ?? <ArrowRightIcon className="h-4 w-4" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-fg-default truncate">{a.label}</span>
                      {a.hint && (
                        <span className="block text-[12px] text-fg-muted truncate">{a.hint}</span>
                      )}
                    </span>
                    {a.shortcut && <kbd className="kbd shrink-0">{a.shortcut}</kbd>}
                  </button>
                );
              }
              const n = it.note;
              return (
                <button
                  key={`n-${n.path}`}
                  type="button"
                  data-cursor={i}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => {
                    onJumpToNote(n.path);
                    onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                    active ? "bg-sunken" : ""
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sunken text-fg-muted shrink-0">
                    <FileIcon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] text-fg-default truncate">
                      {n.title?.trim() || stripMd(basename(n.path))}
                    </span>
                    <span className="block text-[12px] font-mono text-fg-faint truncate">
                      {n.path}
                    </span>
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-fg-faint shrink-0" />
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2 text-[12px] text-fg-muted">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2">
              <kbd className="kbd">↑↓</kbd> navigate
            </span>
            <span className="inline-flex items-center gap-2">
              <kbd className="kbd">↵</kbd> select
            </span>
          </div>
          <span>
            {items.length} result{items.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}
function stripMd(s: string): string {
  return s.replace(/\.md$/i, "");
}

/**
 * Cheap subsequence-aware score: each query character that matches in order
 * adds 1; contiguous matches add a bonus; word-start matches add a bonus.
 * Returns 0 if not all chars match — that's what filters non-results.
 */
function scoreMatch(text: string, query: string): number {
  if (!query) return 1;
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (let qi = 0; qi < query.length; qi++) {
    const ch = query[qi];
    let found = -1;
    for (let i = ti; i < text.length; i++) {
      if (text[i] === ch) {
        found = i;
        break;
      }
    }
    if (found < 0) return 0;
    // Word-start bonus
    if (found === 0 || text[found - 1] === " " || text[found - 1] === "/") {
      score += 2;
    }
    if (found === ti) {
      streak += 1;
      score += streak;
    } else {
      streak = 0;
    }
    score += 1;
    ti = found + 1;
  }
  return score;
}

// Helpful icon re-exports for callers building action lists.
export { PlusIcon, SearchIcon, XIcon };
