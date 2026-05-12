from typing import Protocol


class EmbeddingProvider(Protocol):
    """Embedding provider contract.

    `name` is stable per (model, dim) pair and is used as the
    `embedding_providers.name` storage key — re-registering with a different
    `dim` for the same `name` raises (you'd need to reindex anyway).
    """

    name: str
    dim: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...
