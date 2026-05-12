from typing import Protocol


class Storage(Protocol):
    """Abstract storage layer. SqliteStorage (local) and PostgresStorage (cloud) implement this.

    M0 surface is intentionally tiny — just enough to ping the DB. The full surface
    (notes, chunks, vector search, auth tables) lands in M1.
    """

    async def init(self) -> None: ...
    async def close(self) -> None: ...
    async def ping(self) -> bool: ...
