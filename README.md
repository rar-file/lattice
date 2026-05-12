# Lattice

An AI-native Obsidian replacement. Markdown files on disk; AI woven through everything.

**Status:** M0 skeleton.

## Layout

```
apps/
  api/        FastAPI — runs --mode=local (SQLite) or --mode=cloud (Postgres+pgvector)
  cli/        Click CLI (`lattice ...`)
  web/        Next.js 15 web app
  desktop/    Tauri 2 desktop wrapper (spawns api as sidecar)
packages/
  sdk-ts/     TS client, generated from OpenAPI
  sdk-py/     Python SDK, shared by api + cli
  shared-schema/  OpenAPI spec, prompts
infra/
  migrations/      Schema (SQL)
  docker-compose.yml  Local Postgres + mailhog
```

## Dev quickstart

```bash
# Python
uv sync

# JS
pnpm install

# API (local mode, SQLite)
uv run lattice-api --mode=local

# API (cloud mode, Postgres via docker)
docker compose -f infra/docker-compose.yml up -d
uv run lattice-api --mode=cloud

# Web
pnpm --filter @lattice/web dev

# CLI
uv run lattice --help
```

See `/root/.claude/plans/shiny-snuggling-micali.md` for the full architecture plan.
