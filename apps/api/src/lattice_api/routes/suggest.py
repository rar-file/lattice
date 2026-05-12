"""Ambient link + capture endpoints (M3).

`POST /suggest/links` takes the user's current paragraph + cursor and returns
ranked existing notes to suggest a wikilink to. Backed by vector search on the
paragraph.

`POST /capture` takes a raw thought + optional source, asks Claude to draft an
atomic note (title + frontmatter + body), and writes it to `Inbox/<date>-<slug>.md`.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..auth import AuthContext, current_user

router = APIRouter(tags=["suggest"])


class SuggestLinksReq(BaseModel):
    paragraph: str
    cursor_offset: int | None = None
    limit: int = Field(default=5, ge=1, le=20)


class LinkSuggestion(BaseModel):
    path: str
    title: str | None
    score: float
    snippet: str
    anchor: str | None = None  # which phrase to wrap as the wikilink


class SuggestLinksResp(BaseModel):
    suggestions: list[LinkSuggestion]


@router.post("/suggest/links", response_model=SuggestLinksResp)
async def suggest_links(
    req: SuggestLinksReq, request: Request, ctx: AuthContext = Depends(current_user)
) -> SuggestLinksResp:
    storage = request.app.state.storage
    embedder = request.app.state.embedder
    session = getattr(request.app.state, "vault_session", None)
    if session is None:
        # Cloud fallback — pick the user's first vault.
        vaults = await storage.list_vaults(user_id=ctx.user.id)
        if not vaults:
            return SuggestLinksResp(suggestions=[])
        vault_id = vaults[0].id
        provider_id = await storage.register_embedding_provider(embedder.name, embedder.dim)
    else:
        vault_id = session.vault.id
        provider_id = session.embedding_provider_id

    p = req.paragraph.strip()
    if not p:
        return SuggestLinksResp(suggestions=[])

    [emb] = await embedder.embed([p])
    hits = await storage.hybrid_search(
        vault_id=vault_id,
        query=p,
        query_embedding=emb,
        embedding_provider_id=provider_id,
        limit=req.limit * 2,
    )

    suggestions: list[LinkSuggestion] = []
    seen_paths: set[str] = set()
    for h in hits:
        if h.note_path in seen_paths:
            continue
        seen_paths.add(h.note_path)
        anchor = _pick_anchor(p, h.note_title) if h.note_title else None
        suggestions.append(
            LinkSuggestion(
                path=h.note_path,
                title=h.note_title,
                score=h.score,
                snippet=_truncate(h.content, 140),
                anchor=anchor,
            )
        )
        if len(suggestions) >= req.limit:
            break

    return SuggestLinksResp(suggestions=suggestions)


def _truncate(s: str, n: int) -> str:
    if len(s) <= n:
        return s
    return s[: n - 1].rsplit(" ", 1)[0] + "…"


def _pick_anchor(paragraph: str, title: str) -> str | None:
    """Find a phrase in the paragraph that best matches the target note title."""
    title_norm = title.lower()
    p_lower = paragraph.lower()
    if title_norm in p_lower:
        idx = p_lower.index(title_norm)
        return paragraph[idx : idx + len(title)]
    # fall back to longest title token present in paragraph
    tokens = [t for t in re.split(r"\W+", title) if len(t) >= 4]
    for t in sorted(tokens, key=len, reverse=True):
        if t.lower() in p_lower:
            return t
    return None


# ----- Capture -----------------------------------------------------------


class CaptureReq(BaseModel):
    text: str
    source: str | None = None  # e.g. "cli", "tray", "slack"
    inbox_dir: str = "Inbox"


class CaptureResp(BaseModel):
    path: str
    title: str
    body: str


_CAPTURE_SYSTEM = """\
You convert raw thoughts into atomic markdown notes. Each note has:
- a short, specific title (Title Case, no quotes)
- YAML frontmatter with `tags` (list, lowercase, kebab-case) and `source`
- a body that is one or two paragraphs in the author's own voice, lightly edited
  for clarity. Do not invent facts. Preserve any links or code verbatim.
