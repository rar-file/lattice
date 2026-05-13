import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Markdown highlight tuned for the dark Lattice palette.
 *
 * Weights cap at 600 (the project's max). Wikilinks/URLs use the accent
 * (--accent: #a78bfa), which is also the highlight for `[[wikilink]]`-style
 * tokens — accent reads as "live", and links pointing into the vault are
 * live navigation targets.
 */
export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "600", color: "#f0f1f5" },
  { tag: t.heading2, fontWeight: "600", color: "#f0f1f5" },
  { tag: t.heading3, fontWeight: "500", color: "#f0f1f5" },
  { tag: t.heading, fontWeight: "500", color: "#f0f1f5" },
  { tag: t.strong, fontWeight: "500", color: "#f0f1f5" },
  { tag: t.emphasis, fontStyle: "italic", color: "#f0f1f5" },
  { tag: t.link, color: "#a78bfa", textDecoration: "underline" },
  { tag: t.url, color: "#a78bfa" },
  {
    tag: t.monospace,
    color: "#c5c9d6",
    backgroundColor: "rgba(255,255,255,0.04)",
    fontFamily: "var(--font-mono), JetBrains Mono, ui-monospace, monospace",
    fontSize: "0.92em",
  },
  { tag: t.quote, color: "#8b91a4", fontStyle: "italic" },
  { tag: t.list, color: "#8b91a4" },
  // markdown punctuation (#, *, _) — quiet, secondary.
  { tag: t.processingInstruction, color: "#5b6072" },
  { tag: t.contentSeparator, color: "#5b6072" },
]);
