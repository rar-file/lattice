import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// Minimal markdown highlight palette tuned for the existing neutral-grey UI.
// Keeps colours muted so the editor stays text-first, not syntax-first.
export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "600", color: "#0a0a0a" },
  { tag: t.heading2, fontWeight: "600", color: "#171717" },
  { tag: t.heading3, fontWeight: "600", color: "#262626" },
  { tag: t.heading, fontWeight: "600", color: "#404040" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "#2563eb", textDecoration: "underline" },
  { tag: t.url, color: "#2563eb" },
  { tag: t.monospace, color: "#1f2937", backgroundColor: "rgba(0,0,0,0.04)" },
  { tag: t.quote, color: "#525252", fontStyle: "italic" },
  { tag: t.list, color: "#525252" },
  { tag: t.processingInstruction, color: "#a3a3a3" },
  { tag: t.contentSeparator, color: "#a3a3a3" },
]);
