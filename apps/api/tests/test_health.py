from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from lattice_api.config import Mode, Settings
from lattice_api.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(mode=Mode.LOCAL, local_data_dir=tmp_path, local_token="test")


async def test_healthz_local(settings: Settings) -> None:
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer test"},
        ) as client:
            r = await client.get("/healthz")
            assert r.status_code == 200
            body = r.json()
            assert body["ok"] is True
            assert body["mode"] == "local"
            assert "version" in body


async def test_version(settings: Settings) -> None:
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer test"},
        ) as client:
            r = await client.get("/version")
            assert r.status_code == 200
            assert "version" in r.json()
