"use client";

import type { VaultInfo } from "@lattice/sdk";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getClient } from "../lib/client";
import {
  CommandIcon,
  FolderIcon,
  LatticeMark,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  SparkleIcon,
} from "./icons";

interface Props {
  vault: VaultInfo;
  onCapture(): void;
  onClose(): void;
  onFocusSearch(): void;
  onToggleSidebar?: () => void;
}

/**
 * Workspace top bar. Replaces the original VaultBar (which was a path input).
 * After a vault is open the path is plumbing detail — we surface the vault
 * NAME prominently and tuck details into a dropdown menu.
 */
export function TopBar({ vault, onCapture, onClose, onFocusSearch, onToggleSidebar }: Props) {
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
    <header className="relative flex h-12 items-center gap-2 border-b border-border-subtle bg-surface/80 backdrop-blur px-3">
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

      <button
        type="button"
        onClick={onFocusSearch}
        className="btn btn-secondary btn-sm ml-auto"
        title="Search (⌘K)"
      >
        <span className="hidden md:inline text-fg-muted">Search…</span>
        <span className="kbd ml-1">⌘K</span>
      </button>

      <button
        type="button"
        onClick={onCapture}
        className="btn btn-primary btn-sm"
        title="Capture (⇧⌘C)"
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
