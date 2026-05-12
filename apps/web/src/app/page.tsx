"use client";

import type { NoteSummary, OpenVaultResponse, VaultInfo } from "@lattice/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureModal } from "../components/CaptureModal";
import { CodeMirrorEditor } from "../components/CodeMirrorEditor";
import { FileList } from "../components/FileList";
import { SidePanel, type SidePanelHandle } from "../components/SidePanel";
import { TopBar } from "../components/TopBar";
import { Welcome } from "../components/Welcome";
import { getClient } from "../lib/client";
import { useShortcuts } from "../lib/shortcuts";

export default function HomePage() {
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const sidePanelRef = useRef<SidePanelHandle>(null);

  const refreshNotes = useCallback(async () => {
    try {
      const ns = await getClient().listNotes();
      setNotes(ns);
    } catch {
      // No vault open → 409; that's the normal pre-open state. Swallow.
    }
  }, []);

  // Initial bootstrap: figure out if a vault is already open, otherwise
  // we'll render the Welcome flow.
  useEffect(() => {
    let cancelled = false;
    getClient()
      .currentVault()
      .then(async (v) => {
        if (cancelled) return;
        setVault(v);
        if (v) await refreshNotes();
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBootstrapping(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshNotes]);

  // After a vault is freshly opened, the API auto-selects the Welcome note
  // (if it exists) so the user lands on something useful instead of a blank.
  function onVaultOpened(resp: OpenVaultResponse) {
    setVault(resp.vault);
    void refreshAndAutoSelect();
  }

  const refreshAndAutoSelect = useCallback(async () => {
    try {
      const ns = await getClient().listNotes();
      setNotes(ns);
      const welcome = ns.find((n) => n.path.toLowerCase() === "welcome.md");
      if (welcome) setSelected(welcome.path);
      else if (ns.length === 1) setSelected(ns[0].path);
    } catch {
      // pass
    }
  }, []);

  async function closeVault() {
    try {
      await getClient().closeVault();
    } catch {
      // ignore
    }
    setVault(null);
    setNotes([]);
    setSelected(null);
  }

  async function afterCapture(path: string) {
    await refreshNotes();
    setSelected(path);
  }

  useShortcuts([
    {
      key: "k",
      meta: true,
      handler: () => {
        setRightOpen(true);
        sidePanelRef.current?.focusSearch();
      },
    },
    {
      key: "c",
      meta: true,
      shift: true,
      handler: () => vault && setCaptureOpen(true),
    },
  ]);

  if (bootstrapping) {
    return (
      <main className="flex h-screen items-center justify-center bg-canvas">
        <div className="flex items-center gap-3 text-fg-muted text-[13px]">
          <span className="lattice-skeleton h-3 w-24" />
        </div>
      </main>
    );
  }

  if (!vault) {
    return <Welcome onOpened={onVaultOpened} />;
  }

  return (
    <main className="flex h-screen flex-col bg-canvas">
      <TopBar
        vault={vault}
        onCapture={() => setCaptureOpen(true)}
        onClose={closeVault}
        onFocusSearch={() => {
          setRightOpen(true);
          sidePanelRef.current?.focusSearch();
        }}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <div className="relative flex flex-1 min-h-0">
        {/* Left sidebar */}
        <aside
          className={`
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            md:translate-x-0
            absolute md:relative z-20 md:z-auto inset-y-0 left-0
            w-[280px] shrink-0
            bg-surface border-r border-border-subtle
            flex flex-col min-h-0
            transition-transform duration-200 ease-out
            md:transition-none
          `}
        >
          <FileList
            notes={notes}
            selected={selected}
            onSelect={(p) => {
              setSelected(p);
              setSidebarOpen(false);
            }}
            onCapture={() => setCaptureOpen(true)}
          />
        </aside>
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden absolute inset-0 z-10 bg-fg-default/20 backdrop-blur-[1px]"
          />
        )}

        {/* Editor center */}
        <section className="flex-1 min-w-0 min-h-0">
          <CodeMirrorEditor notePath={selected} onSaved={refreshNotes} onJumpToNote={setSelected} />
        </section>

        {/* Right panel */}
        <aside
          className={`
            ${rightOpen ? "translate-x-0" : "translate-x-full"}
            lg:translate-x-0
            absolute lg:relative z-20 lg:z-auto inset-y-0 right-0
            w-[360px] shrink-0
            border-l border-border-subtle
            transition-transform duration-200 ease-out
            lg:transition-none
          `}
        >
          <SidePanel ref={sidePanelRef} vaultOpen={vault !== null} onJumpToNote={setSelected} />
        </aside>
        {rightOpen && (
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => setRightOpen(false)}
            className="lg:hidden absolute inset-0 z-10 bg-fg-default/20 backdrop-blur-[1px]"
          />
        )}
      </div>

      <CaptureModal
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCaptured={afterCapture}
      />
    </main>
  );
}
