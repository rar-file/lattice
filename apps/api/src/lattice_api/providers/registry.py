"""Provider lookup.

Routes never instantiate providers directly — they call
`get_embedding_provider(settings)` / `get_llm_provider(settings)` so tests and
the desktop sidecar can swap in stubs by overriding `settings`.
"""

from __future__ import annotations

from functools import lru_cache

from ..config import Settings
from .anthropic import AnthropicProvider
from .embed.fastembed_provider import FastembedProvider
from .embed.hash_provider import HashEmbeddingProvider
from .embed.protocol import EmbeddingProvider
from .llm import LLMProvider
from .stub_llm import StubLLMProvider


@lru_cache(maxsize=4)
def _cached_fastembed(model: str) -> FastembedProvider:
    return FastembedProvider(model=model)


def get_embedding_provider(settings: Settings) -> EmbeddingProvider:
    name = settings.embedding_provider
    if name == "fastembed":
        return _cached_fastembed(settings.embedding_model)
    if name == "hash":
        return HashEmbeddingProvider()
    raise ValueError(f"unknown embedding provider: {name!r}")


def get_llm_provider(settings: Settings) -> LLMProvider:
    if settings.anthropic_api_key:
        return AnthropicProvider(
            api_key=settings.anthropic_api_key,
            default_model=settings.default_llm_model,
        )
    # No key configured → tests/offline get the stub; production startup should
    # log a warning before depending on this fallback.
    return StubLLMProvider()
