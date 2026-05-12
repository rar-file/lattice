from enum import StrEnum
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Mode(StrEnum):
    LOCAL = "local"
    CLOUD = "cloud"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LATTICE_", env_file=".env", extra="ignore")

    mode: Mode = Mode.LOCAL

    local_data_dir: Path = Field(default=Path.home() / ".lattice")
    local_socket_path: Path | None = None

    cloud_database_url: str = "postgresql+asyncpg://lattice:lattice@localhost:5432/lattice"
    cloud_session_secret: str = "dev-only-change-me"

    anthropic_api_key: str | None = None
    default_llm_model: str = "claude-sonnet-4-6"
    cheap_llm_model: str = "claude-haiku-4-5"

    embedding_provider: str = "fastembed"
    embedding_model: str = "BAAI/bge-small-en-v1.5"

    # M2 — cloud + auth
    public_base_url: str = "http://localhost:8787"
    resend_api_key: str | None = None
    sync_push_chunk_size: int = 200

    @property
    def sqlite_path(self) -> Path:
        return self.local_data_dir / "lattice.db"
