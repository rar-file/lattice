import argparse
import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Mode, Settings
from .email import build_default_mailer
from .modes import build_storage
from .providers.registry import get_embedding_provider, get_llm_provider
from .routes import (
    auth,
    chat,
    health,
    mcp_sse,
    notes,
    search,
    suggest,
    sync,
    synthesis,
    vault,
)

log = logging.getLogger("lattice")


def create_app(
    settings: Settings | None = None,
    *,
    storage_override=None,
    embedder_override=None,
    llm_override=None,
    mailer_override=None,
) -> FastAPI:
    settings = settings or Settings()
    storage = storage_override or build_storage(settings)
    embedder = embedder_override or get_embedding_provider(settings)
    llm = llm_override or get_llm_provider(settings)
    mailer = mailer_override or build_default_mailer()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await storage.init()
        app.state.settings = settings
        app.state.storage = storage
        app.state.embedder = embedder
        app.state.llm = llm
        app.state.mailer = mailer
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

    # CORS — the Tauri WebView serves the bundled UI from ``tauri://localhost``
    # (macOS/Linux) or ``https://tauri.localhost`` (Windows), so every API
    # call is technically cross-origin even though the API is local. Without
    # this middleware the browser blocks the request with a generic "Failed
    # to fetch". We also allow the dev URLs so `pnpm dev` keeps working.
    app.add_middleware(
        CORSMiddleware,
        # Covers:
        #   tauri://localhost              (macOS/Linux WebKit)
        #   http(s)://tauri.localhost      (Windows WebView2)
        #   http(s)://localhost:<port>     (dev: Next.js, Vite, etc.)
        #   http(s)://127.0.0.1:<port>
        allow_origin_regex=r"^(tauri://localhost|https?://(tauri\.localhost|localhost|127\.0\.0\.1)(:\d+)?)$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.settings = settings
    app.state.storage = storage
    app.state.embedder = embedder
    app.state.llm = llm
    app.state.mailer = mailer
    app.state.vault_session = None
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(vault.router)
    app.include_router(notes.router)
    app.include_router(notes.rename_router)
    app.include_router(notes.backlinks_router)
    app.include_router(search.router)
    app.include_router(chat.router)
    app.include_router(sync.router)
    app.include_router(suggest.router)
    app.include_router(synthesis.router)
    app.include_router(mcp_sse.router)
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
