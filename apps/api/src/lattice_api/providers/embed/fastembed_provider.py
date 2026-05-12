"""Local embedding provider backed by `fastembed` (ONNX runtime).

Default model: BAAI/bge-small-en-v1.5 → 384-d.

The first call to `embed()` downloads the ONNX model from HuggingFace
(~30 MB) and caches it under `~/.cache/fastembed`. Subsequent runs are
fully offline.
"""

from __future__ import annotations

import asyncio
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastembed import TextEmbedding


_DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"
_DEFAULT_DIM = 384


class FastembedProvider:
    name: str
    dim: int

    def __init__(self, model: str = _DEFAULT_MODEL, dim: int = _DEFAULT_DIM) -> None:
        self.name = f"fastembed:{model}"
        self.dim = dim
        self._model_name = model
        self._model: TextEmbedding | None = None
        self._lock = threading.Lock()

    def _ensure_loaded(self) -> TextEmbedding:
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from fastembed import TextEmbedding

                    self._model = TextEmbedding(model_name=self._model_name)
        return self._model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        def go() -> list[list[float]]:
            model = self._ensure_loaded()
            return [list(map(float, v)) for v in model.embed(texts)]

        return await asyncio.to_thread(go)
