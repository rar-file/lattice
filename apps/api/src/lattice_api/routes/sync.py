"""Sync routes (cloud mode).

The cloud holds a copy of every note + an append-only `sync_log`. Clients:
  * push: send their changed paths/bodies; cloud writes to notes + sync_log
  * pull: ask for sync_log entries since `cursor`; apply locally with conflict policy

Conflict policy lives on the client (CLI/desktop). The server is a dumb log.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth import AuthContext, current_user

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncVaultEnsureReq(BaseModel):
    name: str
    root_path: str = "cloud://"


class SyncVaultInfo(BaseModel):
    id: str
    name: str
    root_path: str


@router.post("/vault", response_model=SyncVaultInfo)
async def ensure_vault(
    req: SyncVaultEnsureReq,
    request: Request,
    ctx: AuthContext = Depends(current_user),
) -> SyncVaultInfo:
    storage = request.app.state.storage
    # Cloud vaults are scoped per user; for v0 we keep one vault per user with
    # a stable synthetic root_path ("cloud://<user_id>").
    synthetic = f"cloud://{ctx.user.id}"
    from pathlib import Path as _P

    # storage.upsert_vault expects a Path; encode synthetic via Path(synthetic)
    # which Postgres/SQLite store as-is in the `root_path` column.
    vault = await storage.upsert_vault(req.name, _P(synthetic), user_id=ctx.user.id)
    return SyncVaultInfo(id=vault.id, name=vault.name, root_path=vault.root_path)


class PushItem(BaseModel):
    path: str
    op: str = Field(..., pattern="^(upsert|delete|rename)$")
    new_path: str | None = None
    content_hash: str | None = None
    body: str | None = None
    mtime: float | None = None


class PushReq(BaseModel):
    vault_id: str
    items: list[PushItem]


class PushResp(BaseModel):
    accepted: int
    cursor: int


@router.post("/push", response_model=PushResp)
async def push(
    req: PushReq, request: Request, ctx: AuthContext = Depends(current_user)
) -> PushResp:
    ctx.require("vault:write")
    storage = request.app.state.storage
    embedder = request.app.state.embedder
    vault = await storage.get_vault(req.vault_id)
    if vault is None or (vault.user_id and vault.user_id != ctx.user.id):
        raise HTTPException(status_code=404, detail="vault not found")
    provider_id = await storage.register_embedding_provider(embedder.name, embedder.dim)
    last_id = 0
    accepted = 0
    for item in req.items:
        if item.op == "upsert":
            if item.body is None or item.content_hash is None:
                raise HTTPException(status_code=400, detail="upsert needs body+content_hash")
            mtime = item.mtime or datetime.now(UTC).timestamp()
            title = _title_from_path(item.path)
            note = await storage.upsert_note(
                vault_id=req.vault_id,
                path=item.path,
                title=title,
                content_hash=item.content_hash,
                mtime=mtime,
                size=len(item.body.encode("utf-8")),
                frontmatter=None,
                body=item.body,
            )
            # Chunk + embed so the cloud copy is searchable. Skips on empty body.
            from ..indexer import chunk_markdown

            chunks = chunk_markdown(item.body)
            if chunks:
                embs = await embedder.embed([c.content for c in chunks])
                await storage.replace_chunks_for_note(
                    note_id=note.id,
                    chunks=chunks,
                    embeddings=embs,
                    embedding_provider_id=provider_id,
                )
            entry = await storage.append_sync_log(
                vault_id=req.vault_id,
                op="upsert",
                path=item.path,
                content_hash=item.content_hash,
                body=item.body,
            )
        elif item.op == "delete":
            await storage.delete_note(req.vault_id, item.path)
            entry = await storage.append_sync_log(
                vault_id=req.vault_id, op="delete", path=item.path
            )
        else:  # rename
            if not item.new_path:
                raise HTTPException(status_code=400, detail="rename needs new_path")
            existing = await storage.get_note(req.vault_id, item.path)
            if existing is None:
                raise HTTPException(status_code=404, detail=f"note not found: {item.path}")
            await storage.upsert_note(
                vault_id=req.vault_id,
                path=item.new_path,
                title=existing.title,
                content_hash=existing.content_hash,
                mtime=existing.mtime.timestamp(),
                size=existing.size,
                frontmatter=existing.frontmatter,
                body=existing.body,
            )
            await storage.delete_note(req.vault_id, item.path)
            entry = await storage.append_sync_log(
                vault_id=req.vault_id, op="rename", path=item.path, new_path=item.new_path
            )
        last_id = max(last_id, entry.id)
        accepted += 1
    return PushResp(accepted=accepted, cursor=last_id)


class PullEntry(BaseModel):
    id: int
    op: str
    path: str
    new_path: str | None
    content_hash: str | None
    body: str | None
    ts: str


class PullResp(BaseModel):
    cursor: int
    entries: list[PullEntry]


@router.get("/pull", response_model=PullResp)
async def pull(
    vault_id: str,
    request: Request,
    since: int = 0,
    limit: int = 500,
    ctx: AuthContext = Depends(current_user),
) -> PullResp:
    ctx.require("vault:read")
    storage = request.app.state.storage
    vault = await storage.get_vault(vault_id)
    if vault is None or (vault.user_id and vault.user_id != ctx.user.id):
        raise HTTPException(status_code=404, detail="vault not found")
    entries = await storage.sync_log_since(vault_id=vault_id, since_id=since, limit=limit)
    cursor = entries[-1].id if entries else since
    return PullResp(
        cursor=cursor,
        entries=[
            PullEntry(
                id=e.id,
                op=e.op,
                path=e.path,
                new_path=e.new_path,
                content_hash=e.content_hash,
                body=e.body,
                ts=e.ts.isoformat(),
            )
            for e in entries
        ],
    )


def _title_from_path(path: str) -> str:
    return path.rsplit("/", 1)[-1].removesuffix(".md")
