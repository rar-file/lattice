from dataclasses import dataclass, field
from datetime import datetime


@dataclass(slots=True)
class Vault:
    id: str
    name: str
    root_path: str
    created_at: datetime


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
