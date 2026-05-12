"""Tests for the /notes-backlinks endpoint."""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from lattice_api.config import Mode, Settings
from lattice_api.main import create_app
from lattice_api.providers.embed.hash_provider import HashEmbeddingProvider


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(mode=Mode.LOCAL, local_data_dir=tmp_path / "data", embedding_provider="hash")


def make_app(settings: Settings):
    return create_app(settings, embedder_override=HashEmbeddingProvider())


async def _open_vault(client: AsyncClient, root: Path) -> None:
    r = await client.post("/vault/open", json={"root_path": str(root)})
    assert r.status_code == 200, r.text


async def test_backlinks_finds_wikilink_references(settings: Settings, tmp_path: Path) -> None:
    root = tmp_path / "vault"
    root.mkdir()
    (root / "target.md").write_text("# Target\n\nA destination note.\n", encoding="utf-8")
    (root / "source.md").write_text(
        "# Source\n\nSee also [[target]] for context.\n", encoding="utf-8"
    )
    (root / "other.md").write_text(
        "# Other\n\nReferences [[Target]] by display title.\n", encoding="utf-8"
    )
    (root / "unrelated.md").write_text("# Unrelated\n\nNo references here.\n", encoding="utf-8")

    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open_vault(client, root)
            r = await client.get("/notes-backlinks/target.md")
            assert r.status_code == 200, r.text
            hits = r.json()
            paths = {h["path"] for h in hits}
            assert paths == {"source.md", "other.md"}
            assert all(h["snippet"] for h in hits)


async def test_backlinks_ignores_self(settings: Settings, tmp_path: Path) -> None:
    root = tmp_path / "vault"
    root.mkdir()
    # A note that mentions itself shouldn't show up as its own backlink.
    (root / "narcissist.md").write_text(
        "# Narcissist\n\nI link to [[narcissist]].\n", encoding="utf-8"
    )

    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open_vault(client, root)
            r = await client.get("/notes-backlinks/narcissist.md")
            assert r.status_code == 200
            assert r.json() == []


async def test_backlinks_404_for_missing(settings: Settings, tmp_path: Path) -> None:
    root = tmp_path / "vault"
    root.mkdir()
    (root / "real.md").write_text("# Real\n", encoding="utf-8")

    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open_vault(client, root)
            r = await client.get("/notes-backlinks/nope.md")
            assert r.status_code == 404
