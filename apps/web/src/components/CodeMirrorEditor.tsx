"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import type { BacklinkHit, LinkSuggestion } from "@lattice/sdk";
import { useEffect, useRef, useState } from "react";
import { getClient } from "../lib/client";
import { markdownHighlight } from "../lib/cm-highlight";
import { formatShortcut } from "../lib/platform";
import { CheckIcon, FileIcon, LinkIcon } from "./icons";

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
  const [backlinks, setBacklinks] = useState<BacklinkHit[]>([]);
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
          history(),
          syntaxHighlighting(markdownHighlight),
          markdown({ base: markdownLanguage }),
          placeholder("Start writing…"),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.lineWrapping,
          EditorView.theme({
            "&": { height: "100%", backgroundColor: "transparent" },
            ".cm-scroller": {
              fontFamily: "var(--font-sans), Inter, ui-sans-serif, system-ui, sans-serif",
              fontSize: "16px",
              lineHeight: "1.65",
              maxWidth: "720px",
              margin: "0 auto",
              padding: "0 24px",
            },
            ".cm-content": { padding: "32px 0 200px" },
            ".cm-line": { padding: "0" },
            ".cm-cursor": { borderLeftColor: "currentColor", borderLeftWidth: "1.5px" },
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
      setBacklinks([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Defensive retry: a freshly-captured note can momentarily 404 on slow
    // disks (the indexer commit hasn't landed by the time the redirect to
    // the new note fires). Up to 3 quick retries before surfacing the error.
    (async () => {
      let lastErr: unknown = null;
      for (let i = 0; i < 3 && !cancelled; i++) {
        try {
          const note = await getClient().getNote(notePath);
          if (cancelled) return;
          _setDoc(note.body);
          setBody(note.body);
          setOriginalBody(note.body);
          setTitle(note.title);
          setError(null);
          return;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          if (!/404|not found/i.test(msg)) break;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      if (!cancelled && lastErr) {
        setError(lastErr instanceof Error ? lastErr.message : String(lastErr));
      }
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });
    // Backlinks fetched in parallel — slow path, render when ready.
    getClient()
      .backlinks(notePath)
      .then((hits) => {
        if (!cancelled) setBacklinks(hits);
      })
      .catch(() => {
        if (!cancelled) setBacklinks([]);
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
      <div className="flex h-full flex-col items-center justify-center px-6 text-center bg-canvas">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sunken mb-4">
          <FileIcon className="h-5 w-5 text-fg-muted" />
        </div>
        <h2 className="text-[16px] font-medium tracking-tight text-fg-default">
          Pick a note to start
        </h2>
        <p className="mt-2 max-w-sm text-[13px] text-fg-muted leading-relaxed">
          Choose any note from the sidebar to begin writing, or press{" "}
          <kbd className="kbd">{formatShortcut("⇧⌘C")}</kbd> to capture a new thought into your
          Inbox.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-md w-full">
          <ShortcutHint k={formatShortcut("⌘K")} label="Search" />
          <ShortcutHint k={formatShortcut("⌘S")} label="Save" />
          <ShortcutHint k={formatShortcut("⇧⌘C")} label="Capture" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-3 border-b border-border-subtle bg-surface px-6 py-3">
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium tracking-tight text-fg-default truncate">
            {title?.trim() || stripMd(basename(notePath))}
          </div>
          <div className="text-[12px] text-fg-faint font-mono truncate" title={notePath}>
            {notePath}
          </div>
        </div>
        <SaveIndicator dirty={dirty} saving={saving} />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="btn btn-secondary btn-xs"
        >
          {saving ? "Saving…" : "Save"}
          <span className="kbd">{formatShortcut("⌘S")}</span>
        </button>
      </div>
      {error && <div className="mx-6 mt-2 text-[12px] text-fg-muted px-1">{error}</div>}
      <div className="flex-1 min-h-0 relative">
        <div ref={hostRef} className="absolute inset-0 overflow-auto scrollbar-thin" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-fg-muted pointer-events-none">
            <span className="lattice-skeleton h-3 w-24" />
          </div>
        )}
      </div>
      {suggestionsEnabled && suggestions.length > 0 && (
        <div className="border-t border-border-subtle border-l-2 border-l-accent bg-surface px-6 py-3 animate-slide-up">
          <div className="flex items-center gap-2 mb-2">
            <span className="section-label">Linked notes</span>
            <span className="text-[12px] text-fg-faint">
              — click to insert <span className="font-mono">[[wikilink]]</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.path}
                type="button"
                onClick={() => applySuggestion(s)}
                onDoubleClick={() => onJumpToNote?.(s.path)}
                title={s.snippet}
                className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface px-2 py-1 text-[12px] hover:border-accent/40 hover:bg-accent-soft/40 transition-colors focus-ring"
              >
                <LinkIcon className="h-3 w-3 text-fg-faint" />
                <span className="font-mono">
                  [[{s.title?.trim() || stripMd(basename(s.path))}]]
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {backlinks.length > 0 && (
        <div className="border-t border-border-subtle bg-surface px-6 py-3 animate-slide-up">
          <div className="flex items-center gap-2 mb-2">
            <LinkIcon className="h-4 w-4 text-fg-muted" />
            <span className="section-label">
              Linked from {backlinks.length} {backlinks.length === 1 ? "note" : "notes"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {backlinks.slice(0, 5).map((b) => (
              <button
                key={b.path}
                type="button"
                onClick={() => onJumpToNote?.(b.path)}
                className="text-left rounded-md px-2 py-2 hover:bg-sunken transition-colors focus-ring"
              >
                <div className="text-[13px] font-medium text-fg-default truncate">
                  {b.title?.trim() || stripMd(basename(b.path))}
                </div>
                <div className="text-[12px] text-fg-muted truncate">{b.snippet}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <EditorFooter body={body} notePath={notePath} />
    </div>
  );
}

function EditorFooter({ body, notePath }: { body: string; notePath: string }) {
  const words = countWords(body);
  // ~225 wpm is the median for prose reading on screen.
  const minutes = Math.max(1, Math.round(words / 225));
  return (
    <div className="flex items-center justify-between border-t border-border-subtle bg-surface px-6 py-2 text-[12px] text-fg-faint font-mono">
      <div className="flex items-center gap-3">
        <span>
          {words.toLocaleString()} {words === 1 ? "word" : "words"}
        </span>
        <span className="text-fg-faint/60">·</span>
        <span>{minutes} min read</span>
        <span className="text-fg-faint/60">·</span>
        <span>{body.length.toLocaleString()} chars</span>
      </div>
      <span className="truncate max-w-[40%]" title={notePath}>
        {notePath}
      </span>
    </div>
  );
}

function countWords(s: string): number {
  // Strip code fences and inline code so we don't inflate the count with
  // language tokens; markdown punctuation is fine to ignore.
  const stripped = s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#*_>~\-+|[\]()]/g, " ");
  const m = stripped.match(/\b[\w'-]+\b/g);
  return m ? m.length : 0;
}

function SaveIndicator({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  if (saving) {
    return <span className="text-[12px] text-fg-muted animate-fade-in">Saving…</span>;
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" /> Unsaved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-fg-faint">
      <CheckIcon className="h-3 w-3" /> Saved
    </span>
  );
}

function ShortcutHint({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-md border border-border-subtle bg-surface px-2 py-2 text-[12px] text-fg-muted">
      <kbd className="kbd">{k}</kbd>
      <span>{label}</span>
    </div>
  );
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}
function stripMd(s: string): string {
  return s.replace(/\.md$/i, "");
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
