"""Postgres-backed Storage for cloud mode.

M1 only needs `ping` working — cloud sync, search, and chat ship in M2 where
the full storage surface gets implemented against pgvector.
"""

from __future__ import annotations

from pathlib import Path
from typing import NoReturn

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.sql import text

from .models import ChunkInput, Note, SearchHit, Vault


def _not_yet() -> NoReturn:
    raise NotImplementedError("PostgresStorage M1 surface only supports ping; full impl lands in M2")


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

    # M1 surface — not implemented yet. Cloud sync lands in M2. ---------

    async def upsert_vault(self, name: str, root_path: Path) -> Vault:
        _not_yet()

    async def get_vault(self, vault_id: str) -> Vault | None:
        _not_yet()

    async def get_vault_by_path(self, root_path: Path) -> Vault | None:
        _not_yet()

    async def list_vaults(self) -> list[Vault]:
        _not_yet()

    async def register_embedding_provider(self, name: str, dim: int) -> int:
        _not_yet()

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
        _not_yet()

    async def get_note(self, vault_id: str, path: str) -> Note | None:
        _not_yet()

    async def get_note_by_id(self, note_id: str) -> Note | None:
        _not_yet()

    async def list_notes(
        self, vault_id: str, *, prefix: str | None = None, limit: int = 1000
    ) -> list[Note]:
        _not_yet()

    async def delete_note(self, vault_id: str, path: str) -> bool:
        _not_yet()

    async def replace_chunks_for_note(
        self,
        *,
        note_id: str,
        chunks: list[ChunkInput],
        embeddings: list[list[float]],
        embedding_provider_id: int,
    ) -> None:
        _not_yet()

    async def vector_search(
        self,
        *,
        vault_id: str,
        query_embedding: list[float],
        embedding_provider_id: int,
        limit: int = 20,
    ) -> list[SearchHit]:
        _not_yet()

    async def fts_search(
        self, *, vault_id: str, query: str, limit: int = 20
    ) -> list[SearchHit]:
        _not_yet()

    async def hybrid_search(
        self,
        *,
        vault_id: str,
        query: str,
        query_embedding: list[float],
        embedding_provider_id: int,
        limit: int = 10,
    ) -> list[SearchHit]:
        _not_yet()
