export const SDK_VERSION = "0.0.0";

export interface HealthResponse {
  ok: boolean;
  mode: "local" | "cloud";
  version: string;
}

export interface LatticeClientOptions {
  baseUrl: string;
  token?: string;
}

export class LatticeClient {
  constructor(private readonly opts: LatticeClientOptions) {}

  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.opts.baseUrl}/healthz`, {
      headers: this.opts.token ? { Authorization: `Bearer ${this.opts.token}` } : undefined,
    });
    if (!res.ok) throw new Error(`health failed: ${res.status}`);
    return (await res.json()) as HealthResponse;
  }
}
