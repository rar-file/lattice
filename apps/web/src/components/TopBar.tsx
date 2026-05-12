"use client";

import type { VaultInfo } from "@lattice/sdk";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatShortcut } from "../lib/platform";
import { ThemeToggle } from "./ThemeToggle";
import {
  ChevronDownIcon,
  FolderIcon,
  InboxIcon,
  LatticeMark,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "./icons";

interface Props {
  vault: VaultInfo;
  onCapture(): void;
  onClose(): void;
  onFocusSearch(): void;
  onOpenPalette?(): void;
  onToggleSidebar?: () => void;
}

/**
 * Workspace top bar. Vault name on the left, command palette in the centre,
 * Settings + theme + Capture on the right. Subtracted chrome: no border on
 * the bar (the editor surface lifts away through its own bg shift), no
 * dividers between right-side actions.
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
    <header className="relative z-30 flex h-12 items-center gap-2 bg-canvas px-3">
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
        className="hidden md:flex items-center h-7 px-1 focus-ring rounded mr-2"
        aria-label="Lattice home"
      >
        <LatticeMark withWordmark={false} size={20} />
      </Link>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 h-7 pl-2 pr-1.5 rounded-md
            text-[13px] text-fg-default
            hover:bg-sunken focus-ring max-w-[280px]
            transition-colors duration-fast ease-out"
          title={vault.root_path}
        >
          <FolderIcon className="h-4 w-4 text-fg-muted shrink-0" />
          <span className="truncate leading-none">{vault.name}</span>
          <ChevronDownIcon className="h-3.5 w-3.5 text-fg-faint shrink-0" />
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full mt-1 w-[320px] card-elevated p-1 z-30 animate-fade-in">
            <div className="px-3 pt-2 pb-3">
              <div className="text-eyebrow">Vault path</div>
              <div className="mt-2 break-all text-meta font-mono">{vault.root_path}</div>
            </div>
            <div className="hr mx-1" />
            <div className="p-1">
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  onClose();
                }}
                icon={<XIcon className="h-4 w-4 text-fg-muted" />}
              >
                Close vault
              </MenuItem>
            </div>
          </div>
        )}
      </div>

      {onOpenPalette && (
        <button
          type="button"
          onClick={onOpenPalette}
          className="inline-flex items-center gap-2 h-7 pl-2 pr-2 rounded-md
            text-[13px] text-fg-muted
            hover:bg-sunken hover:text-fg-default focus-ring
            ml-auto max-w-[320px] flex-1 min-w-0
            transition-colors duration-fast ease-out"
          title={`Command palette (${formatShortcut("⌘P")})`}
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline truncate flex-1 text-left leading-none">
            Jump to a note or run a command…
          </span>
          <kbd className="hidden md:inline-flex kbd shrink-0">{formatShortcut("⌘P")}</kbd>
        </button>
      )}

      <Link
        href="/settings/tokens"
        className="btn btn-ghost btn-icon"
        title="Settings — agent tokens"
        aria-label="Settings"
      >
        <SettingsIcon className="h-4 w-4" />
      </Link>

      <ThemeToggle />

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

function MenuItem({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 h-8 rounded-md text-[13px]
        text-fg-default hover:bg-sunken focus-ring text-left
        transition-colors duration-fast ease-out"
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  );
}
