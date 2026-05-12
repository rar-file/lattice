-- Lattice — SQLite (local mode) schema.
--
-- Mirrors infra/migrations/0001_initial.sql but adapted to SQLite:
--   * TEXT primary keys hold UUIDv4 hex (so IDs round-trip with the cloud schema).
--   * Timestamps are ISO-8601 strings (UTC, no offset).
--   * `vector(384)` becomes a sqlite-vec virtual table (chunks_vec).
--   * Postgres GIN/tsvector lexical index becomes an FTS5 virtual table (chunks_fts).
--   * sync_log + auth tables are omitted (cloud-only; reintroduced in M2).
--
-- Loaded by SqliteStorage.init() at startup; idempotent (every statement uses IF NOT EXISTS
-- or CREATE TABLE that fails cleanly on re-run — we tolerate the OperationalError by
-- splitting on `;` and skipping already-exists).

CREATE TABLE IF NOT EXISTS vaults (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    root_path   TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS notes (
    id            TEXT PRIMARY KEY,
    vault_id      TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    path          TEXT NOT NULL,
    title         TEXT,
    content_hash  TEXT NOT NULL,
    mtime         TEXT NOT NULL,
    size          INTEGER NOT NULL,
    frontmatter   TEXT,        -- JSON
    body          TEXT NOT NULL DEFAULT '',
    indexed_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (vault_id, path)
);
CREATE INDEX IF NOT EXISTS notes_vault_idx ON notes(vault_id);
CREATE INDEX IF NOT EXISTS notes_path_idx ON notes(vault_id, path);

CREATE TABLE IF NOT EXISTS embedding_providers (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT UNIQUE NOT NULL,
    dim   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
    id                     TEXT PRIMARY KEY,
    note_id                TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    ord                    INTEGER NOT NULL,
    heading_path           TEXT,
    content                TEXT NOT NULL,
    token_count            INTEGER NOT NULL,
    embedding_provider_id  INTEGER NOT NULL REFERENCES embedding_providers(id),
    UNIQUE (note_id, ord)
);
CREATE INDEX IF NOT EXISTS chunks_note_idx ON chunks(note_id);

-- sqlite-vec virtual table for vector search. rowid maps to chunks.rowid (we keep them
-- in lockstep by always inserting/deleting both together).
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
    embedding float[384]
);

-- FTS5 virtual table for lexical search. content_rowid links rows back to chunks.rowid.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content,
    tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS links (
    src_note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    dst_note_id     TEXT REFERENCES notes(id) ON DELETE CASCADE,
    dst_unresolved  TEXT,
    anchor          TEXT,
    kind            TEXT NOT NULL CHECK (kind IN ('wikilink', 'markdown', 'suggested', 'accepted', 'rejected')),
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK ((dst_note_id IS NULL) <> (dst_unresolved IS NULL))
);
CREATE INDEX IF NOT EXISTS links_src_idx ON links(src_note_id);
CREATE INDEX IF NOT EXISTS links_dst_idx ON links(dst_note_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT PRIMARY KEY,
    vault_id    TEXT REFERENCES vaults(id) ON DELETE SET NULL,
    title       TEXT,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content     TEXT NOT NULL,
    citations   TEXT,            -- JSON: [{note_id, chunk_id, snippet}, …]
    ts          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages(session_id, ts);
