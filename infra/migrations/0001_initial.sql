-- Lattice initial schema.
-- Target: Postgres 16 + pgvector. The SQLite local impl will mirror this with
-- types adapted (vector -> sqlite-vec virtual table, tsvector -> FTS5).
-- This file is the source of truth.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- Identity
-- ============================================================

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE devices (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ
);

CREATE TABLE tokens (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('session', 'device', 'agent')),
    name          TEXT NOT NULL,
    scopes        JSONB NOT NULL DEFAULT '[]'::jsonb,
    hash          TEXT NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ
);
CREATE INDEX tokens_user_kind_idx ON tokens(user_id, kind) WHERE revoked_at IS NULL;

CREATE TABLE magic_links (
    token_hash   TEXT PRIMARY KEY,
    email        TEXT NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ
);

CREATE TABLE device_codes (
    user_code         TEXT PRIMARY KEY,
    device_code_hash  TEXT UNIQUE NOT NULL,
    expires_at        TIMESTAMPTZ NOT NULL,
    approved_user_id  UUID REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Vault
-- ============================================================

CREATE TABLE vaults (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    root_path   TEXT,           -- local fs path (local mode) or blob prefix (cloud)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id          UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    path              TEXT NOT NULL,
    title             TEXT,
    content_hash      TEXT NOT NULL,           -- xxhash64 of raw bytes
    mtime             TIMESTAMPTZ NOT NULL,
    size              BIGINT NOT NULL,
    frontmatter       JSONB,
    UNIQUE (vault_id, path)
);
CREATE INDEX notes_vault_idx ON notes(vault_id);

CREATE TABLE embedding_providers (
    id    SERIAL PRIMARY KEY,
    name  TEXT UNIQUE NOT NULL,   -- e.g. "fastembed:bge-small-en-v1.5"
    dim   INTEGER NOT NULL
);

CREATE TABLE chunks (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id                  UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    ord                      INTEGER NOT NULL,
    heading_path             TEXT,
    content                  TEXT NOT NULL,
    token_count              INTEGER NOT NULL,
    embedding_provider_id    INTEGER NOT NULL REFERENCES embedding_providers(id),
    -- Dim is enforced at provider granularity; the column accepts any vector
    -- size and queries filter by embedding_provider_id.
    embedding                vector(384),
    UNIQUE (note_id, ord)
);
CREATE INDEX chunks_note_idx ON chunks(note_id);
CREATE INDEX chunks_embedding_hnsw_idx ON chunks
    USING hnsw (embedding vector_cosine_ops);
-- Lexical full-text fallback (used for hybrid search):
CREATE INDEX chunks_content_fts_idx ON chunks
    USING gin (to_tsvector('english', content));

CREATE TABLE links (
    src_note_id   UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    dst_note_id   UUID REFERENCES notes(id) ON DELETE CASCADE,
    dst_unresolved TEXT,    -- when target note doesn't (yet) exist
    anchor        TEXT,
    kind          TEXT NOT NULL CHECK (kind IN ('wikilink', 'markdown', 'suggested', 'accepted', 'rejected')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((dst_note_id IS NULL) <> (dst_unresolved IS NULL))
);
CREATE INDEX links_src_idx ON links(src_note_id);
CREATE INDEX links_dst_idx ON links(dst_note_id);

-- ============================================================
-- Sync (cloud only)
-- ============================================================

CREATE TABLE sync_log (
    id            BIGSERIAL PRIMARY KEY,
    vault_id      UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    op            TEXT NOT NULL CHECK (op IN ('upsert', 'delete', 'rename')),
    path          TEXT NOT NULL,
    new_path      TEXT,                -- only set for renames
    content_hash  TEXT,
    ts            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sync_log_vault_ts_idx ON sync_log(vault_id, ts);

-- ============================================================
-- Chat / recall
-- ============================================================

CREATE TABLE chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id    UUID REFERENCES vaults(id) ON DELETE SET NULL,
    title       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content     TEXT NOT NULL,
    citations   JSONB,                 -- list of {note_id, chunk_id, snippet}
    ts          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_session_idx ON chat_messages(session_id, ts);
