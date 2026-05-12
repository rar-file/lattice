"""Auth + cloud-mode end-to-end tests.

These run cloud mode against SqliteStorage so we can exercise the full auth
machinery without a Postgres dependency.
"""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from lattice_api.config import Mode, Settings
from lattice_api.email import Mailer
from lattice_api.main import create_app
from lattice_api.providers.embed.hash_provider import HashEmbeddingProvider
from lattice_api.providers.stub_llm import StubLLMProvider
from lattice_api.storage.sqlite import SqliteStorage


@pytest.fixture
def cloud_settings(tmp_path: Path) -> Settings:
    # We force cloud mode but back it with SQLite by passing storage_override.
    return Settings(
        mode=Mode.CLOUD,
        local_data_dir=tmp_path,
        embedding_provider="hash",
        public_base_url="http://test",
    )


@pytest.fixture
def mailer() -> Mailer:
    return Mailer()


def build_cloud_app(settings: Settings, tmp_path: Path, mailer: Mailer):
    storage = SqliteStorage(tmp_path / "cloud.db")
    return create_app(
        settings,
        storage_override=storage,
        embedder_override=HashEmbeddingProvider(),
        llm_override=StubLLMProvider(reply="ok [1]"),
        mailer_override=mailer,
    )


async def test_magic_link_full_flow(
    cloud_settings: Settings, tmp_path: Path, mailer: Mailer
) -> None:
    app = build_cloud_app(cloud_settings, tmp_path, mailer)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/auth/magic/start", json={"email": "alice@example.com"})
            assert r.status_code == 200, r.text
            assert r.json()["sent"] is True
            assert len(mailer.sent) == 1
            link_body = mailer.sent[0].body
            assert "auth/magic/consume?token=latt_magic_" in link_body
            token = link_body.split("token=")[1].split()[0]

            r = await client.get("/auth/magic/consume", params={"token": token})
            assert r.status_code == 200, r.text
            session_token = r.json()["session_token"]
            assert session_token.startswith("latt_session_")

            r = await client.get(
                "/auth/whoami", headers={"Authorization": f"Bearer {session_token}"}
            )
            assert r.status_code == 200
            who = r.json()
            assert who["email"] == "alice@example.com"
            assert who["mode"] == "cloud"

            # Reusing the magic link should fail (single-use).
            r = await client.get("/auth/magic/consume", params={"token": token})
            assert r.status_code == 400


async def test_device_flow_end_to_end(
    cloud_settings: Settings, tmp_path: Path, mailer: Mailer
) -> None:
    app = build_cloud_app(cloud_settings, tmp_path, mailer)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Bootstrap a user via magic link first (the user must exist to approve).
            await client.post("/auth/magic/start", json={"email": "bob@example.com"})
            token = mailer.sent[-1].body.split("token=")[1].split()[0]
            r = await client.get("/auth/magic/consume", params={"token": token})
            session_token = r.json()["session_token"]
            auth = {"Authorization": f"Bearer {session_token}"}

            # CLI side: start device flow.
            r = await client.post("/auth/device/start", json={"name": "my-laptop"})
            assert r.status_code == 200, r.text
            dev = r.json()
            user_code = dev["user_code"]
            device_code = dev["device_code"]
            assert "-" in user_code  # ABCD-1234 format

            # Poll before approval → pending.
            r = await client.post("/auth/device/poll", json={"device_code": device_code})
            assert r.json()["status"] == "pending"

            # Web side: user approves.
            r = await client.post(
                "/auth/device/approve", json={"user_code": user_code}, headers=auth
            )
            assert r.status_code == 200
            assert r.json()["approved"] is True

            # Poll again → ready, with token.
            r = await client.post("/auth/device/poll", json={"device_code": device_code})
            payload = r.json()
            assert payload["status"] == "ready"
            assert payload["token"].startswith("latt_device_")

            # Polling once more returns consumed.
            r = await client.post("/auth/device/poll", json={"device_code": device_code})
            assert r.json()["status"] == "consumed"

            # The new device token works.
            r = await client.get(
                "/auth/whoami", headers={"Authorization": f"Bearer {payload['token']}"}
            )
            assert r.status_code == 200
            assert r.json()["email"] == "bob@example.com"


async def test_agent_token_create_list_revoke(
    cloud_settings: Settings, tmp_path: Path, mailer: Mailer
) -> None:
    app = build_cloud_app(cloud_settings, tmp_path, mailer)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/auth/magic/start", json={"email": "carol@example.com"})
            mt = mailer.sent[-1].body.split("token=")[1].split()[0]
            r = await client.get("/auth/magic/consume", params={"token": mt})
            session_token = r.json()["session_token"]
            auth = {"Authorization": f"Bearer {session_token}"}

            r = await client.post("/auth/tokens", json={"name": "claude-code"}, headers=auth)
            assert r.status_code == 200
            agent_token = r.json()["token"]
            token_id = r.json()["info"]["id"]
            assert agent_token.startswith("latt_agent_")
            assert "vault:read" in r.json()["info"]["scopes"]

            r = await client.get("/auth/tokens", headers=auth)
            kinds = sorted(t["kind"] for t in r.json())
            assert "agent" in kinds and "session" in kinds

            r = await client.delete(f"/auth/tokens/{token_id}", headers=auth)
            assert r.json()["revoked"] is True

            # Revoked token rejects.
            r = await client.get("/auth/whoami", headers={"Authorization": f"Bearer {agent_token}"})
            assert r.status_code == 401


async def test_protected_routes_reject_unauth(
    cloud_settings: Settings, tmp_path: Path, mailer: Mailer
) -> None:
    app = build_cloud_app(cloud_settings, tmp_path, mailer)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            for path in ["/auth/whoami", "/auth/tokens"]:
                r = await client.get(path)
                assert r.status_code == 401, path
            r = await client.post("/auth/tokens", json={"name": "x"})
            assert r.status_code == 401
