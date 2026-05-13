"use client";

import { LatticeClient } from "@lattice/sdk";
import { useEffect, useState } from "react";
import { Breadcrumb } from "../../components/Breadcrumb";
import { CheckIcon, XIcon } from "../../components/icons";

type State =
  | { kind: "loading" }
  | { kind: "ok"; mode: "local" | "cloud"; version: string }
  | { kind: "error"; message: string };

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
    <main className="min-h-screen" style={{ background: "var(--surface-base)" }}>
      <Breadcrumb trail={[{ label: "Health" }]} />

      <div className="mx-auto max-w-md px-6 py-10 animate-fade-in">
        <div className="card p-6">
          <h1 className="text-section">API status</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Reachability and mode of the Lattice API this UI is talking to.
          </p>

          <div className="mt-5">
            <Row label="Endpoint" mono>
              {process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787"}
            </Row>
            <Row label="Status">
              {state.kind === "loading" && (
                <span style={{ color: "var(--text-secondary)" }}>Checking…</span>
              )}
              {state.kind === "ok" && (
                <span
                  className="inline-flex items-center gap-1"
                  style={{ color: "rgb(var(--success))" }}
                >
                  <CheckIcon className="h-4 w-4" /> Reachable
                </span>
              )}
              {state.kind === "error" && (
                <span
                  className="inline-flex items-center gap-1"
                  style={{ color: "rgb(var(--danger))" }}
                >
                  <XIcon className="h-4 w-4" /> Unreachable
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
              <div className="mt-3 text-[12px] px-1" style={{ color: "var(--text-secondary)" }}>
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
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </div>
      <div
        className={`text-[13px] text-right ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--text-default)" }}
      >
        {children}
      </div>
    </div>
  );
}
