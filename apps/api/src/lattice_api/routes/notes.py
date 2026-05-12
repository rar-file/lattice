from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteSummary(BaseModel):
    path: str
    title: str | None
    size: int


class NoteFull(BaseModel):
    path: str
    title: str | None
    frontmatter: dict | None
    body: str
    size: int
    content_hash: str


class WriteNoteRequest(BaseModel):
    body: str


class RenameNoteRequest(BaseModel):
    new_path: str


def _require_session(request: Request):
    session = getattr(request.app.state, "vault_session", None)
    if session is None:
        raise HTTPException(status_code=409, detail="no vault open")
    return session


def _safe_resolve(session, rel_path: str) -> Path:
    """Map a request-supplied relative path to an absolute path inside the vault.

    Reject anything that escapes via `..` or starts with `/` — defence in
    depth even though local mode trusts the caller; otherwise a curl from
    elsewhere on the host could read/write arbitrary files.
    """
    root = Path(session.vault.root_path).resolve()
    candidate = (root / rel_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="path escapes vault root") from e
    return candidate


@router.get("", response_model=list[NoteSummary])
async def list_notes_route(
    request: Request, prefix: str | None = None, limit: int = 1000
) -> list[NoteSummary]:
    session = _require_session(request)
    notes = await request.app.state.storage.list_notes(session.vault.id, prefix=prefix, limit=limit)
    return [NoteSummary(path=n.path, title=n.title, size=n.size) for n in notes]


@router.get("/{rel_path:path}", response_model=NoteFull)
async def get_note_route(rel_path: str, request: Request) -> NoteFull:
    session = _require_session(request)
    note = await request.app.state.storage.get_note(session.vault.id, rel_path)
    if note is None:
        raise HTTPException(status_code=404, detail="note not found")
    return NoteFull(
        path=note.path,
        title=note.title,
        frontmatter=note.frontmatter,
        body=note.body,
        size=note.size,
        content_hash=note.content_hash,
    )


@router.put("/{rel_path:path}", response_model=NoteFull)
async def put_note_route(rel_path: str, req: WriteNoteRequest, request: Request) -> NoteFull:
    session = _require_session(request)
    abs_path = _safe_resolve(session, rel_path)
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_text(req.body, encoding="utf-8")
    # Synchronously reindex so the response is immediately consistent. The
    # watcher will also fire on this write but its debounce would race the
    # response — easier to just do the work now.
    await session.indexer.index_file(abs_path)
    note = await request.app.state.storage.get_note(session.vault.id, rel_path)
    if note is None:  # pragma: no cover — index_file just upserted it
        raise HTTPException(status_code=500, detail="note disappeared after write")
    return NoteFull(
        path=note.path,
        title=note.title,
        frontmatter=note.frontmatter,
        body=note.body,
        size=note.size,
        content_hash=note.content_hash,
    )


@router.delete("/{rel_path:path}")
async def delete_note_route(rel_path: str, request: Request) -> dict:
    session = _require_session(request)
    abs_path = _safe_resolve(session, rel_path)
    deleted_disk = False
    if abs_path.exists():
        abs_path.unlink()
        deleted_disk = True
    deleted_db = await session.indexer.delete_file(abs_path)
    return {"deleted_disk": deleted_disk, "deleted_db": deleted_db}


# Rename has its own route off /notes-rename/{old_path:path} rather than
# living under /notes/{path:path} so it doesn't collide with the catch-all
# GET/PUT/DELETE handlers above.
rename_router = APIRouter(prefix="/notes-rename", tags=["notes"])


@rename_router.post("/{rel_path:path}", response_model=NoteFull)
async def rename_note_route(rel_path: str, req: RenameNoteRequest, request: Request) -> NoteFull:
    """Rename / move a note inside the vault.

    Reads the existing body, writes it at the new path, deletes the old file,
    and reindexes. Errors if the destination already exists — we don't silently
    overwrite a different note.
    """

    session = _require_session(request)
    src = _safe_resolve(session, rel_path)
    if not src.exists() or not src.is_file():
        raise HTTPException(status_code=404, detail="source note not found")

    new_rel = req.new_path.strip().lstrip("/")
    if not new_rel:
        raise HTTPException(status_code=400, detail="new_path is required")
    if not new_rel.lower().endswith(".md"):
        new_rel = f"{new_rel}.md"
    dst = _safe_resolve(session, new_rel)
    if dst == src:
        # no-op rename — just return the current note
        note = await request.app.state.storage.get_note(session.vault.id, rel_path)
        if note is None:  # pragma: no cover
            raise HTTPException(status_code=500, detail="note disappeared")
        return NoteFull(
            path=note.path,
            title=note.title,
            frontmatter=note.frontmatter,
            body=note.body,
            size=note.size,
            content_hash=note.content_hash,
        )
    if dst.exists():
        raise HTTPException(status_code=409, detail=f"destination {new_rel} already exists")

    body = src.read_text(encoding="utf-8")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(body, encoding="utf-8")
    src.unlink()
    await session.indexer.delete_file(src)
    await session.indexer.index_file(dst)
    note = await request.app.state.storage.get_note(session.vault.id, new_rel)
    if note is None:  # pragma: no cover
        raise HTTPException(status_code=500, detail="note disappeared after rename")
    return NoteFull(
        path=note.path,
        title=note.title,
        frontmatter=note.frontmatter,
        body=note.body,
        size=note.size,
        content_hash=note.content_hash,
    )
