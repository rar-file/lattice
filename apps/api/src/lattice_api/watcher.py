"""Filesystem watcher that reindexes on save.

Wraps `watchdog.Observer` and routes filesystem events into the running
asyncio loop, where they're debounced (1s default — most editors write a
.swp/.tmp before the real file, and atomic-rename editors fire two events
within a few hundred ms).

A single `VaultWatcher` instance owns one observer thread and one debounce
queue. Stop it via `await watcher.stop()` before closing the storage.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from .indexer import Indexer

log = logging.getLogger("lattice.watcher")


class _Handler(FileSystemEventHandler):
    def __init__(self, queue: asyncio.Queue[tuple[str, str]], loop: asyncio.AbstractEventLoop):
        self._queue = queue
        self._loop = loop

    def _enqueue(self, kind: str, path: str) -> None:
        # watchdog callbacks run on its own thread; bounce to the loop.
        self._loop.call_soon_threadsafe(self._queue.put_nowait, (kind, path))

    def on_modified(self, event: FileSystemEvent) -> None:
        if not event.is_directory and str(event.src_path).endswith(".md"):
            self._enqueue("upsert", str(event.src_path))

    def on_created(self, event: FileSystemEvent) -> None:
        if not event.is_directory and str(event.src_path).endswith(".md"):
            self._enqueue("upsert", str(event.src_path))

    def on_deleted(self, event: FileSystemEvent) -> None:
        if not event.is_directory and str(event.src_path).endswith(".md"):
            self._enqueue("delete", str(event.src_path))

    def on_moved(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        src = str(event.src_path)
        dst = str(getattr(event, "dest_path", ""))
        if src.endswith(".md"):
            self._enqueue("delete", src)
        if dst.endswith(".md"):
            self._enqueue("upsert", dst)


class VaultWatcher:
    def __init__(self, indexer: Indexer, *, debounce_seconds: float = 1.0) -> None:
        self._indexer = indexer
        self._debounce = debounce_seconds
        # `Observer` from watchdog is a factory, not a class — annotate as Any.
        self._observer: Any = None
        self._queue: asyncio.Queue[tuple[str, str]] | None = None
        self._task: asyncio.Task | None = None
        self._pending: dict[str, tuple[str, asyncio.TimerHandle]] = {}

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        self._queue = asyncio.Queue()
        observer = Observer()
        observer.schedule(
            _Handler(self._queue, loop), str(self._indexer.vault_root), recursive=True
        )
        observer.start()
        self._observer = observer
        self._task = asyncio.create_task(self._run(), name="lattice-watcher")
        log.info("watching %s", self._indexer.vault_root)

    async def stop(self) -> None:
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=2.0)
            self._observer = None
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        # Cancel any in-flight debounce timers.
        for _kind, handle in self._pending.values():
            handle.cancel()
        self._pending.clear()

    async def _run(self) -> None:
        assert self._queue is not None
        loop = asyncio.get_running_loop()
        while True:
            kind, path = await self._queue.get()
            # Coalesce: a delete followed by upsert within the debounce window
            # (atomic-rename editor) wins as upsert; redundant upserts collapse.
            existing = self._pending.get(path)
            if existing is not None:
                existing[1].cancel()
            handle = loop.call_later(
                self._debounce, lambda p=path, k=kind: asyncio.create_task(self._dispatch(k, p))
            )
            self._pending[path] = (kind, handle)

    async def _dispatch(self, kind: str, path: str) -> None:
        self._pending.pop(path, None)
        p = Path(path)
        try:
            if kind == "delete":
                await self._indexer.delete_file(p)
                log.info("reindex (delete): %s", p)
            else:
                changed, n = await self._indexer.index_file(p)
                if changed:
                    log.info("reindex: %s (%d chunks)", p, n)
        except Exception:
            log.exception("reindex failed for %s", p)
