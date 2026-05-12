# Handoff — M1 through M4

Picking this up? Read this, then `docs/architecture.md`, then `/root/.claude/plans/shiny-snuggling-micali.md` for the full original plan. This file is the **scrutinised, simpler** path forward.

## Where we are

**M1 shipped 2026-05-12.** Local-everything is functional end-to-end:
- SqliteStorage with sqlite-vec + FTS5; hybrid search via reciprocal-rank fusion.
- Indexer (heading-aware chunking, xxhash dedup) + watchdog-based reindexer.
- Pluggable providers: `fastembed` (BAAI/bge-small-en-v1.5, 384d) + Anthropic (Claude with prompt caching) + stub for tests.
- HTTP routes: `/vault/{open,close,}`, `/notes`, `/search`, `/chat` (with parsed `[n]` citations).
- Local stdio MCP server (`lattice mcp serve`) exposing `search_notes` / `read_note` / `list_notes`.
- CLI subcommands: `lattice open|search|chat|mcp serve` — talk to lattice_api modules in-process.
- Web app: 3-pane UI (file list / textarea editor / search+chat panel) hitting the API.
- Tauri shell: spawns PyInstaller-packed `lattice-api-<triple>` as a sidecar; vault picker via tauri-plugin-dialog.
- PyInstaller build script: `uv run python apps/desktop/src-tauri/build_sidecar.py`.
- GitHub Actions release workflow: tag `v*` → builds `.dmg` (macOS arm64+intel) and `.msi` (Windows x86_64) and uploads to a draft GitHub release.

21 pytest tests green; pyright + ruff clean; pnpm typecheck clean. Repo public at https://github.com/rar-file/lattice.

M0 baseline reminder: monorepo bootstrapped, FastAPI in two modes, full Postgres schema in `infra/migrations/0001_initial.sql`.

## Locked decisions (don't re-litigate)

- **Local-first**, disk vault is canonical. Cloud sync is opt-in.
- Storage `Protocol` with `SqliteStorage` + `PostgresStorage` impls — one API codebase, two modes.
- AI providers are **pluggable**. Anthropic default (`claude-sonnet-4-6`, `claude-haiku-4-5`). Embeddings default `fastembed` (`BAAI/bge-small-en-v1.5`, 384d).
- Monorepo: uv + pnpm + turbo. Lockfiles committed.

## Cuts from the original plan (and why)

| Cut from | What | Why |
|---|---|---|
| M1 | All auth (magic link, device flow, tokens) | Local mode doesn't need it; auth belongs with cloud |
| M1 | Web app | Useless without sync — pair with M2 |
| M1 | CodeMirror 6 editor | Two weeks of polish doesn't help the wedge; textarea works for v1 |
| M1 | Hosted SSE MCP | Needs cloud + auth — follows them in M2 |
| M2 | Multi-vault per user | One-vault assumption is fine; add when someone complains |
| M2 | Rich token mgmt UI | Plain table is enough |
| M3 | Voice capture (whisper.cpp) | Feature creep — defer indefinitely |

## M1 — Local everything (✅ shipped 2026-05-12)

**The wedge: Tauri at an Obsidian vault, semantic search + chat + MCP for Claude Code. All local, no auth, no cloud.**

What landed (see "Where we are" above for the file-level summary). Verification criteria below were all met during build-out:

- Index an existing vault — `uv run lattice open ~/MyVault` indexes a small vault in <1s; hash-dedup keeps re-runs at ~2ms.
- Edit a note (CLI/desktop/api) → watchdog picks it up within ~1s debounce and reindexes only the changed file.
- Hybrid search returns the right note even when keywords don't match (vector side carries semantic queries; FTS side carries exact-keyword queries; RRF merges).
- `lattice chat "..."` returns an answer with parsed `[1]` citations pointing at real chunks. Anthropic provider sends instructions as a cached system block.
- `lattice mcp serve` exposes `search_notes` / `read_note` / `list_notes` over stdio; works in Claude Code via `claude mcp add lattice -- lattice mcp serve`.

## M2 — Cloud + sync + web + auth + CodeMirror (≈2 weeks)

**Turn it into a product. Now there's a reason for the web app, so CodeMirror lands here.**

### Scope
- Auth: magic link (Resend), device flow (CLI/desktop), per-agent tokens. Token format `latt_<kind>_<base62>`, stored as SHA-256.
- Sync: opt-in. `lattice sync enable`. Debounced 5s push tick. Pull on launch + every 30s. Conflict policy: `path.conflict-<device>-<ts>.md` and keep both.
- Web app: login → vault picker (cloud) → CodeMirror 6 editor (markdown + wikilink autocomplete) → search → chat. Replace the M1 `SimpleEditor` with CodeMirror everywhere (desktop swaps to it too).
- Hosted SSE MCP at `api.lattice.app/mcp/sse` with `Bearer latt_agent_…`. Same tools as local stdio.

### Critical files to create

