"""Weekly synthesis (M4).

`POST /synthesize` runs the synthesis job for a given ISO week (default: this
week). It pulls the notes modified during the week, asks the LLM to summarise
themes / surfaced questions / loose threads, and writes
`Synthesis/YYYY-Www.md` with wikilinks back to the source notes.

In cloud mode, a scheduler hits this endpoint weekly. In local mode the CLI
(`lattice synthesize`) calls it on demand.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ..auth import AuthContext, current_user

router = APIRouter(prefix="/synthesize", tags=["synthesis"])


SYNTHESIS_SYSTEM = """\
You read a week of notes from someone's personal knowledge vault and produce a
short synthesis. Output sections:

# Synthesis YYYY-Www

## Themes
2–5 bullets, each linking to the notes that anchor the theme via `[[Note Title]]` wikilinks.

## Questions surfaced
Bullets of questions the author seems to be working on, with wikilinks.

## Loose threads
Things partially explored that warrant more attention next week.

Use ONLY the notes given. Cite via wikilinks; do not invent titles. Be terse.
"""


class SynthesizeReq(BaseModel):
    week: str | None = None  # ISO week label e.g. "2026-W19"; default = current week
    inbox_dir: str = "Synthesis"


class SynthesizeResp(BaseModel):
    path: str
    week: str
    n_notes: int
    body: str


@router.post("", response_model=SynthesizeResp)
async def synthesize(
    req: SynthesizeReq, request: Request, ctx: AuthContext = Depends(current_user)
) -> SynthesizeResp:
    ctx.require("vault:write")
    storage = request.app.state.storage
    llm = request.app.state.llm
    session = getattr(request.app.state, "vault_session", None)

    week = req.week or _current_week_label()
    week_start, week_end = _week_bounds(week)

    if session is not None:
        vault_id = session.vault.id
    else:
        vaults = await storage.list_vaults(user_id=ctx.user.id)
        if not vaults:
            raise HTTPException(status_code=409, detail="no vault available")
        vault_id = vaults[0].id

    all_notes = await storage.list_notes(vault_id, limit=10000)
    week_notes = [
        n
        for n in all_notes
        if week_start <= n.mtime.astimezone(UTC).date() <= week_end
        and not n.path.startswith(req.inbox_dir.rstrip("/") + "/")
    ]
    if not week_notes:
        body = f"# Synthesis {week}\n\nNo notes were modified this week.\n"
        path = f"{req.inbox_dir.rstrip('/')}/{week}.md"
        await _write_note(request, vault_id, path, body)
        return SynthesizeResp(path=path, week=week, n_notes=0, body=body)

    payload = _format_payload(week_notes)
    from ..providers.llm import Message, SystemBlock

    resp = await llm.chat(
        [Message(role="user", content=payload)],
        system=[SystemBlock(text=SYNTHESIS_SYSTEM.replace("YYYY-Www", week), cache=True)],
        model=request.app.state.settings.default_llm_model,
        max_tokens=1500,
    )
    body = resp.content.strip()
    path = f"{req.inbox_dir.rstrip('/')}/{week}.md"
    await _write_note(request, vault_id, path, body)

    return SynthesizeResp(path=path, week=week, n_notes=len(week_notes), body=body)


def _current_week_label() -> str:
    today = datetime.now(UTC).date()
    iso = today.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _week_bounds(label: str) -> tuple[date, date]:
    try:
        year_str, week_str = label.split("-W")
        year = int(year_str)
        week = int(week_str)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"bad week label: {label}") from e
    monday = date.fromisocalendar(year, week, 1)
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _format_payload(notes) -> str:
    parts: list[str] = []
    for n in notes:
        title = n.title or n.path
        head = f"## [[{title}]]\nPath: {n.path}\nModified: {n.mtime.isoformat()}\n\n"
        body = n.body if len(n.body) < 4000 else n.body[:4000] + "\n…(truncated)"
        parts.append(head + body)
    return "\n\n---\n\n".join(parts)


async def _write_note(request, vault_id: str, path: str, body: str) -> None:
    storage = request.app.state.storage
    embedder = request.app.state.embedder
    session = getattr(request.app.state, "vault_session", None)
    from ..indexer import _content_hash, chunk_markdown

    if session is not None:
        abs_path = Path(session.vault.root_path) / path
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_text(body, encoding="utf-8")
        await session.indexer.index_file(abs_path)
        return
    provider_id = await storage.register_embedding_provider(embedder.name, embedder.dim)
    note = await storage.upsert_note(
        vault_id=vault_id,
        path=path,
        title=path.rsplit("/", 1)[-1].removesuffix(".md"),
        content_hash=_content_hash(body.encode("utf-8")),
        mtime=datetime.now(UTC).timestamp(),
        size=len(body.encode("utf-8")),
        frontmatter=None,
        body=body,
    )
    chunks = chunk_markdown(body)
    if chunks:
        embs = await embedder.embed([c.content for c in chunks])
        await storage.replace_chunks_for_note(
            note_id=note.id,
            chunks=chunks,
            embeddings=embs,
            embedding_provider_id=provider_id,
        )
