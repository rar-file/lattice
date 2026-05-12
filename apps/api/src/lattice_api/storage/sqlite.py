import sqlite3
from pathlib import Path


class SqliteStorage:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._conn: sqlite3.Connection | None = None

    async def init(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")

    async def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    async def ping(self) -> bool:
        if self._conn is None:
            return False
        cur = self._conn.execute("SELECT 1")
        return cur.fetchone()[0] == 1
