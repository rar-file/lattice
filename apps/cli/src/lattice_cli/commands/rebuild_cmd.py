"""`lattice rebuild` — wipe every byte of derived state and rebuild from the vault.

The vault on disk is the only source of truth. This command enforces it by
deleting the SQLite database (notes, chunks, embeddings, FTS, vec index) and
re-running the indexer over the vault.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import click
from rich.console import Console

from .._local import load_settings, open_session, recall_vault, remember_vault

console = Console()


@click.command("rebuild")
@click.argument(
    "vault_path",
    type=click.Path(exists=True, file_okay=False, dir_okay=True, path_type=Path),
    required=False,
)
def rebuild_cmd(vault_path: Path | None) -> None:
    """Drop derived state (SQLite + FTS + vec) and reindex the vault from disk."""
    asyncio.run(_run(vault_path))


async def _run(vault_path: Path | None) -> None:
    settings = load_settings()
    target = vault_path or recall_vault(settings)
    if target is None:
        raise click.UsageError("no vault path given and no current vault remembered — pass a path")

    db = settings.sqlite_path
    if db.exists():
        db.unlink()
    wal = db.with_suffix(db.suffix + "-wal")
    shm = db.with_suffix(db.suffix + "-shm")
    if wal.exists():
        wal.unlink()
    if shm.exists():
        shm.unlink()

    async with open_session(settings, target) as (_storage, _embedder, _llm, session):
        report = await session.indexer.index_vault()
    remember_vault(settings, target)
    console.print(
        f"[bold green]rebuilt[/] [cyan]{session.vault.root_path}[/] — "
        f"notes={report.notes_indexed} chunks={report.chunks_indexed} "
        f"({report.duration_seconds:.2f}s)"
    )
