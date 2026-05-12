from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


@dataclass
class Message:
    role: str  # "user" | "assistant" | "system"
    content: str


@dataclass
class ChatResponse:
    content: str
    model: str
    input_tokens: int
    output_tokens: int


@dataclass
class StreamChunk:
    delta: str
    done: bool = False


class LLMProvider(Protocol):
    name: str

    async def chat(
        self,
        messages: list[Message],
        *,
        model: str | None = None,
        max_tokens: int = 1024,
    ) -> ChatResponse: ...

    def stream(
        self,
        messages: list[Message],
        *,
        model: str | None = None,
        max_tokens: int = 1024,
    ) -> AsyncIterator[StreamChunk]: ...
