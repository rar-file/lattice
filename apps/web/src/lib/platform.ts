/**
 * Platform-aware keyboard shortcut rendering. macOS uses ⌘/⇧/⌥; Windows and
 * Linux use Ctrl/Shift/Alt. This module renders the right glyphs for the
 * current OS so a Windows user doesn't see "⌘K" — they see "Ctrl+K".
 *
 * Detection runs once at module load (browser only). SSR returns ``false``
 * which biases the static HTML toward the Windows/Linux rendering; the
 * client hydrates and re-renders if needed.
 */

function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  // userAgentData is the modern path; falls back to userAgent on older browsers.
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || navigator.platform || "";
  return /Mac|iPhone|iPad|iPod/.test(platform);
}

export const IS_MAC: boolean = detectMac();

/**
 * Convert a mac-glyph shortcut string ("⌘K", "⇧⌘C") to the right rendering
 * for the current platform. On Mac: returned as-is. On Windows/Linux:
 *
 *    ⌘ → Ctrl
 *    ⇧ → Shift
 *    ⌥ → Alt
 *    ⌃ → Ctrl
 *
 * Multi-key glyphs become "+" separated, so "⇧⌘C" → "Ctrl+Shift+C".
 * Drops the "+" before single letters so "⌘P" → "Ctrl+P" not "CtrlP".
 */
export function formatShortcut(mac: string): string {
  if (IS_MAC) return mac;
  const parts: string[] = [];
  for (const ch of mac) {
    if (ch === "⌘" || ch === "⌃") parts.push("Ctrl");
    else if (ch === "⇧") parts.push("Shift");
    else if (ch === "⌥") parts.push("Alt");
    else parts.push(ch);
  }
  // Re-join: every modifier becomes "<mod>+", non-modifier letters are
  // appended directly so "Ctrl Shift C" → "Ctrl+Shift+C".
  const mods = parts.filter((p) => p === "Ctrl" || p === "Shift" || p === "Alt");
  const keys = parts.filter((p) => p !== "Ctrl" && p !== "Shift" && p !== "Alt");
  return [...mods, ...keys].filter(Boolean).join("+");
}
