"""Stub LLM provider used by tests and offline development.

`StubLLMProvider("...")` always returns the configured response so tests can
assert citation parsing and route plumbing without hitting Anthropic.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from .llm import ChatResponse, Message, StreamChunk, SystemBlock


class StubLLMProvider:
    name = "stub"

    def __init__(self, reply: str = "stub reply [1]", model: str = "stub-model") -> None:
        self._reply = reply
        self._model = model
        self.last_messages: list[Message] = []
        self.last_system: list[SystemBlock] | None = None

    async def chat(
        self,
        messages: list[Message],
        *,
        system: list[SystemBlock] | None = None,
        model: str | None = None,
        max_tokens: int = 1024,
    ) -> ChatResponse:
        self.last_messages = list(messages)
        self.last_system = list(system) if system else None
        return ChatResponse(
            content=self._reply,
            model=model or self._model,
            input_tokens=sum(len(m.content) for m in messages),
            output_tokens=len(self._reply),
        )

    async def stream(  # type: ignore[override]
        self,
        messages: list[Message],
        *,
        system: list[SystemBlock] | None = None,
        model: str | None = None,
        max_tokens: int = 1024,
    ) -> AsyncIterator[StreamChunk]:
        self.last_messages = list(messages)
        self.last_system = list(system) if system else None
        yield StreamChunk(delta=self._reply)
        yield StreamChunk(delta="", done=True)
