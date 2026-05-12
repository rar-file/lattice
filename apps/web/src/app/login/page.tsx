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
    <main className="relative min-h-screen overflow-hidden bg-canvas">
      <div className="absolute inset-0 bg-aurora pointer-events-none" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <header className="flex items-center justify-between animate-fade-in">
          <Link href="/" className="focus-ring rounded px-1">
            <LatticeMark />
          </Link>
          <Link
            href="/"
            className="text-xs text-fg-muted hover:text-fg-default transition-colors focus-ring rounded px-1"
          >
            ← Back
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full card-elevated p-7 animate-scale-in">
            <h1 className="text-[22px] font-semibold tracking-tight">Sign in to Lattice</h1>
            <p className="mt-1.5 text-[13px] text-fg-muted leading-relaxed">
              We'll email you a one-time sign-in link. No password to remember, no tracking pixels.
            </p>

            {sent ? (
              <div className="mt-6 rounded-md border border-success/30 bg-success-soft/40 px-4 py-3 animate-fade-in">
                <div className="flex items-center gap-2 text-success">
                  <CheckIcon className="h-4 w-4" />
                  <span className="text-[13px] font-medium">Check your inbox</span>
                </div>
                <p className="mt-1 text-[12.5px] text-fg-muted">
                  A sign-in link is on the way to{" "}
                  <span className="font-medium text-fg-default">{email}</span>. The link is valid
                  for 15 minutes.
                </p>
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="mt-3 text-[11.5px] text-fg-muted hover:text-fg-default underline-offset-2 hover:underline focus-ring rounded px-0.5"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-3">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-[12px] font-medium text-fg-default mb-1.5"
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
              <div className="mt-4 rounded-md bg-danger-soft text-danger px-3 py-2 text-[12px]">
                {error}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-border-subtle text-[11.5px] text-fg-muted leading-relaxed">
              <p>
                Signing in connects your local Lattice to the cloud, enabling sync across devices
                and hosted MCP for AI agents. Your notes remain on your disk; only what you choose
                to push is uploaded.
              </p>
            </div>
          </div>
        </div>

        <footer className="text-center text-[11px] text-fg-faint pt-2">
          Don't have a vault yet?{" "}
          <Link
            href="/"
            className="text-fg-muted hover:text-fg-default underline-offset-2 hover:underline"
          >
            Start local first
          </Link>
        </footer>
      </div>
    </main>
  );
}
