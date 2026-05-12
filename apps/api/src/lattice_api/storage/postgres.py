"""Postgres-backed Storage for cloud mode.

Mirrors SqliteStorage. Uses raw SQL via SQLAlchemy's async core (no ORM) so the
two impls stay shape-for-shape comparable.

Vector search uses pgvector cosine distance; lexical search uses tsvector +
plainto_tsquery. Hybrid search is reciprocal-rank fusion done in Python
(matches the SQLite impl).
"""

from __future__ import annotations

import dataclasses
import logging
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.sql import text

from .models import (
    ChunkInput,
    DeviceCodeRecord,
    Note,
    SearchHit,
    SyncLogEntry,
    Token,
    User,
    Vault,
)

log = logging.getLogger("lattice.storage.postgres")


def _row_to_note(row: Any) -> Note:
    return Note(
        id=str(row.id),
        vault_id=str(row.vault_id),
        path=row.path,
        title=row.title,
        content_hash=row.content_hash,
        mtime=row.mtime,
        size=row.size,
        frontmatter=row.frontmatter,
        body=row.body or "",
        indexed_at=row.indexed_at,
    )


def _row_to_vault(row: Any) -> Vault:
    return Vault(
        id=str(row.id),
        name=row.name,
        root_path=row.root_path or "",
        created_at=row.created_at,
        user_id=str(row.user_id) if row.user_id else None,
    )


def _row_to_user(row: Any) -> User:
    return User(id=str(row.id), email=row.email, created_at=row.created_at)


def _row_to_token(row: Any) -> Token:
    scopes = row.scopes if isinstance(row.scopes, list) else (row.scopes or [])
    return Token(
        id=str(row.id),
        user_id=str(row.user_id),
        kind=row.kind,
        name=row.name,
        scopes=list(scopes),
        created_at=row.created_at,
        last_used_at=row.last_used_at,
        revoked_at=row.revoked_at,
    )


def _row_to_device_code(row: Any) -> DeviceCodeRecord:
    scopes = row.scopes if isinstance(row.scopes, list) else (row.scopes or [])
    return DeviceCodeRecord(
        user_code=row.user_code,
        name=row.name,
        scopes=list(scopes),
        expires_at=row.expires_at,
        approved_user_id=str(row.approved_user_id) if row.approved_user_id else None,
        issued_token_id=str(row.issued_token_id) if row.issued_token_id else None,
    )


def _row_to_sync(row: Any) -> SyncLogEntry:
    return SyncLogEntry(
        id=int(row.id),
        vault_id=str(row.vault_id),
        op=row.op,
        path=row.path,
        new_path=row.new_path,
        content_hash=row.content_hash,
        body=row.body,
        ts=row.ts,
    )


