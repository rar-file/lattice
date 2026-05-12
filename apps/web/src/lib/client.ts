import { LatticeClient } from "@lattice/sdk";

let cached: LatticeClient | null = null;

export function getClient(): LatticeClient {
  if (cached) return cached;
  const baseUrl =
    process.env.NEXT_PUBLIC_LATTICE_API_URL ?? "http://127.0.0.1:8787";
  cached = new LatticeClient({ baseUrl });
  return cached;
}
