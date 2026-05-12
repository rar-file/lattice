"""Anthropic LLM provider.

Uses the official `anthropic` async client. Vault context blocks are sent as
system content blocks marked `cache_control: {"type": "ephemeral"}` so a
follow-up chat against the same retrieval set hits the 5-minute prompt cache
instead of re-billing the whole context.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from anthropic import AsyncAnthropic
from anthropic.types import MessageParam, TextBlock

from .llm import ChatResponse, Message, StreamChunk, SystemBlock


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, *, default_model: str = "claude-sonnet-4-6") -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._default_model = default_model

    @staticmethod
    def _build_system(system: list[SystemBlock] | None) -> list[dict[str, Any]]:
        if not system:
            return []
        blocks: list[dict[str, Any]] = []
        for b in system:
            block: dict[str, Any] = {"type": "text", "text": b.text}
            if b.cache:
                block["cache_control"] = {"type": "ephemeral"}
            blocks.append(block)
        return blocks

    @staticmethod
    def _to_message_params(messages: list[Message]) -> list[MessageParam]:
        out: list[MessageParam] = []
        for m in messages:
            role = "assistant" if m.role == "assistant" else "user"
            out.append({"role": role, "content": m.content})
        return out

    async def chat(
        self,
        messages: list[Message],
        *,
        system: list[SystemBlock] | None = None,
        model: str | None = None,
        max_tokens: int = 1024,
    ) -> ChatResponse:
        resp = await self._client.messages.create(
            model=model or self._default_model,
            system=self._build_system(system),  # type: ignore[arg-type]
            messages=self._to_message_params(messages),
            max_tokens=max_tokens,
        )
        text_parts = [b.text for b in resp.content if isinstance(b, TextBlock)]
        usage = resp.usage
        return ChatResponse(
            content="".join(text_parts),
            model=resp.model,
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            cached_input_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        )

    async def stream(  # type: ignore[override]
        self,
        messages: list[Message],
        *,
        system: list[SystemBlock] | None = None,
        model: str | None = None,
        max_tokens: int = 1024,
    ) -> AsyncIterator[StreamChunk]:
        async with self._client.messages.stream(
            model=model or self._default_model,
            system=self._build_system(system),  # type: ignore[arg-type]
            messages=self._to_message_params(messages),
            max_tokens=max_tokens,
        ) as stream:
            async for text in stream.text_stream:
                yield StreamChunk(delta=text)
            yield StreamChunk(delta="", done=True)
