from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/search", tags=["search"])


class SearchHitOut(BaseModel):
    note_id: str
    note_path: str
    note_title: str | None
    chunk_id: str
    chunk_ord: int
    heading_path: str | None
    content: str
    score: float
    sources: list[str]


@router.get("", response_model=list[SearchHitOut])
async def search_route(
    request: Request,
    q: str,
    limit: int = 10,
    mode: str = "hybrid",
) -> list[SearchHitOut]:
    session = getattr(request.app.state, "vault_session", None)
    if session is None:
        raise HTTPException(status_code=409, detail="no vault open")
    if not q.strip():
        return []
    storage = request.app.state.storage
    embedder = request.app.state.embedder

    if mode == "fts":
        hits = await storage.fts_search(vault_id=session.vault.id, query=q, limit=limit)
    elif mode == "vec":
        [query_emb] = await embedder.embed([q])
        hits = await storage.vector_search(
            vault_id=session.vault.id,
            query_embedding=query_emb,
            embedding_provider_id=session.embedding_provider_id,
            limit=limit,
        )
    elif mode == "hybrid":
        [query_emb] = await embedder.embed([q])
        hits = await storage.hybrid_search(
            vault_id=session.vault.id,
            query=q,
            query_embedding=query_emb,
            embedding_provider_id=session.embedding_provider_id,
            limit=limit,
        )
    else:
        raise HTTPException(status_code=400, detail=f"unknown mode {mode!r}")

    return [
        SearchHitOut(
            note_id=h.note_id,
            note_path=h.note_path,
            note_title=h.note_title,
            chunk_id=h.chunk_id,
            chunk_ord=h.chunk_ord,
            heading_path=h.heading_path,
            content=h.content,
            score=h.score,
            sources=h.sources,
        )
        for h in hits
    ]
