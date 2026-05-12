"use client";

import { useEffect } from "react";

type Handler = (e: KeyboardEvent) => void;

interface Shortcut {
  key: string;
  meta?: boolean;
  shift?: boolean;
  handler: Handler;
}

/** Global keyboard-shortcut hook. Pass a list of {key, meta, shift, handler}.  */
export function useShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      for (const s of shortcuts) {
        const meta = e.metaKey || e.ctrlKey;
        if (e.key.toLowerCase() !== s.key.toLowerCase()) continue;
        if ((s.meta ?? false) !== meta) continue;
        if ((s.shift ?? false) !== e.shiftKey) continue;
        e.preventDefault();
        s.handler(e);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);
}
