"use client";

import type { SearchHit } from "@lattice/sdk";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { getClient } from "../lib/client";
import { SearchIcon } from "./icons";

interface Props {
  vaultOpen: boolean;
  onJumpToNote: (path: string) => void;
}

export interface SidePanelHandle {
  focusSearch(): void;
}

export const SidePanel = forwardRef<SidePanelHandle, Props>(function SidePanel(
  { vaultOpen, onJumpToNote },
  ref,
) {
  const searchInput = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusSearch() {
      requestAnimationFrame(() => searchInput.current?.focus());
    },
  }));

  return (
    <div className="flex h-full flex-col bg-surface">
      <SearchPane inputRef={searchInput} vaultOpen={vaultOpen} onJumpToNote={onJumpToNote} />
    </div>
  );
});

interface SearchPaneProps extends Props {
  inputRef?: React.Ref<HTMLInputElement>;
}

function SearchPane({ vaultOpen, onJumpToNote, inputRef }: SearchPaneProps) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const hs = await getClient().search(q, { limit: 12 });
      setHits(hs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="p-3 border-b border-border-subtle"
      >
        <div className="relative">
          <SearchIcon
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-faint"
            aria-hidden
          />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={!vaultOpen || busy}
            placeholder={vaultOpen ? "Search your vault…" : "Open a vault to search"}
            className="input pl-9"
          />
        </div>
      </form>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {error && <div className="m-3 text-[12px] text-fg-muted px-1">{error}</div>}
        {hits === null ? (
          <EmptyState
            icon={<SearchIcon className="h-5 w-5 text-fg-muted" />}
            title="Find by meaning, not keywords"
            body={
              <>
                Hybrid search blends semantic similarity with keyword matching. Try a phrase like{" "}
                <em className="text-fg-default not-italic">"writing about decision trees"</em>.
              </>
            }
          />
        ) : hits.length === 0 ? (
          <EmptyState
            icon={<SearchIcon className="h-5 w-5 text-fg-muted" />}
            title="No matches"
            body={
              <>
                Try a broader phrase, or describe what the note is{" "}
                <em className="text-fg-default not-italic">about</em>.
              </>
            }
          />
        ) : (
          <ul className="px-1 py-1">
            {hits.map((h) => (
              <li key={h.chunk_id}>
                <button
                  type="button"
                  onClick={() => onJumpToNote(h.note_path)}
                  className="group block w-full text-left px-3 py-3 rounded-md hover:bg-sunken transition-colors focus-ring"
                >
                  <div className="flex items-baseline gap-2">
                    <div className="text-[13px] font-medium text-fg-default truncate flex-1">
                      {h.note_title ?? stripMd(basename(h.note_path))}
                    </div>
                    <div className="text-[12px] font-mono text-fg-faint shrink-0">
                      {h.score.toFixed(2)}
                    </div>
                  </div>
                  {h.heading_path && (
                    <div className="text-[12px] text-fg-muted font-mono mt-1 truncate">
                      ↳ {h.heading_path}
                    </div>
                  )}
                  <p className="mt-2 text-[12px] text-fg-muted line-clamp-3 leading-relaxed">
                    {h.content}
                  </p>
                  <div className="mt-2 flex gap-1">
                    {h.sources.map((s) => (
                      <span key={s} className="chip">
                        {s}
                      </span>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10 gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sunken">{icon}</div>
      <div className="text-[14px] font-medium text-fg-default">{title}</div>
      <p className="text-[12px] text-fg-muted leading-relaxed max-w-[240px]">{body}</p>
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
