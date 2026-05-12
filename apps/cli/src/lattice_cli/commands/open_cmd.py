"""`lattice open <path>` — index a vault and remember it as current."""

from __future__ import annotations

import asyncio
from pathlib import Path

import click
from rich.console import Console

from .._local import load_settings, open_session, remember_vault

console = Console()


@click.command("open")
@click.argument(
    "vault_path", type=click.Path(exists=True, file_okay=False, dir_okay=True, path_type=Path)
)
def open_cmd(vault_path: Path) -> None:
    """Open and index a vault. Subsequent search/chat use this vault by default."""
    asyncio.run(_run(vault_path))


async def _run(vault_path: Path) -> None:
    settings = load_settings()
    async with open_session(settings, vault_path) as (_storage, _embedder, _llm, session):
        report = await session.indexer.index_vault()
    remember_vault(settings, vault_path)
    console.print(
        f"[bold green]opened[/] [cyan]{session.vault.root_path}[/] — "
        f"indexed={report.notes_indexed} skipped={report.notes_skipped} "
        f"chunks={report.chunks_indexed} ({report.duration_seconds:.2f}s)"
    )
