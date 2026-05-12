"""Tests for the new /vault/init first-run endpoint."""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from lattice_api.config import Mode, Settings
from lattice_api.main import create_app
from lattice_api.providers.embed.hash_provider import HashEmbeddingProvider


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(mode=Mode.LOCAL, local_data_dir=tmp_path, embedding_provider="hash")


def make_app(settings: Settings):
    return create_app(settings, embedder_override=HashEmbeddingProvider())


async def test_init_creates_vault_and_starter_note(settings: Settings, tmp_path: Path) -> None:
    target = tmp_path / "my-vault"
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/vault/init", json={"root_path": str(target)})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["vault"]["root_path"] == str(target)

            assert (target / "Welcome.md").is_file()
            assert (target / "Inbox").is_dir()
            assert (target / "Inbox" / ".gitkeep").is_file()
            content = (target / "Welcome.md").read_text(encoding="utf-8")
            assert "Welcome to Lattice" in content
            assert body["indexed"]["notes_indexed"] >= 1


async def test_init_rejects_non_empty_dir(settings: Settings, tmp_path: Path) -> None:
    target = tmp_path / "occupied"
    target.mkdir()
    (target / "something.md").write_text("hello", encoding="utf-8")
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/vault/init", json={"root_path": str(target)})
            assert r.status_code == 400
            assert "not empty" in r.json()["detail"]


async def test_init_picks_path_from_name_when_root_missing(
    settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When no root_path is sent, the server slugifies ``name`` under ``~/Documents``."""
    from lattice_api.routes import vault as vault_routes

    home = tmp_path / "home"
    home.mkdir()
    (home / "Documents").mkdir()
    monkeypatch.setattr(vault_routes.Path, "home", staticmethod(lambda: home))

    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/vault/init", json={"name": "Field Notes"})
            assert r.status_code == 200, r.text
            assert r.json()["vault"]["root_path"] == str(home / "Documents" / "Field-Notes")

            # Calling again with the same name should pick a -2 suffix.
            r2 = await client.post("/vault/init", json={"name": "Field Notes"})
            assert r2.status_code == 200, r2.text
            assert r2.json()["vault"]["root_path"] == str(home / "Documents" / "Field-Notes-2")


async def test_init_rejects_in_cloud_mode(tmp_path: Path) -> None:
    s = Settings(mode=Mode.CLOUD, local_data_dir=tmp_path, embedding_provider="hash")
    app = create_app(s, embedder_override=HashEmbeddingProvider())
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/vault/init", json={"root_path": str(tmp_path / "remote")})
            assert r.status_code == 400
            assert "local-only" in r.json()["detail"]
