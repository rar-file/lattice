"""Sync engine tests — push/pull/conflict round-trip against cloud-mode storage."""

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
def settings(tmp_path: Path) -> Settings:
    return Settings(
        mode=Mode.CLOUD,
        local_data_dir=tmp_path,
        embedding_provider="hash",
        public_base_url="http://test",
    )


def make_app(settings: Settings, db_path: Path):
    storage = SqliteStorage(db_path)
    return create_app(
        settings,
        storage_override=storage,
        embedder_override=HashEmbeddingProvider(),
        llm_override=StubLLMProvider(reply="ok [1]"),
        mailer_override=Mailer(),
    )


async def _login(client: AsyncClient, email: str, mailer: Mailer) -> str:
    await client.post("/auth/magic/start", json={"email": email})
    token = mailer.sent[-1].body.split("token=")[1].split()[0]
    r = await client.get("/auth/magic/consume", params={"token": token})
    return r.json()["session_token"]


async def test_push_pull_round_trip(settings: Settings, tmp_path: Path) -> None:
    mailer = Mailer()
    app = create_app(
        settings,
        storage_override=SqliteStorage(tmp_path / "cloud.db"),
        embedder_override=HashEmbeddingProvider(),
        llm_override=StubLLMProvider(reply="ok [1]"),
        mailer_override=mailer,
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            session_token = await _login(client, "dora@example.com", mailer)
            auth = {"Authorization": f"Bearer {session_token}"}

            r = await client.post("/sync/vault", json={"name": "main"}, headers=auth)
            assert r.status_code == 200, r.text
            vault_id = r.json()["id"]

            push_items = [
                {
                    "path": "alpha.md",
                    "op": "upsert",
                    "content_hash": "h1",
                    "body": "# Alpha\n\nfirst note about whales\n",
                },
                {
                    "path": "beta.md",
                    "op": "upsert",
                    "content_hash": "h2",
                    "body": "# Beta\n\nsecond note about dolphins\n",
                },
            ]
            r = await client.post(
                "/sync/push",
                json={"vault_id": vault_id, "items": push_items},
                headers=auth,
            )
            assert r.status_code == 200, r.text
            cursor = r.json()["cursor"]
            assert r.json()["accepted"] == 2

            # Pull from beginning sees both upserts.
            r = await client.get(
                "/sync/pull", params={"vault_id": vault_id, "since": 0}, headers=auth
            )
            assert r.status_code == 200
            entries = r.json()["entries"]
            assert {e["path"] for e in entries} == {"alpha.md", "beta.md"}
            assert all(e["op"] == "upsert" for e in entries)
            assert r.json()["cursor"] == cursor

            # Pull since cursor returns nothing new.
            r = await client.get(
                "/sync/pull", params={"vault_id": vault_id, "since": cursor}, headers=auth
            )
            assert r.json()["entries"] == []

            # Delete + rename round-trip.
            r = await client.post(
                "/sync/push",
                json={
                    "vault_id": vault_id,
                    "items": [
                        {
                            "path": "beta.md",
                            "op": "rename",
                            "new_path": "renamed-beta.md",
                        },
                        {"path": "alpha.md", "op": "delete"},
                    ],
                },
                headers=auth,
            )
            assert r.status_code == 200
            r = await client.get(
                "/sync/pull", params={"vault_id": vault_id, "since": cursor}, headers=auth
            )
            ops = sorted(e["op"] for e in r.json()["entries"])
            assert ops == ["delete", "rename"]

            # Notes endpoint reflects state.
            await client.post("/vault/open", json={"root_path": "cloud://"})  # ignored on cloud
            # The /notes route requires a vault session; cloud sync doesn't open one.
            # Verify via storage indirectly: pull cursor advanced and renamed path now exists in DB.
            from lattice_api.storage.sqlite import SqliteStorage as _S

            store = _S(tmp_path / "cloud.db")
            await store.init()
            try:
                got = await store.list_notes(vault_id)
                paths = sorted(n.path for n in got)
                assert paths == ["renamed-beta.md"]
            finally:
                await store.close()


async def test_push_requires_auth(settings: Settings, tmp_path: Path) -> None:
    app = make_app(settings, tmp_path / "noauth.db")
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/sync/push",
                json={"vault_id": "anything", "items": []},
            )
            assert r.status_code == 401


async def test_push_rejects_other_users_vault(settings: Settings, tmp_path: Path) -> None:
    mailer = Mailer()
    app = create_app(
        settings,
        storage_override=SqliteStorage(tmp_path / "cloud.db"),
        embedder_override=HashEmbeddingProvider(),
        llm_override=StubLLMProvider(),
        mailer_override=mailer,
    )
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # User A creates a vault.
            tok_a = await _login(client, "a@example.com", mailer)
            r = await client.post(
                "/sync/vault",
                json={"name": "alpha"},
                headers={"Authorization": f"Bearer {tok_a}"},
            )
            vault_a = r.json()["id"]

            # User B tries to push to A's vault.
            tok_b = await _login(client, "b@example.com", mailer)
            r = await client.post(
                "/sync/push",
                json={
                    "vault_id": vault_a,
                    "items": [
                        {
                            "path": "x.md",
                            "op": "upsert",
                            "content_hash": "h",
                            "body": "x",
                        }
                    ],
                },
                headers={"Authorization": f"Bearer {tok_b}"},
            )
            assert r.status_code == 404
