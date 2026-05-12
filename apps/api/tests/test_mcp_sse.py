"""Hosted SSE MCP tests — tool discovery + call surface, bearer-token auth."""

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


def make_app(settings: Settings, tmp_path: Path) -> tuple:
    mailer = Mailer()
    app = create_app(
        settings,
        storage_override=SqliteStorage(tmp_path / "cloud.db"),
        embedder_override=HashEmbeddingProvider(),
        llm_override=StubLLMProvider(),
        mailer_override=mailer,
    )
    return app, mailer


async def _login(client: AsyncClient, email: str, mailer: Mailer) -> str:
    await client.post("/auth/magic/start", json={"email": email})
    token = mailer.sent[-1].body.split("token=")[1].split()[0]
    r = await client.get("/auth/magic/consume", params={"token": token})
    return r.json()["session_token"]


async def _make_agent(client: AsyncClient, session_tok: str, scopes: list[str]) -> str:
    r = await client.post(
        "/auth/tokens",
        json={"name": "mcp", "scopes": scopes},
        headers={"Authorization": f"Bearer {session_tok}"},
    )
    return r.json()["token"]


async def test_sse_requires_auth(settings: Settings, tmp_path: Path) -> None:
    app, _ = make_app(settings, tmp_path)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/mcp/sse")
            assert r.status_code == 401


async def test_call_search_and_read(settings: Settings, tmp_path: Path) -> None:
    app, mailer = make_app(settings, tmp_path)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            session_tok = await _login(client, "ed@example.com", mailer)
            auth = {"Authorization": f"Bearer {session_tok}"}

            r = await client.post("/sync/vault", json={"name": "main"}, headers=auth)
            vault_id = r.json()["id"]
            await client.post(
                "/sync/push",
                json={
                    "vault_id": vault_id,
                    "items": [
                        {
                            "path": "topic.md",
                            "op": "upsert",
                            "content_hash": "h",
                            "body": "# Topic\n\nphysical replication uses WAL\n",
                        }
                    ],
                },
                headers=auth,
            )

            agent_tok = await _make_agent(client, session_tok, ["vault:read", "search"])
            agent_auth = {"Authorization": f"Bearer {agent_tok}"}

            r = await client.post(
                "/mcp/call",
                json={"tool": "list_notes", "args": {}},
                headers=agent_auth,
            )
            assert r.status_code == 200
            assert any(n["path"] == "topic.md" for n in r.json()["result"])

            r = await client.post(
                "/mcp/call",
                json={"tool": "read_note", "args": {"path": "topic.md"}},
                headers=agent_auth,
            )
            assert r.status_code == 200
            assert "WAL" in r.json()["result"]["body"]

            r = await client.post(
                "/mcp/call",
                json={
                    "tool": "search_notes",
                    "args": {"query": "replication", "mode": "fts"},
                },
                headers=agent_auth,
            )
            assert r.status_code == 200
            assert r.json()["result"], "expected at least one hit"


async def test_write_requires_vault_write_scope(settings: Settings, tmp_path: Path) -> None:
    app, mailer = make_app(settings, tmp_path)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            session_tok = await _login(client, "fay@example.com", mailer)
            auth = {"Authorization": f"Bearer {session_tok}"}
            r = await client.post("/sync/vault", json={"name": "main"}, headers=auth)
            assert r.status_code == 200

            # Read-only agent token
            ro = await _make_agent(client, session_tok, ["vault:read"])
            r = await client.post(
                "/mcp/call",
                json={
                    "tool": "write_note",
                    "args": {"path": "x.md", "content": "x", "mode": "create"},
                },
                headers={"Authorization": f"Bearer {ro}"},
            )
            assert r.status_code == 403

            # Read+write agent token
            rw = await _make_agent(client, session_tok, ["vault:read", "vault:write"])
            r = await client.post(
                "/mcp/call",
                json={
                    "tool": "write_note",
                    "args": {"path": "x.md", "content": "x", "mode": "create"},
                },
                headers={"Authorization": f"Bearer {rw}"},
            )
            assert r.status_code == 200, r.text
            assert r.json()["result"]["ok"] is True
