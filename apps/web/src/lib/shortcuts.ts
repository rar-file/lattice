"use client";

import { useEffect } from "react";

type Handler = (e: KeyboardEvent) => void;

interface Shortcut {
  key: string;
  meta?: boolean;
  shift?: boolean;
  handler: Handler;
}

/**
 * Global keyboard-shortcut hook.
 *
 * Skips when the user is typing in an input/textarea/contenteditable — except
 * for meta-key combos (⌘K etc.) which should always work. This means we can
 * safely register single-key shortcuts like `?` for help without stealing
 * keystrokes from text fields.
 */
export function useShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return true;
      if (t.isContentEditable) return true;
      // CodeMirror's editable area is a div with [contenteditable].
      return false;
    }

    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      const editing = isEditableTarget(e.target);
      for (const s of shortcuts) {
        if (e.key.toLowerCase() !== s.key.toLowerCase()) continue;
        if ((s.meta ?? false) !== meta) continue;
        if ((s.shift ?? false) !== e.shiftKey) continue;
        // Allow meta combos inside text fields; block single-key shortcuts.
        if (editing && !s.meta) return;
        e.preventDefault();
        s.handler(e);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);
}