| File | Purpose |
|---|---|
| `apps/api/src/lattice_api/routes/auth.py` | Magic link, device flow, token endpoints |
| `apps/api/src/lattice_api/routes/sync.py` | Push/pull deltas |
| `apps/api/src/lattice_api/routes/mcp.py` | SSE MCP for cloud |
| `apps/api/src/lattice_api/storage/postgres.py` | Expand to full storage surface |
| `apps/api/src/lattice_api/email.py` | Resend client |
| `apps/cli/src/lattice_cli/auth.py` | Device flow + OS keychain via `keyring` |
| `apps/cli/src/lattice_cli/commands/sync.py` | `lattice sync enable/disable/status` |
| `apps/web/src/app/(auth)/login/page.tsx` | Magic link entry |
| `apps/web/src/app/(auth)/device/page.tsx` | Device-flow confirmation |
| `apps/web/src/app/vault/[...path]/page.tsx` | Editor route |
| `apps/web/src/components/editor/CodeMirrorEditor.tsx` | CM6 + markdown + wikilink plugin |
| `apps/web/src/app/settings/tokens/page.tsx` | Per-agent token mgmt |

### Verification
- Sign up via web magic link → `lattice login` device flow on CLI → same user state on web.
- Edit in desktop → 10s → change visible in web. Edit in web → change pulled to desktop.
- Cause a conflict: edit on A while offline; edit different content on B; reconnect A. Both files preserved as `note.md` and `note.conflict-<device>-<ts>.md`.
- `curl -N -H "Authorization: Bearer latt_agent_…" https://api.lattice.app/mcp/sse` streams a tool list.

## M3 — Ambient links + text capture (≈2 weeks)

**The "AI woven in" milestone.**

### Scope
- `POST /suggest/links` endpoint: takes current paragraph + cursor pos → returns ranked existing notes to link. Debounced 800ms on edit.
- CodeMirror decoration layer: ghost-underline suggested wikilinks. Accept with `⌘.` / `Ctrl+.`. Reject is a no-op (just keep typing).
- `lattice capture "raw thought"` → Claude reformats into an atomic note (title, frontmatter, body) and writes to `Inbox/YYYY-MM-DD-<slug>.md`.
- Tauri tray icon → quick-add text dialog → same capture pipeline.

### Critical files

| File | Purpose |
|---|---|
| `apps/api/src/lattice_api/routes/suggest.py` | `/suggest/links` retrieval + ranking |
| `apps/api/src/lattice_api/routes/capture.py` | Capture → drafted note |
| `apps/api/src/lattice_api/prompts/{link_suggest,capture_draft}.md` | Externalised prompts (cache-friendly) |
| `apps/web/src/components/editor/AmbientLinks.tsx` | CM6 decoration + accept handler |
| `apps/cli/src/lattice_cli/commands/capture.py` | CLI capture |
| `apps/desktop/src-tauri/src/tray.rs` | Tray + quick-add window |

### Verification
- Type a paragraph that mentions a topic you have notes on → see ghost-underlined wikilink suggestion within 1s → `⌘.` accepts.
- `lattice capture "starting on a new postgres replication design with logical slots"` produces `Inbox/2026-05-13-postgres-logical-replication-design.md` with frontmatter, a title, and a short body.

## M4 — Weekly synthesis (≈1 week)

