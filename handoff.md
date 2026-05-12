# Handoff — M1 through M4

Picking this up? Read this, then `docs/architecture.md`, then `/root/.claude/plans/shiny-snuggling-micali.md` for the full original plan. This file is the **scrutinised, simpler** path forward.

## Where we are

M0 shipped (commit `227b7cc`). Monorepo bootstrapped, FastAPI boots in `--mode=local` (SQLite) and `--mode=cloud` (Postgres+pgvector) from one codebase. CLI, Next.js, and Tauri shells exist. Full Postgres schema is in `infra/migrations/0001_initial.sql`. 4 pytest tests green; pyright + ruff clean. Repo public at https://github.com/rar-file/lattice.

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

## M1 — Local everything (≈2 weeks)

**Ship the wedge: point Tauri at an Obsidian vault, get semantic search + chat + MCP for Claude Code. All local, no auth, no cloud.**

### Scope
- Vault open: folder picker → walk `*.md` → parse frontmatter → chunk → embed → insert into SQLite + `sqlite-vec` virtual table.
- Watcher (`watchdog`) reindexes on save (debounce 1s).
- Hybrid search: vector (sqlite-vec) + FTS5 lexical, merged by reciprocal-rank-fusion.
- `/chat` endpoint: retrieval (top-k chunks) → Claude completion → response with inline `[1]…[n]` citations.
- Desktop: Tauri spawns the API as a sidecar (PyInstaller-packed). Vault picker via `tauri-plugin-dialog`. UI: file list left, **plain `<textarea>` editor** middle, search/chat panel right. Save flushes to disk.
- CLI: `lattice open <path>`, `lattice search "..."`, `lattice chat "..."`, `lattice mcp serve`.
- **Local stdio MCP server** with tools: `search_notes(query, limit?)`, `read_note(path)`, `list_notes(prefix?)`. This is the moat — it's what makes Claude Code/Cursor read your vault.

### Critical files to create

| File | Purpose |
|---|---|
| `apps/api/src/lattice_api/indexer.py` | Markdown → chunks → embeddings |
| `apps/api/src/lattice_api/watcher.py` | watchdog wrapper, debounce |
| `apps/api/src/lattice_api/storage/sqlite.py` | Expand: notes, chunks, sqlite-vec, FTS5 |
| `apps/api/src/lattice_api/providers/anthropic.py` | Claude impl + prompt caching for vault context |
| `apps/api/src/lattice_api/providers/embed/fastembed_provider.py` | Local default |
| `apps/api/src/lattice_api/routes/{vault,search,chat}.py` | HTTP routes |
| `apps/api/src/lattice_api/mcp_server.py` | stdio MCP entrypoint |
| `apps/cli/src/lattice_cli/commands/{open,search,chat,mcp}.py` | CLI subcommands |
| `apps/desktop/src-tauri/src/lib.rs` | Sidecar spawn + lifecycle |
| `apps/desktop/src-tauri/binaries/lattice-api-*` | PyInstaller-packed sidecar binary |
| `apps/web/src/components/editor/SimpleEditor.tsx` | textarea-based editor (also used by desktop) |
| `infra/migrations/0002_sqlite_local.sql` | sqlite-vec + FTS5 setup for local mode |

### Verification

- Drop an existing Obsidian vault into a folder; `lattice open ~/MyVault` indexes a 1k-note vault within 30s.
- Edit a note in desktop, see it reindex within 2s (watchdog).
- Semantic query returns the right note even when keywords don't match.
- `lattice chat "what did I write about postgres replication?"` → cited answer with valid `[1]` link to a real note.
- Add to Claude Code's MCP config: `claude mcp add lattice lattice mcp serve`. From a Claude Code session, `search_notes` returns real vault results.

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
- **Tests:** `uv run pytest -v`. Don't reintroduce `tests/__init__.py` — it collides between apps.
- **Type check:** `uv run pyright` + `pnpm -r typecheck`. Both must stay green.
- **Migrations:** new SQL files in `infra/migrations/NNNN_*.sql`. Postgres picks them up via the docker entrypoint. SQLite gets a parallel `sqlite_*.sql` file (different syntax for `vector` and FTS).
- **The plan file** at `/root/.claude/plans/shiny-snuggling-micali.md` has more rationale and the original (more ambitious) version of each milestone if you ever want to add something back.

## What to do first

1. `cd /root/lattice && uv sync --all-packages && pnpm install`.
2. Confirm M0 still works: `uv run pytest -v` (4 pass), `uv run lattice-api --mode=local &` + `curl localhost:8787/healthz` returns `{"ok":true,"mode":"local",…}`.
3. Start M1 with `apps/api/src/lattice_api/indexer.py` — markdown chunking is the building block everything else depends on.
