"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRightIcon, CheckIcon, LatticeMark } from "../../components/icons";
import { getClient } from "../../lib/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await getClient().magicStart(email);
      setSent(r.sent);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{ background: "var(--surface-base)" }}
    >
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <header className="flex items-center justify-between animate-fade-in">
          <Link href="/" className="focus-ring rounded px-1">
            <LatticeMark />
          </Link>
          <Link
            href="/"
            className="text-[12px] transition-colors focus-ring rounded px-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            ← Back
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full card-elevated p-7 animate-fade-in">
            <h1 className="text-section">Sign in to Lattice</h1>
            <p className="mt-2 text-meta">
              We'll email you a one-time sign-in link. No password to remember, no tracking pixels.
            </p>

            {sent ? (
              <div
                className="mt-6 rounded-md px-4 py-3 animate-fade-in"
                style={{ background: "var(--surface-hover)" }}
              >
                <div className="flex items-center gap-2" style={{ color: "rgb(var(--success))" }}>
                  <CheckIcon className="h-4 w-4" />
                  <span className="text-[13px]" style={{ fontWeight: 500 }}>
                    Check your inbox
                  </span>
                </div>
                <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  A sign-in link is on the way to{" "}
                  <span style={{ color: "var(--text-emphasis)" }}>{email}</span>. The link is valid
                  for 15 minutes.
                </p>
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="mt-3 text-[12px] focus-ring rounded px-1 transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-3">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-[12px] mb-2"
                    style={{ color: "var(--text-default)", fontWeight: 500 }}
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!email || loading}
                  className="btn btn-primary w-full"
                >
                  {loading ? (
                    "Sending…"
                  ) : (
                    <>
                      Email me a link <ArrowRightIcon className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {error && (
              <div className="mt-4 text-[12px] px-1" style={{ color: "var(--text-secondary)" }}>
                {error}
              </div>
            )}

            <div
              className="mt-6 pt-6 text-caption"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <p>
                Signing in connects your local Lattice to the cloud, enabling sync across devices
                and hosted MCP for AI agents. Your notes remain on your disk; only what you choose
                to push is uploaded.
              </p>
            </div>
          </div>
        </div>

        <footer className="text-center text-[12px] pt-2" style={{ color: "var(--text-tertiary)" }}>
          Don't have a vault yet?{" "}
          <Link href="/" style={{ color: "var(--text-secondary)" }}>
            Start local first
          </Link>
        </footer>
      </div>
    </main>
  );
}
