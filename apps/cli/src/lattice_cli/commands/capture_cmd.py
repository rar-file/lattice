"""`lattice capture "<thought>"` — draft an atomic note into Inbox/."""

from __future__ import annotations

import asyncio
from pathlib import Path

import click
from rich.console import Console

from .._local import load_settings, open_session, recall_vault

console = Console()


@click.command("capture")
@click.argument("text")
@click.option("--source", default="cli")
@click.option("--inbox", default="Inbox")
@click.option(
    "--vault", type=click.Path(exists=True, file_okay=False, path_type=Path), default=None
)
def capture_cmd(text: str, source: str, inbox: str, vault: Path | None) -> None:
    """Convert a raw thought into an atomic note in Inbox/."""
    asyncio.run(_run(text, source, inbox, vault))


async def _run(text: str, source: str, inbox: str, vault: Path | None) -> None:
    settings = load_settings()
    vault_path = vault or recall_vault(settings)
    if vault_path is None:
        console.print("[red]no vault open[/]. Run `lattice open <path>` first or pass --vault.")
        raise SystemExit(2)

    from datetime import UTC, datetime

    from lattice_api.providers.llm import Message, SystemBlock
    from lattice_api.routes.suggest import _CAPTURE_SYSTEM, _slugify, _split_title_and_body

    async with open_session(settings, vault_path) as (_storage, _emb, llm, session):
        resp = await llm.chat(
            [
                Message(
                    role="user",
                    content=(
                        f"Source: {source}\n\nRaw thought:\n{text}\n\nDraft the atomic note now."
                    ),
                )
            ],
            system=[SystemBlock(text=_CAPTURE_SYSTEM, cache=True)],
            model=settings.cheap_llm_model,
            max_tokens=512,
        )
        drafted = resp.content.strip()
        title, _ = _split_title_and_body(drafted)
        slug = _slugify(title)
        date_prefix = datetime.now(UTC).strftime("%Y-%m-%d")
        rel = f"{inbox.rstrip('/')}/{date_prefix}-{slug}.md"
        abs_path = Path(session.vault.root_path) / rel
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_text(drafted, encoding="utf-8")
        await session.indexer.index_file(abs_path)
        console.print(f"[green]captured →[/] {rel}")
