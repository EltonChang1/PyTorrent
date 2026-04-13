"""FastAPI REST + WebSocket for torrent jobs."""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import aiohttp
import structlog
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from pytorrent.bencoding import BencodeError
from pytorrent.torrent import TorrentMeta, playback_content_type, primary_playback_span
from pytorrent.session import TorrentSession
from pytorrentd.torrent_api_client import torrent_api_configured, torrent_api_get_json, torrent_api_search_json

log = structlog.get_logger()


# #region agent log
def _agent_debug_ndjson(hypothesis_id: str, location: str, message: str, data: dict[str, Any]) -> None:
    """Append one NDJSON line for debug sessions (under workspace or repo .cursor/)."""
    line = (
        json.dumps(
            {
                "sessionId": "7eef1f",
                "hypothesisId": hypothesis_id,
                "location": location,
                "message": message,
                "data": data,
                "timestamp": int(time.time() * 1000),
            },
            default=str,
        )
        + "\n"
    )
    here = Path(__file__).resolve()
    for base in (here.parents[3], here.parents[2]):
        try:
            log_path = base / ".cursor" / "debug-7eef1f.log"
            log_path.parent.mkdir(parents=True, exist_ok=True)
            with log_path.open("a", encoding="utf-8") as f:
                f.write(line)
            return
        except OSError:
            continue


# #endregion


class MagnetAddBody(BaseModel):
    magnet: str = Field(..., min_length=12)
    download_dir: str | None = None
    sequential: bool = False
    """Prefer sequential pieces from the start (watch while downloading in the browser)."""


class RegisterBody(BaseModel):
    username: str = Field(..., min_length=2, max_length=32)
    password: str = Field(..., min_length=6, max_length=200)


class LoginBody(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class UserSettingsPatch(BaseModel):
    favoriteGenres: list[str] | None = None
    hiddenRowKeys: list[str] | None = None
    showRecommendations: bool | None = None
    rowOrder: list[str] | None = None
    myList: list[dict[str, Any]] | None = None


class WatchProgressIn(BaseModel):
    job_id: str = Field(..., min_length=8, max_length=80)
    position_sec: float = Field(0, ge=0)
    duration_sec: float = Field(0, ge=0)
    title: str | None = None


def _ensure_vendor_torrent_path() -> None:
    import sys
    from pathlib import Path

    v = Path(__file__).resolve().parent / "vendor_torrent_api"
    s = str(v)
    if s not in sys.path:
        sys.path.insert(0, s)


@dataclass
class Job:
    id: str
    meta: TorrentMeta
    download_dir: str
    session: TorrentSession
    task: asyncio.Task | None = None
    error: str | None = None
    complete_broadcast: bool = False
    sequential: bool = False


class JobRegistry:
    def __init__(self, data_dir: str, *, listen_port: int | None = None) -> None:
        self.data_dir = data_dir
        self.listen_port = listen_port if listen_port is not None else int(
            os.environ.get("PYTORRENT_BT_PORT", "6881")
        )
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
        *,
        sequential: bool = False,
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
            listen_port=self.listen_port,
            sequential=sequential,
        )

        job = Job(id=jid, meta=meta, download_dir=ddir, session=session, sequential=sequential)

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
        try:
            async with aiohttp.ClientSession(trust_env=True) as sess:
                await job.session.announce_tracker_event(sess, "stopped")
        except Exception as e:
            log.warning("tracker_stopped_failed", job=jid, err=str(e))
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


def _parse_range_header(range_header: str | None, size: int) -> tuple[int, int] | None:
    """Inclusive byte range within logical file of length ``size``. None = send default prefix."""
    if range_header is None:
        return None
    if not range_header.startswith("bytes="):
        return None
    part = range_header.split("=", 1)[1].strip().split(",", 1)[0].strip()
    if part.startswith("-"):
        try:
            suffix = int(part[1:])
        except ValueError:
            return None
        if suffix <= 0 or size <= 0:
            return None
        start = max(0, size - suffix)
        return (start, size - 1)
    if "-" not in part:
        return None
    start_s, end_s = part.split("-", 1)
    try:
        if start_s == "":
            return None
        start = int(start_s)
        end = int(end_s) if end_s != "" else size - 1
    except ValueError:
        return None
    if size <= 0 or start < 0 or start >= size:
        return None
    end = min(end, size - 1)
    if end < start:
        return None
    return (start, end)


