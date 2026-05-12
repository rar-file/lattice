"""Vault → chunks → embeddings → storage.

`Indexer.index_vault` walks `*.md` under the vault root, parses frontmatter,
heading-aware-chunks the body, embeds, and upserts. `Indexer.index_file`
re-runs the same pipeline for a single file (used by the watcher).

Chunking strategy:
    * Frontmatter is stripped (it goes into the `frontmatter` column).
    * Body is split into paragraphs (blank-line-separated blocks).
    * Headings (`#…`) update a running heading-path stack, so each chunk
      knows its section.
    * Paragraphs are packed into chunks ≤ MAX_CHARS chars — BGE-small's
      tokenizer caps at 512 tokens, and 1500 chars sits well under that.

The indexer is sync about embedding (one batch per file) but iteration over
files is in a thread to keep the event loop responsive.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from pathlib import Path

import frontmatter
import xxhash

from .providers.embed.protocol import EmbeddingProvider
from .storage.models import ChunkInput
from .storage.protocol import Storage

log = logging.getLogger("lattice.indexer")

MAX_CHARS = 1500


@dataclass(slots=True)
class IndexReport:
    notes_indexed: int = 0
    notes_skipped: int = 0  # unchanged hash, no-op
    notes_failed: int = 0
    chunks_indexed: int = 0
    duration_seconds: float = 0.0


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def _content_hash(raw: bytes) -> str:
    return xxhash.xxh64(raw).hexdigest()


def _split_paragraphs(body: str) -> list[str]:
    # Normalise line endings then split on blank lines.
    body = body.replace("\r\n", "\n").replace("\r", "\n")
    paras = re.split(r"\n\s*\n", body.strip())
    return [p.strip() for p in paras if p.strip()]


def chunk_markdown(body: str) -> list[ChunkInput]:
    """Heading-aware paragraph packing into ≤ MAX_CHARS chunks."""

    chunks: list[ChunkInput] = []
    heading_stack: list[str] = []
    buf: list[str] = []
    buf_heading_path: str | None = None
    buf_chars = 0

    def flush() -> None:
        nonlocal buf, buf_heading_path, buf_chars
        if not buf:
            return
        content = "\n\n".join(buf).strip()
        chunks.append(
            ChunkInput(
                ord=len(chunks),
                content=content,
                heading_path=buf_heading_path,
                token_count=len(content.split()),
            )
        )
        buf = []
        buf_chars = 0
        buf_heading_path = None

    for para in _split_paragraphs(body):
        heading_match = _HEADING_RE.match(para.splitlines()[0]) if para else None
        if heading_match:
            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()
            heading_stack = heading_stack[: level - 1]
            heading_stack.append(title)
            # Headings get their own chunk break — flush first so the next
            # paragraph picks up the new heading_path.
            flush()
            # The heading line itself is small; tag it as its own chunk so
            # queries that match the section title surface the section.
            chunks.append(
                ChunkInput(
                    ord=len(chunks),
                    content=para,
                    heading_path=" > ".join(heading_stack),
                    token_count=len(para.split()),
                )
            )
            continue

        if buf_heading_path is None:
            buf_heading_path = " > ".join(heading_stack) if heading_stack else None
        if buf_chars + len(para) > MAX_CHARS and buf:
            flush()
            buf_heading_path = " > ".join(heading_stack) if heading_stack else None
        buf.append(para)
        buf_chars += len(para)

    flush()
    return chunks


@dataclass(slots=True)
class ParsedNote:
    title: str | None
    frontmatter: dict | None
    body: str
    content_hash: str
    mtime: float
    size: int


def parse_note(path: Path) -> ParsedNote:
    raw = path.read_bytes()
    stat = path.stat()
    try:
        post = frontmatter.loads(raw.decode("utf-8", errors="replace"))
        meta = dict(post.metadata) if post.metadata else None
        body = post.content
    except Exception as e:
        log.warning("frontmatter parse failed for %s: %s", path, e)
        meta = None
        body = raw.decode("utf-8", errors="replace")

    title: str | None = None
    fm_title = meta.get("title") if meta else None
    if isinstance(fm_title, str):
        title = fm_title
    else:
        # Fall back to first H1, else the filename stem.
        for line in body.splitlines():
            m = _HEADING_RE.match(line)
            if m and len(m.group(1)) == 1:
                title = m.group(2).strip()
                break
        if not title:
            title = path.stem

    return ParsedNote(
        title=title,
        frontmatter=meta,
        body=body,
        content_hash=_content_hash(raw),
        mtime=stat.st_mtime,
        size=stat.st_size,
    )


def walk_vault(root: Path) -> list[Path]:
    """All `*.md` paths under root, skipping hidden directories and `.obsidian/`."""
    out: list[Path] = []
    for p in root.rglob("*.md"):
        if any(part.startswith(".") for part in p.relative_to(root).parts):
            continue
        out.append(p)
    return sorted(out)


class Indexer:
    """One indexer instance per (vault, embedding-provider) pair."""

    def __init__(
        self,
        *,
        storage: Storage,
        embedder: EmbeddingProvider,
        vault_id: str,
        vault_root: Path,
        embedding_provider_id: int,
    ) -> None:
        self.storage = storage
        self.embedder = embedder
        self.vault_id = vault_id
        self.vault_root = vault_root.resolve()
        self.embedding_provider_id = embedding_provider_id

    def _relpath(self, path: Path) -> str:
        return str(path.resolve().relative_to(self.vault_root))

    async def index_file(self, path: Path) -> tuple[bool, int]:
        """Index a single file. Returns (changed, n_chunks)."""

        if not path.exists() or path.suffix != ".md":
            return False, 0

        rel = self._relpath(path)
        parsed = parse_note(path)
        existing = await self.storage.get_note(self.vault_id, rel)
        if existing and existing.content_hash == parsed.content_hash:
            return False, 0

        note = await self.storage.upsert_note(
            vault_id=self.vault_id,
            path=rel,
            title=parsed.title,
            content_hash=parsed.content_hash,
            mtime=parsed.mtime,
            size=parsed.size,
            frontmatter=parsed.frontmatter,
            body=parsed.body,
        )
        chunks = chunk_markdown(parsed.body)
        if not chunks:
            await self.storage.replace_chunks_for_note(
                note_id=note.id,
                chunks=[],
                embeddings=[],
                embedding_provider_id=self.embedding_provider_id,
            )
            return True, 0
        embeddings = await self.embedder.embed([c.content for c in chunks])
        await self.storage.replace_chunks_for_note(
            note_id=note.id,
            chunks=chunks,
            embeddings=embeddings,
            embedding_provider_id=self.embedding_provider_id,
        )
        return True, len(chunks)

    async def delete_file(self, path: Path) -> bool:
        rel = self._relpath(path)
        return await self.storage.delete_note(self.vault_id, rel)

    async def index_vault(self) -> IndexReport:
        import time

        start = time.monotonic()
        report = IndexReport()
        paths = walk_vault(self.vault_root)
        for path in paths:
            try:
                changed, n = await self.index_file(path)
                if changed:
                    report.notes_indexed += 1
                    report.chunks_indexed += n
                else:
                    report.notes_skipped += 1
            except Exception:
                log.exception("indexing failed for %s", path)
                report.notes_failed += 1
        report.duration_seconds = time.monotonic() - start
        return report
