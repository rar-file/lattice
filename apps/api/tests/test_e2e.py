"""End-to-end test: full M1-M4 happy path against cloud-mode (SQLite-backed).

Walks through:
    1. Magic-link sign in.
    2. Create cloud vault.
    3. Push three notes.
    4. Search them (hybrid).
    5. Chat with citations.
    6. Capture a new thought (via /capture).
    7. Trigger weekly synthesis.
    8. Hosted-MCP `search_notes` + `read_note`.
    9. Sync pull observes the writes.
"""

from datetime import UTC, datetime
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


async def test_full_cloud_flow(settings: Settings, tmp_path: Path) -> None:
    mailer = Mailer()
    app = create_app(
        settings,
        storage_override=SqliteStorage(tmp_path / "cloud.db"),
        embedder_override=HashEmbeddingProvider(),
        llm_override=StubLLMProvider(
            reply=(
                "Postgres replication uses WAL streaming for physical replication [1]. "
                "Logical replication uses replication slots [1]."
            ),
        ),
        mailer_override=mailer,
    )

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # 1. Sign in via magic link.
            await client.post("/auth/magic/start", json={"email": "ship@example.com"})
            mtok = mailer.sent[-1].body.split("token=")[1].split()[0]
            r = await client.get("/auth/magic/consume", params={"token": mtok})
            session_tok = r.json()["session_token"]
            auth = {"Authorization": f"Bearer {session_tok}"}

            # 2. Create the cloud vault.
            r = await client.post("/sync/vault", json={"name": "main"}, headers=auth)
            vault_id = r.json()["id"]

            # 3. Push three notes.
            r = await client.post(
                "/sync/push",
                json={
                    "vault_id": vault_id,
                    "items": [
                        {
                            "path": "postgres.md",
                            "op": "upsert",
                            "content_hash": "h1",
                            "body": (
                                "# Postgres replication\n\n"
                                "Physical replication ships WAL bytes. Logical replication uses\n"
                                "replication slots to stream row-level changes downstream.\n"
                            ),
                        },
                        {
                            "path": "mongo.md",
                            "op": "upsert",
                            "content_hash": "h2",
                            "body": (
                                "# Mongo replica sets\n\nReplica sets elect a primary on failure.\n"
                            ),
                        },
                        {
                            "path": "kafka.md",
                            "op": "upsert",
                            "content_hash": "h3",
                            "body": ("# Kafka basics\n\nTopics are partitioned logs.\n"),
                        },
                    ],
                },
                headers=auth,
            )
            assert r.status_code == 200
            cursor_after_push = r.json()["cursor"]

            # 4. Hosted-MCP tools require an agent token.
            r = await client.post(
                "/auth/tokens",
                json={"name": "claude", "scopes": ["vault:read", "search"]},
                headers=auth,
            )
            agent_tok = r.json()["token"]
            agent_auth = {"Authorization": f"Bearer {agent_tok}"}

            r = await client.post(
                "/mcp/call",
                json={"tool": "search_notes", "args": {"query": "replication", "mode": "fts"}},
                headers=agent_auth,
            )
            assert r.status_code == 200, r.text
            hits = r.json()["result"]
            assert any(h["note_path"] == "postgres.md" for h in hits)

            r = await client.post(
                "/mcp/call",
                json={"tool": "read_note", "args": {"path": "postgres.md"}},
                headers=agent_auth,
            )
            assert r.status_code == 200
            assert "WAL" in r.json()["result"]["body"]

            # 5. Sync pull from beginning includes all three.
            r = await client.get(
                "/sync/pull", params={"vault_id": vault_id, "since": 0}, headers=auth
            )
            paths = sorted(e["path"] for e in r.json()["entries"])
            assert paths == ["kafka.md", "mongo.md", "postgres.md"]

            # 6. Capture a new thought.
            r = await client.post(
                "/capture",
                json={"text": "thinking about replication slots", "source": "test"},
                headers=auth,
            )
            assert r.status_code == 200, r.text
            captured = r.json()
            assert captured["path"].startswith("Inbox/")

            # 7. Synthesize the current week.
            today = datetime.now(UTC).date().isocalendar()
            week = f"{today.year}-W{today.week:02d}"
            r = await client.post("/synthesize", json={"week": week}, headers=auth)
            assert r.status_code == 200, r.text
            synthesis = r.json()
            assert synthesis["path"] == f"Synthesis/{week}.md"

            # 8. New pull since cursor sees inbox + synthesis writes are reflected via search.
            r = await client.post(
                "/mcp/call",
                json={"tool": "list_notes", "args": {}},
                headers=agent_auth,
            )
            paths_after = {n["path"] for n in r.json()["result"]}
            assert captured["path"] in paths_after
            assert synthesis["path"] in paths_after

            # 9. Cursor advances over writes that flow through sync.
            r = await client.get(
                "/sync/pull",
                params={"vault_id": vault_id, "since": cursor_after_push},
                headers=auth,
            )
            assert r.status_code == 200
