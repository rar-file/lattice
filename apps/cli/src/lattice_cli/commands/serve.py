import shutil
import subprocess
import sys

import click


@click.command()
@click.option("--socket", default=None, help="Unix socket path (default: ~/.lattice/api.sock)")
@click.option("--port", type=int, default=None, help="TCP port (mutually exclusive with --socket)")
def serve(socket: str | None, port: int | None) -> None:
    """Spawn the local lattice-api in --mode=local."""
    api_bin = shutil.which("lattice-api")
    if api_bin is None:
        click.echo("error: lattice-api not found on PATH. Did `uv sync` run?", err=True)
        sys.exit(1)
    cmd = [api_bin, "--mode=local"]
    if socket:
        cmd += ["--socket", socket]
    elif port:
        cmd += ["--port", str(port)]
    subprocess.run(cmd, check=False)
