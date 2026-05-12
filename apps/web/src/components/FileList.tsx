"use client";

import type { NoteSummary } from "@lattice/sdk";
import { useMemo, useState } from "react";
import { FileIcon, InboxIcon, LayersIcon, SearchIcon } from "./icons";

interface Props {
  notes: NoteSummary[];
  selected: string | null;
  onSelect: (path: string) => void;
  onCapture?: () => void;
}

/**
 * Sidebar file list.
 *
 * Notes are grouped by top-level folder (Inbox, Synthesis, everything else),
 * and a built-in filter lets the user type to narrow. Each row shows the
 * note title with the path as a quiet line underneath.
 */
export function FileList({ notes, selected, onSelect, onCapture }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return notes;
    const q = query.toLowerCase();
    return notes.filter(
      (n) => n.path.toLowerCase().includes(q) || (n.title ?? "").toLowerCase().includes(q),
    );
  }, [notes, query]);

  const groups = useMemo(() => groupByFolder(filtered), [filtered]);

  if (!notes.length) {
    return (
      <div className="flex flex-col items-center text-center px-6 py-10 gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sunken">
          <FileIcon className="h-5 w-5 text-fg-muted" />
        </div>
        <div className="text-[13.5px] font-medium text-fg-default">No notes yet</div>
        <p className="text-[12px] text-fg-muted leading-relaxed">
          Drop a Markdown file into the vault folder, or capture a thought to start.
        </p>
        {onCapture && (
          <button type="button" onClick={onCapture} className="btn btn-secondary btn-xs mt-1">
            Capture a thought
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <SearchIcon
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-faint"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter notes…"
            className="input pl-8 h-8 text-[12.5px]"
          />
        </div>
      </div>
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
                    <button
                      type="button"
                      onClick={() => onSelect(n.path)}
                      className={`group w-full text-left px-3 py-1.5 rounded-md mx-1 transition-colors duration-100 focus-ring ${
                        selected === n.path
                          ? "bg-accent-soft/60 text-fg-default"
                          : "hover:bg-sunken"
                      }`}
                      title={n.path}
                    >
                      <div className="text-[13px] font-medium truncate leading-snug">
                        {n.title?.trim() || stripMd(basename(n.path))}
                      </div>
                      <div className="text-[11px] text-fg-faint truncate font-mono mt-0.5 group-hover:text-fg-muted">
                        {n.path}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
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
