import argparse
import asyncio
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from .config import Mode, Settings
from .modes import build_storage
from .routes import health

log = logging.getLogger("lattice")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    storage = build_storage(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await storage.init()
        app.state.settings = settings
        app.state.storage = storage
        log.info("lattice-api ready in mode=%s", settings.mode.value)
        try:
            yield
        finally:
            await storage.close()

    app = FastAPI(title="Lattice API", version="0.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.storage = storage
    app.include_router(health.router)
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
