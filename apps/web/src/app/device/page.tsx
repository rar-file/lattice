"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckIcon, LatticeMark } from "../../components/icons";
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
    <main className="relative min-h-screen overflow-hidden bg-canvas">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
        <header className="flex items-center justify-between animate-fade-in">
          <Link href="/" className="focus-ring rounded px-1">
            <LatticeMark />
          </Link>
        </header>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full card-elevated p-7 animate-scale-in">
            <h1 className="text-[20px] font-medium tracking-tight">Approve a device</h1>
            <p className="mt-2 text-[13px] text-fg-muted leading-relaxed">
              Enter the 4-by-4 code shown by your Lattice CLI, desktop, or mobile app. The device
              will pick up its token within a few seconds of approval.
            </p>

            {status === "ok" ? (
              <div className="mt-6 rounded-md border border-success/30 bg-success-soft/40 px-4 py-3 animate-fade-in">
                <div className="flex items-center gap-2 text-success">
                  <CheckIcon className="h-4 w-4" />
                  <span className="text-[13px] font-medium">Device approved</span>
                </div>
                <p className="mt-1 text-[13px] text-fg-muted">
                  You can close this window and return to the device that was waiting.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-3">
                <div>
                  <label
                    htmlFor="device-code"
                    className="block text-[12px] font-medium text-fg-default mb-2"
                  >
                    Device code
                  </label>
                  <input
                    id="device-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ABCD-1234"
                    className="input font-mono uppercase text-center tracking-[0.3em] text-[16px]"
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={!code} className="btn btn-primary w-full">
                  Approve device
                </button>
              </form>
            )}

            {error && status === "error" && (
              <div className="mt-4 text-[12px] text-fg-muted px-1">{error}</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
