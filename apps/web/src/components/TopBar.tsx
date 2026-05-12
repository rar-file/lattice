"use client";

import type { VaultInfo } from "@lattice/sdk";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatShortcut } from "../lib/platform";
import { ThemeToggle } from "./ThemeToggle";
import { FolderIcon, LatticeMark, MenuIcon, SearchIcon, SparkleIcon } from "./icons";

interface Props {
  vault: VaultInfo;
  onCapture(): void;
  onClose(): void;
  onFocusSearch(): void;
  onOpenPalette?(): void;
  onToggleSidebar?: () => void;
}

/**
 * Workspace top bar. Replaces the original VaultBar (which was a path input).
 * After a vault is open the path is plumbing detail — we surface the vault
 * NAME prominently and tuck details into a dropdown menu.
 */
export function TopBar({
  vault,
  onCapture,
  onClose,
  onFocusSearch,
  onOpenPalette,
  onToggleSidebar,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click / escape.
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

  return (
    <header className="relative z-30 flex h-12 items-center gap-2 border-b border-border-subtle bg-surface/80 backdrop-blur px-3">
      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="btn btn-ghost btn-xs md:hidden"
          aria-label="Toggle sidebar"
        >
          <MenuIcon className="h-4 w-4" />
        </button>
      )}

      <div className="hidden md:flex items-center pr-2 mr-1 border-r border-border-subtle">
        <LatticeMark />
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="btn btn-secondary btn-sm gap-2 max-w-[280px]"
          title={vault.root_path}
        >
          <FolderIcon className="h-4 w-4 text-fg-muted shrink-0" />
          <span className="truncate font-medium">{vault.name}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="text-fg-faint shrink-0"
            aria-hidden
          >
            <path
              d="M2 4l3 3 3-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full mt-2 w-[320px] card-elevated p-1.5 z-30 animate-scale-in">
            <div className="px-3 py-2 border-b border-border-subtle">
              <div className="text-[11px] section-label">Vault path</div>
              <div className="text-[12px] font-mono mt-1 break-all text-fg-muted">
                {vault.root_path}
              </div>
            </div>
            <MenuItem
              onClick={() => {
                setMenuOpen(false);
                onClose();
              }}
            >
              Close vault…
            </MenuItem>
            <Link
              href="/settings/tokens"
              className="block px-3 py-2 rounded text-[13px] hover:bg-sunken focus-ring"
            >
              Agent tokens
            </Link>
          </div>
        )}
      </div>

      {onOpenPalette && (
        <button
          type="button"
          onClick={onOpenPalette}
          className="btn btn-secondary btn-sm ml-auto max-w-[280px] flex-1 justify-start text-fg-muted"
          title={`Command palette (${formatShortcut("⌘P")})`}
        >
          <SearchIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:inline truncate">Jump to a note or run a command…</span>
          <span className="hidden md:inline kbd ml-auto shrink-0">{formatShortcut("⌘P")}</span>
        </button>
      )}

      <button
        type="button"
        onClick={onFocusSearch}
        className={`btn btn-ghost btn-sm ${onOpenPalette ? "" : "ml-auto"}`}
        title={`Search (${formatShortcut("⌘K")})`}
        aria-label="Search vault"
      >
        <SearchIcon className="h-4 w-4" />
        <span className="hidden sm:inline kbd">{formatShortcut("⌘K")}</span>
      </button>

      <ThemeToggle />

      <button
        type="button"
        onClick={onCapture}
        className="btn btn-primary btn-sm"
        title={`Capture (${formatShortcut("⇧⌘C")})`}
      >
        <SparkleIcon className="h-4 w-4" />
        <span className="hidden sm:inline">Capture</span>
      </button>
    </header>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left px-3 py-2 rounded text-[13px] hover:bg-sunken focus-ring"
    >
      {children}
    </button>
  );
}
