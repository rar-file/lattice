import argparse
import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from .config import Mode, Settings
from .modes import build_storage
from .providers.registry import get_embedding_provider, get_llm_provider
from .routes import chat, health, notes, search, vault

log = logging.getLogger("lattice")


def create_app(
    settings: Settings | None = None,
    *,
    storage_override=None,
    embedder_override=None,
    llm_override=None,
) -> FastAPI:
    settings = settings or Settings()
    storage = storage_override or build_storage(settings)
    embedder = embedder_override or get_embedding_provider(settings)
    llm = llm_override or get_llm_provider(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await storage.init()
        app.state.settings = settings
        app.state.storage = storage
        app.state.embedder = embedder
        app.state.llm = llm
        app.state.vault_session = None
        log.info("lattice-api ready in mode=%s", settings.mode.value)
        try:
            yield
        finally:
            session = getattr(app.state, "vault_session", None)
            if session is not None:
                from .session import close_vault_session

                await close_vault_session(session)
                app.state.vault_session = None
            await storage.close()

    app = FastAPI(title="Lattice API", version="0.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.storage = storage
    app.state.embedder = embedder
    app.state.llm = llm
    app.state.vault_session = None
    app.include_router(health.router)
    app.include_router(vault.router)
    app.include_router(notes.router)
    app.include_router(search.router)
    app.include_router(chat.router)
    return app


def cli() -> None:
    parser = argparse.ArgumentParser(prog="lattice-api")
    parser.add_argument("--mode", choices=[m.value for m in Mode], default=None)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--socket", default=None, help="Unix socket path (local mode)")
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s | %(message)s"
    )

    settings = Settings()
    if args.mode:
        settings = Settings(mode=Mode(args.mode))

    app = create_app(settings)

    if args.socket:
        # Bind to unix socket — local mode wired by Tauri/CLI.
        asyncio.run(_serve_unix(app, args.socket))
    else:
        uvicorn.run(app, host=args.host, port=args.port, reload=args.reload, log_level="info")


async def _serve_unix(app: FastAPI, socket_path: str) -> None:
    config = uvicorn.Config(app, uds=socket_path, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    cli()
