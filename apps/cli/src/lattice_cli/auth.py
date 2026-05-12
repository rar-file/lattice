"""CLI device-flow login + token storage in OS keychain (keyring)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import httpx
import keyring

KEYRING_SERVICE = "lattice"


@dataclass(slots=True)
class CliAuth:
    base_url: str
    token: str | None


def _config_path() -> Path:
    return Path.home() / ".lattice" / "config.json"


def load() -> CliAuth:
    path = _config_path()
    if not path.exists():
        return CliAuth(base_url="https://api.lattice.app", token=None)
    data = json.loads(path.read_text())
    base = data.get("base_url", "https://api.lattice.app")
    try:
        token = keyring.get_password(KEYRING_SERVICE, base) or None
    except Exception:
        # keyring is best-effort; fall back to plaintext on the config file.
        token = data.get("token")
    return CliAuth(base_url=base, token=token)


def save(base_url: str, token: str) -> None:
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        keyring.set_password(KEYRING_SERVICE, base_url, token)
        path.write_text(json.dumps({"base_url": base_url}))
    except Exception:
        # No keyring backend — write the token to the config file (mode 0600).
        path.write_text(json.dumps({"base_url": base_url, "token": token}))
        path.chmod(0o600)


async def device_login(base_url: str, *, name: str = "cli") -> str:
    """Run the device-flow handshake. Returns the issued token."""

    import asyncio
    import sys

    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        r = await client.post("/auth/device/start", json={"name": name})
        r.raise_for_status()
        start = r.json()
        print(
            f"Open {start['verification_url']} and enter code: {start['user_code']}",
            file=sys.stderr,
        )
        device_code = start["device_code"]
        deadline = asyncio.get_event_loop().time() + start.get("expires_in", 600)
        while True:
            await asyncio.sleep(2)
            if asyncio.get_event_loop().time() > deadline:
                raise TimeoutError("device flow expired")
            r = await client.post("/auth/device/poll", json={"device_code": device_code})
            r.raise_for_status()
            payload = r.json()
            status = payload["status"]
            if status == "ready":
                return payload["token"]
            if status in {"expired", "invalid"}:
                raise RuntimeError(f"device flow {status}")
