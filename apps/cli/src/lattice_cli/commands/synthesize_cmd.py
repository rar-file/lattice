"""`lattice synthesize --week 2026-W19` — weekly synthesis."""

from __future__ import annotations

import asyncio
from pathlib import Path

import click
from rich.console import Console

from .._local import load_settings, open_session, recall_vault

console = Console()


@click.command("synthesize")
@click.option("--week", default=None, help="ISO week label e.g. 2026-W19; default = current week")
@click.option("--dir", "synth_dir", default="Synthesis")
@click.option(
    "--vault", type=click.Path(exists=True, file_okay=False, path_type=Path), default=None
)
def synthesize_cmd(week: str | None, synth_dir: str, vault: Path | None) -> None:
    """Generate a weekly synthesis note in Synthesis/."""
    asyncio.run(_run(week, synth_dir, vault))


async def _run(week: str | None, synth_dir: str, vault: Path | None) -> None:
    settings = load_settings()
    vault_path = vault or recall_vault(settings)
    if vault_path is None:
        console.print("[red]no vault open[/]. Run `lattice open <path>` first or pass --vault.")
        raise SystemExit(2)

    from datetime import UTC, date, timedelta

    from lattice_api.providers.llm import Message, SystemBlock
    from lattice_api.routes.synthesis import SYNTHESIS_SYSTEM, _current_week_label

    async with open_session(settings, vault_path) as (storage, _emb, llm, session):
        label = week or _current_week_label()
        try:
            year_str, week_str = label.split("-W")
            year = int(year_str)
            wnum = int(week_str)
            monday = date.fromisocalendar(year, wnum, 1)
            sunday = monday + timedelta(days=6)
        except ValueError as exc:
            console.print(f"[red]bad week label[/] {label!r}: {exc}")
            raise SystemExit(2) from exc

        all_notes = await storage.list_notes(session.vault.id, limit=10000)
        week_notes = [
            n
            for n in all_notes
            if monday <= n.mtime.astimezone(UTC).date() <= sunday
            and not n.path.startswith(synth_dir.rstrip("/") + "/")
        ]
        if not week_notes:
            body = f"# Synthesis {label}\n\nNo notes were modified this week.\n"
        else:
            parts = []
            for n in week_notes:
                title = n.title or n.path
                head = f"## [[{title}]]\nPath: {n.path}\nModified: {n.mtime.isoformat()}\n\n"
                trunc = n.body if len(n.body) < 4000 else n.body[:4000] + "\n…(truncated)"
                parts.append(head + trunc)
            payload = "\n\n---\n\n".join(parts)
            resp = await llm.chat(
                [Message(role="user", content=payload)],
                system=[SystemBlock(text=SYNTHESIS_SYSTEM.replace("YYYY-Www", label), cache=True)],
                model=settings.default_llm_model,
                max_tokens=1500,
            )
            body = resp.content.strip()

        rel = f"{synth_dir.rstrip('/')}/{label}.md"
        abs_path = Path(session.vault.root_path) / rel
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_text(body, encoding="utf-8")
        await session.indexer.index_file(abs_path)
        console.print(f"[green]synthesized →[/] {rel}")
        console.print(f"[dim]{len(week_notes)} note(s) reviewed[/]")
