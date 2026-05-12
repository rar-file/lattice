from dataclasses import dataclass, field
from datetime import datetime


@dataclass(slots=True)
class Vault:
    id: str
    name: str
    root_path: str
    created_at: datetime
    user_id: str | None = None


@dataclass(slots=True)
class Note:
    id: str
    vault_id: str
    path: str
    title: str | None
    content_hash: str
    mtime: datetime
    size: int
    frontmatter: dict | None
    body: str
    indexed_at: datetime


@dataclass(slots=True)
class ChunkInput:
    """A chunk staged for insert. Pair with an embedding in replace_chunks_for_note()."""

    ord: int
    content: str
    heading_path: str | None = None
    token_count: int = 0


@dataclass(slots=True)
class SearchHit:
    note_id: str
    note_path: str
    note_title: str | None
    chunk_id: str
    chunk_ord: int
    heading_path: str | None
    content: str
    score: float
    sources: list[str] = field(default_factory=list)  # ["vec", "fts"] — which searches found it


# ============================================================
# Auth (M2)
# ============================================================


@dataclass(slots=True)
class User:
    id: str
    email: str
    created_at: datetime


@dataclass(slots=True)
class Token:
    id: str
    user_id: str
    kind: str  # 'session' | 'device' | 'agent'
    name: str
    scopes: list[str]
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


@dataclass(slots=True)
class DeviceCodeRecord:
    user_code: str
    name: str
    scopes: list[str]
    expires_at: datetime
    approved_user_id: str | None
    issued_token_id: str | None


# ============================================================
# Sync (M2)
# ============================================================


@dataclass(slots=True)
class SyncLogEntry:
    id: int
    vault_id: str
    op: str  # 'upsert' | 'delete' | 'rename'
    path: str
    new_path: str | None
    content_hash: str | None
    body: str | None
    ts: datetime
