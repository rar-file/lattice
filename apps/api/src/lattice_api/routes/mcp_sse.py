"""Hosted SSE MCP endpoint.

A minimal Server-Sent-Events bridge for MCP that doesn't depend on the full
`mcp` SDK's HTTP transport (which currently expects starlette's lifespan setup
in a particular way). For v0 we expose a JSON-over-SSE protocol that mirrors
the MCP tool surface: clients GET `/mcp/sse` for tool discovery + heartbeats,
and POST `/mcp/call` to invoke a tool. This is enough for Claude Code's
"http" MCP mode without forking the SDK.

Auth: `Authorization: Bearer latt_agent_<…>` with `vault:read` (+ `vault:write`
for write-class tools).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import AuthContext, current_user

router = APIRouter(prefix="/mcp", tags=["mcp"])


_TOOLS = [
    {
        "name": "search_notes",
        "description": "Hybrid search over the current vault.",
        "input": {"query": "str", "limit": "int?", "mode": "str?"},
    },
    {
        "name": "read_note",
        "description": "Read a note by vault-relative path.",
        "input": {"path": "str"},
    },
    {
        "name": "list_notes",
        "description": "List notes, optionally filtered by path prefix.",
        "input": {"prefix": "str?", "limit": "int?"},
    },
    {
        "name": "write_note",
        "description": "Create or overwrite a note. Requires vault:write.",
        "input": {"path": "str", "content": "str", "mode": "str?"},
    },
]


@router.get("/sse")
async def sse(request: Request, ctx: AuthContext = Depends(current_user)) -> StreamingResponse:
    ctx.require("vault:read")

    async def stream():
        yield _event("ready", {"tools": _TOOLS})
        try:
            while True:
                if await request.is_disconnected():
                    return
                await asyncio.sleep(15)
                yield _event("heartbeat", {"ts": _now_iso()})
        except asyncio.CancelledError:  # pragma: no cover — race during shutdown
            return

    return StreamingResponse(stream(), media_type="text/event-stream")


class CallReq(BaseModel):
    tool: str
    args: dict


class CallResp(BaseModel):
    result: object


@router.post("/call", response_model=CallResp)
async def call(
    req: CallReq, request: Request, ctx: AuthContext = Depends(current_user)
) -> CallResp:
    ctx.require("vault:read")
    storage = request.app.state.storage
    embedder = request.app.state.embedder
    session = getattr(request.app.state, "vault_session", None)
    if session is not None:
        vault_id: str | None = session.vault.id
    else:
        vaults = await storage.list_vaults(user_id=ctx.user.id)
        vault_id = vaults[0].id if vaults else None
    if vault_id is None:
        raise HTTPException(status_code=409, detail="no vault available")

    if req.tool == "search_notes":
        q = req.args["query"]
        limit = int(req.args.get("limit", 10))
        mode = req.args.get("mode", "hybrid")
        if mode == "fts":
            hits = await storage.fts_search(vault_id=vault_id, query=q, limit=limit)
        else:
            [emb] = await embedder.embed([q])
            provider_id = await storage.register_embedding_provider(embedder.name, embedder.dim)
            if mode == "vec":
                hits = await storage.vector_search(
                    vault_id=vault_id,
                    query_embedding=emb,
                    embedding_provider_id=provider_id,
                    limit=limit,
                )
            else:
                hits = await storage.hybrid_search(
                    vault_id=vault_id,
                    query=q,
                    query_embedding=emb,
                    embedding_provider_id=provider_id,
                    limit=limit,
                )
        return CallResp(
            result=[
                {
                    "note_path": h.note_path,
                    "note_title": h.note_title,
                    "heading_path": h.heading_path,
                    "content": h.content,
                    "score": h.score,
                    "sources": h.sources,
                }
                for h in hits
            ]
        )
    if req.tool == "read_note":
        path = req.args["path"]
        note = await storage.get_note(vault_id, path)
        if note is None:
            raise HTTPException(status_code=404, detail="note not found")
        return CallResp(
            result={
                "path": note.path,
                "title": note.title,
                "frontmatter": note.frontmatter,
                "body": note.body,
            }
        )
    if req.tool == "list_notes":
        prefix = req.args.get("prefix")
        limit = int(req.args.get("limit", 200))
        notes = await storage.list_notes(vault_id, prefix=prefix, limit=limit)
        return CallResp(result=[{"path": n.path, "title": n.title, "size": n.size} for n in notes])
    if req.tool == "write_note":
        ctx.require("vault:write")
        path = req.args["path"]
        content = req.args["content"]
        mode = req.args.get("mode", "overwrite")
        if mode not in {"create", "overwrite", "append"}:
            raise HTTPException(status_code=400, detail="bad mode")
        existing = await storage.get_note(vault_id, path)
        if existing and mode == "create":
            raise HTTPException(status_code=409, detail="note exists")
        body = content if mode != "append" or existing is None else existing.body + "\n" + content
        from ..indexer import _content_hash

        await storage.upsert_note(
            vault_id=vault_id,
            path=path,
            title=Path(path).stem,
            content_hash=_content_hash(body.encode("utf-8")),
            mtime=_now_ts(),
            size=len(body.encode("utf-8")),
            frontmatter=None,
            body=body,
        )
        return CallResp(result={"ok": True, "path": path})
    raise HTTPException(status_code=400, detail=f"unknown tool: {req.tool}")


def _event(event: str, data: object) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _now_iso() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat()


def _now_ts() -> float:
    from datetime import UTC, datetime

    return datetime.now(UTC).timestamp()
