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

export interface VaultInfo {
  id: string;
  name: string;
  root_path: string;
}

export interface IndexSummary {
  notes_indexed: number;
  notes_skipped: number;
  notes_failed: number;
  chunks_indexed: number;
  duration_seconds: number;
}

export interface OpenVaultResponse {
  vault: VaultInfo;
  indexed: IndexSummary;
}

export interface NoteSummary {
  path: string;
  title: string | null;
  size: number;
}

export interface NoteFull {
  path: string;
  title: string | null;
  frontmatter: Record<string, unknown> | null;
  body: string;
  size: number;
  content_hash: string;
}

export interface SearchHit {
  note_id: string;
  note_path: string;
  note_title: string | null;
  chunk_id: string;
  chunk_ord: number;
  heading_path: string | null;
  content: string;
  score: number;
  sources: string[];
}

export type SearchMode = "hybrid" | "vec" | "fts";

export interface Citation {
  n: number;
  note_id: string;
  note_path: string;
  note_title: string | null;
  chunk_id: string;
  heading_path: string | null;
  snippet: string;
}

export interface ChatResponseBody {
  answer: string;
  citations: Citation[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
  };
}

export class LatticeClient {
  constructor(private readonly opts: LatticeClientOptions) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.token) h.Authorization = `Bearer ${this.opts.token}`;
    return h;
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  health(): Promise<HealthResponse> {
    return this.req<HealthResponse>("/healthz");
  }

  openVault(rootPath: string, name?: string): Promise<OpenVaultResponse> {
    return this.req<OpenVaultResponse>("/vault/open", {
      method: "POST",
      body: JSON.stringify({ root_path: rootPath, name: name ?? null }),
    });
  }

  initVault(rootPath: string, name?: string): Promise<OpenVaultResponse> {
    return this.req<OpenVaultResponse>("/vault/init", {
      method: "POST",
      body: JSON.stringify({ root_path: rootPath, name: name ?? null }),
    });
  }

  closeVault(): Promise<{ closed: boolean }> {
    return this.req<{ closed: boolean }>("/vault/close", { method: "POST" });
  }

  currentVault(): Promise<VaultInfo | null> {
    return this.req<VaultInfo | null>("/vault");
  }

  listNotes(prefix?: string, limit = 1000): Promise<NoteSummary[]> {
    const params = new URLSearchParams();
    if (prefix) params.set("prefix", prefix);
    params.set("limit", String(limit));
    return this.req<NoteSummary[]>(`/notes?${params}`);
  }

  getNote(path: string): Promise<NoteFull> {
    return this.req<NoteFull>(`/notes/${encodeNotePath(path)}`);
  }

  putNote(path: string, body: string): Promise<NoteFull> {
    return this.req<NoteFull>(`/notes/${encodeNotePath(path)}`, {
      method: "PUT",
      body: JSON.stringify({ body }),
    });
  }

  deleteNote(path: string): Promise<{ deleted_disk: boolean; deleted_db: boolean }> {
    return this.req(`/notes/${encodeNotePath(path)}`, { method: "DELETE" });
  }

  renameNote(oldPath: string, newPath: string): Promise<NoteFull> {
    return this.req<NoteFull>(`/notes-rename/${encodeNotePath(oldPath)}`, {
      method: "POST",
      body: JSON.stringify({ new_path: newPath }),
    });
  }

  search(q: string, opts: { limit?: number; mode?: SearchMode } = {}): Promise<SearchHit[]> {
    const params = new URLSearchParams({ q });
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.mode) params.set("mode", opts.mode);
    return this.req<SearchHit[]>(`/search?${params}`);
  }

  chat(
    query: string,
    opts: { topK?: number; model?: string; maxTokens?: number } = {},
  ): Promise<ChatResponseBody> {
    return this.req<ChatResponseBody>("/chat", {
      method: "POST",
      body: JSON.stringify({
        query,
        top_k: opts.topK ?? 8,
        model: opts.model ?? null,
        max_tokens: opts.maxTokens ?? 1024,
      }),
    });
  }

  // ---- Auth (M2) -----------------------------------------------------

  magicStart(email: string): Promise<{ sent: boolean }> {
    return this.req("/auth/magic/start", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  magicConsume(token: string): Promise<{ user_id: string; session_token: string }> {
    return this.req(`/auth/magic/consume?token=${encodeURIComponent(token)}`);
  }

  whoami(): Promise<{ user_id: string; email: string; scopes: string[]; mode: string }> {
    return this.req("/auth/whoami");
  }

  deviceApprove(userCode: string): Promise<{ approved: boolean }> {
    return this.req("/auth/device/approve", {
      method: "POST",
      body: JSON.stringify({ user_code: userCode }),
    });
  }

  listTokens(): Promise<TokenInfo[]> {
    return this.req<TokenInfo[]>("/auth/tokens");
  }

  createAgentToken(
    name: string,
    scopes: string[] = ["vault:read", "search"],
  ): Promise<{ info: TokenInfo; token: string }> {
    return this.req("/auth/tokens", {
      method: "POST",
      body: JSON.stringify({ name, scopes }),
    });
  }

  revokeToken(id: string): Promise<{ revoked: boolean }> {
    return this.req(`/auth/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // ---- Suggest / capture / synthesize -------------------------------

  suggestLinks(
    paragraph: string,
    opts: { cursorOffset?: number; limit?: number } = {},
  ): Promise<{ suggestions: LinkSuggestion[] }> {
    return this.req("/suggest/links", {
      method: "POST",
      body: JSON.stringify({
        paragraph,
        cursor_offset: opts.cursorOffset ?? null,
        limit: opts.limit ?? 5,
      }),
    });
  }

  capture(
    text: string,
    opts: { source?: string; inboxDir?: string } = {},
  ): Promise<{ path: string; title: string; body: string }> {
    return this.req("/capture", {
      method: "POST",
      body: JSON.stringify({
        text,
        source: opts.source ?? null,
        inbox_dir: opts.inboxDir ?? "Inbox",
      }),
    });
  }

  synthesize(
    opts: { week?: string; inboxDir?: string } = {},
  ): Promise<{ path: string; week: string; n_notes: number; body: string }> {
    return this.req("/synthesize", {
      method: "POST",
      body: JSON.stringify({ week: opts.week ?? null, inbox_dir: opts.inboxDir ?? "Synthesis" }),
    });
  }

  setToken(token: string | null): void {
    (this.opts as { token?: string }).token = token ?? undefined;
  }
}

export interface TokenInfo {
  id: string;
  kind: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface LinkSuggestion {
  path: string;
  title: string | null;
  score: number;
  snippet: string;
  anchor: string | null;
}

// Encode each segment of a path so slashes stay as path separators but
// spaces/unicode are percent-encoded. Reject `..` segments at the SDK boundary
// as well — defence in depth alongside the API's _safe_resolve.
function encodeNotePath(p: string): string {
  return p
    .split("/")
    .map((seg) => {
      if (seg === ".." || seg === ".") throw new Error(`unsafe path segment: ${seg}`);
      return encodeURIComponent(seg);
    })
    .join("/");
}
