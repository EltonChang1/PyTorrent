"""Orchestrate tracker announces, peer workers, resume, and progress."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Callable, Coroutine

import aiohttp

from pytorrent.piece_picker import PiecePicker
from pytorrent.piece_state import PieceState
from pytorrent.protocol.peer import BLOCK_SIZE, run_peer_download
from pytorrent.storage import DiskStorage
from pytorrent.torrent import TorrentMeta
from pytorrent.tracker import TrackerPeer, announce, make_peer_id

log = logging.getLogger(__name__)

MAX_PEER_TASKS = 40
ANNOUNCE_MIN_SLEEP = 2.0

ProgressCallback = Callable[[dict[str, Any]], Coroutine[Any, Any, None]] | None


class TorrentSession:
    def __init__(
        self,
        meta: TorrentMeta,
        download_dir: str,
        *,
        listen_port: int = 6881,
        data_dir: str | None = None,
    ):
        self.meta = meta
        self.download_dir = download_dir
        self.listen_port = listen_port
        self.data_dir = data_dir or os.path.expanduser("~/.pytorrent")
        self.peer_id = make_peer_id()
        self.storage = DiskStorage(meta, download_dir)
        self.piece_state = PieceState(
            meta.piece_length, meta.total_length, meta.num_pieces, BLOCK_SIZE
        )
        self.picker = PiecePicker(meta.num_pieces)
        self.stop_event = asyncio.Event()
        self.uploaded = 0
        self._progress_cb: ProgressCallback = None
        self._lock = asyncio.Lock()

    def job_id(self) -> str:
        return self.meta.info_hash.hex()

    def state_path(self) -> str:
        d = os.path.join(self.data_dir, self.job_id())
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, "session.json")

    def set_progress_callback(self, cb: ProgressCallback) -> None:
        self._progress_cb = cb

    def haves(self) -> set[int]:
        return set(self.picker.completed)

    async def record_upload(self, n: int) -> None:
        if n <= 0:
            return
        async with self._lock:
            self.uploaded += n

    def bytes_done(self) -> int:
        n = 0
        for p in self.picker.completed:
            n += self.piece_state.piece_len(p)
        return n

    def is_complete(self) -> bool:
        return len(self.picker.completed) >= self.meta.num_pieces

    async def load_resume(self) -> None:
        path = self.state_path()
        if not os.path.isfile(path):
            return
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            return
        for p in data.get("completed", []):
            if not isinstance(p, int) or p < 0 or p >= self.meta.num_pieces:
                continue
            if await self.storage.verify_piece(p):
                self.piece_state.mark_piece_finished(p)
                self.picker.mark_complete(p)

    async def save_resume(self) -> None:
        path = self.state_path()
        data = {"completed": sorted(self.picker.completed)}
        tmp = path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f)
            os.replace(tmp, path)
        except OSError as e:
            log.warning("save resume failed: %s", e)

    async def _emit_progress(self) -> None:
        if not self._progress_cb:
            return
        async with self._lock:
            payload = {
                "info_hash": self.job_id(),
                "downloaded": self.bytes_done(),
                "total": self.meta.total_length,
                "complete": self.is_complete(),
                "peers": len(self.picker.peer_has),
                "uploaded": self.uploaded,
            }
        await self._progress_cb(payload)

    async def run(self) -> None:
        await self.load_resume()
        await self._emit_progress()

        peer_queue: asyncio.Queue[TrackerPeer] = asyncio.Queue()
        workers = [
            asyncio.create_task(self._peer_worker(peer_queue)) for _ in range(MAX_PEER_TASKS)
        ]

        urls = []
        for u in self.meta.iter_announce_urls():
            if isinstance(u, bytes):
                urls.append(u.decode("utf-8", errors="replace"))
            else:
                urls.append(str(u))
        if not urls:
            log.error("no announce URL in torrent")
            self.stop_event.set()
            await asyncio.gather(*workers, return_exceptions=True)
            return

        first_started = True
        completed_event_sent = False
        last_announce = 0.0
        interval = 60.0
        url_i = 0

        async def do_announce(
            sess: aiohttp.ClientSession, event: str | None
        ):
            left = max(0, self.meta.total_length - self.bytes_done())
            downloaded = self.bytes_done()
            async with self._lock:
                up = self.uploaded
            resp = None
            attempts = 0
            nonlocal url_i
            while attempts < len(urls) and resp is None:
                u = urls[url_i % len(urls)]
                url_i += 1
                attempts += 1
                try:
                    resp = await announce(
                        sess,
                        u,
                        self.meta.info_hash,
                        self.peer_id,
                        self.listen_port,
                        up,
                        downloaded,
                        left,
                        event=event,
                    )
                except Exception as e:
                    log.debug("announce error: %s", e)
            return resp

        try:
            async with aiohttp.ClientSession() as sess:
                while not self.stop_event.is_set():
                    now = time.time()
                    need_announce = first_started or (now - last_announce >= interval)
                    if self.is_complete() and not completed_event_sent and not first_started:
                        need_announce = True

                    if need_announce:
                        event: str | None = None
                        if first_started:
                            event = "started"
                        elif self.is_complete() and not completed_event_sent:
                            event = "completed"
                            completed_event_sent = True

                        resp = await do_announce(sess, event)
                        if first_started and self.is_complete() and not completed_event_sent:
                            await do_announce(sess, "completed")
                            completed_event_sent = True
                        first_started = False

                        last_announce = now
                        if resp:
                            interval = float(resp.interval)
                            if resp.failure_reason:
                                log.warning("tracker: %s", resp.failure_reason)
                            if not self.is_complete() and resp.peers:
                                for p in resp.peers:
                                    await peer_queue.put(p)
                        await self.save_resume()
                        await self._emit_progress()

                    await asyncio.sleep(ANNOUNCE_MIN_SLEEP)
        finally:
            await asyncio.gather(*workers, return_exceptions=True)
        await self.save_resume()
        await self._emit_progress()

    async def _peer_worker(self, q: asyncio.Queue[TrackerPeer]) -> None:
        while not self.stop_event.is_set():
            if self.is_complete():
                await asyncio.sleep(0.5)
                continue
            try:
                peer = await asyncio.wait_for(q.get(), timeout=2.0)
            except asyncio.TimeoutError:
                continue
            await run_peer_download(
                peer,
                self.meta.info_hash,
                self.peer_id,
                self.meta.num_pieces,
                self.storage,
                self.picker,
                self.piece_state,
                self.stop_event,
                on_progress=self._emit_progress,
            )

    def stop(self) -> None:
        self.stop_event.set()
