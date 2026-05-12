from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..config import Mode
from ..session import close_vault_session, open_vault_session

router = APIRouter(prefix="/vault", tags=["vault"])


def _reject_in_cloud(request: Request) -> None:
    """`/vault/open` (and the in-process indexer it spawns) is local-only.

    In cloud mode the canonical store *is* Postgres + the sync log — the
    desktop/CLI mirrors content via `/sync/push` instead of opening a disk
    path on the cloud server. Without this guard, an authenticated agent
    token could trick the cloud process into walking arbitrary filesystem
    paths server-side.
    """

    if request.app.state.settings.mode is Mode.CLOUD:
        raise HTTPException(
            status_code=400, detail="vault/open is local-only; use /sync/vault in cloud mode"
        )


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


class InitVaultRequest(BaseModel):
    root_path: str
    name: str | None = None


_STARTER_WELCOME = """\
---
title: Welcome to Lattice
tags: [meta, getting-started]
---

# Welcome to Lattice

This is your **vault** — every Markdown file inside this folder is part of it.
Lattice indexes them as you write, so anything you've ever written is one
search or one question away.

## A few things to try

- **⌘K** — focus the search panel and find anything in your vault by meaning,
  not just keywords. Hybrid (semantic + keyword) search is on by default.
- **⇧⌘C** — open the *capture* modal. Drop a raw thought and Lattice will
  reshape it into a clean atomic note in `Inbox/`.
- **[[wikilinks]]** — type `[[` followed by a note title to link to it.
  Lattice will also suggest links as you write, below the editor.
- **Chat with your vault** — switch the right panel to *chat* and ask
  questions. Answers are grounded in your notes with citations you can click.

## How your notes are organised

You don't have to follow any convention, but a useful starting point is:

- `Inbox/` — anything captured quickly, to be filed later
- `Synthesis/` — weekly rollups generated from your notes
- everything else — your real notes, in whatever folders feel natural

Delete this file whenever you'd like. It's just here to break the ice.
"""

_STARTER_INBOX_GITKEEP = ""


@router.post("/init", response_model=OpenVaultResponse)
async def init_vault(req: InitVaultRequest, request: Request) -> OpenVaultResponse:
    """Create a new local vault folder seeded with a starter note, then open it.

    Used by the first-run flow when the user picks "Create a new vault" instead
    of pointing at an existing folder. Errors if `root_path` already exists and
    is non-empty so we never overwrite a user's data.
    """

    _reject_in_cloud(request)
    root = Path(req.root_path).expanduser()
    try:
        if root.exists():
            if not root.is_dir():
                raise HTTPException(status_code=400, detail=f"{root} is not a directory")
            if any(root.iterdir()):
                raise HTTPException(
                    status_code=400,
                    detail=f"{root} is not empty; pick a fresh folder or use Open Existing",
                )
        else:
            root.mkdir(parents=True, exist_ok=True)
        (root / "Inbox").mkdir(exist_ok=True)
        welcome = root / "Welcome.md"
        if not welcome.exists():
            welcome.write_text(_STARTER_WELCOME, encoding="utf-8")
        gitkeep = root / "Inbox" / ".gitkeep"
        if not gitkeep.exists():
            gitkeep.write_text(_STARTER_INBOX_GITKEEP, encoding="utf-8")
    except PermissionError as e:
        raise HTTPException(status_code=400, detail=f"can't write to {root}: {e}") from e
    return await open_vault(OpenVaultRequest(root_path=str(root), name=req.name), request)


@router.post("/open", response_model=OpenVaultResponse)
async def open_vault(req: OpenVaultRequest, request: Request) -> OpenVaultResponse:
    _reject_in_cloud(request)
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
        vault=VaultInfo(
            id=session.vault.id, name=session.vault.name, root_path=session.vault.root_path
        ),
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
    return VaultInfo(
        id=session.vault.id, name=session.vault.name, root_path=session.vault.root_path
    )
