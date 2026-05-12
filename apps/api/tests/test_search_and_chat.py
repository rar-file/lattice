from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from lattice_api.config import Settings
from lattice_api.main import create_app
from lattice_api.providers.embed.hash_provider import HashEmbeddingProvider
from lattice_api.providers.stub_llm import StubLLMProvider


@pytest.fixture
def stub_llm() -> StubLLMProvider:
    return StubLLMProvider(
        reply=(
            "Postgres uses logical replication slots to stream row-level changes [1]. "
            "It also supports physical replication via WAL [1]."
        )
    )


def build_app(settings: Settings, stub_llm: StubLLMProvider):
    return create_app(
        settings,
        embedder_override=HashEmbeddingProvider(),
        llm_override=stub_llm,
    )


async def _open_vault(client: AsyncClient, root: Path) -> dict:
    r = await client.post("/vault/open", json={"root_path": str(root)})
    assert r.status_code == 200, r.text
    return r.json()


async def test_vault_open_indexes_three_notes(
    settings: Settings, stub_llm: StubLLMProvider, fixture_vault: Path
) -> None:
    app = build_app(settings, stub_llm)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            body = await _open_vault(client, fixture_vault)
            assert body["vault"]["root_path"].endswith("vault")
            assert body["indexed"]["notes_indexed"] == 3
            assert body["indexed"]["chunks_indexed"] >= 3

            # Re-open same path → notes_skipped, not re-indexed.
            body2 = await _open_vault(client, fixture_vault)
            assert body2["indexed"]["notes_indexed"] == 0
            assert body2["indexed"]["notes_skipped"] == 3


async def test_notes_listing_and_read(
    settings: Settings, stub_llm: StubLLMProvider, fixture_vault: Path
) -> None:
    app = build_app(settings, stub_llm)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open_vault(client, fixture_vault)
            r = await client.get("/notes")
            assert r.status_code == 200
            paths = sorted(n["path"] for n in r.json())
            assert paths == ["kafka.md", "mongo.md", "postgres.md"]

            r = await client.get("/notes/postgres.md")
            assert r.status_code == 200
            body = r.json()
            assert body["title"] == "Postgres replication"
            assert "WAL" in body["body"]


async def test_note_write_and_reindex(
    settings: Settings, stub_llm: StubLLMProvider, fixture_vault: Path
) -> None:
    app = build_app(settings, stub_llm)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open_vault(client, fixture_vault)
            r = await client.put(
                "/notes/postgres.md",
                json={"body": "# Postgres\n\nnow about pelicans and pineapples\n"},
            )
            assert r.status_code == 200
            assert "pelicans" in r.json()["body"]

            r = await client.get("/search", params={"q": "pelicans", "mode": "fts"})
            assert r.status_code == 200
            hits = r.json()
            assert hits, "expected new content to be searchable after write"
            assert hits[0]["note_path"] == "postgres.md"


async def test_note_path_traversal_rejected(
    settings: Settings, stub_llm: StubLLMProvider, fixture_vault: Path
) -> None:
    app = build_app(settings, stub_llm)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open_vault(client, fixture_vault)
            # Percent-encode so httpx doesn't normalize `..` away before sending.
            r = await client.put("/notes/%2E%2E/escape.md", json={"body": "nope"})
            assert r.status_code == 400, r.text


async def test_search_fts_and_hybrid(
    settings: Settings, stub_llm: StubLLMProvider, fixture_vault: Path
) -> None:
    app = build_app(settings, stub_llm)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open_vault(client, fixture_vault)
            r = await client.get("/search", params={"q": "replication", "mode": "fts"})
            assert r.status_code == 200
            hits = r.json()
            assert any(h["note_path"] == "postgres.md" for h in hits)

            r = await client.get("/search", params={"q": "Kafka offsets", "mode": "hybrid"})
            assert r.status_code == 200
            assert r.json(), "expected at least one hybrid hit"


async def test_chat_returns_answer_with_parsed_citations(
    settings: Settings, stub_llm: StubLLMProvider, fixture_vault: Path
) -> None:
    app = build_app(settings, stub_llm)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await _open_vault(client, fixture_vault)
            r = await client.post(
                "/chat",
                json={"query": "How does postgres replication work?", "top_k": 4},
            )
            assert r.status_code == 200, r.text
            payload = r.json()
            assert "[1]" in payload["answer"]
            assert payload["citations"], "expected at least one parsed citation"
            assert payload["citations"][0]["n"] == 1
            # Sources injected for the stub — verify system blocks went through and were cached.
            assert stub_llm.last_system is not None
            assert any(b.cache for b in stub_llm.last_system)


async def test_chat_rejects_without_vault(
    settings: Settings, stub_llm: StubLLMProvider
) -> None:
    app = build_app(settings, stub_llm)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/chat", json={"query": "anything"})
            assert r.status_code == 409
