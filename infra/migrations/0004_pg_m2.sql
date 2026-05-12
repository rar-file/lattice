-- Lattice — Postgres M2 additions.
-- Extends 0001 with:
--   * body column on notes (we serve note content from DB in cloud mode)
--   * body + new_path columns on sync_log
--   * device_codes.name + .scopes + .issued_token_id columns
--   * indexed_at on notes for parity with SQLite
-- All ALTERs are IF NOT EXISTS so the migration is idempotent.

ALTER TABLE notes ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS body TEXT;

ALTER TABLE device_codes ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'cli';
ALTER TABLE device_codes ADD COLUMN IF NOT EXISTS scopes JSONB NOT NULL
    DEFAULT '["vault:read","vault:write","search","chat"]'::jsonb;
ALTER TABLE device_codes ADD COLUMN IF NOT EXISTS issued_token_id UUID
    REFERENCES tokens(id) ON DELETE SET NULL;
