"""Chat over the vault: retrieve → format sources → call LLM → parse citations.

The prompt design is deliberately small and Anthropic-friendly:
    * System block 1 (cached): high-level instructions including the citation
      format. This is stable across queries so the prompt cache catches it.
    * System block 2: numbered SOURCES list built from retrieval hits. This
      varies per query so it's *not* cached — caching changing content would
      pay the write cost without recouping a hit.
    * The user query goes in as a single user message.

The model is instructed to use `[n]` markers. We post-parse the response
for those markers and build a citations array tying each `n` back to the
source chunk so the UI can render real links.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from .providers.llm import LLMProvider, Message, SystemBlock
from .storage.models import SearchHit

log = logging.getLogger("lattice.chat")

SYSTEM_INSTRUCTIONS = """You are Lattice, an assistant that answers questions about the user's own notes.

Rules:
- Answer the user's question using ONLY information present in the SOURCES section below.
- Cite each claim inline using bracketed numbers like [1] or [2, 3] that correspond to
  numbered entries in the SOURCES list.
- If the SOURCES don't contain enough information to answer, say so plainly. Do not
  invent facts or cite sources you weren't given.
- Be concise. Prefer short, direct answers over preambles.""".strip()


@dataclass(slots=True)
class Citation:
    n: int
    note_id: str
    note_path: str
    note_title: str | None
    chunk_id: str
    heading_path: str | None
    snippet: str


@dataclass(slots=True)
class ChatResult:
    answer: str
    citations: list[Citation]
    model: str
    input_tokens: int
    output_tokens: int
    cached_input_tokens: int


def _format_sources(hits: list[SearchHit]) -> str:
    lines: list[str] = ["SOURCES"]
    for i, hit in enumerate(hits, start=1):
        loc = hit.note_path
        if hit.heading_path:
            loc = f"{hit.note_path} :: {hit.heading_path}"
        lines.append(f"[{i}] {loc}")
        lines.append(hit.content.strip())
        lines.append("")
    return "\n".join(lines).strip()


_CITE_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")


def _parse_citations(answer: str, hits: list[SearchHit]) -> list[Citation]:
    seen: dict[int, Citation] = {}
    for match in _CITE_RE.finditer(answer):
        for num_str in match.group(1).split(","):
            try:
                n = int(num_str.strip())
            except ValueError:
                continue
            if not (1 <= n <= len(hits)) or n in seen:
                continue
            hit = hits[n - 1]
            snippet = hit.content.strip()
            if len(snippet) > 240:
                snippet = snippet[:237] + "…"
            seen[n] = Citation(
                n=n,
                note_id=hit.note_id,
                note_path=hit.note_path,
                note_title=hit.note_title,
                chunk_id=hit.chunk_id,
                heading_path=hit.heading_path,
                snippet=snippet,
            )
    return [seen[k] for k in sorted(seen)]


async def chat_with_vault(
    *,
    llm: LLMProvider,
    query: str,
    hits: list[SearchHit],
    model: str | None = None,
    max_tokens: int = 1024,
) -> ChatResult:
    sources = _format_sources(hits) if hits else "SOURCES\n(no notes retrieved)"
    system = [
        SystemBlock(text=SYSTEM_INSTRUCTIONS, cache=True),
        SystemBlock(text=sources, cache=False),
    ]
    resp = await llm.chat(
        [Message(role="user", content=query)],
        system=system,
        model=model,
        max_tokens=max_tokens,
    )
    citations = _parse_citations(resp.content, hits)
    return ChatResult(
        answer=resp.content,
        citations=citations,
        model=resp.model,
        input_tokens=resp.input_tokens,
        output_tokens=resp.output_tokens,
        cached_input_tokens=resp.cached_input_tokens,
    )
