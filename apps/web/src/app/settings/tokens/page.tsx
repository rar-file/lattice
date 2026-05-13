"use client";

import type { TokenInfo } from "@lattice/sdk";
import { useCallback, useEffect, useState } from "react";
import { Breadcrumb } from "../../../components/Breadcrumb";
import { CheckIcon, CopyIcon, TrashIcon } from "../../../components/icons";
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
    <main className="min-h-screen" style={{ background: "var(--surface-base)" }}>
      <Breadcrumb trail={[{ label: "Settings" }, { label: "Agent tokens" }]} />

      <div className="mx-auto max-w-3xl px-8 pt-10 pb-16 animate-fade-in">
        <header>
          <h1 className="text-page">Agent tokens</h1>
          <p className="mt-3 text-meta max-w-[58ch]">
            Issue scoped tokens for MCP clients — Claude Desktop, Cursor, custom agents. Each token
            grants only the scopes you check. The plaintext is shown once at creation, then stored
            as a SHA-256 hash.
          </p>
        </header>

        {error && <p className="mt-6 text-meta">{error}</p>}

        <section className="mt-10">
          <h2 className="text-section">New token</h2>

          <div className="mt-6 space-y-6">
            <div>
              <label htmlFor="token-name" className="block text-meta mb-2">
                Name
              </label>
              <input
                id="token-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="claude-code-laptop"
                className="input max-w-md"
              />
              <p className="mt-2 text-caption">
                You'll see this next to last-used timestamps below.
              </p>
            </div>

            <div>
              <div className="block text-meta mb-2">Scopes</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl">
                {Object.entries(SCOPE_DESCRIPTIONS).map(([scope, desc]) => {
                  const on = newScopes.includes(scope);
                  return (
                    <label
                      key={scope}
                      className="flex items-start gap-3 rounded-md px-3 py-3 cursor-pointer transition-colors"
                      style={{
                        background: on ? "var(--surface-active)" : "var(--surface-raised)",
                        color: on ? "var(--text-emphasis)" : "var(--text-default)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleScope(scope)}
                        className="mt-0.5"
                        style={{ accentColor: "var(--accent)" }}
                      />
                      <div className="min-w-0">
                        <div
                          className="font-mono text-[12px]"
                          style={{ color: "var(--text-emphasis)" }}
                        >
                          {scope}
                        </div>
                        <div className="mt-1 text-caption">{desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={!newName || newScopes.length === 0}
                onClick={create}
                className="btn btn-primary"
              >
                Create token
              </button>
            </div>

            {created && (
              <div
                className="mt-2 p-4 rounded-md animate-fade-in"
                style={{ background: "var(--surface-raised)" }}
              >
                <div className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4" style={{ color: "rgb(var(--success))" }} />
                  <span className="text-meta" style={{ color: "var(--text-emphasis)" }}>
                    Copy now — this token won't be shown again
                  </span>
                </div>
                <pre
                  className="mt-3 font-mono text-[12px] break-all whitespace-pre-wrap select-all p-3 rounded"
                  style={{
                    background: "var(--surface-sunken)",
                    color: "var(--text-emphasis)",
                  }}
                >
                  {created.token}
                </pre>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-caption">For {created.name}</span>
                  <button type="button" onClick={copyToken} className="btn btn-ghost btn-xs">
                    <CopyIcon className="h-3.5 w-3.5" />
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-section">Existing tokens</h2>

          <div className="mt-6">
            {loading ? (
              <span className="lattice-skeleton block h-3 w-24" />
            ) : tokens.length === 0 ? (
              <p className="text-meta">No tokens yet — create one above to give an agent access.</p>
            ) : (
              <ul>
                {tokens.map((t) => (
                  <li key={t.id} className="flex items-start gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-body"
                          style={{ color: "var(--text-emphasis)", fontWeight: 500 }}
                        >
                          {t.name}
                        </span>
                        {t.kind !== "agent" && <span className="chip uppercase">{t.kind}</span>}
                        {t.revoked_at && (
                          <span className="chip" style={{ color: "rgb(var(--danger))" }}>
                            Revoked
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {t.scopes.map((s) => (
                          <span key={s} className="chip font-mono">
                            {s}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 text-caption font-mono">
                        {t.last_used_at ? `Last used ${formatDate(t.last_used_at)}` : "Never used"}
                        {" · "}Created {formatDate(t.created_at)}
                      </div>
                    </div>
                    {!t.revoked_at && (
                      <button
                        type="button"
                        onClick={() => revoke(t.id)}
                        className="btn btn-danger btn-xs"
                        aria-label={`Revoke ${t.name}`}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const month = d.toLocaleString(undefined, { month: "short" });
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${month} ${day} · ${hh}:${mm}`;
  } catch {
    return iso;
  }
}
