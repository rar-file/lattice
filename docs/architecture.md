# Lattice Architecture (M0)

See the full implementation plan at `/root/.claude/plans/shiny-snuggling-micali.md` for the
multi-milestone roadmap. This file captures the M0 surface only.

## What ships in M0

- Monorepo bootstrap (uv + pnpm + turbo).
- `apps/api`: FastAPI that boots in two modes:
  - `--mode=local` → SQLite (`~/.lattice/lattice.db`), no auth.
  - `--mode=cloud` → Postgres + pgvector (docker-compose), auth required (TODO M1).
- `apps/cli`: Click skeleton with `hello`, `serve` (spawns local api).
- `apps/web`: Next.js 15 hello-world with a `/healthz` page that pings the api.
- `apps/desktop`: Tauri 2 shell pointing at the Next.js dev server. Sidecar wiring lands M1.
- `packages/{sdk-ts,sdk-py,shared-schema}`: stubs + OpenAPI seed.
- `infra/migrations/0001_initial.sql`: full schema (users, vaults, notes, chunks, links,
  sync_log, chat, tokens). Loaded automatically by `pgvector/pgvector` container on first
  boot.

## Modes

The single FastAPI codebase serves both topologies. The storage layer is a `Protocol`
(`apps/api/src/lattice_api/storage/protocol.py`) with two impls:

- `SqliteStorage` — file-backed, no auth needed.
- `PostgresStorage` — pool + pgvector.

`build_storage(settings)` in `modes.py` is the factory. Routes never know which one
they're talking to.

## Verifying M0

```bash
# Python install
uv sync --all-packages

# JS install
pnpm install

# Run tests
uv run pytest -v

# Boot api (local)
uv run lattice-api --mode=local --port 8787 &
curl http://127.0.0.1:8787/healthz
# -> {"ok":true,"mode":"local","version":"0.0.0"}

# Boot api (cloud)
docker compose -f infra/docker-compose.yml up -d postgres
uv run lattice-api --mode=cloud --port 8788
curl http://127.0.0.1:8788/healthz
# -> {"ok":true,"mode":"cloud","version":"0.0.0"}

# CLI
uv run lattice hello

# Web (dev)
pnpm --filter @lattice/web dev
# Browse http://localhost:3000 and http://localhost:3000/healthz
```