class PostgresStorage:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self._engine: AsyncEngine | None = None

    async def init(self) -> None:
        self._engine = create_async_engine(self.database_url, pool_pre_ping=True)

    async def close(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None

    async def ping(self) -> bool:
        if self._engine is None:
            return False
        async with self._engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            return result.scalar() == 1

    @property
    def _eng(self) -> AsyncEngine:
        if self._engine is None:
            raise RuntimeError("PostgresStorage not initialised")
        return self._engine

    # Vaults --------------------------------------------------------------

    async def upsert_vault(
        self, name: str, root_path: Path, *, user_id: str | None = None
    ) -> Vault:
        root = str(root_path.resolve())
        async with self._eng.begin() as conn:
            row = (
                await conn.execute(
                    text("SELECT * FROM vaults WHERE root_path = :rp"),
                    {"rp": root},
                )
            ).first()
            if row is not None:
                if row.name != name:
                    await conn.execute(
                        text("UPDATE vaults SET name=:n WHERE id=:id"),
                        {"n": name, "id": row.id},
                    )
                    row = (
                        await conn.execute(
                            text("SELECT * FROM vaults WHERE id=:id"), {"id": row.id}
                        )
                    ).first()
                return _row_to_vault(row)
            inserted = (
                await conn.execute(
                    text(
                        """
                        INSERT INTO vaults (user_id, name, root_path)
                        VALUES (:uid, :n, :rp)
                        RETURNING *
                        """
                    ),
                    {"uid": user_id, "n": name, "rp": root},
                )
            ).first()
            return _row_to_vault(inserted)

    async def get_vault(self, vault_id: str) -> Vault | None:
        async with self._eng.connect() as conn:
            row = (
                await conn.execute(text("SELECT * FROM vaults WHERE id=:id"), {"id": vault_id})
            ).first()
            return _row_to_vault(row) if row else None

    async def get_vault_by_path(self, root_path: Path) -> Vault | None:
        root = str(root_path.resolve())
        async with self._eng.connect() as conn:
            row = (
                await conn.execute(text("SELECT * FROM vaults WHERE root_path=:rp"), {"rp": root})
            ).first()
            return _row_to_vault(row) if row else None

    async def list_vaults(self, *, user_id: str | None = None) -> list[Vault]:
        async with self._eng.connect() as conn:
            if user_id:
                rows = (
                    await conn.execute(
                        text("SELECT * FROM vaults WHERE user_id=:uid ORDER BY created_at"),
                        {"uid": user_id},
                    )
                ).fetchall()
            else:
                rows = (
                    await conn.execute(text("SELECT * FROM vaults ORDER BY created_at"))
                ).fetchall()
            return [_row_to_vault(r) for r in rows]

    # Embedding providers ------------------------------------------------

    async def register_embedding_provider(self, name: str, dim: int) -> int:
        async with self._eng.begin() as conn:
            row = (
                await conn.execute(
                    text("SELECT id, dim FROM embedding_providers WHERE name=:n"), {"n": name}
                )
            ).first()
            if row is not None:
                if row.dim != dim:
                    raise ValueError(
                        f"embedding provider {name!r} previously registered with dim={row.dim}"
                    )
                return int(row.id)
            inserted = (
                await conn.execute(
                    text(
                        "INSERT INTO embedding_providers (name, dim) VALUES (:n, :d) RETURNING id"
                    ),
                    {"n": name, "d": dim},
                )
            ).first()
            assert inserted is not None
            return int(inserted.id)

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
        import json
        from datetime import UTC, datetime

        mtime_dt = datetime.fromtimestamp(mtime, tz=UTC)
        fm_json = json.dumps(frontmatter) if frontmatter else None

        async with self._eng.begin() as conn:
            row = (
                await conn.execute(
                    text("SELECT id FROM notes WHERE vault_id=:v AND path=:p"),
                    {"v": vault_id, "p": path},
                )
            ).first()
            if row is None:
                inserted = (
                    await conn.execute(
                        text(
                            """
                            INSERT INTO notes (
                                vault_id, path, title, content_hash, mtime, size,
                                frontmatter, body, indexed_at
                            )
                            VALUES (:v, :p, :t, :h, :m, :s, CAST(:fm AS JSONB), :b, now())
                            RETURNING *
                            """
                        ),
                        {
                            "v": vault_id,
                            "p": path,
                            "t": title,
                            "h": content_hash,
                            "m": mtime_dt,
                            "s": size,
                            "fm": fm_json,
                            "b": body,
                        },
                    )
                ).first()
                return _row_to_note(inserted)
            updated = (
                await conn.execute(
                    text(
                        """
                        UPDATE notes
                           SET title=:t, content_hash=:h, mtime=:m, size=:s,
                               frontmatter=CAST(:fm AS JSONB), body=:b, indexed_at=now()
                         WHERE id=:id
                        RETURNING *
                        """
                    ),
                    {
                        "id": row.id,
                        "t": title,
                        "h": content_hash,
                        "m": mtime_dt,
                        "s": size,
                        "fm": fm_json,
                        "b": body,
                    },
                )
            ).first()
            return _row_to_note(updated)

    async def get_note(self, vault_id: str, path: str) -> Note | None:
        async with self._eng.connect() as conn:
            row = (
                await conn.execute(
                    text("SELECT * FROM notes WHERE vault_id=:v AND path=:p"),
                    {"v": vault_id, "p": path},
                )
            ).first()
            return _row_to_note(row) if row else None

    async def get_note_by_id(self, note_id: str) -> Note | None:
        async with self._eng.connect() as conn:
            row = (
                await conn.execute(text("SELECT * FROM notes WHERE id=:id"), {"id": note_id})
            ).first()
            return _row_to_note(row) if row else None

    async def list_notes(
        self, vault_id: str, *, prefix: str | None = None, limit: int = 1000
    ) -> list[Note]:
        async with self._eng.connect() as conn:
            if prefix:
                rows = (
                    await conn.execute(
                        text(
                            "SELECT * FROM notes WHERE vault_id=:v AND path LIKE :p"
                            " ORDER BY path LIMIT :l"
                        ),
                        {"v": vault_id, "p": prefix.rstrip("/") + "%", "l": limit},
                    )
                ).fetchall()
            else:
                rows = (
                    await conn.execute(
                        text("SELECT * FROM notes WHERE vault_id=:v ORDER BY path LIMIT :l"),
                        {"v": vault_id, "l": limit},
                    )
                ).fetchall()
            return [_row_to_note(r) for r in rows]

    async def delete_note(self, vault_id: str, path: str) -> bool:
        async with self._eng.begin() as conn:
            result = await conn.execute(
                text("DELETE FROM notes WHERE vault_id=:v AND path=:p"),
                {"v": vault_id, "p": path},
            )
            return (result.rowcount or 0) > 0

    # Chunks -------------------------------------------------------------

    async def replace_chunks_for_note(
        self,
        *,
        note_id: str,
        chunks: list[ChunkInput],
        embeddings: list[list[float]],
        embedding_provider_id: int,
    ) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError(f"chunks/embeddings mismatch: {len(chunks)} vs {len(embeddings)}")
        async with self._eng.begin() as conn:
            await conn.execute(text("DELETE FROM chunks WHERE note_id=:n"), {"n": note_id})
            for chunk, emb in zip(chunks, embeddings, strict=True):
                await conn.execute(
                    text(
                        """
                        INSERT INTO chunks (
                            note_id, ord, heading_path, content, token_count,
                            embedding_provider_id, embedding
                        ) VALUES (:n, :o, :h, :c, :t, :p, :e)
                        """
                    ),
                    {
                        "n": note_id,
                        "o": chunk.ord,
                        "h": chunk.heading_path,
                        "c": chunk.content,
                        "t": chunk.token_count,
                        "p": embedding_provider_id,
                        "e": _pgvector_literal(emb),
                    },
                )

    # Search -------------------------------------------------------------

    async def vector_search(
        self,
        *,
        vault_id: str,
        query_embedding: list[float],
        embedding_provider_id: int,
        limit: int = 20,
    ) -> list[SearchHit]:
        async with self._eng.connect() as conn:
            rows = (
                await conn.execute(
                    text(
                        """
                        SELECT c.id AS chunk_id, c.note_id AS note_id, c.ord AS ord,
                               c.heading_path AS heading_path, c.content AS content,
                               n.path AS note_path, n.title AS note_title,
                               (c.embedding <=> :q) AS distance
                          FROM chunks c
                          JOIN notes n ON c.note_id = n.id
                         WHERE n.vault_id = :v AND c.embedding_provider_id = :p
                         ORDER BY c.embedding <=> :q
                         LIMIT :l
                        """
                    ),
                    {
                        "q": _pgvector_literal(query_embedding),
                        "v": vault_id,
                        "p": embedding_provider_id,
                        "l": limit,
                    },
                )
            ).fetchall()
            return [
                SearchHit(
                    note_id=str(r.note_id),
                    note_path=r.note_path,
                    note_title=r.note_title,
                    chunk_id=str(r.chunk_id),
                    chunk_ord=r.ord,
                    heading_path=r.heading_path,
                    content=r.content,
                    score=1.0 / (1.0 + float(r.distance)),
                    sources=["vec"],
                )
                for r in rows
            ]

    async def fts_search(self, *, vault_id: str, query: str, limit: int = 20) -> list[SearchHit]:
        if not query.strip():
            return []
        async with self._eng.connect() as conn:
            rows = (
                await conn.execute(
                    text(
                        """
                        SELECT c.id AS chunk_id, c.note_id AS note_id, c.ord AS ord,
                               c.heading_path AS heading_path, c.content AS content,
                               n.path AS note_path, n.title AS note_title,
                               ts_rank(to_tsvector('english', c.content),
                                       plainto_tsquery('english', :q)) AS rank
                          FROM chunks c
                          JOIN notes n ON c.note_id = n.id
                         WHERE n.vault_id = :v
                           AND to_tsvector('english', c.content)
                                @@ plainto_tsquery('english', :q)
                         ORDER BY rank DESC
                         LIMIT :l
                        """
                    ),
                    {"q": query, "v": vault_id, "l": limit},
                )
            ).fetchall()
            return [
                SearchHit(
                    note_id=str(r.note_id),
                    note_path=r.note_path,
                    note_title=r.note_title,
                    chunk_id=str(r.chunk_id),
                    chunk_ord=r.ord,
                    heading_path=r.heading_path,
                    content=r.content,
                    score=float(r.rank),
                    sources=["fts"],
                )
                for r in rows
            ]

    async def hybrid_search(
        self,
        *,
        vault_id: str,
        query: str,
        query_embedding: list[float],
        embedding_provider_id: int,
        limit: int = 10,
    ) -> list[SearchHit]:
        import asyncio

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
        return sorted(merged.values(), key=lambda h: h.score, reverse=True)[:limit]

    # Auth ---------------------------------------------------------------

    async def upsert_user(self, email: str) -> User:
        async with self._eng.begin() as conn:
            row = (
                await conn.execute(text("SELECT * FROM users WHERE email=:e"), {"e": email})
            ).first()
            if row is not None:
                return _row_to_user(row)
            inserted = (
                await conn.execute(
                    text("INSERT INTO users (email) VALUES (:e) RETURNING *"), {"e": email}
                )
            ).first()
            return _row_to_user(inserted)

    async def get_user(self, user_id: str) -> User | None:
        async with self._eng.connect() as conn:
            row = (
                await conn.execute(text("SELECT * FROM users WHERE id=:id"), {"id": user_id})
            ).first()
            return _row_to_user(row) if row else None

    async def get_user_by_email(self, email: str) -> User | None:
        async with self._eng.connect() as conn:
            row = (
                await conn.execute(text("SELECT * FROM users WHERE email=:e"), {"e": email})
            ).first()
            return _row_to_user(row) if row else None

    async def create_magic_link(self, *, token_hash: str, email: str, expires_at_iso: str) -> None:
        async with self._eng.begin() as conn:
            await conn.execute(
                text("INSERT INTO magic_links (token_hash, email, expires_at) VALUES (:h, :e, :x)"),
                {"h": token_hash, "e": email, "x": expires_at_iso},
            )

    async def consume_magic_link(self, *, token_hash: str, now_iso: str) -> str | None:
        async with self._eng.begin() as conn:
            row = (
                await conn.execute(
                    text(
                        "SELECT email, expires_at, consumed_at FROM magic_links WHERE token_hash=:h"
                    ),
                    {"h": token_hash},
                )
            ).first()
            if row is None or row.consumed_at is not None:
                return None
            if row.expires_at.isoformat().replace("+00:00", "Z") < now_iso:
                return None
            await conn.execute(
                text("UPDATE magic_links SET consumed_at=:n WHERE token_hash=:h"),
                {"n": now_iso, "h": token_hash},
            )
            return row.email

    async def create_device_code(
        self,
        *,
        user_code: str,
        device_code_hash: str,
        expires_at_iso: str,
        name: str,
        scopes: list[str],
    ) -> None:
        import json

        async with self._eng.begin() as conn:
            await conn.execute(
                text(
                    """
                    INSERT INTO device_codes
                      (user_code, device_code_hash, expires_at, name, scopes)
                    VALUES (:u, :h, :x, :n, CAST(:s AS JSONB))
                    """
                ),
                {
                    "u": user_code,
                    "h": device_code_hash,
                    "x": expires_at_iso,
                    "n": name,
                    "s": json.dumps(scopes),
                },
            )

    async def get_device_code(self, user_code: str) -> DeviceCodeRecord | None:
        async with self._eng.connect() as conn:
            row = (
                await conn.execute(
                    text("SELECT * FROM device_codes WHERE user_code=:u"), {"u": user_code}
                )
            ).first()
            return _row_to_device_code(row) if row else None

    async def approve_device_code(self, *, user_code: str, user_id: str) -> bool:
        async with self._eng.begin() as conn:
            result = await conn.execute(
                text(
                    "UPDATE device_codes SET approved_user_id=:uid"
                    " WHERE user_code=:u AND approved_user_id IS NULL"
                ),
                {"uid": user_id, "u": user_code},
            )
            return (result.rowcount or 0) > 0

    async def poll_device_code(
        self, *, device_code_hash: str, now_iso: str
    ) -> tuple[str, DeviceCodeRecord | None]:
        async with self._eng.connect() as conn:
            row = (
                await conn.execute(
                    text("SELECT * FROM device_codes WHERE device_code_hash=:h"),
                    {"h": device_code_hash},
                )
            ).first()
            if row is None:
                return "invalid", None
            rec = _row_to_device_code(row)
            if rec.issued_token_id is not None:
                return "consumed", rec
            if row.expires_at.isoformat().replace("+00:00", "Z") < now_iso:
                return "expired", rec
            if rec.approved_user_id is None:
                return "pending", rec
            return "ready", rec

    async def mark_device_code_consumed(self, *, device_code_hash: str, token_id: str) -> None:
        async with self._eng.begin() as conn:
            await conn.execute(
                text("UPDATE device_codes SET issued_token_id=:t WHERE device_code_hash=:h"),
                {"t": token_id, "h": device_code_hash},
            )

    async def create_token(
        self,
        *,
        user_id: str,
        kind: str,
        name: str,
        scopes: list[str],
        token_hash: str,
    ) -> Token:
        import json

        async with self._eng.begin() as conn:
            inserted = (
                await conn.execute(
                    text(
                        """
                        INSERT INTO tokens (user_id, kind, name, scopes, hash)
                        VALUES (:u, :k, :n, CAST(:s AS JSONB), :h)
                        RETURNING *
                        """
                    ),
                    {
                        "u": user_id,
                        "k": kind,
                        "n": name,
                        "s": json.dumps(scopes),
                        "h": token_hash,
                    },
                )
            ).first()
            return _row_to_token(inserted)

    async def get_token_by_hash(self, token_hash: str) -> Token | None:
        async with self._eng.connect() as conn:
            row = (
                await conn.execute(text("SELECT * FROM tokens WHERE hash=:h"), {"h": token_hash})
            ).first()
            return _row_to_token(row) if row else None

    async def list_tokens(self, user_id: str, *, kind: str | None = None) -> list[Token]:
        async with self._eng.connect() as conn:
            if kind:
                rows = (
                    await conn.execute(
                        text(
                            "SELECT * FROM tokens WHERE user_id=:u AND kind=:k"
                            " ORDER BY created_at DESC"
                        ),
                        {"u": user_id, "k": kind},
                    )
                ).fetchall()
            else:
                rows = (
                    await conn.execute(
                        text("SELECT * FROM tokens WHERE user_id=:u ORDER BY created_at DESC"),
                        {"u": user_id},
                    )
                ).fetchall()
            return [_row_to_token(r) for r in rows]

    async def revoke_token(self, token_id: str, now_iso: str) -> bool:
        async with self._eng.begin() as conn:
            result = await conn.execute(
                text("UPDATE tokens SET revoked_at=:n WHERE id=:id AND revoked_at IS NULL"),
                {"n": now_iso, "id": token_id},
            )
            return (result.rowcount or 0) > 0

    async def touch_token(self, token_id: str, now_iso: str) -> None:
        async with self._eng.begin() as conn:
            await conn.execute(
                text("UPDATE tokens SET last_used_at=:n WHERE id=:id"),
                {"n": now_iso, "id": token_id},
            )

    # Sync ---------------------------------------------------------------

    async def append_sync_log(
        self,
        *,
        vault_id: str,
        op: str,
        path: str,
        new_path: str | None = None,
        content_hash: str | None = None,
        body: str | None = None,
    ) -> SyncLogEntry:
        async with self._eng.begin() as conn:
            inserted = (
                await conn.execute(
                    text(
                        """
                        INSERT INTO sync_log (vault_id, op, path, new_path, content_hash, body)
                        VALUES (:v, :o, :p, :np, :h, :b)
                        RETURNING *
                        """
                    ),
                    {
                        "v": vault_id,
                        "o": op,
                        "p": path,
                        "np": new_path,
                        "h": content_hash,
                        "b": body,
                    },
                )
            ).first()
            return _row_to_sync(inserted)

    async def sync_log_since(
        self, *, vault_id: str, since_id: int = 0, limit: int = 500
    ) -> list[SyncLogEntry]:
        async with self._eng.connect() as conn:
            rows = (
                await conn.execute(
                    text(
                        "SELECT * FROM sync_log WHERE vault_id=:v AND id > :s"
                        " ORDER BY id ASC LIMIT :l"
                    ),
                    {"v": vault_id, "s": since_id, "l": limit},
                )
            ).fetchall()
            return [_row_to_sync(r) for r in rows]


def _pgvector_literal(values: list[float]) -> str:
    """Render a Python list as a pgvector literal: '[1.0, 2.0, …]'."""
    return "[" + ",".join(f"{v:.6f}" for v in values) + "]"
