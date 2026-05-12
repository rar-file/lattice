from .config import Mode, Settings
from .storage.postgres import PostgresStorage
from .storage.protocol import Storage
from .storage.sqlite import SqliteStorage


def build_storage(settings: Settings) -> Storage:
    if settings.mode is Mode.LOCAL:
        return SqliteStorage(settings.sqlite_path)
    return PostgresStorage(settings.cloud_database_url)
