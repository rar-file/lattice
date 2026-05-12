"use client";

import type { OpenVaultResponse, VaultInfo } from "@lattice/sdk";
import { useState } from "react";
import { getClient } from "../lib/client";
import { isTauri, pickVaultFolder } from "../lib/tauri";

interface Props {
  vault: VaultInfo | null;
  onOpened: (resp: OpenVaultResponse) => void;
}

export function VaultBar({ vault, onOpened }: Props) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tauri = isTauri();

  async function pick() {
    const p = await pickVaultFolder();
    if (p) setPath(p);
  }

  async function open() {
    const root = path.trim();
    if (!root) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await getClient().openVault(root);
      onOpened(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">vault</div>
      {vault ? (
        <div className="text-sm font-mono truncate flex-1" title={vault.root_path}>
          {vault.root_path}
        </div>
      ) : (
        <>
          {tauri && (
            <button
              type="button"
              onClick={pick}
              className="text-xs rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              browse…
            </button>
          )}
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path/to/vault"
            className="flex-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm font-mono"
          />
          <button
            type="button"
            disabled={busy || !path.trim()}
            onClick={open}
            className="text-xs rounded bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 px-3 py-1 disabled:opacity-50"
          >
            {busy ? "opening…" : "open"}
          </button>
        </>
      )}
      {error && <div className="text-xs text-red-500 truncate">{error}</div>}
    </div>
  );
}
