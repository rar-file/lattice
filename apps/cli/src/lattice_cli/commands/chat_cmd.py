"""`lattice chat "<query>"` — ask Claude over the current vault, with citations."""

from __future__ import annotations

import asyncio
from pathlib import Path

import click
from lattice_api.chat import chat_with_vault
from rich.console import Console

from .._local import load_settings, open_session, recall_vault

console = Console()


@click.command("chat")
@click.argument("query")
@click.option("--top-k", "-k", type=int, default=8)
@click.option("--vault", type=click.Path(exists=True, file_okay=False, path_type=Path), default=None)
@click.option("--model", default=None)
def chat_cmd(query: str, top_k: int, vault: Path | None, model: str | None) -> None:
    """Chat with the vault. Falls back to a stub reply if LATTICE_ANTHROPIC_API_KEY is unset."""
    asyncio.run(_run(query, top_k, vault, model))


async def _run(query: str, top_k: int, vault: Path | None, model: str | None) -> None:
    settings = load_settings()
    vault_path = vault or recall_vault(settings)
    if vault_path is None:
        console.print("[red]no vault open[/]. Run `lattice open <path>` first or pass --vault.")
        raise SystemExit(2)

    async with open_session(settings, vault_path) as (storage, embedder, llm, session):
        [q_emb] = await embedder.embed([query])
        hits = await storage.hybrid_search(
            vault_id=session.vault.id,
            query=query,
            query_embedding=q_emb,
            embedding_provider_id=session.embedding_provider_id,
            limit=top_k,
        )
        result = await chat_with_vault(llm=llm, query=query, hits=hits, model=model)

    console.print(result.answer)
    if result.citations:
        console.print()
        console.print("[bold]citations[/]")
        for c in result.citations:
            loc = c.note_path if not c.heading_path else f"{c.note_path} :: {c.heading_path}"
            console.print(f"  [{c.n}] [cyan]{loc}[/]")
    console.print(
        f"\n[dim]model={result.model} in={result.input_tokens} out={result.output_tokens} "
        f"cached={result.cached_input_tokens}[/]"
    )
