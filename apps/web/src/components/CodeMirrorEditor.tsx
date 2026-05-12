"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, placeholder } from "@codemirror/view";
import type { LinkSuggestion } from "@lattice/sdk";
import { useEffect, useRef, useState } from "react";
import { getClient } from "../lib/client";
import { markdownHighlight } from "../lib/cm-highlight";

interface Props {
  notePath: string | null;
  onSaved?: () => void;
  onJumpToNote?: (path: string) => void;
  suggestionsEnabled?: boolean;
}

export function CodeMirrorEditor({
  notePath,
  onSaved,
  onJumpToNote,
  suggestionsEnabled = true,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [originalBody, setOriginalBody] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = body !== originalBody;

  // Build the editor once; tie its content to React state via dispatch on the
  // outside and onChange via update listener on the inside.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          history(),
          syntaxHighlighting(markdownHighlight),
          markdown({ base: markdownLanguage }),
          placeholder("Start writing…"),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": { height: "100%", backgroundColor: "transparent" },
            ".cm-scroller": {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "13px",
            },
            ".cm-content": { padding: "16px 12px" },
            ".cm-gutters": {
              backgroundColor: "transparent",
              borderRight: "none",
              color: "var(--cm-gutter-color, #9ca3af)",
            },
            ".cm-cursor": { borderLeftColor: "currentColor" },
            ".cm-activeLine": { backgroundColor: "transparent" },
            ".cm-activeLineGutter": { backgroundColor: "transparent" },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setBody(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Load the note when notePath changes.
  useEffect(() => {
    if (!notePath) {
      _setDoc("");
      setBody("");
      setOriginalBody("");
      setTitle(null);
      setError(null);
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getClient()
      .getNote(notePath)
      .then((note) => {
        if (cancelled) return;
        _setDoc(note.body);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notePath]);

  function _setDoc(text: string) {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === text) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  }

  // `body` is intentionally a dep so each keystroke restarts the debounce
  // even though we read content from the editor view, not `body`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: body retriggers debounce on edit
  useEffect(() => {
    if (!suggestionsEnabled || !notePath) {
      setSuggestions([]);
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => {
      const para = currentParagraph(view);
      if (para.length < 20) {
        setSuggestions([]);
        return;
      }
      getClient()
        .suggestLinks(para, { limit: 4 })
        .then((resp) => setSuggestions(resp.suggestions))
        .catch(() => setSuggestions([]));
    }, 800);
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [body, notePath, suggestionsEnabled]);

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

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      void save();
    }
  }

  function applySuggestion(s: LinkSuggestion) {
    const view = viewRef.current;
    if (!view) return;
    const title = s.title ?? s.path.replace(/\.md$/, "");
    const wikilink = `[[${title}]]`;
    const head = view.state.selection.main.head;
    const para = currentParagraphRange(view);
    if (s.anchor) {
      const para_text = view.state.doc.sliceString(para.from, para.to);
      const idx = para_text.indexOf(s.anchor);
      if (idx >= 0) {
        const from = para.from + idx;
        const to = from + s.anchor.length;
        view.dispatch({ changes: { from, to, insert: wikilink } });
        view.focus();
        return;
      }
    }
    view.dispatch({ changes: { from: head, insert: ` ${wikilink}` } });
    view.focus();
  }

  if (!notePath) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Select a note on the left.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" onKeyDown={onKeyDown}>
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
      <div className="flex-1 min-h-0 relative">
        <div ref={hostRef} className="absolute inset-0 overflow-auto" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-500 pointer-events-none">
            loading…
          </div>
        )}
      </div>
      {suggestionsEnabled && suggestions.length > 0 && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 px-3 py-2 bg-neutral-50/60 dark:bg-neutral-900/60">
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
            link suggestions
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.path}
                type="button"
                onClick={() => applySuggestion(s)}
                onDoubleClick={() => onJumpToNote?.(s.path)}
                title={s.snippet}
                className="text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                [[{s.title ?? s.path.replace(/\.md$/, "")}]]
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function currentParagraph(view: EditorView): string {
  const range = currentParagraphRange(view);
  return view.state.doc.sliceString(range.from, range.to).trim();
}

function currentParagraphRange(view: EditorView): { from: number; to: number } {
  const head = view.state.selection.main.head;
  const doc = view.state.doc;
  // Walk back to the previous blank line; walk forward to the next.
  let from = head;
  for (let i = head - 1; i >= 0; i--) {
    if (doc.sliceString(i, i + 1) === "\n" && doc.sliceString(i - 1, i) === "\n") {
      from = i + 1;
      break;
    }
    if (i === 0) from = 0;
  }
  let to = head;
  for (let i = head; i < doc.length; i++) {
    if (doc.sliceString(i, i + 1) === "\n" && doc.sliceString(i + 1, i + 2) === "\n") {
      to = i;
      break;
    }
    if (i === doc.length - 1) to = doc.length;
  }
  return { from, to };
}
