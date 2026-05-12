"""PyInstaller entry script.

Imported when running the bundled `lattice-api-*` sidecar binary. PyInstaller
treats the script's parent directory as a package root, so we need an entry
that pulls the real module by absolute import — `apps/api/src/lattice_api/main.py`
uses relative imports (`from .config import ...`) which break when PyInstaller
runs the file directly.
"""

from lattice_api.main import cli

if __name__ == "__main__":
    cli()
