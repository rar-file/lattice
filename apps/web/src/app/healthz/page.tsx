"use client";

import { LatticeClient } from "@lattice/sdk";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckIcon, LatticeMark, XIcon } from "../../components/icons";

type State =
  | { kind: "loading" }
  | { kind: "ok"; mode: "local" | "cloud"; version: string }
  | { kind: "error"; message: string };

/**
 * Visible health page — useful when debugging connectivity or showing the user
 * "yes, the API is reachable and here's which mode it's in". Keep it simple
 * and information-dense.
 */
export default function HealthPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const client = new LatticeClient({
      baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787",
    });
    client
      .health()
      .then((r) => setState({ kind: "ok", mode: r.mode, version: r.version }))
      .catch((e) =>
        setState({ kind: "error", message: e instanceof Error ? e.message : String(e) }),
      );
  }, []);

  return (
    <main className="min-h-screen bg-canvas">
      <nav className="border-b border-border-subtle bg-surface/60 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-2xl items-center gap-3 px-6">
          <Link href="/" className="focus-ring rounded px-1">
            <LatticeMark />
          </Link>
          <span className="text-fg-faint">/</span>
          <span className="text-[13px] text-fg-muted">Health</span>
        </div>
      </nav>

      <div className="mx-auto max-w-md px-6 py-12 animate-fade-in">
        <div className="card p-6">
          <h1 className="text-[18px] font-semibold tracking-tight">API status</h1>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            Reachability and mode of the Lattice API this UI is talking to.
          </p>

          <div className="mt-5 space-y-2">
            <Row label="Endpoint" mono>
              {process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787"}
            </Row>
            <Row label="Status">
              {state.kind === "loading" && <span className="text-fg-muted">Checking…</span>}
              {state.kind === "ok" && (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckIcon className="h-3.5 w-3.5" /> Reachable
                </span>
              )}
              {state.kind === "error" && (
                <span className="inline-flex items-center gap-1 text-danger">
                  <XIcon className="h-3.5 w-3.5" /> Unreachable
                </span>
              )}
            </Row>
            {state.kind === "ok" && (
              <>
                <Row label="Mode">
                  <span className="chip uppercase">{state.mode}</span>
                </Row>
                <Row label="Version" mono>
                  {state.version}
                </Row>
              </>
            )}
            {state.kind === "error" && (
              <div className="mt-3 rounded-md bg-danger-soft text-danger px-3 py-2 text-[12px]">
                {state.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border-subtle last:border-b-0">
      <div className="text-[12px] text-fg-muted">{label}</div>
      <div className={`text-[12.5px] text-fg-default text-right ${mono ? "font-mono" : ""}`}>
        {children}
      </div>
    </div>
  );
}
