"""Auth routes: magic link + device flow + token mgmt.

The shapes here are deliberately small — every flow funnels into the same
`storage.create_token` call at the end. Reviewable in one pass.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

from ..auth import (
    DEFAULT_AGENT_SCOPES,
    DEFAULT_DEVICE_SCOPES,
    AuthContext,
    current_user,
    in_minutes,
    iso,
    make_token,
    make_user_code,
    now,
    token_hash,
)
from ..config import Mode

router = APIRouter(prefix="/auth", tags=["auth"])

MAGIC_LINK_TTL_MINUTES = 15
DEVICE_CODE_TTL_MINUTES = 10


# ----- Magic link --------------------------------------------------------


class MagicStartReq(BaseModel):
    email: EmailStr


class MagicStartResp(BaseModel):
    sent: bool


@router.post("/magic/start", response_model=MagicStartResp)
async def magic_start(req: MagicStartReq, request: Request) -> MagicStartResp:
    storage = request.app.state.storage
    mailer = request.app.state.mailer
    token = make_token("magic")
    expires = in_minutes(MAGIC_LINK_TTL_MINUTES)
    await storage.create_magic_link(
        token_hash=token_hash(token), email=req.email, expires_at_iso=iso(expires)
    )
    base = request.app.state.settings.public_base_url.rstrip("/")
    link = f"{base}/auth/magic/consume?token={token}"
    await mailer.send(
        to=req.email,
        subject="Your Lattice sign-in link",
        body=(
            f"Click to sign in (valid for {MAGIC_LINK_TTL_MINUTES} minutes):\n\n"
            f"{link}\n\nIf you didn't request this, ignore the email."
        ),
    )
    return MagicStartResp(sent=True)


class MagicConsumeResp(BaseModel):
    user_id: str
    session_token: str


@router.get("/magic/consume", response_model=MagicConsumeResp)
async def magic_consume(token: str, request: Request, response: Response) -> MagicConsumeResp:
    storage = request.app.state.storage
    email = await storage.consume_magic_link(token_hash=token_hash(token), now_iso=iso(now()))
    if email is None:
        raise HTTPException(status_code=400, detail="invalid or expired magic link")
    user = await storage.upsert_user(email)
    session_plain = make_token("session")
    await storage.create_token(
        user_id=user.id,
        kind="session",
        name="web",
        scopes=["*"],
        token_hash=token_hash(session_plain),
    )
    response.set_cookie(
        "lattice_session",
        session_plain,
        httponly=True,
        secure=request.app.state.settings.mode is Mode.CLOUD,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
    )
    return MagicConsumeResp(user_id=user.id, session_token=session_plain)


# ----- Device flow -------------------------------------------------------


class DeviceStartReq(BaseModel):
    name: str = "cli"
    scopes: list[str] = Field(default_factory=lambda: list(DEFAULT_DEVICE_SCOPES))


class DeviceStartResp(BaseModel):
    user_code: str
    device_code: str
    verification_url: str
    expires_in: int


@router.post("/device/start", response_model=DeviceStartResp)
async def device_start(req: DeviceStartReq, request: Request) -> DeviceStartResp:
    storage = request.app.state.storage
    user_code = make_user_code()
    device_plain = make_token("device")
    expires = in_minutes(DEVICE_CODE_TTL_MINUTES)
    await storage.create_device_code(
        user_code=user_code,
        device_code_hash=token_hash(device_plain),
        expires_at_iso=iso(expires),
        name=req.name,
        scopes=req.scopes,
    )
    base = request.app.state.settings.public_base_url.rstrip("/")
    return DeviceStartResp(
        user_code=user_code,
        device_code=device_plain,
        verification_url=f"{base}/device",
        expires_in=DEVICE_CODE_TTL_MINUTES * 60,
    )


class DeviceApproveReq(BaseModel):
    user_code: str


class DeviceApproveResp(BaseModel):
    approved: bool


@router.post("/device/approve", response_model=DeviceApproveResp)
async def device_approve(
    req: DeviceApproveReq,
    request: Request,
    ctx: AuthContext = Depends(current_user),
) -> DeviceApproveResp:
    storage = request.app.state.storage
    rec = await storage.get_device_code(req.user_code)
    if rec is None or rec.expires_at < now():
        raise HTTPException(status_code=400, detail="invalid or expired user code")
    ok = await storage.approve_device_code(user_code=req.user_code, user_id=ctx.user.id)
    if not ok:
        raise HTTPException(status_code=400, detail="could not approve")
    return DeviceApproveResp(approved=True)


class DevicePollReq(BaseModel):
    device_code: str


class DevicePollResp(BaseModel):
    status: str  # pending | ready | expired | invalid | consumed
    token: str | None = None


@router.post("/device/poll", response_model=DevicePollResp)
async def device_poll(req: DevicePollReq, request: Request) -> DevicePollResp:
    storage = request.app.state.storage
    code_hash = token_hash(req.device_code)
    status, rec = await storage.poll_device_code(device_code_hash=code_hash, now_iso=iso(now()))
    if status != "ready" or rec is None or rec.approved_user_id is None:
        return DevicePollResp(status=status)
    plain = make_token("device")
    tok = await storage.create_token(
        user_id=rec.approved_user_id,
        kind="device",
        name=rec.name,
        scopes=rec.scopes,
        token_hash=token_hash(plain),
    )
    await storage.mark_device_code_consumed(device_code_hash=code_hash, token_id=tok.id)
    return DevicePollResp(status="ready", token=plain)


# ----- Tokens (agent-token mgmt) -----------------------------------------


class TokenInfo(BaseModel):
    id: str
    kind: str
    name: str
    scopes: list[str]
    created_at: str
    last_used_at: str | None
    revoked_at: str | None


class CreateAgentTokenReq(BaseModel):
    name: str
    scopes: list[str] = Field(default_factory=lambda: list(DEFAULT_AGENT_SCOPES))


class CreateAgentTokenResp(BaseModel):
    info: TokenInfo
    token: str  # plaintext — shown once


@router.get("/tokens", response_model=list[TokenInfo])
async def list_tokens(
    request: Request, ctx: AuthContext = Depends(current_user)
) -> list[TokenInfo]:
    rows = await request.app.state.storage.list_tokens(ctx.user.id)
    return [_token_info(t) for t in rows]


@router.post("/tokens", response_model=CreateAgentTokenResp)
async def create_agent_token(
    req: CreateAgentTokenReq,
    request: Request,
    ctx: AuthContext = Depends(current_user),
) -> CreateAgentTokenResp:
    plain = make_token("agent")
    tok = await request.app.state.storage.create_token(
        user_id=ctx.user.id,
        kind="agent",
        name=req.name,
        scopes=req.scopes,
        token_hash=token_hash(plain),
    )
    return CreateAgentTokenResp(info=_token_info(tok), token=plain)


@router.delete("/tokens/{token_id}")
async def revoke_token_route(
    token_id: str, request: Request, ctx: AuthContext = Depends(current_user)
) -> dict:
    ok = await request.app.state.storage.revoke_token(token_id, iso(now()))
    return {"revoked": ok}


@router.get("/whoami")
async def whoami(request: Request, ctx: AuthContext = Depends(current_user)) -> dict:
    return {
        "user_id": ctx.user.id,
        "email": ctx.user.email,
        "scopes": ctx.scopes,
        "mode": request.app.state.settings.mode.value,
    }


def _token_info(t) -> TokenInfo:
    return TokenInfo(
        id=t.id,
        kind=t.kind,
        name=t.name,
        scopes=t.scopes,
        created_at=iso(t.created_at),
        last_used_at=iso(t.last_used_at) if t.last_used_at else None,
        revoked_at=iso(t.revoked_at) if t.revoked_at else None,
    )
