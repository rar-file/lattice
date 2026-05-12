"""Tests for /notes-rename/{path}."""

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


async def _open(client: AsyncClient, root: Path) -> None:
    r = await client.post("/vault/open", json={"root_path": str(root)})
    assert r.status_code == 200, r.text


async def test_rename_moves_file_and_reindexes(settings: Settings, fixture_vault: Path) -> None:
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open(client, fixture_vault)
            # Pick an existing fixture note
            notes = (await client.get("/notes")).json()
            src_path = notes[0]["path"]
            r = await client.post(
                f"/notes-rename/{src_path}",
                json={"new_path": "Renamed/moved-note"},
            )
            assert r.status_code == 200, r.text
            assert r.json()["path"] == "Renamed/moved-note.md"
            # Old path 404
            r2 = await client.get(f"/notes/{src_path}")
            assert r2.status_code == 404
            # New path readable
            r3 = await client.get("/notes/Renamed/moved-note.md")
            assert r3.status_code == 200
            # File moved on disk
            assert (fixture_vault / "Renamed/moved-note.md").is_file()
            assert not (fixture_vault / src_path).exists()


async def test_rename_rejects_existing_destination(settings: Settings, fixture_vault: Path) -> None:
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open(client, fixture_vault)
            notes = (await client.get("/notes")).json()
            a, b = notes[0]["path"], notes[1]["path"]
            r = await client.post(f"/notes-rename/{a}", json={"new_path": b})
            assert r.status_code == 409
            assert "already exists" in r.json()["detail"]


async def test_rename_rejects_escape(settings: Settings, fixture_vault: Path) -> None:
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open(client, fixture_vault)
            notes = (await client.get("/notes")).json()
            r = await client.post(
                f"/notes-rename/{notes[0]['path']}",
                json={"new_path": "../../../etc/passwd"},
            )
            assert r.status_code == 400
