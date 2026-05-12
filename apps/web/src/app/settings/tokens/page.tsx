"use client";

import type { TokenInfo } from "@lattice/sdk";
import { useCallback, useEffect, useState } from "react";
import { getClient } from "../../../lib/client";

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState<string[]>(["vault:read", "search"]);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const ts = await getClient().listTokens();
      setTokens(ts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    if (!newName) return;
    setError(null);
    try {
      const r = await getClient().createAgentToken(newName, newScopes);
      setCreated({ token: r.token, name: r.info.name });
      setNewName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await getClient().revokeToken(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function toggleScope(scope: string) {
    setNewScopes((cur) => (cur.includes(scope) ? cur.filter((s) => s !== scope) : [...cur, scope]));
  }

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        <header>
          <h1 className="text-xl font-medium">Agent tokens</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Issue scoped tokens for MCP clients (Claude Code, Cursor, custom agents).
          </p>
        </header>

        {error && (
          <div className="rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 text-xs px-3 py-2">
            {error}
          </div>
        )}

        <section className="rounded border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
          <h2 className="text-sm font-medium">Create token</h2>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="claude-code-laptop"
            className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <div className="flex flex-wrap gap-2 text-xs">
            {["vault:read", "vault:write", "search", "chat", "mcp"].map((s) => (
              <label
                key={s}
                className="flex items-center gap-1.5 rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <input
                  type="checkbox"
                  checked={newScopes.includes(s)}
                  onChange={() => toggleScope(s)}
                />
                <span className="font-mono">{s}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={!newName}
            onClick={create}
            className="rounded bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Create
          </button>
          {created && (
            <div className="rounded bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 px-3 py-2 text-xs space-y-1">
              <div>
                Copy <strong>{created.name}</strong> now — you won&apos;t see it again.
              </div>
              <pre className="font-mono break-all whitespace-pre-wrap select-all">
                {created.token}
              </pre>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-medium mb-2">Existing tokens</h2>
          {loading ? (
            <div className="text-sm text-neutral-500">loading…</div>
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{t.name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-neutral-500 border border-neutral-300 dark:border-neutral-700 rounded px-1.5 py-0.5">
                        {t.kind}
                      </span>
                      {t.revoked_at && (
                        <span className="text-[10px] uppercase text-red-600">revoked</span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      {t.scopes.join(", ")}
                    </div>
                  </div>
                  <div className="text-[11px] text-neutral-500 hidden sm:block">
                    {t.last_used_at ? `used ${t.last_used_at}` : "never used"}
                  </div>
                  {!t.revoked_at && (
                    <button
                      type="button"
                      onClick={() => revoke(t.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      revoke
                    </button>
                  )}
                </li>
              ))}
              {!tokens.length && (
                <li className="px-3 py-4 text-sm text-neutral-500">No tokens yet.</li>
              )}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
