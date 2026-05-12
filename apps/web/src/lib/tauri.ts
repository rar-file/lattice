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
  // Defer the import so a non-Tauri build doesn't try to resolve the module.
  const dialog = await import(/* webpackIgnore: true */ "@tauri-apps/plugin-dialog").catch(
    () => null,
  );
  if (!dialog) return null;
  const result = (await dialog.open({ directory: true, multiple: false })) as string | null;
  return result;
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  const core = await import(/* webpackIgnore: true */ "@tauri-apps/api/core").catch(() => null);
  if (!core) return null;
  const fn = core.invoke as InvokeFn;
  return fn<T>(cmd, args);
}
