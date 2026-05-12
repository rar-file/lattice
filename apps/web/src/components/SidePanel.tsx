"use client";

import type { ChatResponseBody, SearchHit } from "@lattice/sdk";
import { useState } from "react";
import { getClient } from "../lib/client";

interface Props {
  vaultOpen: boolean;
  onJumpToNote: (path: string) => void;
}

type Tab = "search" | "chat";

export function SidePanel({ vaultOpen, onJumpToNote }: Props) {
  const [tab, setTab] = useState<Tab>("search");
  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-neutral-200 dark:border-neutral-800">
        {(["search", "chat"] as const).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs uppercase tracking-wide ${
              tab === t
                ? "border-b-2 border-neutral-900 dark:border-neutral-100 font-semibold"
                : "text-neutral-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "search" ? (
          <SearchTab vaultOpen={vaultOpen} onJumpToNote={onJumpToNote} />
        ) : (
          <ChatTab vaultOpen={vaultOpen} onJumpToNote={onJumpToNote} />
        )}
      </div>
    </div>
  );
}

function SearchTab({ vaultOpen, onJumpToNote }: Props) {
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
        className="p-3 border-b border-neutral-200 dark:border-neutral-800"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={!vaultOpen || busy}
          placeholder={vaultOpen ? "search the vault…" : "open a vault first"}
          className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
        />
      </form>
      <div className="flex-1 overflow-y-auto">
        {error && <div className="p-3 text-xs text-red-500">{error}</div>}
        {hits === null ? (
          <div className="p-4 text-xs text-neutral-500">No search run yet.</div>
        ) : hits.length === 0 ? (
          <div className="p-4 text-xs text-neutral-500">No matches.</div>
        ) : (
          <ul>
            {hits.map((h) => (
              <li key={h.chunk_id} className="border-b border-neutral-100 dark:border-neutral-900">
                <button
                  type="button"
                  onClick={() => onJumpToNote(h.note_path)}
                  className="block w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <div className="text-xs font-semibold truncate">
                    {h.note_title ?? h.note_path}
                  </div>
                  <div className="text-[11px] font-mono text-neutral-500 truncate">
                    {h.note_path}
                    {h.heading_path ? ` :: ${h.heading_path}` : ""}
                  </div>
                  <div className="text-xs mt-1 line-clamp-3 text-neutral-700 dark:text-neutral-300">
                    {h.content}
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-1">
                    score {h.score.toFixed(3)} · {h.sources.join("+")}
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

function ChatTab({ vaultOpen, onJumpToNote }: Props) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<ChatResponseBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await getClient().chat(q);
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
          void run();
        }}
        className="p-3 border-b border-neutral-200 dark:border-neutral-800 flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={!vaultOpen || busy}
          placeholder={vaultOpen ? "ask the vault…" : "open a vault first"}
          className="flex-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={!vaultOpen || busy || !q.trim()}
          className="text-xs rounded bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 px-3 py-1 disabled:opacity-50"
        >
          {busy ? "…" : "ask"}
        </button>
      </form>
      <div className="flex-1 overflow-y-auto p-3">
        {error && <div className="text-xs text-red-500">{error}</div>}
        {resp ? (
          <>
            <div className="whitespace-pre-wrap text-sm">{resp.answer}</div>
            {resp.citations.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                  citations
                </div>
                <ul className="space-y-1">
                  {resp.citations.map((c) => (
                    <li key={c.n}>
                      <button
                        type="button"
                        onClick={() => onJumpToNote(c.note_path)}
                        className="text-left text-xs hover:underline"
                      >
                        [{c.n}] {c.note_path}
                        {c.heading_path ? ` :: ${c.heading_path}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 text-[10px] text-neutral-500">
              {resp.model} · in {resp.usage.input_tokens} / out {resp.usage.output_tokens} / cached{" "}
              {resp.usage.cached_input_tokens}
            </div>
          </>
        ) : (
          <div className="text-xs text-neutral-500">Ask anything about your notes.</div>
        )}
      </div>
    </div>
  );
}
