"use client";

import { useEffect, useRef, useState } from "react";
import { type Theme, useTheme } from "../lib/theme";

/**
 * Three-state theme toggle. Cycles light → dark → system → … on click; the
 * full menu is available via a dropdown.
 */
export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost btn-sm"
        title="Appearance"
        aria-label="Appearance"
      >
        {resolved === "dark" ? <MoonIcon /> : <SunIcon />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 card-elevated p-1 z-30 animate-scale-in">
          <Option current={theme} value="light" onPick={setTheme} onClose={() => setOpen(false)}>
            <SunIcon /> Light
          </Option>
          <Option current={theme} value="dark" onPick={setTheme} onClose={() => setOpen(false)}>
            <MoonIcon /> Dark
          </Option>
          <Option current={theme} value="system" onPick={setTheme} onClose={() => setOpen(false)}>
            <SystemIcon /> System
          </Option>
        </div>
      )}
    </div>
  );
}

function Option({
  current,
  value,
  onPick,
  onClose,
  children,
}: {
  current: Theme;
  value: Theme;
  onPick: (t: Theme) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onPick(value);
        onClose();
      }}
      className={`flex w-full items-center gap-2 px-3 py-2 rounded text-[13px] hover:bg-sunken focus-ring ${
        current === value ? "text-fg-default font-medium" : "text-fg-muted"
      }`}
    >
      {children}
      {current === value && <span className="ml-auto text-accent text-[12px]">●</span>}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      role="img"
      focusable="false"
    >
      <title>Light mode</title>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      role="img"
      focusable="false"
    >
      <title>Dark mode</title>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}
function SystemIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      role="img"
      focusable="false"
    >
      <title>System theme</title>
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 18v3" />
    </svg>
  );
}
