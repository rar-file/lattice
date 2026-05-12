"""Deterministic hash-based embedding provider — tests only.

Produces 384-d unit-length vectors derived from a SHA-256 hash of the input.
Cheap, offline, and consistent across runs so tests don't depend on the
fastembed model download. Useful in CI and in any test that just needs
"some" embedding to flow through the indexer/search pipeline.
"""

from __future__ import annotations

import hashlib
import math


class HashEmbeddingProvider:
    name: str
    dim: int

    def __init__(self, dim: int = 384) -> None:
        self.name = f"hash:dim{dim}"
        self.dim = dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        # Stream SHA-256 with a counter until we have enough bytes for dim*4.
        out: list[float] = []
        counter = 0
        while len(out) < self.dim:
            block = hashlib.sha256(f"{counter}:{text}".encode()).digest()
            for i in range(0, len(block), 4):
                if len(out) >= self.dim:
                    break
                # interpret 4 bytes as unsigned int, scale to [-1, 1]
                n = int.from_bytes(block[i : i + 4], "big", signed=False)
                out.append((n / 2**32) * 2.0 - 1.0)
            counter += 1
        # L2-normalise so cosine and dot-product agree
        norm = math.sqrt(sum(x * x for x in out)) or 1.0
        return [x / norm for x in out]
