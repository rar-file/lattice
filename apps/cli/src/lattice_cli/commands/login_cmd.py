"""`lattice login` — device-flow auth against a cloud API."""

from __future__ import annotations

import asyncio

import click
from rich.console import Console

from ..auth import device_login, load, save

console = Console()


@click.command("login")
@click.option(
    "--base-url",
    default=None,
    help="Cloud API base URL (default: from config, then https://api.lattice.app)",
)
@click.option("--name", default="cli", help="Device name shown in the tokens UI")
def login_cmd(base_url: str | None, name: str) -> None:
    """Authenticate against a cloud Lattice deployment."""

    auth = load()
    base = base_url or auth.base_url

    async def go() -> str:
        return await device_login(base, name=name)

    token = asyncio.run(go())
    save(base, token)
    console.print(f"[green]signed in[/] to {base}")
    console.print("[dim]token stored in OS keychain (or ~/.lattice/config.json fallback)[/]")


@click.command("logout")
def logout_cmd() -> None:
    """Remove stored credentials."""

    from ..auth import _config_path

    path = _config_path()
    if path.exists():
        path.unlink()
    console.print("[green]signed out[/]")
