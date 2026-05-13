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
import { FileIcon, LinkIcon } from "./icons";

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
              fontSize: "15px",
              lineHeight: "1.65",
              maxWidth: "720px",
              margin: "0 auto",
              padding: "0 24px",
            },
            ".cm-content": { padding: "32px 0 200px", color: "var(--text-default)" },
            ".cm-line": { padding: "0" },
            ".cm-cursor": {
              borderLeftColor: "var(--accent)",
              borderLeftWidth: "1.5px",
            },
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
      <div
        className="flex h-full flex-col items-center justify-center px-6 text-center"
        style={{ background: "var(--surface-raised)" }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl mb-4"
          style={{ background: "var(--surface-hover)" }}
        >
          <FileIcon className="h-5 w-5" style={{ color: "var(--text-tertiary)" }} />
        </div>
        <h2 className="text-section">Pick a note to start</h2>
        <p
          className="mt-2 max-w-sm text-[13px] leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          Choose any note from the left rail, or press{" "}
          <kbd className="kbd">{formatShortcut("⇧⌘C")}</kbd> to drop a thought into your Inbox.
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
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--surface-raised)" }}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-3 px-8 pt-6 pb-3">
        <div className="flex-1 min-w-0">
          <div
            className="text-[15px] truncate leading-snug"
            style={{ color: "var(--text-emphasis)", fontWeight: 500 }}
          >
            {title?.trim() || stripMd(basename(notePath))}
          </div>
          <div
            className="mt-1 text-[11px] font-mono truncate"
            style={{ color: "var(--text-tertiary)" }}
            title={notePath}
          >
            {notePath}
          </div>
        </div>
        <SaveIndicator dirty={dirty} saving={saving} />
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="btn btn-ghost btn-xs"
        >
          {saving ? "Saving…" : "Save"}
          <kbd className="kbd">{formatShortcut("⌘S")}</kbd>
        </button>
      </div>
      {error && <div className="mx-8 -mt-1 mb-2 text-meta">{error}</div>}
      <div className="flex-1 min-h-0 relative">
        <div ref={hostRef} className="absolute inset-0 overflow-auto scrollbar-thin" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="live-dot" />
          </div>
        )}
      </div>
      {suggestionsEnabled && suggestions.length > 0 && (
        <div className="px-8 pt-3 pb-3 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-eyebrow">Linked notes</span>
            <span className="text-caption">click to insert</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.path}
                type="button"
                onClick={() => applySuggestion(s)}
                onDoubleClick={() => onJumpToNote?.(s.path)}
                title={s.snippet}
                className="inline-flex items-center gap-1.5 rounded-md px-2 h-7 text-[12px] focus-ring transition-colors"
                style={{ background: "var(--surface-hover)", color: "var(--text-secondary)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--surface-active)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-emphasis)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                }}
              >
                <LinkIcon className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
                <span className="font-mono">
                  [[{s.title?.trim() || stripMd(basename(s.path))}]]
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {backlinks.length > 0 && (
        <div className="px-8 pt-3 pb-3 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-eyebrow">
              Linked from {backlinks.length} {backlinks.length === 1 ? "note" : "notes"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {backlinks.slice(0, 5).map((b) => (
              <button
                key={b.path}
                type="button"
                onClick={() => onJumpToNote?.(b.path)}
                className="text-left rounded-md px-2 py-1.5 focus-ring transition-colors"
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <div className="text-[13px] truncate" style={{ color: "var(--text-emphasis)" }}>
                  {b.title?.trim() || stripMd(basename(b.path))}
                </div>
                <div
                  className="text-[11px] truncate font-mono"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {b.path}
                </div>
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
  const minutes = Math.max(1, Math.round(words / 225));
  return (
    <div
      className="flex items-center justify-between px-8 py-3 text-[11px] font-mono"
      style={{ color: "var(--text-tertiary)" }}
    >
      <div className="flex items-center gap-3">
        <span>
          {words.toLocaleString()} {words === 1 ? "word" : "words"}
        </span>
        <span>·</span>
        <span>{minutes} min read</span>
        <span>·</span>
        <span>{body.length.toLocaleString()} chars</span>
      </div>
      <span className="truncate max-w-[40%]" title={notePath}>
        {notePath}
      </span>
    </div>
  );
}

function countWords(s: string): number {
  const stripped = s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#*_>~\-+|[\]()]/g, " ");
  const m = stripped.match(/\b[\w'-]+\b/g);
  return m ? m.length : 0;
}

function SaveIndicator({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  if (saving) {
    return (
      <span
        className="inline-flex items-center gap-2 text-[12px] animate-fade-in"
        style={{ color: "var(--text-secondary)" }}
      >
        <span className="live-dot" aria-hidden /> Saving
      </span>
    );
  }
  if (dirty) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[12px]"
        style={{ color: "rgb(var(--warning))" }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "rgb(var(--warning))" }} />{" "}
        Unsaved
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px]"
      style={{ color: "var(--text-tertiary)" }}
    >
      Saved
    </span>
  );
}

function ShortcutHint({ k, label }: { k: string; label: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[12px]"
      style={{ background: "var(--surface-hover)", color: "var(--text-secondary)" }}
    >
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
