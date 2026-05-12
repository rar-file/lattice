"""M3 — ambient links + capture inbox tests."""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from lattice_api.config import Mode, Settings
from lattice_api.main import create_app
from lattice_api.providers.embed.hash_provider import HashEmbeddingProvider
from lattice_api.providers.stub_llm import StubLLMProvider


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(mode=Mode.LOCAL, local_data_dir=tmp_path, embedding_provider="hash")


def make_app(settings: Settings, drafted: str | None = None):
    return create_app(
        settings,
        embedder_override=HashEmbeddingProvider(),
        llm_override=StubLLMProvider(reply=drafted or "stub [1]"),
    )


async def _open(client: AsyncClient, root: Path) -> None:
    r = await client.post("/vault/open", json={"root_path": str(root)})
    assert r.status_code == 200, r.text


async def test_suggest_links_ranks_existing_notes(settings: Settings, fixture_vault: Path) -> None:
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open(client, fixture_vault)
            r = await client.post(
                "/suggest/links",
                json={"paragraph": "Today I was thinking about postgres replication slots."},
            )
            assert r.status_code == 200, r.text
            suggestions = r.json()["suggestions"]
            assert suggestions, "expected at least one suggestion"
            assert any(s["path"] == "postgres.md" for s in suggestions[:2])


async def test_suggest_links_empty_paragraph(settings: Settings, fixture_vault: Path) -> None:
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open(client, fixture_vault)
            r = await client.post("/suggest/links", json={"paragraph": "   "})
            assert r.status_code == 200
            assert r.json()["suggestions"] == []


async def test_capture_writes_inbox_note(settings: Settings, fixture_vault: Path) -> None:
    drafted = (
        "---\n"
        "title: Postgres logical replication design\n"
        "tags: [postgres, replication]\n"
        "source: cli\n"
        "---\n\n"
        "Started on logical replication via slots. Need to compare with physical WAL.\n"
    )
    app = make_app(settings, drafted=drafted)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open(client, fixture_vault)
            r = await client.post(
                "/capture",
                json={
                    "text": "thinking about logical replication via slots",
                    "source": "cli",
                },
            )
            assert r.status_code == 200, r.text
            payload = r.json()
            assert payload["title"] == "Postgres logical replication design"
            assert payload["path"].startswith("Inbox/")
            assert payload["path"].endswith(".md")

            inbox = fixture_vault / payload["path"]
            assert inbox.is_file()
            content = inbox.read_text(encoding="utf-8")
            assert "logical replication" in content


async def test_capture_rejects_empty(settings: Settings, fixture_vault: Path) -> None:
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open(client, fixture_vault)
            r = await client.post("/capture", json={"text": "  "})
            assert r.status_code == 400