Respond ONLY with the note content (frontmatter + body), no explanation.
"""


@router.post("/capture", response_model=CaptureResp)
async def capture(
    req: CaptureReq, request: Request, ctx: AuthContext = Depends(current_user)
) -> CaptureResp:
    ctx.require("vault:write")
    storage = request.app.state.storage
    llm = request.app.state.llm
    embedder = request.app.state.embedder
    session = getattr(request.app.state, "vault_session", None)

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty capture text")

    from ..providers.llm import Message, SystemBlock

    settings = request.app.state.settings

    # When no real LLM is wired (no Anthropic key → fallback stub), don't run
    # the user's thought through something that just returns "Stub reply [1]".
    # Write the raw text verbatim with a friendly frontmatter shell. Users
    # who configure Anthropic still get the reshape behavior.
    if getattr(llm, "is_fallback", False):
        title = _title_from_raw(text)
        drafted = _raw_capture_note(text, title, source=req.source)
    else:
        model = settings.cheap_llm_model
        user_msg = (
            f"Source: {req.source or 'manual'}\n\n"
            f"Raw thought:\n{text}\n\nDraft the atomic note now."
        )
        resp = await llm.chat(
            [Message(role="user", content=user_msg)],
            system=[SystemBlock(text=_CAPTURE_SYSTEM, cache=True)],
            model=model,
            max_tokens=512,
        )
        drafted = resp.content.strip() or _raw_capture_note(
            text, _title_from_raw(text), source=req.source
        )
        title, _ = _split_title_and_body(drafted)
    slug = _slugify(title)
    date_prefix = datetime.now(UTC).strftime("%Y-%m-%d")
    rel = f"{req.inbox_dir.rstrip('/')}/{date_prefix}-{slug}.md"

    if session is not None:
        abs_path = Path(session.vault.root_path) / rel
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_text(drafted, encoding="utf-8")
        await session.indexer.index_file(abs_path)
    else:
        vaults = await storage.list_vaults(user_id=ctx.user.id)
        if not vaults:
            raise HTTPException(status_code=409, detail="no vault available")
        vault_id = vaults[0].id
        from ..indexer import _content_hash

        provider_id = await storage.register_embedding_provider(embedder.name, embedder.dim)
        note = await storage.upsert_note(
            vault_id=vault_id,
            path=rel,
            title=title,
            content_hash=_content_hash(drafted.encode("utf-8")),
            mtime=datetime.now(UTC).timestamp(),
            size=len(drafted.encode("utf-8")),
            frontmatter=None,
            body=drafted,
        )
        # Chunk + embed inline (no Indexer needed since there's no disk).
        from ..indexer import chunk_markdown

        chunks = chunk_markdown(drafted)
        if chunks:
            embs = await embedder.embed([c.content for c in chunks])
            await storage.replace_chunks_for_note(
                note_id=note.id,
                chunks=chunks,
                embeddings=embs,
                embedding_provider_id=provider_id,
            )

    return CaptureResp(path=rel, title=title, body=drafted)


def _split_title_and_body(drafted: str) -> tuple[str, str]:
    """Pull a title out of the drafted note (frontmatter `title:` or first H1 or filename)."""
    title = ""
    for line in drafted.splitlines():
        line = line.strip()
        if line.lower().startswith("title:"):
            title = line.split(":", 1)[1].strip().strip('"').strip("'")
            break
        m = re.match(r"#\s+(.+)", line)
        if m:
            title = m.group(1).strip()
            break
    if not title:
        title = "Untitled Capture"
    return title, drafted


def _slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "note"


def _title_from_raw(text: str) -> str:
    """Best-effort title from raw capture text: first non-empty line, stripped
    of markdown markers, capped at ~64 chars. Falls back to first 8 words."""
    for line in text.splitlines():
        line = line.strip().lstrip("#").strip()
        if line:
            return (line[:64] + "…") if len(line) > 64 else line
    words = text.split()[:8]
    return " ".join(words) or "Captured note"


def _raw_capture_note(text: str, title: str, *, source: str | None) -> str:
    """Build a verbatim atomic note when no real LLM is wired."""
    ts = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    src = source or "manual"
    safe_title = title.replace('"', "'")
    # Quote the timestamp so PyYAML doesn't materialise it as a `datetime`
    # object — the indexer JSON-encodes frontmatter and would explode.
    return (
        "---\n"
        f'title: "{safe_title}"\n'
        f"source: {src}\n"
        f'captured: "{ts}"\n'
        "tags: [inbox]\n"
        "---\n\n"
        f"# {title}\n\n"
        f"{text}\n"
    )
