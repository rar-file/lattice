from pathlib import Path
from typing import Protocol

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


class Storage(Protocol):
    """Abstract storage layer.

    `SqliteStorage` (local) and `PostgresStorage` (cloud) both implement the
    full surface — local SQLite is used in cloud-mode unit tests so we don't
    need Postgres in CI.
    """

    async def init(self) -> None: ...
    async def close(self) -> None: ...
    async def ping(self) -> bool: ...

    # Vaults --------------------------------------------------------------
    async def upsert_vault(
        self, name: str, root_path: Path, *, user_id: str | None = None
    ) -> Vault: ...
    async def get_vault(self, vault_id: str) -> Vault | None: ...
    async def get_vault_by_path(self, root_path: Path) -> Vault | None: ...
    async def list_vaults(self, *, user_id: str | None = None) -> list[Vault]: ...

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

    # Auth (M2) -----------------------------------------------------------
    async def upsert_user(self, email: str) -> User: ...
    async def get_user(self, user_id: str) -> User | None: ...
    async def get_user_by_email(self, email: str) -> User | None: ...

    async def create_magic_link(
        self, *, token_hash: str, email: str, expires_at_iso: str
    ) -> None: ...
    async def consume_magic_link(self, *, token_hash: str, now_iso: str) -> str | None:
        """Mark a magic-link token as used and return its email if valid."""
        ...

    async def create_device_code(
        self,
        *,
        user_code: str,
        device_code_hash: str,
        expires_at_iso: str,
        name: str,
        scopes: list[str],
    ) -> None: ...
    async def get_device_code(self, user_code: str) -> DeviceCodeRecord | None: ...
    async def approve_device_code(self, *, user_code: str, user_id: str) -> bool: ...
    async def poll_device_code(
        self, *, device_code_hash: str, now_iso: str
    ) -> tuple[str, DeviceCodeRecord | None]:
        """Returns (status, record|None). status ∈ {pending, expired, ready, invalid, consumed}."""
        ...

    async def mark_device_code_consumed(self, *, device_code_hash: str, token_id: str) -> None: ...

    async def create_token(
        self,
        *,
        user_id: str,
        kind: str,
        name: str,
        scopes: list[str],
        token_hash: str,
    ) -> Token: ...
    async def get_token_by_hash(self, token_hash: str) -> Token | None: ...
    async def list_tokens(self, user_id: str, *, kind: str | None = None) -> list[Token]: ...
    async def revoke_token(self, token_id: str, now_iso: str) -> bool: ...
    async def touch_token(self, token_id: str, now_iso: str) -> None: ...

    # Sync (M2) -----------------------------------------------------------
    async def append_sync_log(
        self,
        *,
        vault_id: str,
        op: str,
        path: str,
        new_path: str | None = None,
        content_hash: str | None = None,
        body: str | None = None,
    ) -> SyncLogEntry: ...
    async def sync_log_since(
        self, *, vault_id: str, since_id: int = 0, limit: int = 500
    ) -> list[SyncLogEntry]: ...
