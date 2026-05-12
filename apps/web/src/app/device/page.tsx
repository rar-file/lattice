"use client";

import { useState } from "react";
import { getClient } from "../../lib/client";

export default function DevicePage() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("idle");
    setError(null);
    try {
      const r = await getClient().deviceApprove(code.toUpperCase().trim());
      setStatus(r.approved ? "ok" : "error");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="flex h-screen items-center justify-center bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
        <h1 className="text-lg font-medium">Approve device</h1>
        <p className="text-sm text-neutral-500">Enter the code shown by your CLI or desktop app.</p>
        {status === "ok" ? (
          <div className="rounded bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-200 px-3 py-2 text-sm">
            Approved — the device will pick up its token within a few seconds.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCD-1234"
              className="w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm font-mono tracking-widest text-center outline-none focus:border-neutral-500 uppercase"
            />
            <button
              type="submit"
              disabled={!code}
              className="w-full rounded bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 px-3 py-2 text-sm disabled:opacity-50"
            >
              Approve
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
