#!/usr/bin/env python3
"""Build the PyInstaller-bundled `lattice-api` sidecar for the desktop app.

Run from the repo root:

    uv run python apps/desktop/src-tauri/build_sidecar.py

Outputs the binary to:

    apps/desktop/src-tauri/binaries/lattice-api-<target-triple>

The target triple is detected from `rustc -vV` so the resulting filename
matches Tauri's expectations for `bundle.externalBin`.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
APP_API = REPO_ROOT / "apps" / "api"
MIGRATIONS = REPO_ROOT / "infra" / "migrations"
SIDECAR_DIR = REPO_ROOT / "apps" / "desktop" / "src-tauri" / "binaries"


def detect_triple() -> str:
    try:
        out = subprocess.run(["rustc", "-vV"], check=True, capture_output=True, text=True).stdout
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        raise SystemExit(
            "rustc is required to detect the target triple. Install Rust or pass --triple."
        ) from e
    for line in out.splitlines():
        if line.startswith("host: "):
            return line.removeprefix("host: ").strip()
    raise SystemExit("could not parse rustc -vV output for host triple")


def main() -> None:
    triple = sys.argv[1] if len(sys.argv) > 1 else detect_triple()
    out_name = f"lattice-api-{triple}"
    print(f"target triple: {triple}")
    print(f"output binary: {SIDECAR_DIR / out_name}")

    SIDECAR_DIR.mkdir(parents=True, exist_ok=True)
    workdir = REPO_ROOT / ".pyinstaller"
    distdir = SIDECAR_DIR
    specdir = workdir / "spec"
    workdir.mkdir(exist_ok=True)
    specdir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "pyinstaller",
        "--noconfirm",
        "--onefile",
        f"--name={out_name}",
        f"--distpath={distdir}",
        f"--workpath={workdir / 'build'}",
        f"--specpath={specdir}",
        f"--add-data={MIGRATIONS}{':' if sys.platform != 'win32' else ';'}migrations",
        "--collect-all=fastembed",
        "--collect-all=onnxruntime",
        "--collect-all=tokenizers",
        "--collect-all=huggingface_hub",
        "--collect-all=sqlite_vec",
        "--hidden-import=lattice_api.main",
        "--hidden-import=lattice_api.mcp_server",
        f"--paths={APP_API / 'src'}",
        str(APP_API / "src" / "lattice_api" / "__pyinstaller_entry__.py"),
    ]
    print("running:", " ".join(map(str, cmd)))
    subprocess.run(cmd, check=True)

    # Tauri's `externalBin` looks for `<name>-<triple>` on macOS/Linux and
    # `<name>-<triple>.exe` on Windows. PyInstaller already produces the
    # right name on each platform, so we don't need to move anything —
    # just verify the expected file exists.
    expected = distdir / (f"{out_name}.exe" if sys.platform == "win32" else out_name)
    if not expected.exists():
        raise SystemExit(
            f"expected sidecar binary at {expected}, but PyInstaller didn't produce it"
        )
    print(f"built: {expected}")


if __name__ == "__main__":
    main()
