import click
from rich.console import Console

from . import __version__
from .commands import (
    capture_cmd,
    chat_cmd,
    login_cmd,
    mcp_cmd,
    open_cmd,
    search_cmd,
    serve,
    sync_cmd,
    synthesize_cmd,
)

console = Console()


@click.group()
@click.version_option(__version__, prog_name="lattice")
def cli() -> None:
    """Lattice — AI-native vault, CLI."""


cli.add_command(serve.serve)
cli.add_command(open_cmd.open_cmd)
cli.add_command(search_cmd.search_cmd)
cli.add_command(chat_cmd.chat_cmd)
cli.add_command(mcp_cmd.mcp_cmd)
cli.add_command(login_cmd.login_cmd)
cli.add_command(login_cmd.logout_cmd)
cli.add_command(sync_cmd.sync_cmd)
cli.add_command(capture_cmd.capture_cmd)
cli.add_command(synthesize_cmd.synthesize_cmd)


@cli.command()
def hello() -> None:
    """Smoke-test command."""
    console.print(f"[bold cyan]lattice[/bold cyan] v{__version__} — ready.")


if __name__ == "__main__":
    cli()