_STREAM_CHUNK = 256 * 1024

_auth_rl_buckets: dict[str, list[float]] = {}
_AUTH_RL_WINDOW = 60.0
_AUTH_RL_MAX = 30


def _auth_rate_check(request: Request) -> None:
    if os.environ.get("PYTORRENT_DISABLE_AUTH_RL", "").lower() in ("1", "true", "yes"):
        return
    ip = (request.client.host if request.client else None) or "unknown"
    now = time.time()
    cutoff = now - _AUTH_RL_WINDOW
    bucket = _auth_rl_buckets.setdefault(ip, [])
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= _AUTH_RL_MAX:
        raise HTTPException(429, "Too many attempts; try again shortly.") from None
    bucket.append(now)


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
        from pytorrentd import user_store

        await user_store.async_init_db()

        bind = os.environ.get("PYTORRENT_BT_BIND", "0.0.0.0")
        req_port = int(os.environ.get("PYTORRENT_BT_PORT", "6881"))

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

        _bt_server = None
        effective_listen = req_port
        last_err: OSError | None = None
        bound_addrs: list[str] = []
        for candidate in range(req_port, req_port + 32):
            bound_addrs = []
            try:
                _registry = JobRegistry(data, listen_port=candidate)
                _bt_server = await asyncio.start_server(bt_client, bind, candidate)
                effective_listen = candidate
                for sock in _bt_server.sockets or ():
                    try:
                        host, prt = sock.getsockname()[:2]
                        bound_addrs.append(f"{host}:{prt}")
                    except OSError:
                        pass
                log.info(
                    "bt_listen",
                    bind=bind,
                    port=candidate,
                    requested_port=req_port,
                    sockets=bound_addrs,
                )
                app.state.bt_listen = {
                    "ok": True,
                    "configured_bind": bind,
                    "configured_port": candidate,
                    "requested_port": req_port,
                    "sockets": bound_addrs,
                    "announced_to_trackers_port": candidate,
                }
                break
            except OSError as e:
                last_err = e
                _registry = None
                continue

        if _bt_server is None:
            log.error(
                "bt_listen_failed",
                err=str(last_err) if last_err else "unknown",
                bind=bind,
                port=req_port,
            )
            app.state.bt_listen = {
                "ok": False,
                "configured_bind": bind,
                "configured_port": req_port,
                "requested_port": req_port,
                "announced_to_trackers_port": req_port,
                "error": str(last_err) if last_err else "bind failed",
            }
            _registry = JobRegistry(data, listen_port=req_port)

        yield

        if _bt_server is not None:
            _bt_server.close()
            await _bt_server.wait_closed()
            _bt_server = None
        if hasattr(app.state, "bt_listen"):
            delattr(app.state, "bt_listen")
        if _registry:
            try:
                async with aiohttp.ClientSession(trust_env=True) as sess:
                    coros = [
                        j.session.announce_tracker_event(sess, "stopped")
                        for j in list(_registry.jobs.values())
                    ]
                    if coros:
                        await asyncio.wait_for(
                            asyncio.gather(*coros, return_exceptions=True),
                            timeout=12.0,
                        )
            except asyncio.TimeoutError:
                log.warning("tracker_stopped_shutdown_timeout")
            except Exception as e:
                log.warning("tracker_stopped_shutdown_failed", err=str(e))
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
        out["search"] = {
            "configured": torrent_api_configured(),
            "embedded": torrent_api_configured()
            and not bool(os.environ.get("PYTORRENT_SEARCH_API_BASE", "").strip()),
            "external_base": bool(os.environ.get("PYTORRENT_SEARCH_API_BASE", "").strip()),
        }
        out["accounts"] = {"enabled": True}
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
                    "sequential": j.sequential,
                }
            )
        return JSONResponse(out)

    @app.post("/torrents")
    async def add_torrent(
        file: UploadFile = File(...),
        download_dir: str | None = Form(None),
        sequential: bool = Form(False),
    ) -> JSONResponse:
        raw = await file.read()
        if not raw:
            raise HTTPException(400, "empty file")
        try:
            job = await get_registry().add_torrent(raw, download_dir, sequential=sequential)
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

    @app.post("/torrents/magnet")
    async def add_magnet(body: MagnetAddBody) -> JSONResponse:
        from pytorrent.magnet import parse_magnet
        from pytorrent.metadata_fetch import fetch_metadata_via_trackers
        from pytorrent.tracker import make_peer_id

        try:
            mag = parse_magnet(body.magnet.strip())
        except ValueError as e:
            # #region agent log
            _agent_debug_ndjson("H1", "app.py:add_magnet", "parse_magnet_failed", {"err": str(e)[:300]})
            # #endregion
            raise HTTPException(400, str(e)) from e
        if not mag.trackers:
            # #region agent log
            _agent_debug_ndjson(
                "H2",
                "app.py:add_magnet",
                "no_trackers",
                {"ih": mag.info_hash.hex()[:16]},
            )
            # #endregion
            raise HTTPException(
                400,
                "magnet has no tr= trackers; add trackers to the link or use a .torrent file",
            )
        listen = get_registry().listen_port
        peer_id = make_peer_id()
        info_b = await fetch_metadata_via_trackers(mag.trackers, mag.info_hash, peer_id, listen)
        if not info_b:
            # #region agent log
            _agent_debug_ndjson(
                "H3",
                "app.py:add_magnet",
                "metadata_timeout",
                {
                    "bt_port": listen,
                    "tracker_count": len(mag.trackers),
                    "ih": mag.info_hash.hex()[:16],
                },
            )
            # #endregion
            raise HTTPException(
                504,
                "could not fetch metadata from peers (no ut_metadata or timeout)",
            )
        try:
            meta = TorrentMeta.from_resolved_magnet(info_b, mag.trackers)
        except BencodeError as e:
            # #region agent log
            _agent_debug_ndjson("H4", "app.py:add_magnet", "bencode_failed", {"err": str(e)[:300]})
            # #endregion
            raise HTTPException(400, f"invalid metadata: {e}") from e
        try:
            job = await get_registry().add_torrent(
                meta.raw, body.download_dir, sequential=body.sequential
            )
        except Exception as e:
            log.warning("magnet add failed", err=str(e))
            # #region agent log
            _agent_debug_ndjson("H5", "app.py:add_magnet", "add_torrent_failed", {"err": str(e)[:300]})
            # #endregion
            raise HTTPException(400, str(e)) from e
        # #region agent log
        _agent_debug_ndjson(
            "H0",
            "app.py:add_magnet",
            "ok",
            {"job_id": job.id, "sequential": body.sequential},
        )
        # #endregion
        return JSONResponse(
            {
                "id": job.id,
                "name": job.meta.name,
                "download_dir": job.download_dir,
                "sequential": job.sequential,
            }
        )

    def _stream_headers_and_body(
        job: Job, request: Request, *, head_only: bool
    ) -> Response | StreamingResponse:
        v_off, v_len = primary_playback_span(job.meta)
        if v_len <= 0:
            raise HTTPException(404, "nothing to stream") from None
        contiguous = job.session.torrent_contiguous_verified_end()
        video_avail = max(0, min(contiguous - v_off, v_len))
        mime = playback_content_type(job.meta, v_off)

        if video_avail <= 0:
            return Response(
                status_code=503,
                headers={
                    "Retry-After": "2",
                    "Accept-Ranges": "bytes",
                    "Content-Type": mime,
                },
            )

        range_header = request.headers.get("range")
        parsed = _parse_range_header(range_header, v_len)
        if parsed is None:
            start, end = 0, min(v_len - 1, video_avail - 1)
        else:
            start, end = parsed
            end = min(end, v_len - 1, video_avail - 1)
            if start >= video_avail:
                return Response(
                    status_code=416,
                    headers={"Content-Range": f"bytes */{v_len}"},
                )
            if start > end:
                return Response(
                    status_code=416,
                    headers={"Content-Range": f"bytes */{v_len}"},
                )

        abs_start = v_off + start
        body_len = end - start + 1
        full_complete = video_avail >= v_len and start == 0 and end == v_len - 1
        use_partial = bool(range_header) or not full_complete
        status = 206 if use_partial else 200

        hdrs: dict[str, str] = {
            "Content-Type": mime,
            "Accept-Ranges": "bytes",
            "Content-Length": str(body_len),
        }
        if use_partial:
            hdrs["Content-Range"] = f"bytes {start}-{end}/{v_len}"

        if head_only:
            return Response(status_code=status, headers=hdrs)

        async def gen():
            remaining = body_len
            pos = abs_start
            while remaining > 0:
                n = min(_STREAM_CHUNK, remaining)
                chunk = await job.session.storage.read_at(pos, n)
                if len(chunk) != n:
                    break
                yield chunk
                pos += n
                remaining -= n

        return StreamingResponse(
            gen(),
            status_code=status,
            media_type=mime,
            headers=hdrs,
        )

    @app.head("/torrents/{job_id}/stream", response_model=None)
    async def stream_torrent_head(job_id: str, request: Request):
        job = get_registry().get(job_id)
        if not job:
            raise HTTPException(404, "not found") from None
        return _stream_headers_and_body(job, request, head_only=True)

    @app.get("/torrents/{job_id}/stream", response_model=None)
    async def stream_torrent_get(job_id: str, request: Request):
        job = get_registry().get(job_id)
        if not job:
            raise HTTPException(404, "not found") from None
        return _stream_headers_and_body(job, request, head_only=False)

    @app.get("/search")
    async def search_proxy(
        q: str,
        site: str | None = None,
        limit: int = 15,
    ) -> JSONResponse:
        return await torrent_api_search_json(q=q, site=site, limit=limit, timeout=60.0)

    @app.get("/browse/sites")
    async def browse_sites() -> JSONResponse:
        return await torrent_api_get_json("/api/v1/sites", {})

    @app.get("/browse/sites/config")
    async def browse_sites_config() -> JSONResponse:
        return await torrent_api_get_json("/api/v1/sites/config", {})

    @app.get("/browse/trending")
    async def browse_trending(
        site: str,
        limit: int = 24,
        category: str | None = None,
        page: int = 1,
    ) -> JSONResponse:
        return await torrent_api_get_json(
            "/api/v1/trending",
            {"site": site, "limit": limit, "page": page, "category": category},
        )

    @app.get("/browse/recent")
    async def browse_recent(
        site: str,
        limit: int = 24,
        category: str | None = None,
        page: int = 1,
    ) -> JSONResponse:
        return await torrent_api_get_json(
            "/api/v1/recent",
            {"site": site, "limit": limit, "page": page, "category": category},
        )

    @app.get("/browse/category")
    async def browse_category(
        site: str,
        query: str,
        category: str,
        limit: int = 24,
        page: int = 1,
    ) -> JSONResponse:
        return await torrent_api_get_json(
            "/api/v1/category",
            {
                "site": site,
                "query": query,
                "category": category,
                "limit": limit,
                "page": page,
            },
        )

    @app.get("/browse/yts/list")
    async def browse_yts_curated_list(
        genre: str | None = None,
        sort_by: str = "download_count",
        order_by: str = "desc",
        minimum_rating: int | None = None,
        limit: int = 24,
        page: int = 1,
    ) -> JSONResponse:
        """YTS JSON list_movies slice (genres, sorts) for home-page rails."""
        _ensure_vendor_torrent_path()
        from torrents import yts_api

        async with aiohttp.ClientSession(trust_env=True) as sess:
            raw = await yts_api.fetch_list_movies_json(
                sess,
                page=page,
                limit=limit,
                sort_by=sort_by or None,
                order_by=order_by,
                genre=genre,
                minimum_rating=minimum_rating,
            )
        if raw is None:
            return JSONResponse({"data": [], "total": 0, "error": "yts_list_unavailable"})
        out = yts_api.wrap_list_response(raw, limit=limit, elapsed=0.0)
        return JSONResponse(out)

    async def _session_user(request: Request) -> int | None:
        from pytorrentd import user_store

        tok = request.cookies.get("pt_session")
        return await asyncio.to_thread(user_store.session_user_id, tok)

    @app.post("/auth/register")
    async def auth_register(request: Request, body: RegisterBody) -> JSONResponse:
        from pytorrentd import user_store

        _auth_rate_check(request)
        uid, msg = await asyncio.to_thread(user_store.register_user, body.username, body.password)
        if uid is None:
            raise HTTPException(400, msg) from None
        token = await asyncio.to_thread(user_store.create_session, uid)
        u = await asyncio.to_thread(user_store.get_user, uid)
        resp = JSONResponse({"user": u})
        resp.set_cookie(
            key="pt_session",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=user_store.SESSION_DAYS * 86400,
            path="/",
        )
        return resp

    @app.post("/auth/login")
    async def auth_login(request: Request, body: LoginBody) -> JSONResponse:
        from pytorrentd import user_store

        _auth_rate_check(request)
        uid = await asyncio.to_thread(user_store.verify_login, body.username, body.password)
        if uid is None:
            raise HTTPException(401, "invalid username or password") from None
        token = await asyncio.to_thread(user_store.create_session, uid)
        u = await asyncio.to_thread(user_store.get_user, uid)
        resp = JSONResponse({"user": u})
        resp.set_cookie(
            key="pt_session",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=user_store.SESSION_DAYS * 86400,
            path="/",
        )
        return resp

    @app.post("/auth/logout")
    async def auth_logout(request: Request) -> JSONResponse:
        from pytorrentd import user_store

        tok = request.cookies.get("pt_session")
        await asyncio.to_thread(user_store.revoke_session, tok)
        resp = JSONResponse({"ok": True})
        resp.delete_cookie("pt_session", path="/")
        return resp

    @app.get("/auth/me")
    async def auth_me(request: Request) -> JSONResponse:
        from pytorrentd import user_store

        uid = await _session_user(request)
        if uid is None:
            return JSONResponse({"user": None})
        u = await asyncio.to_thread(user_store.get_user, uid)
        return JSONResponse({"user": u})

    @app.get("/user/settings")
    async def user_settings_get(request: Request) -> JSONResponse:
        from pytorrentd import user_store

        uid = await _session_user(request)
        if uid is None:
            raise HTTPException(401, "login required") from None
        s = await asyncio.to_thread(user_store.get_settings, uid)
        return JSONResponse(s)

    @app.put("/user/settings")
    async def user_settings_put(request: Request, body: UserSettingsPatch) -> JSONResponse:
        from pytorrentd import user_store

        uid = await _session_user(request)
        if uid is None:
            raise HTTPException(401, "login required") from None
        cur = await asyncio.to_thread(user_store.get_settings, uid)
        patch = body.model_dump(exclude_unset=True)
        merged = {**cur, **patch}
        await asyncio.to_thread(user_store.save_settings, uid, merged)
        return JSONResponse(merged)

    @app.get("/user/watch/progress")
    async def user_watch_list(request: Request) -> JSONResponse:
        from pytorrentd import user_store

        uid = await _session_user(request)
        if uid is None:
            raise HTTPException(401, "login required") from None
        rows = await asyncio.to_thread(user_store.list_watch_progress, uid, 30)
        return JSONResponse({"items": rows})

    @app.post("/user/watch/progress")
    async def user_watch_save(request: Request, body: WatchProgressIn) -> JSONResponse:
        from pytorrentd import user_store

        uid = await _session_user(request)
        if uid is None:
            raise HTTPException(401, "login required") from None
        await asyncio.to_thread(
            user_store.save_watch_progress,
            uid,
            body.job_id,
            body.position_sec,
            body.duration_sec,
            body.title,
        )
        return JSONResponse({"ok": True})

    @app.get("/catalog/image", response_model=None)
    async def catalog_image(url: str) -> Response:
        """Proxy YTS poster URLs with mirror Referer; host allowlist only (not an open proxy)."""
        from pytorrentd.catalog_image_proxy import fetch_catalog_image

        body, ct = await fetch_catalog_image(url)
        return Response(content=body, media_type=ct)

    @app.get("/catalog/poster")
    async def catalog_poster(imdb_code: str) -> JSONResponse:
        from pytorrentd.yts_catalog_client import lookup_poster_url

        url = await lookup_poster_url(imdb_code)
        if not url:
            raise HTTPException(
                404,
                "No poster found. Set TMDB_API_KEY or OMDB_API_KEY, or check imdb_code.",
            ) from None
        return JSONResponse({"url": url})

    @app.get("/catalog/yts/movie")
    async def catalog_yts_movie(movie_id: int) -> JSONResponse:
        from pytorrentd.yts_catalog_client import get_yts_movie_row

        row = await get_yts_movie_row(movie_id)
        if not row:
            raise HTTPException(404, "YTS movie not found") from None
        return JSONResponse(row)

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

    # React Router paths (e.g. /find, /downloads) when UI is served from daemon — return SPA shell.
    if dist:
        _index_html = os.path.join(dist, "index.html")
        if os.path.isfile(_index_html):

            @app.get("/{spa_path:path}", response_model=None)
            async def spa_shell(spa_path: str) -> FileResponse:
                if spa_path.startswith(
                    ("torrents", "health", "browse", "search", "catalog", "ws", "assets/")
                ) or spa_path == "assets":
                    raise HTTPException(404, "not found")
                return FileResponse(_index_html)

    return app
