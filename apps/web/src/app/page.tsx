"use client";

import type { NoteSummary, OpenVaultResponse, VaultInfo } from "@lattice/sdk";
import { useCallback, useEffect, useState } from "react";
import { FileList } from "../components/FileList";
import { SidePanel } from "../components/SidePanel";
import { SimpleEditor } from "../components/SimpleEditor";
import { VaultBar } from "../components/VaultBar";
import { getClient } from "../lib/client";

export default function HomePage() {
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState<OpenVaultResponse["indexed"] | null>(null);

  const refreshNotes = useCallback(async () => {
    try {
      const ns = await getClient().listNotes();
      setNotes(ns);
    } catch {
      // No vault open → 409; that's the normal pre-open state. Swallow.
    }
  }, []);

  useEffect(() => {
    // On mount, see whether the api already has a vault open (e.g. after a
    // page reload or after `lattice open` set state from a terminal).
    getClient()
      .currentVault()
      .then(async (v) => {
        setVault(v);
        if (v) await refreshNotes();
      })
      .catch(() => {});
  }, [refreshNotes]);

  async function onVaultOpened(resp: OpenVaultResponse) {
    setVault(resp.vault);
    setLastIndex(resp.indexed);
    await refreshNotes();
  }

  return (
    <main className="flex h-screen flex-col bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <VaultBar vault={vault} onOpened={onVaultOpened} />
      <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: "260px 1fr 360px" }}>
        <aside className="border-r border-neutral-200 dark:border-neutral-800 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
            <div className="text-xs uppercase tracking-wide text-neutral-500">notes</div>
            {lastIndex && (
              <div className="text-[10px] text-neutral-500" title="last index">
                {lastIndex.notes_indexed}+{lastIndex.notes_skipped} ·{" "}
                {lastIndex.chunks_indexed}c
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0">
            <FileList notes={notes} selected={selected} onSelect={setSelected} />
          </div>
        </aside>
        <section className="min-w-0 min-h-0">
          <SimpleEditor notePath={selected} onSaved={refreshNotes} />
        </section>
        <aside className="border-l border-neutral-200 dark:border-neutral-800 min-h-0">
          <SidePanel vaultOpen={vault !== null} onJumpToNote={setSelected} />
        </aside>
      </div>
    </main>
  );
}
