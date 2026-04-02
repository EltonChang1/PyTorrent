"""FastAPI REST + WebSocket for torrent jobs."""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import structlog
from fastapi import FastAPI, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from pytorrent.torrent import TorrentMeta
from pytorrent.session import TorrentSession

log = structlog.get_logger()


@dataclass
class Job:
    id: str
    meta: TorrentMeta
    download_dir: str
    session: TorrentSession
    task: asyncio.Task | None = None
    error: str | None = None
    complete_broadcast: bool = False


class JobRegistry:
    def __init__(self, data_dir: str) -> None:
        self.data_dir = data_dir
        self.jobs: dict[str, Job] = {}
        self._ws: set[WebSocket] = set()

    async def broadcast(self, payload: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in self._ws:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._ws.discard(ws)

    def register_ws(self, ws: WebSocket) -> None:
        self._ws.add(ws)

    def unregister_ws(self, ws: WebSocket) -> None:
        self._ws.discard(ws)

    async def add_torrent(
        self,
        raw: bytes,
        download_dir: str | None,
    ) -> Job:
        meta = TorrentMeta.from_bytes(raw)
        jid = meta.info_hash.hex()
        if jid in self.jobs:
            return self.jobs[jid]
        ddir = download_dir or os.path.join(self.data_dir, "downloads", jid)
        os.makedirs(ddir, exist_ok=True)
        session = TorrentSession(
            meta,
            ddir,
            data_dir=self.data_dir,
            listen_port=int(os.environ.get("PYTORRENT_BT_PORT", "6881")),
        )

        job = Job(id=jid, meta=meta, download_dir=ddir, session=session)

        async def on_prog(p: dict[str, Any]) -> None:
            p = {**p, "job_id": jid}
            await self.broadcast({"type": "progress", "data": p})
            if p.get("complete") and not job.complete_broadcast:
                job.complete_broadcast = True
                await self.broadcast({"type": "complete", "data": {"job_id": jid}})

        session.set_progress_callback(on_prog)

        async def runner() -> None:
            try:
                await session.run()
            except Exception as e:
                log.exception("job failed", job=jid)
                job.error = str(e)
                await self.broadcast({"type": "error", "data": {"job_id": jid, "message": str(e)}})

        job.task = asyncio.create_task(runner())
        self.jobs[jid] = job
        await self.broadcast({"type": "added", "data": {"job_id": jid, "name": meta.name}})
        return job

    def get(self, jid: str) -> Job | None:
        return self.jobs.get(jid)

    async def pause(self, jid: str) -> None:
        job = self.jobs.get(jid)
        if not job:
            raise KeyError
        job.session.stop()
        if job.task:
            job.task.cancel()
            try:
                await job.task
            except asyncio.CancelledError:
                pass

    def remove(self, jid: str) -> None:
        self.jobs.pop(jid, None)


_registry: JobRegistry | None = None
_bt_server: asyncio.Server | None = None


def get_registry() -> JobRegistry:
    assert _registry is not None
    return _registry


def web_dist_dir() -> str | None:
    """Directory with Vite `npm run build` output (contains index.html)."""
    env = os.environ.get("PYTORRENT_WEB_DIST", "").strip()
    if env and os.path.isdir(env) and os.path.isfile(os.path.join(env, "index.html")):
        return env
    cand = os.path.abspath(os.path.join(os.getcwd(), "apps", "web", "dist"))
    if os.path.isdir(cand) and os.path.isfile(os.path.join(cand, "index.html")):
        return cand
    return None


def _fallback_root_html() -> str:
    return """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>PyTorrent daemon</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem;
           line-height: 1.5; color: #222; }
    code { background: #f4f4f4; padding: 0.1em 0.35em; border-radius: 4px; }
    a { color: #0b57d0; }
  </style>
</head>
<body>
  <h1>PyTorrent daemon</h1>
  <p>This URL is the <strong>API</strong> (<code>pytorrentd</code>), not the web UI assets.</p>
  <ul>
    <li><strong>Development UI:</strong> run <code>cd apps/web && npm run dev</code> and open
      <a href="http://localhost:5173">http://localhost:5173</a> (proxies to this daemon).</li>
    <li><strong>UI on this port:</strong> run <code>cd apps/web && npm run build</code>, then restart
      <code>pytorrentd</code> from the repo root (or set <code>PYTORRENT_WEB_DIST</code> to your
      <code>dist</code> folder). Reload this page.</li>
  </ul>
  <p>API checks: <a href="/health"><code>GET /health</code></a>,
  <a href="/torrents"><code>GET /torrents</code></a></p>
</body>
</html>"""


def create_app() -> FastAPI:
    global _registry, _bt_server

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        global _registry, _bt_server
        data = os.environ.get("PYTORRENT_DATA_DIR", os.path.expanduser("~/.pytorrent"))
        os.makedirs(data, exist_ok=True)
        _registry = JobRegistry(data)

        bind = os.environ.get("PYTORRENT_BT_BIND", "0.0.0.0")
        port = int(os.environ.get("PYTORRENT_BT_PORT", "6881"))

        async def bt_client(
            reader: asyncio.StreamReader, writer: asyncio.StreamWriter
        ) -> None:
            from pytorrent.protocol.incoming import run_incoming_peer

            def resolve(ih: bytes) -> TorrentSession | None:
                reg = _registry
                if not reg:
                    return None
                j = reg.jobs.get(ih.hex())
                return j.session if j else None

            await run_incoming_peer(reader, writer, resolve)

        bound_addrs: list[str] = []
        try:
            _bt_server = await asyncio.start_server(bt_client, bind, port)
            for sock in _bt_server.sockets or ():
                try:
                    host, prt = sock.getsockname()[:2]
                    bound_addrs.append(f"{host}:{prt}")
                except OSError:
                    pass
            log.info("bt_listen", bind=bind, port=port, sockets=bound_addrs)
            app.state.bt_listen = {
                "ok": True,
                "configured_bind": bind,
                "configured_port": port,
                "sockets": bound_addrs,
                "announced_to_trackers_port": port,
            }
        except OSError as e:
            log.error("bt_listen_failed", err=str(e), bind=bind, port=port)
            _bt_server = None
            app.state.bt_listen = {
                "ok": False,
                "configured_bind": bind,
                "configured_port": port,
                "announced_to_trackers_port": port,
                "error": str(e),
            }

        yield

        if _bt_server is not None:
            _bt_server.close()
            await _bt_server.wait_closed()
            _bt_server = None
        if hasattr(app.state, "bt_listen"):
            delattr(app.state, "bt_listen")
        if _registry:
            for j in list(_registry.jobs.values()):
                j.session.stop()
                if j.task:
                    j.task.cancel()
        _registry = None

    app = FastAPI(title="PyTorrent daemon", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=os.environ.get("PYTORRENT_CORS", "http://localhost:5173").split(","),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health(request: Request) -> dict[str, Any]:
        out: dict[str, Any] = {"status": "ok"}
        bt = getattr(request.app.state, "bt_listen", None)
        if bt is not None:
            out["bt_listen"] = bt
        else:
            out["bt_listen"] = {"ok": False, "error": "listener not initialized"}
        return out

    dist = web_dist_dir()

    @app.get("/torrents")
    async def list_torrents() -> JSONResponse:
        reg = get_registry()
        out = []
        for jid, j in reg.jobs.items():
            out.append(
                {
                    "id": jid,
                    "name": j.meta.name,
                    "download_dir": j.download_dir,
                    "total": j.meta.total_length,
                    "downloaded": j.session.bytes_done(),
                    "uploaded": j.session.uploaded,
                    "complete": j.session.is_complete(),
                    "error": j.error,
                }
            )
        return JSONResponse(out)

    @app.post("/torrents")
    async def add_torrent(
        file: UploadFile = File(...),
        download_dir: str | None = None,
    ) -> JSONResponse:
        raw = await file.read()
        if not raw:
            raise HTTPException(400, "empty file")
        try:
            job = await get_registry().add_torrent(raw, download_dir)
        except Exception as e:
            log.warning("invalid torrent", err=str(e))
            raise HTTPException(400, f"invalid torrent: {e}") from e
        return JSONResponse(
            {
                "id": job.id,
                "name": job.meta.name,
                "download_dir": job.download_dir,
            }
        )

    @app.post("/torrents/{job_id}/stop")
    async def stop_torrent(job_id: str) -> JSONResponse:
        try:
            await get_registry().pause(job_id)
        except KeyError:
            raise HTTPException(404, "not found") from None
        return JSONResponse({"ok": True})

    @app.delete("/torrents/{job_id}")
    async def delete_torrent(job_id: str) -> JSONResponse:
        reg = get_registry()
        await reg.pause(job_id)
        reg.remove(job_id)
        return JSONResponse({"ok": True})

    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket) -> None:
        await ws.accept()
        reg = get_registry()
        reg.register_ws(ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            reg.unregister_ws(ws)

    assets_dir = os.path.join(dist, "assets") if dist else ""
    if dist and os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="web-assets")

    @app.get("/", response_model=None)
    async def root_page() -> FileResponse | HTMLResponse:
        if dist:
            index = os.path.join(dist, "index.html")
            if os.path.isfile(index):
                return FileResponse(index)
        return HTMLResponse(_fallback_root_html())

    return app
