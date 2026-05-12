from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..session import close_vault_session, open_vault_session

router = APIRouter(prefix="/vault", tags=["vault"])


class OpenVaultRequest(BaseModel):
    root_path: str
    name: str | None = None


class VaultInfo(BaseModel):
    id: str
    name: str
    root_path: str


class IndexSummary(BaseModel):
    notes_indexed: int
    notes_skipped: int
    notes_failed: int
    chunks_indexed: int
    duration_seconds: float


class OpenVaultResponse(BaseModel):
    vault: VaultInfo
    indexed: IndexSummary


@router.post("/open", response_model=OpenVaultResponse)
async def open_vault(req: OpenVaultRequest, request: Request) -> OpenVaultResponse:
    storage = request.app.state.storage
    embedder = request.app.state.embedder
    if getattr(request.app.state, "vault_session", None) is not None:
        await close_vault_session(request.app.state.vault_session)
        request.app.state.vault_session = None
    try:
        session = await open_vault_session(
            storage=storage,
            embedder=embedder,
            root_path=Path(req.root_path),
            name=req.name,
        )
    except (FileNotFoundError, NotADirectoryError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    request.app.state.vault_session = session
    report = await session.indexer.index_vault()
    return OpenVaultResponse(
        vault=VaultInfo(id=session.vault.id, name=session.vault.name, root_path=session.vault.root_path),
        indexed=IndexSummary(
            notes_indexed=report.notes_indexed,
            notes_skipped=report.notes_skipped,
            notes_failed=report.notes_failed,
            chunks_indexed=report.chunks_indexed,
            duration_seconds=report.duration_seconds,
        ),
    )


@router.post("/close")
async def close_vault(request: Request) -> dict:
    session = getattr(request.app.state, "vault_session", None)
    if session is None:
        return {"closed": False}
    await close_vault_session(session)
    request.app.state.vault_session = None
    return {"closed": True}


@router.get("", response_model=VaultInfo | None)
async def current_vault(request: Request) -> VaultInfo | None:
    session = getattr(request.app.state, "vault_session", None)
    if session is None:
        return None
    return VaultInfo(id=session.vault.id, name=session.vault.name, root_path=session.vault.root_path)
