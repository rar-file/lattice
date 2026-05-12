from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.sql import text


class PostgresStorage:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url
        self._engine: AsyncEngine | None = None

    async def init(self) -> None:
        self._engine = create_async_engine(self.database_url, pool_pre_ping=True)

    async def close(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None

    async def ping(self) -> bool:
        if self._engine is None:
            return False
        async with self._engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            return result.scalar() == 1
