"use client";

import type { NoteSummary, OpenVaultResponse, VaultInfo } from "@lattice/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptureModal } from "../components/CaptureModal";
import { CodeMirrorEditor } from "../components/CodeMirrorEditor";
import { type CommandAction, CommandPalette } from "../components/CommandPalette";
import { FileList } from "../components/FileList";
import { KeyboardHelp } from "../components/KeyboardHelp";
import { NewNoteForm } from "../components/NewNoteForm";
import { SidePanel, type SidePanelHandle } from "../components/SidePanel";
import { TopBar } from "../components/TopBar";
import { Welcome } from "../components/Welcome";
import { ChatIcon, FolderIcon, PlusIcon, SearchIcon, SparkleIcon } from "../components/icons";
import { getClient } from "../lib/client";
import { formatShortcut } from "../lib/platform";
import { useShortcuts } from "../lib/shortcuts";
import { ToastProvider, useToast } from "../lib/toast";

export default function HomePage() {
  return (
    <ToastProvider>
      <HomeInner />
    </ToastProvider>
  );
}

function HomeInner() {
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const sidePanelRef = useRef<SidePanelHandle>(null);
  const toast = useToast();

  const refreshNotes = useCallback(async (): Promise<NoteSummary[]> => {
    try {
      const ns = await getClient().listNotes();
      setNotes(ns);
      return ns;
    } catch {
      return [];
    }
  }, []);

  // Initial bootstrap — auto-open the user's vault (reopens last vault, or
  // creates a default one at ~/Documents/Lattice). Falls back to the welcome
  // chooser only if the server can't auto-open (cloud mode, permission error).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auto = await getClient().autoVault();
        if (cancelled) return;
        if (auto) {
          setVault(auto.vault);
          await refreshNotes();
        } else {
          // Cloud mode — there's no on-disk vault to open. Fall back to whatever
          // the server considers "current" (if anything) and let the chooser
          // surface the cloud-account path.
          const v = await getClient().currentVault();
          if (cancelled) return;
          setVault(v);
          if (v) await refreshNotes();
        }
      } catch {
        // Server unreachable or refused — show chooser so user can recover.
        if (!cancelled) setVault(null);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshNotes]);

  const refreshAndAutoSelect = useCallback(async () => {
    const ns = await refreshNotes();
    const welcome = ns.find((n) => n.path.toLowerCase() === "welcome.md");
    if (welcome) setSelected(welcome.path);
    else if (ns.length === 1) setSelected(ns[0].path);
  }, [refreshNotes]);

  function onVaultOpened(resp: OpenVaultResponse) {
    setVault(resp.vault);
    void refreshAndAutoSelect();
    toast.success(`Opened ${resp.vault.name} — ${resp.indexed.notes_indexed} notes indexed`);
  }

  async function closeVault() {
    try {
      await getClient().closeVault();
    } catch {
      // ignore
    }
    setVault(null);
    setNotes([]);
    setSelected(null);
    toast.info("Vault closed");
  }

  async function afterCapture(path: string) {
    await refreshNotes();
    setSelected(path);
    toast.success("Captured to Inbox");
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: closeVault and toast are stable; including them rebuilds the action list every render
  const actions: CommandAction[] = useMemo(
    () => [
      {
        id: "new-note",
        label: "New note",
        hint: "Create a fresh note in the vault",
        shortcut: formatShortcut("⌘N"),
        icon: <PlusIcon className="h-3.5 w-3.5" />,
        run: () => setNewNoteOpen(true),
      },
      {
        id: "capture",
        label: "Capture a thought",
        hint: "Drop a thought into Inbox — Claude shapes it",
        shortcut: formatShortcut("⇧⌘C"),
        icon: <SparkleIcon className="h-3.5 w-3.5" />,
        run: () => setCaptureOpen(true),
      },
      {
        id: "search",
        label: "Search the vault",
        hint: "Hybrid (semantic + keyword)",
        shortcut: formatShortcut("⌘K"),
        icon: <SearchIcon className="h-3.5 w-3.5" />,
        run: () => {
          setRightOpen(true);
          sidePanelRef.current?.focusSearch();
        },
      },
      {
        id: "chat",
        label: "Ask your vault",
        hint: "Grounded chat with citations",
        icon: <ChatIcon className="h-3.5 w-3.5" />,
        run: () => {
          setRightOpen(true);
          sidePanelRef.current?.focusSearch();
        },
      },
      {
        id: "synthesize",
        label: "Synthesize this week",
        hint: "Roll recent notes into Synthesis/YYYY-Www.md",
        icon: <SparkleIcon className="h-3.5 w-3.5" />,
        run: async () => {
          try {
            const r = await getClient().synthesize({});
            await refreshNotes();
            setSelected(r.path);
            toast.success(`Synthesis saved to ${r.path}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          }
        },
      },
      {
        id: "tokens",
        label: "Agent tokens",
        hint: "Manage MCP / agent access",
        run: () => {
          window.location.href = "/settings/tokens";
        },
      },
      {
        id: "help",
        label: "Keyboard shortcuts",
        hint: "Cheat sheet",
        shortcut: "?",
        run: () => setHelpOpen(true),
      },
      {
        id: "close-vault",
        label: "Close vault",
        hint: vault?.name ?? "",
        icon: <FolderIcon className="h-3.5 w-3.5" />,
        run: () => void closeVault(),
      },
    ],
    [vault, refreshNotes],
  );

  useShortcuts([
    {
      key: "k",
      meta: true,
      handler: () => {
        if (!vault) return;
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
    {
      key: "p",
      meta: true,
      handler: () => vault && setPaletteOpen(true),
    },
    {
      key: "n",
      meta: true,
      handler: () => vault && setNewNoteOpen(true),
    },
    {
      key: "?",
      shift: true,
      handler: () => setHelpOpen(true),
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
        onOpenPalette={() => setPaletteOpen(true)}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <div className="relative flex flex-1 min-h-0">
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
            onNewNote={() => setNewNoteOpen(true)}
            onChanged={async () => {
              await refreshNotes();
            }}
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

        <section className="flex-1 min-w-0 min-h-0">
          <CodeMirrorEditor notePath={selected} onSaved={refreshNotes} onJumpToNote={setSelected} />
        </section>

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
      <NewNoteForm
        open={newNoteOpen}
        onClose={() => setNewNoteOpen(false)}
        onCreated={async (path) => {
          await refreshNotes();
          setSelected(path);
        }}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        notes={notes}
        onJumpToNote={(p) => {
          setSelected(p);
        }}
        actions={actions}
      />
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}
