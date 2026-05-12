"use client";

import { useState } from "react";
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
    <main className="flex h-screen items-center justify-center bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
        <h1 className="text-lg font-medium">Sign in to Lattice</h1>
        <p className="text-sm text-neutral-500">
          We&apos;ll email a one-time sign-in link. No password needed.
        </p>
        {sent ? (
          <div className="rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-200 px-3 py-2 text-sm">
            Check your inbox — a sign-in link is on the way to <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              disabled={!email || loading}
              className="w-full rounded bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 px-3 py-2 text-sm disabled:opacity-50"
            >
              {loading ? "sending…" : "Email me a link"}
            </button>
          </form>
        )}
        {error && (
          <div className="rounded bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-200 text-xs px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
