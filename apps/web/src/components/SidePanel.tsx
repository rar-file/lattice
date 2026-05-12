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
        className="px-3 pt-3 pb-2"
      >
        <div className="relative">
          <SearchIcon
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-faint pointer-events-none"
            aria-hidden
          />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            disabled={!vaultOpen || busy}
            placeholder={vaultOpen ? "Search your vault" : "Open a vault to search"}
            className="input pl-8"
          />
        </div>
      </form>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {error && <div className="mx-4 mt-2 text-meta">{error}</div>}
        {hits === null ? (
          <EmptyState
            title="Find by meaning, not keywords"
            body={
              <>
                Hybrid search blends semantic similarity with keyword matching. Try{" "}
                <em className="text-fg-default not-italic">writing about decision trees</em>.
              </>
            }
          />
        ) : hits.length === 0 ? (
          <EmptyState
            title={`No matches for "${q}"`}
            body={
              <>
                Try a broader phrase, or describe what the note is{" "}
                <em className="text-fg-default not-italic">about</em>.
              </>
            }
          />
        ) : (
          <ul className="px-1 pb-2">
            {hits.map((h) => (
              <li key={h.chunk_id}>
                <button
                  type="button"
                  onClick={() => onJumpToNote(h.note_path)}
                  className="group block w-full text-left px-3 py-3 rounded-md
                    hover:bg-sunken focus-ring
                    transition-colors duration-fast ease-out"
                >
                  <div className="flex items-baseline gap-2">
                    <div className="text-[13px] font-medium text-fg-strong truncate flex-1">
                      {h.note_title ?? stripMd(basename(h.note_path))}
                    </div>
                    <div className="text-caption font-mono shrink-0">{h.score.toFixed(2)}</div>
                  </div>
                  {h.heading_path && (
                    <div className="mt-1 text-caption font-mono truncate">↳ {h.heading_path}</div>
                  )}
                  <p className="mt-2 text-meta line-clamp-3">{h.content}</p>
                  {h.sources.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {h.sources.map((s) => (
                        <span key={s} className="chip">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start text-left px-4 pt-6 pb-12">
      <div className="text-body font-medium text-fg-strong">{title}</div>
      <p className="mt-2 text-meta max-w-[240px]">{body}</p>
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
