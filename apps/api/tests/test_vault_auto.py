"""Tests for /vault/auto — the launch-time auto-open endpoint."""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from lattice_api.config import Mode, Settings
from lattice_api.main import create_app
from lattice_api.providers.embed.hash_provider import HashEmbeddingProvider
from lattice_api.routes import vault as vault_routes


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(mode=Mode.LOCAL, local_data_dir=tmp_path / "data", embedding_provider="hash")


@pytest.fixture
def fake_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Redirect ``Path.home()`` inside vault.py to a temp dir so the default
    location doesn't escape into the test runner's real ``~/Documents``."""
    home = tmp_path / "home"
    home.mkdir()
    (home / "Documents").mkdir()
    monkeypatch.setattr(vault_routes.Path, "home", staticmethod(lambda: home))
    return home


def make_app(settings: Settings):
    return create_app(settings, embedder_override=HashEmbeddingProvider())


async def test_auto_creates_default_vault_on_first_launch(
    settings: Settings, fake_home: Path
) -> None:
    """No state.json, no default folder — should create ~/Documents/Lattice and open it."""
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/vault/auto")
            assert r.status_code == 200, r.text
            body = r.json()
            expected = fake_home / "Documents" / "Lattice"
            # parents weren't created — but the route creates Documents/Lattice
            # implicitly via mkdir(parents=True). Verify either way.
            assert Path(body["vault"]["root_path"]) == expected
            assert (expected / "Welcome.md").is_file()


async def test_auto_reopens_last_vault(settings: Settings, fake_home: Path, tmp_path: Path) -> None:
    """Once a vault is opened, /vault/auto on a fresh process should reopen it."""
    other = tmp_path / "my-other-vault"
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/vault/init", json={"root_path": str(other)})
            assert r.status_code == 200
            # State persisted to settings.local_data_dir/state.json
            assert (settings.local_data_dir / "state.json").is_file()

    # Simulate a relaunch: brand-new app, same on-disk state.
    app2 = make_app(settings)
    async with app2.router.lifespan_context(app2):
        async with AsyncClient(transport=ASGITransport(app=app2), base_url="http://test") as client:
            r = await client.post("/vault/auto")
            assert r.status_code == 200, r.text
            assert r.json()["vault"]["root_path"] == str(other)


async def test_auto_returns_current_session_if_one_is_open(
    settings: Settings, fake_home: Path, tmp_path: Path
) -> None:
    """Calling /vault/auto while a vault is already open is a no-op reuse."""
    target = tmp_path / "already-open"
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/vault/init", json={"root_path": str(target)})
            r = await client.post("/vault/auto")
            assert r.status_code == 200
            assert r.json()["vault"]["root_path"] == str(target)
            # No re-index — current-session shortcut returns zero counts.
            assert r.json()["indexed"]["notes_indexed"] == 0


async def test_auto_rejected_in_cloud_mode(tmp_path: Path) -> None:
    s = Settings(mode=Mode.CLOUD, local_data_dir=tmp_path, embedding_provider="hash")
    app = create_app(s, embedder_override=HashEmbeddingProvider())
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/vault/auto")
            assert r.status_code == 400
            assert "local-only" in r.json()["detail"]
