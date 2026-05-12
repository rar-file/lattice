-- Lattice — SQLite auth + sync tables (M2).
--
-- These mirror the auth + sync_log tables from 0001_initial.sql (Postgres),
-- adapted for SQLite. They live here so that:
--   * cloud-mode unit tests can run against SQLite without spinning up Postgres,
--   * the same Storage protocol method bodies work in both impls.
-- Local-mode (unix-socket) deployments never touch these tables.

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS devices (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_seen_at  TEXT
);

CREATE TABLE IF NOT EXISTS tokens (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('session', 'device', 'agent')),
    name          TEXT NOT NULL,
    scopes        TEXT NOT NULL DEFAULT '[]',
    hash          TEXT NOT NULL UNIQUE,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_used_at  TEXT,
    revoked_at    TEXT
);
CREATE INDEX IF NOT EXISTS tokens_user_kind_idx ON tokens(user_id, kind);

CREATE TABLE IF NOT EXISTS magic_links (
    token_hash   TEXT PRIMARY KEY,
    email        TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    consumed_at  TEXT
);

CREATE TABLE IF NOT EXISTS device_codes (
    user_code         TEXT PRIMARY KEY,
    device_code_hash  TEXT UNIQUE NOT NULL,
    name              TEXT NOT NULL DEFAULT 'cli',
    scopes            TEXT NOT NULL DEFAULT '["vault:read","vault:write","search","chat"]',
    expires_at        TEXT NOT NULL,
    approved_user_id  TEXT REFERENCES users(id) ON DELETE CASCADE,
    issued_token_id   TEXT REFERENCES tokens(id) ON DELETE SET NULL
);

-- vaults gained user_id in M2 for cloud mode. Local mode keeps NULL.
-- We can't ALTER ADD COLUMN IF NOT EXISTS in SQLite < 3.35; do it via a
-- best-effort try block. Multi-statement script + executescript will tolerate
-- errors only if we use a CREATE-trigger trick. Simpler: detect via pragma.
-- This is done in Python (SqliteStorage._sync_init) rather than SQL.

CREATE TABLE IF NOT EXISTS sync_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    vault_id      TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    op            TEXT NOT NULL CHECK (op IN ('upsert', 'delete', 'rename')),
    path          TEXT NOT NULL,
    new_path      TEXT,
    content_hash  TEXT,
    body          TEXT,
    ts            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sync_log_vault_ts_idx ON sync_log(vault_id, ts);
