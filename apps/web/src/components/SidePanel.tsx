"use client";

import type { ChatResponseBody, SearchHit } from "@lattice/sdk";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { getClient } from "../lib/client";
import { formatShortcut } from "../lib/platform";
import { ChatIcon, SearchIcon, SparkleIcon } from "./icons";

interface Props {
  vaultOpen: boolean;
  onJumpToNote: (path: string) => void;
}

type Tab = "search" | "chat";

export interface SidePanelHandle {
  focusSearch(): void;
}

export const SidePanel = forwardRef<SidePanelHandle, Props>(function SidePanel(
  { vaultOpen, onJumpToNote },
  ref,
) {
  const [tab, setTab] = useState<Tab>("search");
  const searchInput = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusSearch() {
      setTab("search");
      requestAnimationFrame(() => searchInput.current?.focus());
    },
  }));

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-1 border-b border-border-subtle px-2 py-1.5">
        <TabButton
          active={tab === "search"}
          onClick={() => setTab("search")}
          icon={<SearchIcon className="h-3.5 w-3.5" />}
          label="Search"
          shortcut={formatShortcut("⌘K")}
        />
        <TabButton
          active={tab === "chat"}
          onClick={() => setTab("chat")}
          icon={<ChatIcon className="h-3.5 w-3.5" />}
          label="Chat"
        />
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "search" ? (
          <SearchTab inputRef={searchInput} vaultOpen={vaultOpen} onJumpToNote={onJumpToNote} />
        ) : (
          <ChatTab vaultOpen={vaultOpen} onJumpToNote={onJumpToNote} />
        )}
      </div>
    </div>
  );
});

function TabButton({
  active,
  onClick,
  icon,
  label,
  shortcut,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-[12.5px] transition-colors focus-ring ${
        active
          ? "bg-sunken text-fg-default font-medium"
          : "text-fg-muted hover:text-fg-default hover:bg-sunken/50"
      }`}
    >
      {icon}
      <span>{label}</span>
      {shortcut && active && <span className="kbd ml-1">{shortcut}</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Search                                                                    */
/* -------------------------------------------------------------------------- */

interface SearchTabProps extends Props {
  inputRef?: React.Ref<HTMLInputElement>;
}

function SearchTab({ vaultOpen, onJumpToNote, inputRef }: SearchTabProps) {
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
        {error && (
          <div className="m-3 rounded-md bg-danger-soft text-danger px-3 py-2 text-[12px]">
            {error}
          </div>
        )}
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
                  className="group block w-full text-left px-3 py-2.5 rounded-md hover:bg-sunken transition-colors focus-ring"
                >
                  <div className="flex items-baseline gap-2">
                    <div className="text-[13px] font-medium text-fg-default truncate flex-1">
                      {h.note_title ?? stripMd(basename(h.note_path))}
                    </div>
                    <div className="text-[10.5px] font-mono text-fg-faint shrink-0">
                      {h.score.toFixed(2)}
                    </div>
                  </div>
                  {h.heading_path && (
                    <div className="text-[11px] text-fg-muted font-mono mt-0.5 truncate">
                      ↳ {h.heading_path}
                    </div>
                  )}
                  <p className="mt-1.5 text-[12px] text-fg-muted line-clamp-3 leading-relaxed">
                    {h.content}
                  </p>
                  <div className="mt-1.5 flex gap-1">
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

/* -------------------------------------------------------------------------- */
/*  Chat                                                                      */
/* -------------------------------------------------------------------------- */

const SUGGESTED_QUESTIONS = [
  "What have I been writing about this week?",
  "Summarize my notes on $TOPIC",
  "What do I think about $X?",
];

function ChatTab({ vaultOpen, onJumpToNote }: Props) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<ChatResponseBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(query: string) {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await getClient().chat(query);
      setResp(r);
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
          void ask(q);
        }}
        className="p-3 border-b border-border-subtle flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={!vaultOpen || busy}
          placeholder={vaultOpen ? "Ask your vault anything…" : "Open a vault to chat"}
          className="input flex-1"
        />
        <button
          type="submit"
          disabled={!vaultOpen || busy || !q.trim()}
          className="btn btn-primary"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {error && (
          <div className="rounded-md bg-danger-soft text-danger px-3 py-2 text-[12px] mb-3">
            {error}
          </div>
        )}
        {resp ? (
          <article className="space-y-4 animate-fade-in">
            <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-default">
              {resp.answer}
            </div>
            {resp.citations.length > 0 && (
              <div className="border-t border-border-subtle pt-3">
                <div className="section-label mb-2">Sources</div>
                <ul className="space-y-1.5">
                  {resp.citations.map((c) => (
                    <li key={c.n}>
                      <button
                        type="button"
                        onClick={() => onJumpToNote(c.note_path)}
                        className="group flex items-baseline gap-2 text-left text-[12px] focus-ring rounded px-1"
                      >
                        <span className="text-fg-faint font-mono">[{c.n}]</span>
                        <span className="text-fg-default group-hover:text-accent transition-colors">
                          {c.note_title ?? stripMd(basename(c.note_path))}
                        </span>
                        {c.heading_path && (
                          <span className="text-fg-faint font-mono">↳ {c.heading_path}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-[10.5px] text-fg-faint font-mono pt-2">
              {resp.model} · in {resp.usage.input_tokens} · out {resp.usage.output_tokens} · cached{" "}
              {resp.usage.cached_input_tokens}
            </div>
          </article>
        ) : (
          <div className="flex flex-col gap-3 items-center text-center pt-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft">
              <SparkleIcon className="h-4 w-4 text-accent" />
            </div>
            <div className="text-[13.5px] font-medium text-fg-default">Ask your vault</div>
            <p className="text-[12px] text-fg-muted leading-relaxed max-w-[260px]">
              Lattice grounds its answers in your notes and shows citations. Click any citation to
              jump to the source note.
            </p>
            <div className="w-full mt-2 space-y-1">
              {SUGGESTED_QUESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!vaultOpen}
                  onClick={() => {
                    setQ(s);
                    void ask(s);
                  }}
                  className="block w-full text-left text-[12px] text-fg-muted hover:text-fg-default
                    rounded-md px-2.5 py-1.5 hover:bg-sunken transition-colors disabled:opacity-50
                    focus-ring"
                >
                  → {s}
                </button>
              ))}
            </div>
          </div>
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
      <div className="text-[13.5px] font-medium text-fg-default">{title}</div>
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
