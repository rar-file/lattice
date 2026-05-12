"use client";

import type { NoteSummary } from "@lattice/sdk";

interface Props {
  notes: NoteSummary[];
  selected: string | null;
  onSelect: (path: string) => void;
}

export function FileList({ notes, selected, onSelect }: Props) {
  if (!notes.length) {
    return (
      <div className="p-4 text-sm text-neutral-500">No notes indexed yet.</div>
    );
  }
  return (
    <ul className="overflow-y-auto h-full">
      {notes.map((n) => (
        <li key={n.path}>
          <button
            type="button"
            onClick={() => onSelect(n.path)}
            className={`w-full text-left px-3 py-2 text-sm border-b border-neutral-100 dark:border-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 truncate ${
              selected === n.path ? "bg-neutral-100 dark:bg-neutral-800 font-medium" : ""
            }`}
            title={n.path}
          >
            <div className="truncate">{n.title ?? n.path}</div>
            <div className="text-xs text-neutral-500 truncate font-mono">{n.path}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
