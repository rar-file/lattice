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
 * Command palette — ⌘P. Cursor lives on a row painted in surface-active /
 * text-emphasis; accent never appears on a row (the rule for buttons).
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

    return [...actionItems, ...noteItems];
  }, [query, notes, actions]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: query is the trigger, not a read
  useEffect(() => {
    setCursor(0);
  }, [query]);

  useEffect(() => {
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[14vh] animate-fade-in"
      style={{ background: "rgba(7,8,13,0.6)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card-elevated w-full max-w-xl animate-fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 h-12">
          <SearchIcon className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a note or run a command"
            className="flex-1 bg-transparent outline-none text-[14px] font-sans"
            style={{ color: "var(--text-emphasis)" }}
          />
          <kbd className="kbd">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto scrollbar-thin py-1">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-meta">No matches.</div>
          ) : (
            items.map((it, i) => {
              const active = i === cursor;
              const rowStyle: React.CSSProperties = {
                background: active ? "var(--surface-active)" : "transparent",
                color: active ? "var(--text-emphasis)" : "var(--text-default)",
              };
              const rowClass =
                "w-full flex items-center gap-3 px-4 h-9 text-left transition-colors focus-ring";
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
                    className={rowClass}
                    style={rowStyle}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center shrink-0"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {a.icon ?? <ArrowRightIcon className="h-4 w-4" />}
                    </span>
                    <span className="flex-1 min-w-0 flex items-baseline gap-2">
                      <span className="text-[13px] truncate">{a.label}</span>
                      {a.hint && (
                        <span
                          className="text-[11px] truncate"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {a.hint}
                        </span>
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
                  className={rowClass}
                  style={rowStyle}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center shrink-0"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <FileIcon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 min-w-0 flex items-baseline gap-2">
                    <span className="text-[13px] truncate">
                      {n.title?.trim() || stripMd(basename(n.path))}
                    </span>
                    <span
                      className="text-[11px] font-mono truncate"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {n.path}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 h-9"
          style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}
        >
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-2">
              <kbd className="kbd">↑↓</kbd> navigate
            </span>
            <span className="inline-flex items-center gap-2">
              <kbd className="kbd">↵</kbd> select
            </span>
          </div>
          <span className="text-[11px] font-mono">
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

export { PlusIcon, SearchIcon, XIcon };
