from fastapi import APIRouter, Request

from lattice_api import __version__

router = APIRouter()


@router.get("/healthz")
async def healthz(request: Request) -> dict:
    storage = request.app.state.storage
    db_ok = await storage.ping()
    return {
        "ok": db_ok,
        "mode": request.app.state.settings.mode.value,
        "version": __version__,
    }


@router.get("/version")
async def version() -> dict:
    return {"version": __version__}
