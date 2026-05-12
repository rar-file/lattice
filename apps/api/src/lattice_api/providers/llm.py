"""LLM provider protocol + types.

Implementations live alongside this file (`anthropic.py`, `stub.py`). The
chat route looks them up via `providers.registry.get_llm_provider`.

`SystemBlock.cache` enables Anthropic prompt caching for that block — the
chat route marks vault context blocks as cached so repeated queries against
the same retrieval set get the cache hit.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class Message:
    role: str  # "user" | "assistant"
    content: str


@dataclass(slots=True)
class SystemBlock:
    text: str
    cache: bool = False


@dataclass(slots=True)
class ChatResponse:
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    cached_input_tokens: int = 0


@dataclass(slots=True)
class StreamChunk:
    delta: str
    done: bool = False


class LLMProvider(Protocol):
    name: str

    async def chat(
        self,
        messages: list[Message],
        *,
        system: list[SystemBlock] | None = None,
        model: str | None = None,
        max_tokens: int = 1024,
    ) -> ChatResponse: ...

    def stream(
        self,
        messages: list[Message],
        *,
        system: list[SystemBlock] | None = None,
        model: str | None = None,
        max_tokens: int = 1024,
    ) -> AsyncIterator[StreamChunk]: ...
