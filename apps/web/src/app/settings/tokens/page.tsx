"use client";

import type { TokenInfo } from "@lattice/sdk";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckIcon, LatticeMark, PlusIcon, XIcon } from "../../../components/icons";
import { getClient } from "../../../lib/client";

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "vault:read": "Read notes and chunks",
  "vault:write": "Create, update, delete notes",
  search: "Run hybrid search queries",
  chat: "Ask grounded questions",
  mcp: "Connect via MCP",
};

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState<string[]>(["vault:read", "search"]);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function copyToken() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
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
    <main className="min-h-screen bg-canvas">
      <nav className="border-b border-border-subtle bg-surface/60 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-4xl items-center gap-3 px-6">
          <Link href="/" className="focus-ring rounded px-1">
            <LatticeMark />
          </Link>
          <span className="text-fg-faint">/</span>
          <span className="text-[13px] text-fg-default">Settings</span>
          <span className="text-fg-faint">/</span>
          <span className="text-[13px] text-fg-muted">Agent tokens</span>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-10 space-y-8 animate-fade-in">
        <header>
          <h1 className="text-[26px] font-semibold tracking-tight">Agent tokens</h1>
          <p className="mt-2 text-[14px] text-fg-muted leading-relaxed max-w-2xl">
            Issue scoped tokens for MCP clients — Claude, Cursor, custom agents, mobile devices.
            Each token grants only the scopes you check; tokens are shown once at creation, then
            stored as a SHA-256 hash on the server.
          </p>
        </header>

        {error && (
          <div className="rounded-md bg-danger-soft text-danger px-4 py-2.5 text-[12.5px]">
            {error}
          </div>
        )}

        <section className="card p-5">
          <h2 className="text-[14px] font-semibold tracking-tight flex items-center gap-2">
            <PlusIcon className="h-4 w-4 text-accent" />
            Create a token
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="token-name"
                className="block text-[12px] font-medium text-fg-default mb-1.5"
              >
                Name
              </label>
              <input
                id="token-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="claude-code-laptop"
                className="input"
              />
              <p className="mt-1 text-[11.5px] text-fg-muted">
                Pick something memorable — you'll see it in the list below alongside last-used
                timestamps.
              </p>
            </div>

            <div>
              <div className="block text-[12px] font-medium text-fg-default mb-1.5">Scopes</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {Object.entries(SCOPE_DESCRIPTIONS).map(([scope, desc]) => (
                  <label
                    key={scope}
                    className={`flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors
                      ${
                        newScopes.includes(scope)
                          ? "border-accent/40 bg-accent-soft/30"
                          : "border-border-subtle hover:border-border-default"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={newScopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="mt-0.5 accent-[rgb(var(--accent))]"
                    />
                    <div className="min-w-0">
                      <div className="font-mono text-[12px] text-fg-default">{scope}</div>
                      <div className="text-[11.5px] text-fg-muted">{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!newName || newScopes.length === 0}
              onClick={create}
              className="btn btn-primary"
            >
              Create token
            </button>

            {created && (
              <div className="rounded-md border border-warning/30 bg-warning-soft/40 p-3 animate-fade-in">
                <div className="flex items-center gap-2 text-warning">
                  <CheckIcon className="h-4 w-4" />
                  <span className="text-[12.5px] font-medium">
                    Copy now — this token won't be shown again
                  </span>
                </div>
                <pre className="mt-2 font-mono text-[12px] break-all whitespace-pre-wrap select-all text-fg-default bg-surface rounded p-2 border border-border-subtle">
                  {created.token}
                </pre>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11.5px] text-fg-muted">For {created.name}</span>
                  <button type="button" onClick={copyToken} className="btn btn-secondary btn-xs">
                    {copied ? "Copied ✓" : "Copy to clipboard"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[14px] font-semibold tracking-tight mb-3">Existing tokens</h2>
          {loading ? (
            <div className="text-[12px] text-fg-muted">Loading…</div>
          ) : tokens.length === 0 ? (
            <div className="card text-center py-10 px-4">
              <p className="text-[13px] text-fg-muted">
                No tokens yet — create one above to give an agent access.
              </p>
            </div>
          ) : (
            <ul className="card divide-y divide-border-subtle">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13.5px] font-medium text-fg-default">{t.name}</span>
                      <span className="chip uppercase">{t.kind}</span>
                      {t.revoked_at && (
                        <span className="chip text-danger border-danger/30">Revoked</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.scopes.map((s) => (
                        <span key={s} className="chip font-mono">
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 text-[11px] text-fg-muted">
                      {t.last_used_at ? `Last used ${formatDate(t.last_used_at)}` : "Never used"} ·
                      Created {formatDate(t.created_at)}
                    </div>
                  </div>
                  {!t.revoked_at && (
                    <button
                      type="button"
                      onClick={() => revoke(t.id)}
                      className="btn btn-danger btn-xs"
                    >
                      <XIcon className="h-3 w-3" />
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
