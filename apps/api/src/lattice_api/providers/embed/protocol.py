from typing import Protocol


class EmbeddingProvider(Protocol):
    name: str
    dim: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...
