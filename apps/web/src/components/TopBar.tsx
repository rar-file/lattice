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
  KeyIcon,
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
 * Workspace top bar. Vault name as a quiet dropdown on the left; command
 * palette in the centre; theme toggle / settings / capture on the right.
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
    <header className="relative z-30 flex h-12 items-center gap-2 border-b border-border-subtle bg-surface px-3">
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

      <Link
        href="/"
        className="hidden md:flex items-center pr-3 mr-1 border-r border-border-subtle h-7 focus-ring rounded"
        aria-label="Lattice home"
      >
        <LatticeMark withWordmark={false} size={20} />
      </Link>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-[13px]
            text-fg-default hover:bg-sunken transition-colors focus-ring max-w-[280px]"
          title={vault.root_path}
        >
          <FolderIcon className="h-4 w-4 text-fg-muted shrink-0" />
          <span className="truncate font-medium leading-none">{vault.name}</span>
          <ChevronDownIcon className="h-4 w-4 text-fg-faint shrink-0" />
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full mt-1 w-[320px] card-elevated p-1 z-30 animate-fade-in">
            <div className="px-3 py-2 border-b border-border-subtle">
              <div className="section-label">Vault path</div>
              <div className="text-[12px] font-mono mt-1 break-all text-fg-muted leading-snug">
                {vault.root_path}
              </div>
            </div>
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
          className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-[13px]
            text-fg-muted hover:text-fg-default hover:bg-sunken transition-colors focus-ring
            ml-auto max-w-[320px] flex-1 min-w-0 border border-transparent hover:border-border-subtle"
          title={`Command palette (${formatShortcut("⌘P")})`}
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline truncate flex-1 text-left leading-none">
            Jump to a note or run a command…
          </span>
          <kbd className="hidden md:inline-flex kbd shrink-0">{formatShortcut("⌘P")}</kbd>
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
      </button>

      <Link
        href="/settings/tokens"
        className="btn btn-ghost btn-sm"
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
      className="flex w-full items-center gap-2 px-3 py-2 rounded-md text-[13px]
        text-fg-default hover:bg-sunken focus-ring text-left"
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  );
}

// MenuLink kept for future submenus.
export function _MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-[13px]
        text-fg-default hover:bg-sunken focus-ring"
    >
      {icon}
      <span className="flex-1">{children}</span>
    </Link>
  );
}

// Re-export so siblings can build out their menus without importing twice.
export const _Icons = { KeyIcon };
