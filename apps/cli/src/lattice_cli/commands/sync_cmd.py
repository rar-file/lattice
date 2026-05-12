"""`lattice sync …` — push/pull against a cloud Lattice deployment."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import click
import httpx
from rich.console import Console

from .._local import load_settings, recall_vault
from ..auth import load

console = Console()

CURSOR_FILE = ".lattice-sync.json"


@click.group("sync")
def sync_cmd() -> None:
    """Cloud sync (opt-in)."""


@sync_cmd.command("enable")
@click.option("--name", default=None, help="Cloud vault name (default: vault folder name)")
def enable(name: str | None) -> None:
    """Create/attach to a cloud vault and persist its id."""

    settings = load_settings()
    vault_path = recall_vault(settings)
    if vault_path is None:
        console.print("[red]no vault open[/]. Run `lattice open <path>` first.")
        raise SystemExit(2)
    auth = load()
    if not auth.token:
        console.print("[red]not signed in[/]. Run `lattice login` first.")
        raise SystemExit(2)
    name = name or vault_path.name

    async def go() -> dict:
        async with httpx.AsyncClient(
            base_url=auth.base_url,
            timeout=30.0,
            headers={"Authorization": f"Bearer {auth.token}"},
        ) as client:
            r = await client.post("/sync/vault", json={"name": name})
            r.raise_for_status()
            return r.json()

    info = asyncio.run(go())
    state_path = vault_path / CURSOR_FILE
    state_path.write_text(json.dumps({"vault_id": info["id"], "cursor": 0}))
    console.print(f"[green]sync enabled →[/] cloud vault id {info['id']}")


@sync_cmd.command("disable")
def disable() -> None:
    """Forget the cloud vault attachment for the current vault."""

    settings = load_settings()
    vault_path = recall_vault(settings)
    if vault_path is None:
        console.print("[red]no vault open[/]")
        raise SystemExit(2)
    state_path = vault_path / CURSOR_FILE
    if state_path.exists():
        state_path.unlink()
    console.print("[green]sync disabled[/]")


@sync_cmd.command("status")
def status() -> None:
    """Show whether sync is enabled and the last cursor."""

    settings = load_settings()
    vault_path = recall_vault(settings)
    if vault_path is None:
        console.print("[yellow]no vault open[/]")
        return
    state_path = vault_path / CURSOR_FILE
    if not state_path.exists():
        console.print("[yellow]sync not enabled for this vault[/]")
        return
    state = json.loads(state_path.read_text())
    console.print(f"[green]synced[/] vault_id={state['vault_id']} cursor={state.get('cursor', 0)}")


@sync_cmd.command("push")
def push() -> None:
    """Push local changes to the cloud."""

    settings = load_settings()
    vault_path = recall_vault(settings)
    if vault_path is None:
        console.print("[red]no vault open[/]")
        raise SystemExit(2)
    auth = load()
    if not auth.token:
        console.print("[red]not signed in[/]")
        raise SystemExit(2)
    state_path = vault_path / CURSOR_FILE
    if not state_path.exists():
        console.print("[red]sync not enabled. Run `lattice sync enable` first.[/]")
        raise SystemExit(2)
    state = json.loads(state_path.read_text())

    import xxhash

    items = []
    for md in vault_path.rglob("*.md"):
        if any(p.startswith(".") for p in md.relative_to(vault_path).parts):
            continue
        rel = str(md.relative_to(vault_path))
        body = md.read_text(encoding="utf-8")
        items.append(
            {
                "path": rel,
                "op": "upsert",
                "content_hash": xxhash.xxh64(body.encode("utf-8")).hexdigest(),
                "body": body,
                "mtime": md.stat().st_mtime,
            }
        )

    async def go():
        async with httpx.AsyncClient(
            base_url=auth.base_url,
            timeout=120.0,
            headers={"Authorization": f"Bearer {auth.token}"},
        ) as client:
            r = await client.post(
                "/sync/push", json={"vault_id": state["vault_id"], "items": items}
            )
            r.raise_for_status()
            return r.json()

    resp = asyncio.run(go())
    state["cursor"] = max(state.get("cursor", 0), resp["cursor"])
    state_path.write_text(json.dumps(state))
    console.print(f"[green]pushed {resp['accepted']} item(s)[/]; cursor → {state['cursor']}")


@sync_cmd.command("pull")
def pull() -> None:
    """Pull cloud changes into the local vault."""

    settings = load_settings()
    vault_path = recall_vault(settings)
    if vault_path is None:
        console.print("[red]no vault open[/]")
        raise SystemExit(2)
    auth = load()
    if not auth.token:
        console.print("[red]not signed in[/]")
        raise SystemExit(2)
    state_path = vault_path / CURSOR_FILE
    if not state_path.exists():
        console.print("[red]sync not enabled[/]")
        raise SystemExit(2)
    state = json.loads(state_path.read_text())

    async def go():
        async with httpx.AsyncClient(
            base_url=auth.base_url,
            timeout=120.0,
            headers={"Authorization": f"Bearer {auth.token}"},
        ) as client:
            r = await client.get(
                "/sync/pull",
                params={"vault_id": state["vault_id"], "since": state.get("cursor", 0)},
            )
            r.raise_for_status()
            return r.json()

    resp = asyncio.run(go())
    applied = 0
    conflicts = 0
    for entry in resp["entries"]:
        target = vault_path / entry["path"]
        if entry["op"] == "upsert":
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                import xxhash

                local_body = target.read_text(encoding="utf-8")
                local_hash = xxhash.xxh64(local_body.encode("utf-8")).hexdigest()
                if local_hash != entry["content_hash"] and local_body != (entry["body"] or ""):
                    # Conflict: keep both. Local stays at original path; remote
                    # lands at `<path>.conflict-<device>-<ts>.md`.
                    import socket
                    from datetime import UTC, datetime

                    suffix = (
                        f"conflict-{socket.gethostname()}-"
                        f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%S')}"
                    )
                    cpath = Path(str(target).removesuffix(".md") + f".{suffix}.md")
                    cpath.write_text(entry["body"] or "", encoding="utf-8")
                    conflicts += 1
                    continue
            target.write_text(entry["body"] or "", encoding="utf-8")
            applied += 1
        elif entry["op"] == "delete":
            if target.exists():
                target.unlink()
                applied += 1
        elif entry["op"] == "rename" and entry["new_path"]:
            new_target = vault_path / entry["new_path"]
            new_target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                target.rename(new_target)
                applied += 1

    state["cursor"] = resp["cursor"]
    state_path.write_text(json.dumps(state))
    msg = f"[green]pulled {applied} change(s)[/]; cursor → {state['cursor']}"
    if conflicts:
        msg += f"; [yellow]{conflicts} conflict file(s) written[/]"
    console.print(msg)
