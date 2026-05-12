"""Per-process 'open vault' session for local mode.

We only ever open one vault at a time (single-user local deploy). The session
owns the indexer, watcher, and embedding-provider id so routes can reach
them in one hop.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from .indexer import Indexer
from .providers.embed.protocol import EmbeddingProvider
from .storage.models import Vault
from .storage.protocol import Storage
from .watcher import VaultWatcher

log = logging.getLogger("lattice.session")


@dataclass(slots=True)
class VaultSession:
    vault: Vault
    indexer: Indexer
    watcher: VaultWatcher
    embedding_provider_id: int


async def open_vault_session(
    *,
    storage: Storage,
    embedder: EmbeddingProvider,
    root_path: Path,
    name: str | None = None,
    start_watcher: bool = True,
) -> VaultSession:
    root = root_path.resolve()
    if not root.exists():
        raise FileNotFoundError(f"vault root does not exist: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"vault root is not a directory: {root}")

    vault_name = name or root.name
    vault = await storage.upsert_vault(vault_name, root)
    provider_id = await storage.register_embedding_provider(embedder.name, embedder.dim)
    indexer = Indexer(
        storage=storage,
        embedder=embedder,
        vault_id=vault.id,
        vault_root=root,
        embedding_provider_id=provider_id,
    )
    watcher = VaultWatcher(indexer)
    if start_watcher:
        await watcher.start()
    log.info("vault session open: %s (id=%s)", root, vault.id)
    return VaultSession(
        vault=vault, indexer=indexer, watcher=watcher, embedding_provider_id=provider_id
    )


async def close_vault_session(session: VaultSession) -> None:
    await session.watcher.stop()
    log.info("vault session closed: %s", session.vault.root_path)