### Scope
- On-launch (local) or cron-triggered (cloud) job, runs at most once per week per user.
- Pulls the week's modified notes + chat sessions, sends to Claude with a synthesis prompt asking for themes, questions surfaced, and loose threads.
- Writes `Synthesis/YYYY-Www.md` with the result. Note links to the source notes via wikilinks (so it's navigable + indexable).

### Critical files

| File | Purpose |
|---|---|
| `apps/api/src/lattice_api/jobs/synthesis.py` | Weekly job |
| `apps/api/src/lattice_api/prompts/weekly_synthesis.md` | Prompt |

### Verification
- Run `lattice synthesize --week 2026-W19` → `Synthesis/2026-W19.md` exists with linked references to source notes from that week.

## Working with the existing codebase

- **Add deps:** `uv add <pkg> --package lattice-api` (or `lattice-cli`); `pnpm --filter @lattice/web add <pkg>`.
- **Run api locally:** `uv run lattice-api --mode=local --port 8787`. The DB lives at `~/.lattice/lattice.db`.
- **Run api cloud:** `docker compose -f infra/docker-compose.yml up -d postgres && uv run lattice-api --mode=cloud`.
- **Tests:** `uv run pytest -v` (21 expected). Don't reintroduce `tests/__init__.py` — it collides between apps.
- **Type check:** `uv run pyright` + `pnpm -r typecheck`. Both must stay green.
- **Format:** `uv run ruff format .` and `pnpm exec biome check --write apps/web/src apps/desktop/src packages` — CI enforces both.
- **Migrations:** new SQL files in `infra/migrations/NNNN_*.sql`. Postgres picks them up via the docker entrypoint. SQLite gets a parallel `sqlite_*.sql` file (different syntax for `vector` and FTS).
- **The plan file** at `/root/.claude/plans/shiny-snuggling-micali.md` has more rationale and the original (more ambitious) version of each milestone if you ever want to add something back.

## Building & releasing Lattice

### From source (dev loop)

1. `uv sync --all-packages && pnpm install`.
2. **API only**, anywhere `uv` works: `uv run lattice-api --mode=local --port 8787`.
3. **CLI**: `uv run lattice open ~/MyVault && uv run lattice search "..."` — talks to lattice_api modules in-process, no api server needed.
4. **Web UI standalone** (great for iterating on React): keep the api running, then `pnpm --filter @lattice/web dev` and hit <http://localhost:3000>. Reads `NEXT_PUBLIC_LATTICE_API_URL` if you need a non-default base URL.
5. **Desktop dev** (Tauri webview + sidecar): build the PyInstaller sidecar once, then `pnpm --filter @lattice/desktop dev`. The Tauri shell auto-spawns `binaries/lattice-api-<triple>` (or `…exe` on Windows) and points the webview at the Next.js dev server.

### Building the PyInstaller sidecar

The Tauri shell needs a self-contained `lattice-api` binary. Build it with:

```bash
uv run python apps/desktop/src-tauri/build_sidecar.py
```

Output: `apps/desktop/src-tauri/binaries/lattice-api-<rustc-host-triple>` (Linux/macOS) or `…<triple>.exe` (Windows). Size is ~90 MB (fastembed + onnxruntime + tokenizers dominate). The script auto-detects the host triple via `rustc -vV`; pass an explicit triple as argv[1] to cross-target the name (the actual compile is still host-only — cross-compilation needs a matching runner). Built binaries are gitignored.

Cache: PyInstaller scratch lives in `.pyinstaller/` (gitignored). Incremental rebuilds are fast (~30s) once warm; cold runs are 2-3 min.

### Building a desktop installer locally

After the sidecar exists:

```bash
pnpm --filter @lattice/web build           # produces apps/web/out/ (static export)
pnpm --filter @lattice/desktop exec tauri build
```

Output lands in `apps/desktop/src-tauri/target/release/bundle/`:
- macOS → `.dmg` under `dmg/`
- Windows → `.msi` under `msi/` (also `.exe` under `nsis/` if NSIS is installed)
- Linux → `.deb` and AppImage under their respective subdirs

Unsigned by default. The first launch will trigger Gatekeeper / SmartScreen warnings — we'll add code signing when distribution becomes a thing.

### Cutting a release (GitHub Actions)

`.github/workflows/release.yml` builds installers across all three desktop platforms and uploads them as draft-release assets. Trigger by pushing a version tag:

```bash
git tag -a v0.1.2 -m "v0.1.2 — what changed"
git push origin v0.1.2
```

Matrix:
- `macos-14` → `aarch64-apple-darwin` → `.dmg`
- `macos-13` → `x86_64-apple-darwin` → `.dmg`
- `windows-latest` → `x86_64-pc-windows-msvc` → `.msi`

Each job rebuilds its own sidecar (so the in-CI PyInstaller has to find every fastembed/onnxruntime hidden import — if a fresh runtime dep appears later, add it to `--collect-all` in `build_sidecar.py`). Linux installers (`.deb` / AppImage) aren't shipped from the matrix yet — add a `ubuntu-24.04` row plus the GTK system-deps step if/when needed.

Manual dry-run: trigger the workflow from the Actions tab via `workflow_dispatch`. Installers upload as workflow artifacts (no release is touched).

Known gotcha: the per-platform job uses Tauri's `externalBin` to wire the sidecar; the binary name must match `lattice-api-<triple>` exactly (with `.exe` on Windows). The build script keeps PyInstaller's per-OS naming, do not "normalise" it.

### Using Lattice with Claude Code

Once you have a vault open:

```bash
claude mcp add lattice -- lattice mcp serve --vault ~/MyVault
```

In a Claude Code session, `search_notes`, `read_note`, and `list_notes` become available. The MCP server reads from the same SQLite DB at `~/.lattice/lattice.db` and reindexes on startup (cheap, hash-deduped).

## What to do first (M2)

M1 is done; M2 is the next milestone (cloud + sync + web + auth + CodeMirror). Suggested order:

1. `uv sync --all-packages && pnpm install`; confirm green: `uv run pytest -v` (21 pass), `uv run lattice-api --mode=local &` + `curl localhost:8787/healthz`.
2. Start M2 with `apps/api/src/lattice_api/routes/auth.py` (magic-link issuance + verification). Auth gates sync; sync gates the web app being more than a curiosity.
3. Once auth + token issuance work, expand `PostgresStorage` to full surface so cloud-mode parity with `SqliteStorage`.
4. Then sync (`apps/api/src/lattice_api/routes/sync.py` + `apps/cli/src/lattice_cli/commands/sync.py`).
5. Web auth pages + CodeMirror editor land last in M2 — they're the user-visible cherry.
