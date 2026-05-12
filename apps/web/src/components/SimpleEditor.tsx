"use client";

import { useEffect, useRef, useState } from "react";
import { getClient } from "../lib/client";

interface Props {
  notePath: string | null;
  onSaved?: () => void;
}

export function SimpleEditor({ notePath, onSaved }: Props) {
  const [body, setBody] = useState("");
  const [originalBody, setOriginalBody] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!notePath) {
      setBody("");
      setOriginalBody("");
      setTitle(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getClient()
      .getNote(notePath)
      .then((note) => {
        if (cancelled) return;
        setBody(note.body);
        setOriginalBody(note.body);
        setTitle(note.title);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notePath]);

  const dirty = body !== originalBody;

  async function save() {
    if (!notePath || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const note = await getClient().putNote(notePath, body);
      setOriginalBody(note.body);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      void save();
    }
  }

  if (!notePath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Select a note on the left.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 px-4 py-2">
        <div className="text-sm font-medium truncate flex-1" title={notePath}>
          {title ?? notePath}
        </div>
        {dirty && <span className="text-xs text-amber-600 dark:text-amber-400">unsaved</span>}
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="text-xs rounded bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 px-3 py-1 disabled:opacity-50"
        >
          {saving ? "saving…" : "save"}
        </button>
      </div>
      {error && (
        <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 text-xs px-4 py-2">
          {error}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={loading}
        spellCheck={false}
        className="flex-1 resize-none bg-transparent p-4 font-mono text-sm outline-none"
      />
    </div>
  );
}
