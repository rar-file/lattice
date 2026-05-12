import click
from rich.console import Console

from . import __version__
from .commands import serve

console = Console()


@click.group()
@click.version_option(__version__, prog_name="lattice")
def cli() -> None:
    """Lattice — AI-native vault, CLI."""


cli.add_command(serve.serve)


@cli.command()
def hello() -> None:
    """Smoke-test command."""
    console.print(f"[bold cyan]lattice[/bold cyan] v{__version__} — ready.")


if __name__ == "__main__":
    cli()
