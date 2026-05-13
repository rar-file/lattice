"use client";

import { IS_MAC } from "../lib/platform";
import { XIcon } from "./icons";

const MOD = IS_MAC ? "⌘" : "Ctrl";
const SHIFT = IS_MAC ? "⇧" : "Shift";

interface Props {
  open: boolean;
  onClose(): void;
}

const SHORTCUTS: { section: string; rows: { keys: string[]; label: string }[] }[] = [
  {
    section: "Navigation",
    rows: [
      { keys: [MOD, "P"], label: "Command palette — jump to any note or action" },
      { keys: [MOD, "K"], label: "Focus search panel" },
      { keys: ["?"], label: "Show this shortcut help" },
    ],
  },
  {
    section: "Writing",
    rows: [
      { keys: [MOD, "S"], label: "Save the current note" },
      { keys: [SHIFT, MOD, "C"], label: "Capture — drop a thought into Inbox" },
      { keys: [MOD, "N"], label: "New note in the current vault" },
    ],
  },
  {
    section: "Vault",
    rows: [
      { keys: [MOD, ",", MOD, "/"], label: "Open settings (tokens, etc.)" },
      { keys: ["Esc"], label: "Close any modal or panel" },
    ],
  },
];

export function KeyboardHelp({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 animate-fade-in"
      style={{ background: "rgba(7,8,13,0.6)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card-elevated w-full max-w-md animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="text-lede">Keyboard shortcuts</div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            aria-label="Close"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 pb-5 pt-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {SHORTCUTS.map((sec) => (
            <section key={sec.section}>
              <div className="text-eyebrow mb-3">{sec.section}</div>
              <ul className="space-y-2">
                {sec.rows.map((r) => (
                  <li key={r.label} className="flex items-center gap-3">
                    <div className="flex items-center gap-1 min-w-[96px]">
                      {r.keys.map((k, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: shortcut keys aren't reordered
                        <kbd key={i} className="kbd">
                          {k}
                        </kbd>
                      ))}
                    </div>
                    <span className="text-meta">{r.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="px-6 py-3 text-caption" style={{ background: "var(--surface-sunken)" }}>
          Press <kbd className="kbd">?</kbd> any time to show this list.
        </div>
      </div>
    </div>
  );
}
