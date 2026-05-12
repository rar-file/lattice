"use client";

import type { NoteSummary, OpenVaultResponse, VaultInfo } from "@lattice/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureModal } from "../components/CaptureModal";
import { CodeMirrorEditor } from "../components/CodeMirrorEditor";
import { FileList } from "../components/FileList";
import { SidePanel, type SidePanelHandle } from "../components/SidePanel";
import { VaultBar } from "../components/VaultBar";
import { getClient } from "../lib/client";
import { useShortcuts } from "../lib/shortcuts";

export default function HomePage() {
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastIndex, setLastIndex] = useState<OpenVaultResponse["indexed"] | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const sidePanelRef = useRef<SidePanelHandle>(null);

  const refreshNotes = useCallback(async () => {
    try {
      const ns = await getClient().listNotes();
      setNotes(ns);
    } catch {
      // No vault open → 409; that's the normal pre-open state. Swallow.
    }
  }, []);

  useEffect(() => {
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

  async function afterCapture(path: string) {
    await refreshNotes();
    setSelected(path);
  }

  useShortcuts([
    {
      key: "k",
      meta: true,
      handler: () => sidePanelRef.current?.focusSearch(),
    },
    {
      key: "c",
      meta: true,
      shift: true,
      handler: () => vault && setCaptureOpen(true),
    },
  ]);

  return (
    <main className="flex h-screen flex-col bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <VaultBar vault={vault} onOpened={onVaultOpened} />
      <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: "260px 1fr 360px" }}>
        <aside className="border-r border-neutral-200 dark:border-neutral-800 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              notes <span className="ml-1 text-[10px] text-neutral-400">({notes.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {vault && (
                <button
                  type="button"
                  onClick={() => setCaptureOpen(true)}
                  title="Capture (⇧⌘C)"
                  className="text-[10px] uppercase tracking-wide text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  + capture
                </button>
              )}
              {lastIndex && (
                <div className="text-[10px] text-neutral-500" title="last index">
                  {lastIndex.notes_indexed}+{lastIndex.notes_skipped} · {lastIndex.chunks_indexed}c
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <FileList notes={notes} selected={selected} onSelect={setSelected} />
          </div>
        </aside>
        <section className="min-w-0 min-h-0">
          <CodeMirrorEditor notePath={selected} onSaved={refreshNotes} onJumpToNote={setSelected} />
        </section>
        <aside className="border-l border-neutral-200 dark:border-neutral-800 min-h-0">
          <SidePanel ref={sidePanelRef} vaultOpen={vault !== null} onJumpToNote={setSelected} />
        </aside>
      </div>
      <CaptureModal
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCaptured={afterCapture}
      />
    </main>
  );
}
