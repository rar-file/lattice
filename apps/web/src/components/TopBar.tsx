"use client";

import type { VaultInfo } from "@lattice/sdk";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatShortcut } from "../lib/platform";
import {
  ChevronRightIcon,
  FolderIcon,
  InboxIcon,
  LatticeMark,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
} from "./icons";

interface Props {
  vault: VaultInfo;
  currentNote?: string | null;
  onCapture(): void;
  onClose(): void;
  onFocusSearch(): void;
  onOpenPalette?(): void;
  onToggleSidebar?: () => void;
  /** When the AI sidecar is doing something — embedder running, suggestions
   *  streaming. Renders the live dot in the bar. */
  aiActive?: boolean;
}

/**
 * Workspace top bar.
 *
 * Left: Lattice mark → vault → folder → file path (mono, ending in .md).
 * Right: command launcher, settings, capture. Surfaces step instead of
 * separating with a border, so there's no seam between the bar and the rail.
 */
export function TopBar({
  vault,
  currentNote,
  onCapture,
  onClose,
  onFocusSearch,
  onOpenPalette,
  onToggleSidebar,
  aiActive,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const crumbs = breadcrumbFor(vault, currentNote);

  return (
    <header
      className="relative z-30 flex h-11 items-center gap-2 px-3"
      style={{ background: "var(--surface-base)" }}
    >
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="btn btn-ghost btn-icon md:hidden"
          aria-label="Toggle sidebar"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
      )}

      <Link
        href="/"
        className="hidden md:flex items-center h-7 px-1 focus-ring rounded"
        aria-label="Lattice home"
      >
        <LatticeMark withWordmark={false} size={18} />
      </Link>

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded text-[13px] focus-ring transition-colors"
            style={{ color: "var(--text-default)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            title={vault.root_path}
          >
            <FolderIcon className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
            <span className="truncate leading-none">{vault.name}</span>
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-full mt-1 w-[320px] card-elevated p-1 z-30 animate-fade-in">
              <div className="px-3 pt-3 pb-2">
                <div className="text-eyebrow">Vault path</div>
                <div className="mt-2 break-all text-meta font-mono">{vault.root_path}</div>
              </div>
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 px-3 h-8 rounded text-[13px] focus-ring text-left transition-colors"
                  style={{ color: "var(--text-default)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  Close vault
                </button>
              </div>
            </div>
          )}
        </div>

        {crumbs.map((c, i) => (
          <span
            key={`${c.text}-${i}`}
            className="hidden sm:inline-flex items-center gap-1.5 min-w-0"
          >
            <ChevronRightIcon
              className="h-3 w-3 shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            />
            <span
              className={`text-[12px] truncate font-mono leading-none ${c.terminal ? "" : ""}`}
              style={{
                color: c.terminal ? "var(--text-emphasis)" : "var(--text-secondary)",
              }}
              title={c.text}
            >
              {c.text}
            </span>
          </span>
        ))}
      </nav>

      {aiActive && (
        <span
          className="hidden sm:inline-flex items-center gap-2 px-2 h-7 text-[12px]"
          title="Lattice is reading your note"
          style={{ color: "var(--text-secondary)" }}
        >
          <span className="live-dot" aria-hidden />
          watching
        </span>
      )}

      {onOpenPalette && (
        <button
          type="button"
          onClick={onOpenPalette}
          className="inline-flex items-center gap-2 h-7 pl-2 pr-2 rounded
            text-[12px] focus-ring max-w-[280px] transition-colors"
          style={{ background: "var(--surface-raised)", color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-emphasis)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--surface-raised)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }}
          title={`Command palette (${formatShortcut("⌘P")})`}
        >
          <SearchIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:inline truncate leading-none">Jump to a note or command</span>
          <kbd className="hidden md:inline-flex kbd shrink-0">{formatShortcut("⌘P")}</kbd>
        </button>
      )}

      <Link
        href="/settings/tokens"
        className="btn btn-ghost btn-icon"
        title="Settings"
        aria-label="Settings"
      >
        <SettingsIcon className="h-4 w-4" />
      </Link>

      <button
        type="button"
        onClick={onCapture}
        className="btn btn-primary btn-sm"
        title={`Capture (${formatShortcut("⇧⌘C")})`}
      >
        <InboxIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Capture</span>
      </button>
    </header>
  );
}

interface Crumb {
  text: string;
  terminal: boolean;
}

function breadcrumbFor(_vault: VaultInfo, notePath?: string | null): Crumb[] {
  if (!notePath) return [];
  const parts = notePath.split("/").filter(Boolean);
  if (parts.length === 0) return [];
  return parts.map((p, i) => ({ text: p, terminal: i === parts.length - 1 }));
}
