import { LatticeClient } from "@lattice/sdk";
import { invoke, isTauri } from "./tauri";

/**
 * Single shared LatticeClient. The base URL resolves in this order:
 *
 *   1. `localStorage["lattice.apiUrl"]` — set by the user via Settings.
 *   2. `process.env.NEXT_PUBLIC_LATTICE_API_URL` — baked in at build time.
 *      Used for desktop builds that point at the local sidecar, and for
 *      mobile builds that point at a cloud deployment.
 *   3. `http://127.0.0.1:8787` — local dev fallback.
 *
 * The localStorage path lets a mobile WebView user (no env vars at runtime)
 * pick which cloud they're talking to without rebuilding the app.
 *
 * Auth: in Tauri the shell generates a per-launch bearer token and exposes
 * it via the `local_token` invoke; we set it on the client at boot. For
 * `pnpm dev` outside Tauri the developer supplies `NEXT_PUBLIC_LATTICE_LOCAL_TOKEN`
 * (the same value passed to the API process via `LATTICE_LOCAL_TOKEN`).
 */
const STORAGE_KEY = "lattice.apiUrl";

let cached: LatticeClient | null = null;
let bootstrapped: Promise<void> | null = null;

function resolveBaseUrl(): string {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    } catch {
      // Privacy mode / SSR — fall through.
    }
  }
  return process.env.NEXT_PUBLIC_LATTICE_API_URL ?? "http://127.0.0.1:8787";
}

async function bootstrapToken(client: LatticeClient): Promise<void> {
  if (isTauri()) {
    try {
      const t = await invoke<string>("local_token");
      if (t) client.setToken(t);
      return;
    } catch {
      // fall through to dev-mode env var
    }
  }
  const devTok = process.env.NEXT_PUBLIC_LATTICE_LOCAL_TOKEN;
  if (devTok) client.setToken(devTok);
}

export function getClient(): LatticeClient {
  if (cached) return cached;
  cached = new LatticeClient({ baseUrl: resolveBaseUrl() });
  // Kick off token bootstrap; callers that race ahead will just get a 401
  // and the next call (after bootstrap resolves) succeeds.
  if (!bootstrapped) bootstrapped = bootstrapToken(cached);
  return cached;
}

export function tokenReady(): Promise<void> {
  if (!cached) getClient();
  return bootstrapped ?? Promise.resolve();
}

/**
 * Update the API base URL and rebuild the cached client. Call after the
 * user changes the value in Settings; subsequent `getClient()` calls will
 * return a client pointing at the new URL.
 */
export function setApiUrl(url: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (url) window.localStorage.setItem(STORAGE_KEY, url);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — same fallthrough as above
  }
  cached = null;
  bootstrapped = null;
}

export function getApiUrl(): string {
  return resolveBaseUrl();
}
