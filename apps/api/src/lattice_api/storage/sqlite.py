"""SQLite-backed Storage for local mode.

Uses two virtual tables to power hybrid search:
    * `chunks_vec` — sqlite-vec vec0 index (cosine on float32[384])
    * `chunks_fts` — FTS5 porter-stemmed lexical index

Both share rowids with `chunks` (we insert into all three in lockstep). Hybrid
search runs the vector and FTS queries separately and merges them with
reciprocal-rank fusion.

Threading: all DB work is synchronous; the async methods wrap blocking calls
with `asyncio.to_thread` so a slow indexing pass doesn't block the event loop.
"""

from __future__ import annotations

import asyncio
import dataclasses
import json
import sqlite3
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

import sqlite_vec

from .models import ChunkInput, Note, SearchHit, Vault


def _migrations_dir() -> Path:
    """Locate the migrations directory.

    1. PyInstaller --onefile unpacks data files under `sys._MEIPASS`; the
       desktop sidecar build adds `--add-data infra/migrations:migrations`
       so the SQL ends up at `<MEIPASS>/migrations/`.
    2. Otherwise (a normal `uv run` checkout), walk up from this file
       until we find `infra/migrations`.
    """
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        bundled = Path(meipass) / "migrations"
        if bundled.is_dir():
            return bundled
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "infra" / "migrations"
        if candidate.is_dir():
            return candidate
    raise RuntimeError(f"could not locate infra/migrations from {here}")


def _migrations() -> list[Path]:
    return [_migrations_dir() / "0002_sqlite_local.sql"]


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _parse_iso(value: str) -> datetime:
    # SQLite default strftime emits no offset; we always write UTC.
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


def _row_to_vault(row: sqlite3.Row) -> Vault:
    return Vault(
        id=row["id"],
        name=row["name"],
        root_path=row["root_path"],
        created_at=_parse_iso(row["created_at"]),
    )


def _row_to_note(row: sqlite3.Row) -> Note:
    return Note(
        id=row["id"],
        vault_id=row["vault_id"],
        path=row["path"],
        title=row["title"],
        content_hash=row["content_hash"],
        mtime=_parse_iso(row["mtime"]),
        size=row["size"],
        frontmatter=json.loads(row["frontmatter"]) if row["frontmatter"] else None,
        body=row["body"],
        indexed_at=_parse_iso(row["indexed_at"]),
    )


