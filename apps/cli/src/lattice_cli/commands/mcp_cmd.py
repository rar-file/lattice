"""`lattice mcp serve` — start the local stdio MCP server."""

from __future__ import annotations

from pathlib import Path

import click
from lattice_api.mcp_server import run_stdio
from rich.console import Console

from .._local import load_settings, recall_vault

console = Console()


@click.group("mcp")
def mcp_cmd() -> None:
    """MCP server commands."""


@mcp_cmd.command("serve")
@click.option(
    "--vault",
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    default=None,
    help="Vault path to serve (defaults to the current vault from `lattice open`)",
)
def mcp_serve(vault: Path | None) -> None:
    """Serve the lattice MCP tools over stdio."""
    settings = load_settings()
    vault_path = vault or recall_vault(settings)
    if vault_path is None:
        # Errors to stderr — stdout is reserved for MCP protocol traffic.
        click.echo(
            "error: no vault open. Run `lattice open <path>` first or pass --vault.", err=True
        )
        raise SystemExit(2)
    run_stdio(vault_path.expanduser().resolve())
