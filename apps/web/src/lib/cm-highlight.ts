import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Markdown highlight tuned for the design system.
 *
 * We deliberately use a small palette of CSS variable lookups via plain hex
 * (CodeMirror's style spec doesn't accept var(...) directly) so this works in
 * both light and dark modes by overriding the heading colors via CSS. The
 * dark-mode override lives in globals.css under `.cm-editor`.
 */
export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: "700", color: "rgb(28, 26, 24)" },
  { tag: t.heading2, fontWeight: "700", color: "rgb(28, 26, 24)" },
  { tag: t.heading3, fontWeight: "600", color: "rgb(60, 56, 52)" },
  { tag: t.heading, fontWeight: "600", color: "rgb(60, 56, 52)" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  // Indigo from our accent token for links.
  { tag: t.link, color: "rgb(79, 70, 229)", textDecoration: "underline" },
  { tag: t.url, color: "rgb(79, 70, 229)" },
  {
    tag: t.monospace,
    color: "rgb(40, 38, 35)",
    backgroundColor: "rgba(0,0,0,0.04)",
    fontFamily: "var(--font-mono), JetBrains Mono, ui-monospace, monospace",
    fontSize: "0.92em",
  },
  { tag: t.quote, color: "rgb(99, 92, 87)", fontStyle: "italic" },
  { tag: t.list, color: "rgb(99, 92, 87)" },
  // Markdown formatting characters (#, *, _) — quiet, secondary.
  { tag: t.processingInstruction, color: "rgb(168, 160, 152)" },
  { tag: t.contentSeparator, color: "rgb(168, 160, 152)" },
]);
