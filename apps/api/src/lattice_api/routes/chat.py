from __future__ import annotations

import dataclasses

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..chat import chat_with_vault

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    query: str
    top_k: int = Field(default=8, ge=1, le=50)
    model: str | None = None
    max_tokens: int = Field(default=1024, ge=64, le=8192)


class CitationOut(BaseModel):
    n: int
    note_id: str
    note_path: str
    note_title: str | None
    chunk_id: str
    heading_path: str | None
    snippet: str


class ChatResponseOut(BaseModel):
    answer: str
    citations: list[CitationOut]
    model: str
    usage: dict[str, int]


@router.post("", response_model=ChatResponseOut)
async def chat_route(req: ChatRequest, request: Request) -> ChatResponseOut:
    session = getattr(request.app.state, "vault_session", None)
    if session is None:
        raise HTTPException(status_code=409, detail="no vault open")
    storage = request.app.state.storage
    embedder = request.app.state.embedder
    llm = request.app.state.llm

    [query_emb] = await embedder.embed([req.query])
    hits = await storage.hybrid_search(
        vault_id=session.vault.id,
        query=req.query,
        query_embedding=query_emb,
        embedding_provider_id=session.embedding_provider_id,
        limit=req.top_k,
    )
    result = await chat_with_vault(
        llm=llm, query=req.query, hits=hits, model=req.model, max_tokens=req.max_tokens
    )
    return ChatResponseOut(
        answer=result.answer,
        citations=[CitationOut(**dataclasses.asdict(c)) for c in result.citations],
        model=result.model,
        usage={
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "cached_input_tokens": result.cached_input_tokens,
        },
    )
