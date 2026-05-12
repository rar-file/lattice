"""Shared helpers for CLI subcommands that run against the local SQLite DB.

The CLI talks to lattice_api modules directly rather than spawning the HTTP
server — simpler, faster, and avoids socket plumbing for one-shot commands.
The "current vault" pointer lives at `~/.lattice/current_vault.txt` so
`open` can set it and `search` / `chat` can read it.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from lattice_api.config import Mode, Settings
from lattice_api.providers.registry import get_embedding_provider, get_llm_provider
from lattice_api.session import close_vault_session, open_vault_session
from lattice_api.storage.sqlite import SqliteStorage


def _current_vault_file(settings: Settings) -> Path:
    return settings.local_data_dir / "current_vault.txt"


def remember_vault(settings: Settings, root_path: Path) -> None:
    path = _current_vault_file(settings)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(str(root_path.resolve()))


def recall_vault(settings: Settings) -> Path | None:
    path = _current_vault_file(settings)
    if not path.exists():
        return None
    raw = path.read_text().strip()
    return Path(raw) if raw else None


def load_settings() -> Settings:
    return Settings(mode=Mode.LOCAL)


@asynccontextmanager
async def open_session(settings: Settings, vault_path: Path, *, start_watcher: bool = False):
    """Open the vault session, yield (storage, embedder, llm, session), tear down on exit."""
    storage = SqliteStorage(settings.sqlite_path)
    await storage.init()
    embedder = get_embedding_provider(settings)
    llm = get_llm_provider(settings)
    session = await open_vault_session(
        storage=storage,
        embedder=embedder,
        root_path=vault_path,
        start_watcher=start_watcher,
    )
    try:
        yield storage, embedder, llm, session
    finally:
        await close_vault_session(session)
        await storage.close()
