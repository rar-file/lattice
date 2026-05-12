/**
 * Tauri bridge. Returns null when running in a plain browser (so the web app
 * stays usable without Tauri); inside the Tauri shell, dynamically imports the
 * APIs we need so the bundle doesn't drag them into a pure web build.
 */

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri injects `__TAURI_INTERNALS__` in v2.
  return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export async function pickVaultFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  // Let Webpack bundle the plugin — the previous `webpackIgnore: true` made
  // this a runtime URL import that the WebView can't resolve, so the picker
  // silently no-op'd. Bundling is safe; the `isTauri()` guard keeps it from
  // running in a plain browser anyway.
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    return (await dialog.open({ directory: true, multiple: false })) as string | null;
  } catch (e) {
    console.error("pickVaultFolder failed:", e);
    return null;
  }
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const core = await import("@tauri-apps/api/core");
    const fn = core.invoke as InvokeFn;
    return fn<T>(cmd, args);
  } catch (e) {
    console.error("tauri invoke failed:", e);
    return null;
  }
}
