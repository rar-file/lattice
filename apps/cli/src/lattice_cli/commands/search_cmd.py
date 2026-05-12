"""`lattice search "<query>"` — hybrid search over the current vault."""

from __future__ import annotations

import asyncio
from pathlib import Path

import click
from rich.console import Console
from rich.panel import Panel

from .._local import load_settings, open_session, recall_vault

console = Console()


@click.command("search")
@click.argument("query")
@click.option("--limit", "-n", type=int, default=10)
@click.option("--mode", type=click.Choice(["hybrid", "vec", "fts"]), default="hybrid")
@click.option("--vault", type=click.Path(exists=True, file_okay=False, path_type=Path), default=None)
def search_cmd(query: str, limit: int, mode: str, vault: Path | None) -> None:
    """Search the current vault. `lattice open` sets the current vault."""
    asyncio.run(_run(query, limit, mode, vault))


async def _run(query: str, limit: int, mode: str, vault: Path | None) -> None:
    settings = load_settings()
    vault_path = vault or recall_vault(settings)
    if vault_path is None:
        console.print("[red]no vault open[/]. Run `lattice open <path>` first or pass --vault.")
        raise SystemExit(2)

    async with open_session(settings, vault_path) as (storage, embedder, _llm, session):
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

    if not hits:
        console.print(f"[yellow]no results for[/] {query!r}")
        return

    for i, h in enumerate(hits, start=1):
        loc = h.note_path
        if h.heading_path:
            loc = f"{loc} :: {h.heading_path}"
        snippet = h.content if len(h.content) <= 300 else h.content[:297] + "…"
        sources = "+".join(h.sources) if h.sources else "?"
        console.print(
            Panel.fit(
                snippet,
                title=f"[bold]{i}.[/] {loc}  [dim](score={h.score:.3f}, {sources})[/]",
                title_align="left",
            )
        )
