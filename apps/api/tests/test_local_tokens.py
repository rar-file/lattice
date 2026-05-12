"""Smoke: in local mode, creating + listing an agent token via the HTTP
surface works end-to-end (proves the FK seed + CORS-friendly 401 path)."""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from lattice_api.config import Mode, Settings
from lattice_api.main import create_app
from lattice_api.providers.embed.hash_provider import HashEmbeddingProvider


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        mode=Mode.LOCAL,
        local_data_dir=tmp_path,
        embedding_provider="hash",
        local_token="test",
    )


async def test_local_mode_agent_token(settings: Settings) -> None:
    app = create_app(settings, embedder_override=HashEmbeddingProvider())
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer test"},
        ) as c:
            r = await c.post("/auth/tokens", json={"name": "demo", "scopes": ["search"]})
            assert r.status_code == 200, r.text
            t = r.json()
            assert t["token"].startswith("latt_agent_")
            assert t["info"]["name"] == "demo"
            r = await c.get("/auth/tokens")
            assert r.status_code == 200
            assert any(item["name"] == "demo" for item in r.json())


async def test_local_mode_cors_on_401(settings: Settings) -> None:
    """A request that fails the local-token gate must still carry CORS
    headers so the browser doesn't surface it as 'Failed to fetch'."""
    app = create_app(settings, embedder_override=HashEmbeddingProvider())
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            r = await c.get("/auth/tokens", headers={"Origin": "tauri://localhost"})
            assert r.status_code == 401
            assert r.headers.get("access-control-allow-origin") == "tauri://localhost"
