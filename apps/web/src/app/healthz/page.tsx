"use client";

import { LatticeClient } from "@lattice/sdk";
import { useEffect, useState } from "react";

export default function HealthPage() {
  const [state, setState] = useState<string>("checking...");
  useEffect(() => {
    const client = new LatticeClient({
      baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787",
    });
    client
      .health()
      .then((r) => setState(JSON.stringify(r, null, 2)))
      .catch((e) => setState(`error: ${e.message}`));
  }, []);
  return (
    <main className="p-8 font-mono text-sm">
      <pre>{state}</pre>
    </main>
  );
}
