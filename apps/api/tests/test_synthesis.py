"""M4 — weekly synthesis tests."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from lattice_api.config import Mode, Settings
from lattice_api.main import create_app
from lattice_api.providers.embed.hash_provider import HashEmbeddingProvider
from lattice_api.providers.stub_llm import StubLLMProvider


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        mode=Mode.LOCAL, local_data_dir=tmp_path, embedding_provider="hash", local_token="test"
    )


def make_app(settings: Settings, drafted: str | None = None):
    return create_app(
        settings,
        embedder_override=HashEmbeddingProvider(),
        llm_override=StubLLMProvider(reply=drafted or "# stub"),
    )


def _iso_week_label(d: datetime) -> str:
    iso = d.date().isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


async def test_synthesize_writes_weekly_note(settings: Settings, fixture_vault: Path) -> None:
    drafted = (
        "# Synthesis 2026-W19\n\n"
        "## Themes\n- Replication strategies surface heavily across [[Postgres replication]]\n\n"
        "## Questions surfaced\n- How do slots fit?\n\n"
        "## Loose threads\n- Kafka offsets\n"
    )
    app = make_app(settings, drafted=drafted)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer test"},
        ) as client:
            r = await client.post("/vault/open", json={"root_path": str(fixture_vault)})
            assert r.status_code == 200

            today = datetime.now(UTC)
            week = _iso_week_label(today)
            # Touch the fixture notes so their mtime falls in the current week.
            for f in fixture_vault.glob("*.md"):
                f.touch()
            r = await client.post("/synthesize", json={"week": week})
            assert r.status_code == 200, r.text
            payload = r.json()
            assert payload["path"] == f"Synthesis/{week}.md"
            assert payload["n_notes"] >= 1
            assert "Synthesis" in payload["body"]

            synthesis_file = fixture_vault / payload["path"]
            assert synthesis_file.is_file()


async def test_synthesize_empty_week(settings: Settings, fixture_vault: Path) -> None:
    app = make_app(settings, drafted="ignored")
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer test"},
        ) as client:
            r = await client.post("/vault/open", json={"root_path": str(fixture_vault)})
            assert r.status_code == 200
            # Pick a far-past week — none of the fixture notes will fall inside.
            old_label = _iso_week_label(datetime.now(UTC) - timedelta(weeks=200))
            r = await client.post("/synthesize", json={"week": old_label})
            assert r.status_code == 200
            assert r.json()["n_notes"] == 0
            assert "No notes were modified" in r.json()["body"]


async def test_synthesize_rejects_bad_week_label(settings: Settings, fixture_vault: Path) -> None:
    app = make_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer test"},
        ) as client:
            r = await client.post("/vault/open", json={"root_path": str(fixture_vault)})
            assert r.status_code == 200
            r = await client.post("/synthesize", json={"week": "not-a-week"})
            assert r.status_code == 400