class SqliteStorage:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._conn: sqlite3.Connection | None = None
        self._lock = asyncio.Lock()

    # Lifecycle ----------------------------------------------------------

    async def init(self) -> None:
        await asyncio.to_thread(self._sync_init)

    def _sync_init(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path, check_same_thread=False, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA synchronous=NORMAL")
        for migration in _migrations():
            sql = migration.read_text()
            conn.executescript(sql)
        self._conn = conn

    async def close(self) -> None:
        await asyncio.to_thread(self._sync_close)

    def _sync_close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    async def ping(self) -> bool:
        if self._conn is None:
            return False
        return await asyncio.to_thread(lambda: self._conn.execute("SELECT 1").fetchone()[0] == 1)  # type: ignore[union-attr]

    @property
    def _c(self) -> sqlite3.Connection:
        if self._conn is None:
            raise RuntimeError("SqliteStorage not initialised")
        return self._conn

    # Vaults -------------------------------------------------------------

    async def upsert_vault(self, name: str, root_path: Path) -> Vault:
        root = str(root_path.resolve())

        def go() -> Vault:
            row = self._c.execute("SELECT * FROM vaults WHERE root_path=?", (root,)).fetchone()
            if row is not None:
                if row["name"] != name:
                    self._c.execute("UPDATE vaults SET name=? WHERE id=?", (name, row["id"]))
                    row = self._c.execute(
                        "SELECT * FROM vaults WHERE id=?", (row["id"],)
                    ).fetchone()
                return _row_to_vault(row)
            new_id = uuid.uuid4().hex
            self._c.execute(
                "INSERT INTO vaults (id, name, root_path, created_at) VALUES (?, ?, ?, ?)",
                (new_id, name, root, _now_iso()),
            )
            row = self._c.execute("SELECT * FROM vaults WHERE id=?", (new_id,)).fetchone()
            return _row_to_vault(row)

        return await asyncio.to_thread(go)

    async def get_vault(self, vault_id: str) -> Vault | None:
        def go() -> Vault | None:
            row = self._c.execute("SELECT * FROM vaults WHERE id=?", (vault_id,)).fetchone()
            return _row_to_vault(row) if row else None

        return await asyncio.to_thread(go)

    async def get_vault_by_path(self, root_path: Path) -> Vault | None:
        root = str(root_path.resolve())

        def go() -> Vault | None:
            row = self._c.execute("SELECT * FROM vaults WHERE root_path=?", (root,)).fetchone()
            return _row_to_vault(row) if row else None

        return await asyncio.to_thread(go)

    async def list_vaults(self) -> list[Vault]:
        def go() -> list[Vault]:
            rows = self._c.execute("SELECT * FROM vaults ORDER BY created_at").fetchall()
            return [_row_to_vault(r) for r in rows]

        return await asyncio.to_thread(go)

    # Embedding providers ------------------------------------------------

    async def register_embedding_provider(self, name: str, dim: int) -> int:
        def go() -> int:
            row = self._c.execute(
                "SELECT id, dim FROM embedding_providers WHERE name=?", (name,)
            ).fetchone()
            if row is not None:
                if row["dim"] != dim:
                    raise ValueError(
                        f"embedding provider {name!r} previously registered with dim={row['dim']},"
                        f" cannot re-register with dim={dim}"
                    )
                return row["id"]
            cur = self._c.execute(
                "INSERT INTO embedding_providers (name, dim) VALUES (?, ?)", (name, dim)
            )
            return cur.lastrowid  # type: ignore[return-value]

        return await asyncio.to_thread(go)

    # Notes --------------------------------------------------------------

    async def upsert_note(
        self,
        *,
        vault_id: str,
        path: str,
        title: str | None,
        content_hash: str,
        mtime: float,
        size: int,
        frontmatter: dict | None,
        body: str,
    ) -> Note:
        mtime_iso = datetime.fromtimestamp(mtime, tz=UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
        fm_json = json.dumps(frontmatter) if frontmatter else None

        def go() -> Note:
            row = self._c.execute(
                "SELECT id FROM notes WHERE vault_id=? AND path=?", (vault_id, path)
            ).fetchone()
            now = _now_iso()
            if row is None:
                new_id = uuid.uuid4().hex
                self._c.execute(
                    """
                    INSERT INTO notes (
                        id, vault_id, path, title, content_hash, mtime, size,
                        frontmatter, body, indexed_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        new_id,
                        vault_id,
                        path,
                        title,
                        content_hash,
                        mtime_iso,
                        size,
                        fm_json,
                        body,
                        now,
                    ),
                )
                note_id = new_id
            else:
                note_id = row["id"]
                self._c.execute(
                    """
                    UPDATE notes
                       SET title=?, content_hash=?, mtime=?, size=?,
                           frontmatter=?, body=?, indexed_at=?
                     WHERE id=?
                    """,
                    (title, content_hash, mtime_iso, size, fm_json, body, now, note_id),
                )
            full = self._c.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
            return _row_to_note(full)

        return await asyncio.to_thread(go)

    async def get_note(self, vault_id: str, path: str) -> Note | None:
        def go() -> Note | None:
            row = self._c.execute(
                "SELECT * FROM notes WHERE vault_id=? AND path=?", (vault_id, path)
            ).fetchone()
            return _row_to_note(row) if row else None

        return await asyncio.to_thread(go)

    async def get_note_by_id(self, note_id: str) -> Note | None:
        def go() -> Note | None:
            row = self._c.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
            return _row_to_note(row) if row else None

        return await asyncio.to_thread(go)

    async def list_notes(
        self, vault_id: str, *, prefix: str | None = None, limit: int = 1000
    ) -> list[Note]:
        def go() -> list[Note]:
            if prefix:
                rows = self._c.execute(
                    "SELECT * FROM notes WHERE vault_id=? AND path LIKE ? ORDER BY path LIMIT ?",
                    (vault_id, prefix.rstrip("/") + "%", limit),
                ).fetchall()
            else:
                rows = self._c.execute(
                    "SELECT * FROM notes WHERE vault_id=? ORDER BY path LIMIT ?",
                    (vault_id, limit),
                ).fetchall()
            return [_row_to_note(r) for r in rows]

        return await asyncio.to_thread(go)

    async def delete_note(self, vault_id: str, path: str) -> bool:
        def go() -> bool:
            row = self._c.execute(
                "SELECT id FROM notes WHERE vault_id=? AND path=?", (vault_id, path)
            ).fetchone()
            if row is None:
                return False
            note_id = row["id"]
            self._delete_chunks_for_note(note_id)
            self._c.execute("DELETE FROM notes WHERE id=?", (note_id,))
            return True

        return await asyncio.to_thread(go)

    # Chunks -------------------------------------------------------------

    def _delete_chunks_for_note(self, note_id: str) -> None:
        rowids = [
            r["rowid"]
            for r in self._c.execute(
                "SELECT rowid FROM chunks WHERE note_id=?", (note_id,)
            ).fetchall()
        ]
        for rid in rowids:
            self._c.execute("DELETE FROM chunks_vec WHERE rowid=?", (rid,))
            self._c.execute("DELETE FROM chunks_fts WHERE rowid=?", (rid,))
        self._c.execute("DELETE FROM chunks WHERE note_id=?", (note_id,))

    async def replace_chunks_for_note(
        self,
        *,
        note_id: str,
        chunks: list[ChunkInput],
        embeddings: list[list[float]],
        embedding_provider_id: int,
    ) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError(
                f"chunks/embeddings length mismatch: {len(chunks)} vs {len(embeddings)}"
            )

        # The replace is delete-then-insert across three tables — wrap it in a
        # transaction. SQLite serialises writers anyway, but explicit BEGIN
        # only works once at a time on this connection, so we coordinate via
        # `self._lock`.
        async with self._lock:
            await asyncio.to_thread(
                self._sync_replace_chunks, note_id, chunks, embeddings, embedding_provider_id
            )

    def _sync_replace_chunks(
        self,
        note_id: str,
        chunks: list[ChunkInput],
        embeddings: list[list[float]],
        embedding_provider_id: int,
    ) -> None:
        def go() -> None:
            self._c.execute("BEGIN")
            try:
                self._delete_chunks_for_note(note_id)
                for chunk, emb in zip(chunks, embeddings, strict=True):
                    new_id = uuid.uuid4().hex
                    cur = self._c.execute(
                        """
                        INSERT INTO chunks (
                            id, note_id, ord, heading_path, content, token_count,
                            embedding_provider_id
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            new_id,
                            note_id,
                            chunk.ord,
                            chunk.heading_path,
                            chunk.content,
                            chunk.token_count,
                            embedding_provider_id,
                        ),
                    )
                    rid = cur.lastrowid
                    self._c.execute(
                        "INSERT INTO chunks_vec (rowid, embedding) VALUES (?, ?)",
                        (rid, sqlite_vec.serialize_float32(emb)),
                    )
                    self._c.execute(
                        "INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)",
                        (rid, chunk.content),
                    )
                self._c.execute("COMMIT")
            except Exception:
                self._c.execute("ROLLBACK")
                raise

        go()

    # Search -------------------------------------------------------------

    async def vector_search(
        self,
        *,
        vault_id: str,
        query_embedding: list[float],
        embedding_provider_id: int,
        limit: int = 20,
    ) -> list[SearchHit]:
        """Top-`limit` chunks by cosine distance, restricted to the given vault.

        We oversample by 4x from sqlite-vec then filter in Python by vault_id +
        embedding_provider_id, since vec0 MATCH does not compose well with
        joins. For a single-vault local deploy this is effectively no-op.
        """

        oversample = max(limit * 4, 32)
        blob = sqlite_vec.serialize_float32(query_embedding)

        def go() -> list[SearchHit]:
            rows = self._c.execute(
                """
                SELECT v.rowid AS rid, v.distance AS distance,
                       c.id AS chunk_id, c.note_id AS note_id, c.ord AS ord,
                       c.heading_path AS heading_path, c.content AS content,
                       c.embedding_provider_id AS provider_id,
                       n.path AS note_path, n.title AS note_title, n.vault_id AS vault_id
                  FROM chunks_vec v
                  JOIN chunks c ON v.rowid = c.rowid
                  JOIN notes n ON c.note_id = n.id
                 WHERE v.embedding MATCH ?
                   AND v.k = ?
                ORDER BY v.distance
                """,
                (blob, oversample),
            ).fetchall()
            hits: list[SearchHit] = []
            for r in rows:
                if r["vault_id"] != vault_id:
                    continue
                if r["provider_id"] != embedding_provider_id:
                    continue
                # sqlite-vec returns L2 distance for float[] by default; smaller = closer.
                # Convert to a 0..1 similarity-style score (1 = identical).
                score = 1.0 / (1.0 + float(r["distance"]))
                hits.append(
                    SearchHit(
                        note_id=r["note_id"],
                        note_path=r["note_path"],
                        note_title=r["note_title"],
                        chunk_id=r["chunk_id"],
                        chunk_ord=r["ord"],
                        heading_path=r["heading_path"],
                        content=r["content"],
                        score=score,
                        sources=["vec"],
                    )
                )
                if len(hits) >= limit:
                    break
            return hits

        return await asyncio.to_thread(go)

    async def fts_search(self, *, vault_id: str, query: str, limit: int = 20) -> list[SearchHit]:
        clean = _fts_sanitize(query)
        if not clean:
            return []

        def go() -> list[SearchHit]:
            rows = self._c.execute(
                """
                SELECT chunks_fts.rowid AS rid, bm25(chunks_fts) AS bm25,
                       c.id AS chunk_id, c.note_id AS note_id, c.ord AS ord,
                       c.heading_path AS heading_path, c.content AS content,
                       n.path AS note_path, n.title AS note_title
                  FROM chunks_fts
                  JOIN chunks c ON chunks_fts.rowid = c.rowid
                  JOIN notes n ON c.note_id = n.id
                 WHERE chunks_fts MATCH ?
                   AND n.vault_id = ?
                 ORDER BY bm25
                 LIMIT ?
                """,
                (clean, vault_id, limit),
            ).fetchall()
            hits: list[SearchHit] = []
            for r in rows:
                # bm25 in sqlite-fts5 returns lower-is-better; flip sign and squash.
                score = 1.0 / (1.0 + float(r["bm25"]))
                hits.append(
                    SearchHit(
                        note_id=r["note_id"],
                        note_path=r["note_path"],
                        note_title=r["note_title"],
                        chunk_id=r["chunk_id"],
                        chunk_ord=r["ord"],
                        heading_path=r["heading_path"],
                        content=r["content"],
                        score=score,
                        sources=["fts"],
                    )
                )
            return hits

        return await asyncio.to_thread(go)

    async def hybrid_search(
        self,
        *,
        vault_id: str,
        query: str,
        query_embedding: list[float],
        embedding_provider_id: int,
        limit: int = 10,
    ) -> list[SearchHit]:
        """Reciprocal-rank fusion of vector and FTS results.

        RRF with k=60 (the standard from Cormack et al. 2009). Per-hit ranks
        come from each ordered result list; the combined score is
        Σ 1/(k+rank). Both result sets are oversampled to `limit*3` so the
        fusion has room to promote items that appear in both.
        """

        pool = max(limit * 3, 30)
        vec_hits, fts_hits = await asyncio.gather(
            self.vector_search(
                vault_id=vault_id,
                query_embedding=query_embedding,
                embedding_provider_id=embedding_provider_id,
                limit=pool,
            ),
            self.fts_search(vault_id=vault_id, query=query, limit=pool),
        )
        merged: dict[str, SearchHit] = {}
        k = 60.0
        for rank, hit in enumerate(vec_hits, start=1):
            merged[hit.chunk_id] = dataclasses.replace(hit, score=1.0 / (k + rank))
        for rank, hit in enumerate(fts_hits, start=1):
            existing = merged.get(hit.chunk_id)
            rrf = 1.0 / (k + rank)
            if existing is None:
                merged[hit.chunk_id] = dataclasses.replace(hit, score=rrf)
            else:
                existing.score += rrf
                if "fts" not in existing.sources:
                    existing.sources = [*existing.sources, "fts"]
        ranked = sorted(merged.values(), key=lambda h: h.score, reverse=True)
        return ranked[:limit]


# FTS5 has its own query mini-language; user input that contains operators or
# stray quotes can blow up the parser. Wrap each token in double quotes (FTS5
# treats a quoted token as a literal phrase) so arbitrary user queries are safe.
def _fts_sanitize(query: str) -> str:
    tokens = [t for t in query.replace('"', " ").split() if t]
    return " ".join(f'"{t}"' for t in tokens)
