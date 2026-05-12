"""MCP server tool smoke test.

We don't speak the wire protocol here — we just verify the FastMCP server
exposes the three expected tools and that calling them in-process returns
results from the indexed vault.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from lattice_api.config import Mode, Settings
from lattice_api.mcp_server import build_server
from lattice_api.providers.embed.hash_provider import HashEmbeddingProvider
from lattice_api.session import close_vault_session, open_vault_session
from lattice_api.storage.sqlite import SqliteStorage


def _parse_tool_result(result) -> Any:
    """Extract a tool's return value from FastMCP's response.

    For list-returning tools, FastMCP emits one TextContent per item plus a
    structured `{"result": [...]}` envelope. For dict/scalar tools it emits a
    single TextContent and no envelope. Use the structured payload when
    present; otherwise parse the lone block.
    """
    if isinstance(result, tuple):
        content, structured = result
        if isinstance(structured, dict) and "result" in structured:
            return structured["result"]
    else:
        content = result
    assert content, "expected at least one content block"
    return json.loads(content[0].text)


@pytest.fixture
async def mcp_setup(tmp_path: Path, fixture_vault: Path):
    settings = Settings(
        mode=Mode.LOCAL, local_data_dir=tmp_path, embedding_provider="hash", local_token="test"
    )
    storage = SqliteStorage(settings.sqlite_path)
    await storage.init()
    embedder = HashEmbeddingProvider()
    session = await open_vault_session(
        storage=storage,
        embedder=embedder,
        root_path=fixture_vault,
        start_watcher=False,
    )
    await session.indexer.index_vault()
    server = build_server(storage, embedder, session)
    try:
        yield server, session, fixture_vault
    finally:
        await close_vault_session(session)
        await storage.close()


async def test_mcp_exposes_three_tools(mcp_setup) -> None:
    server, _session, _vault = mcp_setup
    tools = await server.list_tools()
    names = sorted(t.name for t in tools)
    assert names == ["list_notes", "read_note", "search_notes"]


async def test_mcp_search_notes(mcp_setup) -> None:
    server, _session, _vault = mcp_setup
    result = await server.call_tool("search_notes", {"query": "replication", "limit": 5})
    hits = _parse_tool_result(result)
    assert hits, "expected at least one hit"
    assert any(h["note_path"] == "postgres.md" for h in hits)


async def test_mcp_list_notes(mcp_setup) -> None:
    server, _session, _vault = mcp_setup
    result = await server.call_tool("list_notes", {})
    notes = _parse_tool_result(result)
    paths = sorted(n["path"] for n in notes)
    assert paths == ["kafka.md", "mongo.md", "postgres.md"]


async def test_mcp_read_note(mcp_setup) -> None:
    server, _session, _vault = mcp_setup
    result = await server.call_tool("read_note", {"path": "postgres.md"})
    note = _parse_tool_result(result)
    assert note["title"] == "Postgres replication"
    assert "WAL" in note["body"]


async def test_mcp_read_note_path_traversal(mcp_setup) -> None:
    server, _session, _vault = mcp_setup
    # FastMCP wraps tool exceptions; we just need to confirm it surfaces an error.
    with pytest.raises(Exception):  # noqa: B017
        await server.call_tool("read_note", {"path": "../escape.md"})
