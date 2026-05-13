"use client";

import type { OpenVaultResponse } from "@lattice/sdk";
import { useState } from "react";
import { getClient } from "../lib/client";
import { isTauri, pickVaultFolder } from "../lib/tauri";
import { ArrowRightIcon, LatticeMark } from "./icons";

interface Props {
  onOpened: (resp: OpenVaultResponse) => void;
}

export function Welcome({ onOpened }: Props) {
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tauri = isTauri();

  async function pickFolder() {
    const p = await pickVaultFolder();
    if (p) setFolder(p);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!folder.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await getClient().openVault(folder.trim());
      onOpened(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createDefault() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await getClient().initVault(null, "Lattice");
      onOpened(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12"
      style={{ background: "var(--surface-base)" }}
    >
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-start mb-8">
          <LatticeMark withWordmark={false} size={28} />
          <h1 className="mt-6 text-page">Open a vault</h1>
          <p className="mt-2 text-meta max-w-sm">
            Any folder of Markdown files. Existing Obsidian vaults work as-is.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1 font-mono text-[13px]"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="/path/to/your-notes"
            />
            {tauri && (
              <button
                type="button"
                onClick={pickFolder}
                className="btn btn-secondary btn-sm shrink-0"
              >
                Choose…
              </button>
            )}
          </div>
          {error && <p className="text-meta">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={createDefault}
              disabled={busy}
              className="text-caption focus-ring rounded px-1 transition-colors"
              style={{ color: "var(--text-tertiary)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--text-default)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)";
              }}
            >
              or create one in ~/Documents/Lattice
            </button>
            <button
              type="submit"
              disabled={!folder.trim() || busy}
              className="btn btn-primary btn-sm"
            >
              {busy ? (
                "Opening…"
              ) : (
                <>
                  Open <ArrowRightIcon className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
