import argparse
import asyncio
import logging
import secrets
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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


_LOCAL_TOKEN_PUBLIC_PATHS: frozenset[str] = frozenset({"/healthz", "/version"})


def _ensure_local_token(settings: Settings) -> str:
    """In local mode the sidecar must require a per-launch bearer token. If
    one wasn't supplied via ``LATTICE_LOCAL_TOKEN``, generate one and persist
    it to ``~/.lattice/local_token`` (mode 0600) so the launcher can forward
    it to the UI. Returns the resolved token."""
    if settings.local_token:
        return settings.local_token
    token = secrets.token_urlsafe(32)
    settings.local_token = token
    token_path = settings.local_data_dir / "local_token"
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(token)
    try:
        token_path.chmod(0o600)
    except OSError:
        pass
    return token


def create_app(
    settings: Settings | None = None,
    *,
    storage_override=None,
    embedder_override=None,
    llm_override=None,
    mailer_override=None,
) -> FastAPI:
    settings = settings or Settings()
    if settings.mode is Mode.LOCAL:
        _ensure_local_token(settings)
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

    if settings.mode is Mode.LOCAL:

        @app.middleware("http")
        async def _gate_local_sidecar(request: Request, call_next):
            # Goal: local sidecars must require auth. Hard requirement, not a
            # v2 thing. CORS preflights are accepted unconditionally; /healthz
            # and /version stay public so a launcher can probe readiness before
            # it knows the token.
            if request.method == "OPTIONS":
                return await call_next(request)
            if request.url.path in _LOCAL_TOKEN_PUBLIC_PATHS:
                return await call_next(request)
            expected = settings.local_token
            if not expected:
                return JSONResponse({"detail": "sidecar token unset"}, status_code=503)
            header = request.headers.get("authorization") or request.headers.get("Authorization")
            supplied: str | None = None
            if header and header.lower().startswith("bearer "):
                supplied = header[7:].strip()
            if not supplied:
                cookie = request.cookies.get("lattice_local_token")
                if cookie:
                    supplied = cookie
            if not supplied or not secrets.compare_digest(supplied, expected):
                return JSONResponse({"detail": "missing or invalid local token"}, status_code=401)
            return await call_next(request)

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

    if settings.mode is Mode.LOCAL and settings.local_token:
        # Tauri (or any launcher) reads this single tagged line from stderr to
        # learn the per-launch token. The token is also persisted to
        # ~/.lattice/local_token for the dev / Next.js path.
        print(f"LATTICE_LOCAL_TOKEN={settings.local_token}", flush=True)

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
