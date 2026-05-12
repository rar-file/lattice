"""Local stdio MCP server.

Exposes three tools that let Claude Code / Cursor / any MCP client read the
user's vault directly:

    * `search_notes(query, limit?, mode?)` — hybrid/vec/fts search
    * `read_note(path)`  — full note body + frontmatter
    * `list_notes(prefix?, limit?)` — listing

Run via `lattice mcp serve --vault <path>`. On startup we open the vault
(idempotent — re-runs are cheap because hash-based dedup skips unchanged
files), then serve over stdio. No filesystem watcher: an editor's writes
won't be picked up until the next reindex or the next time the API/desktop
opens the vault. That's fine for v1; the desktop app *is* the watcher.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from .config import Mode, Settings
from .indexer import parse_note
from .providers.embed.protocol import EmbeddingProvider
from .providers.registry import get_embedding_provider
from .session import VaultSession, open_vault_session
from .storage.protocol import Storage
from .storage.sqlite import SqliteStorage

log = logging.getLogger("lattice.mcp")


def build_server(storage: Storage, embedder: EmbeddingProvider, session: VaultSession) -> FastMCP:
    mcp = FastMCP("lattice")

    @mcp.tool()
    async def search_notes(query: str, limit: int = 10, mode: str = "hybrid") -> list[dict]:
        """Search the vault.

        mode: "hybrid" (default) | "vec" | "fts".
        Returns a list of hits with note_path, heading_path, content, and score.
        """
        if mode == "fts":
            hits = await storage.fts_search(vault_id=session.vault.id, query=query, limit=limit)
        elif mode == "vec":
            [q_emb] = await embedder.embed([query])
            hits = await storage.vector_search(
                vault_id=session.vault.id,
                query_embedding=q_emb,
                embedding_provider_id=session.embedding_provider_id,
                limit=limit,
            )
        else:
            [q_emb] = await embedder.embed([query])
            hits = await storage.hybrid_search(
                vault_id=session.vault.id,
                query=query,
                query_embedding=q_emb,
                embedding_provider_id=session.embedding_provider_id,
                limit=limit,
            )
        return [
            {
                "note_path": h.note_path,
                "note_title": h.note_title,
                "heading_path": h.heading_path,
                "content": h.content,
                "score": h.score,
                "sources": h.sources,
            }
            for h in hits
        ]

    @mcp.tool()
    async def read_note(path: str) -> dict:
        """Read a note by its vault-relative path. Returns title, frontmatter, and body.

        Reads from disk (not the index) so the response is always current.
        """
        root = Path(session.vault.root_path).resolve()
        candidate = (root / path).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as e:
            raise ValueError(f"path escapes vault root: {path}") from e
        if not candidate.exists():
            raise FileNotFoundError(f"note not found: {path}")
        parsed = parse_note(candidate)
        return {
            "path": path,
            "title": parsed.title,
            "frontmatter": parsed.frontmatter,
            "body": parsed.body,
        }

    @mcp.tool()
    async def list_notes(prefix: str | None = None, limit: int = 200) -> list[dict]:
        """List notes in the vault, optionally filtered by path prefix."""
        notes = await storage.list_notes(session.vault.id, prefix=prefix, limit=limit)
        return [{"path": n.path, "title": n.title, "size": n.size} for n in notes]

    return mcp


async def _bootstrap(vault_path: Path) -> tuple[Storage, EmbeddingProvider, VaultSession]:
    settings = Settings(mode=Mode.LOCAL)
    storage = SqliteStorage(settings.sqlite_path)
    await storage.init()
    embedder = get_embedding_provider(settings)
    session = await open_vault_session(
        storage=storage,
        embedder=embedder,
        root_path=vault_path,
        start_watcher=False,
    )
    report = await session.indexer.index_vault()
    log.info(
        "vault ready: indexed=%d skipped=%d chunks=%d in %.2fs",
        report.notes_indexed,
        report.notes_skipped,
        report.chunks_indexed,
        report.duration_seconds,
    )
    return storage, embedder, session


def run_stdio(vault_path: Path) -> None:
    """Open the vault and serve MCP over stdio. Blocks until the client disconnects."""
    logging.basicConfig(
        level=logging.INFO,
        # MCP uses stdout for the protocol; logs MUST go to stderr.
        stream=sys.stderr,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
    )
    storage, embedder, session = asyncio.run(_bootstrap(vault_path))
    try:
        mcp = build_server(storage, embedder, session)
        mcp.run()
    finally:
        asyncio.run(storage.close())


def cli() -> None:
    parser = argparse.ArgumentParser(prog="lattice-mcp")
    parser.add_argument("--vault", required=True, help="Vault root path")
    args = parser.parse_args()
    run_stdio(Path(args.vault).expanduser().resolve())


def describe_tools() -> str:
    """JSON descriptor of the tool surface — used by smoke tests."""
    return json.dumps(
        {
            "tools": [
                {
                    "name": "search_notes",
                    "args": ["query", "limit?", "mode?"],
                },
                {"name": "read_note", "args": ["path"]},
                {"name": "list_notes", "args": ["prefix?", "limit?"]},
            ]
        }
    )


if __name__ == "__main__":
    cli()
