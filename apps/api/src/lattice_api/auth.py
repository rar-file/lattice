"""Auth helpers: token format, hashing, code generation, dependency.

Token format: `latt_<kind>_<base62>`, where `<kind>` is one of session/device/agent.
The plaintext is shown to the user once; only the SHA-256 of the full token
string (including the `latt_…` prefix) is stored.

Magic-link tokens use the same `latt_magic_<base62>` shape but are stored in
the `magic_links` table, not `tokens`.

The `current_user` FastAPI dependency:
  * Local mode → trusts the caller (returns a sentinel user with id="local").
  * Cloud mode → resolves `Authorization: Bearer <token>` or a session cookie
    against the tokens table. 401 on miss/expired/revoked.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request

from .config import Mode
from .storage.models import Token, User

_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _b62(n_bytes: int = 24) -> str:
    raw = secrets.token_bytes(n_bytes)
    num = int.from_bytes(raw, "big")
    out = ""
    while num:
        num, rem = divmod(num, 62)
        out = _ALPHABET[rem] + out
    return out or "0"


def make_token(kind: str) -> str:
    """Mint a plaintext token string. Caller is responsible for hashing + storing."""
    if kind not in {"session", "device", "agent", "magic"}:
        raise ValueError(f"bad token kind: {kind}")
    return f"latt_{kind}_{_b62(24)}"


def token_hash(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def make_user_code() -> str:
    """User-facing device-flow code: ABCD-1234. Crockford-style (no 0/O/1/I)."""
    safe = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    a = "".join(secrets.choice(safe) for _ in range(4))
    b = "".join(secrets.choice(safe) for _ in range(4))
    return f"{a}-{b}"


def now() -> datetime:
    return datetime.now(UTC)


def in_minutes(minutes: int) -> datetime:
    return now() + timedelta(minutes=minutes)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_iso(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)


# Default scopes for an interactive (CLI/desktop) device-flow token.
DEFAULT_DEVICE_SCOPES: list[str] = ["vault:read", "vault:write", "search", "chat"]
# Default scopes for an agent (MCP) token — read-only.
DEFAULT_AGENT_SCOPES: list[str] = ["vault:read", "search"]


@dataclass(slots=True)
class AuthContext:
    user: User
    token: Token | None  # None if local-mode trust path
    scopes: list[str]

    def require(self, scope: str) -> None:
        if "*" in self.scopes:
            return
        if scope not in self.scopes:
            raise HTTPException(status_code=403, detail=f"missing scope: {scope}")


_LOCAL_USER = User(id="local", email="local@lattice", created_at=datetime(1970, 1, 1, tzinfo=UTC))


def _extract_bearer(request: Request) -> str | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    cookie = request.cookies.get("lattice_session")
    if cookie:
        return cookie
    return None


async def current_user(request: Request) -> AuthContext:
    settings = request.app.state.settings
    if settings.mode is Mode.LOCAL:
        return AuthContext(user=_LOCAL_USER, token=None, scopes=["*"])

    plaintext = _extract_bearer(request)
    if not plaintext:
        raise HTTPException(status_code=401, detail="missing bearer token")
    storage = request.app.state.storage
    tok = await storage.get_token_by_hash(token_hash(plaintext))
    if tok is None or tok.revoked_at is not None:
        raise HTTPException(status_code=401, detail="invalid token")
    user = await storage.get_user(tok.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="user not found")
    await storage.touch_token(tok.id, iso(now()))
    return AuthContext(user=user, token=tok, scopes=tok.scopes)


async def optional_user(request: Request) -> AuthContext | None:
    try:
        return await current_user(request)
    except HTTPException:
        return None
