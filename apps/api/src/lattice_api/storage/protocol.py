from pathlib import Path
from typing import Protocol

from .models import ChunkInput, Note, SearchHit, Vault


class Storage(Protocol):
    """Abstract storage layer.

    `SqliteStorage` (local) implements the full M1 surface. `PostgresStorage` (cloud) only
    needs `ping` working for M1 — the rest lands in M2 when cloud sync ships.
    """

    async def init(self) -> None: ...
    async def close(self) -> None: ...
    async def ping(self) -> bool: ...

    # Vaults --------------------------------------------------------------
    async def upsert_vault(self, name: str, root_path: Path) -> Vault: ...
    async def get_vault(self, vault_id: str) -> Vault | None: ...
    async def get_vault_by_path(self, root_path: Path) -> Vault | None: ...
    async def list_vaults(self) -> list[Vault]: ...

    # Embedding providers -------------------------------------------------
    async def register_embedding_provider(self, name: str, dim: int) -> int: ...

    # Notes ---------------------------------------------------------------
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
    ) -> Note: ...

    async def get_note(self, vault_id: str, path: str) -> Note | None: ...
    async def get_note_by_id(self, note_id: str) -> Note | None: ...
    async def list_notes(
        self, vault_id: str, *, prefix: str | None = None, limit: int = 1000
    ) -> list[Note]: ...
    async def delete_note(self, vault_id: str, path: str) -> bool: ...

    # Chunks --------------------------------------------------------------
    async def replace_chunks_for_note(
        self,
        *,
        note_id: str,
        chunks: list[ChunkInput],
        embeddings: list[list[float]],
        embedding_provider_id: int,
    ) -> None: ...

    # Search --------------------------------------------------------------
    async def vector_search(
        self,
        *,
        vault_id: str,
        query_embedding: list[float],
        embedding_provider_id: int,
        limit: int = 20,
    ) -> list[SearchHit]: ...

    async def fts_search(
        self, *, vault_id: str, query: str, limit: int = 20
    ) -> list[SearchHit]: ...

    async def hybrid_search(
        self,
        *,
        vault_id: str,
        query: str,
        query_embedding: list[float],
        embedding_provider_id: int,
        limit: int = 10,
    ) -> list[SearchHit]: ...
