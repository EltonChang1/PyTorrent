"""
Embedded Torrent-Api-py FastAPI application (vendored under vendor_torrent_api/).

Loaded only when needed. Auth: Torrent-Api uses env PYTORRENT_API_KEY (or TORFLIX_API_KEY);
Torflix maps SEARCH_API_KEY to the same if API_KEY is unset.
"""

from __future__ import annotations

import os
import sys
import time
from math import ceil
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

_VENDOR_ROOT = Path(__file__).resolve().parent / "vendor_torrent_api"


def vendor_torrent_api_installed() -> bool:
    return _VENDOR_ROOT.is_dir() and (_VENDOR_ROOT / "routers").is_dir()


def _ensure_vendor_on_path() -> None:
    if not vendor_torrent_api_installed():
        return
    root = str(_VENDOR_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


_embedded_app: FastAPI | None = None


def _sync_api_key_env() -> None:
    sk = (
        os.environ.get("TORFLIX_SEARCH_API_KEY", "").strip()
        or os.environ.get("PYTORRENT_SEARCH_API_KEY", "").strip()
    )
    if not sk:
        return
    if not (
        os.environ.get("TORFLIX_API_KEY", "").strip()
        or os.environ.get("PYTORRENT_API_KEY", "").strip()
    ):
        os.environ.setdefault("TORFLIX_API_KEY", sk)
        os.environ.setdefault("PYTORRENT_API_KEY", sk)


def create_embedded_torrent_api_app() -> FastAPI:
    """Build the same API surface as upstream main.py (without home README route, mangum, or uvicorn)."""
    _ensure_vendor_on_path()
    if not vendor_torrent_api_installed():
        raise RuntimeError("vendor_torrent_api is missing from the Torflix daemon package")

    _sync_api_key_env()

    from helper.dependencies import authenticate_request  # noqa: PLC0415 — after path fix
    from helper.uptime import getUptime  # noqa: PLC0415
    from routers.v1.catergory_router import router as category_router  # noqa: PLC0415
    from routers.v1.combo_routers import router as combo_router  # noqa: PLC0415
    from routers.v1.recent_router import router as recent_router  # noqa: PLC0415
    from routers.v1.search_router import router as search_router  # noqa: PLC0415
    from routers.v1.search_url_router import router as search_url_router  # noqa: PLC0415
    from routers.v1.sites_list_router import router as site_list_router  # noqa: PLC0415
    from routers.v1.trending_router import router as trending_router  # noqa: PLC0415

    start_time = time.time()

    app = FastAPI(
        title="Torrent-Api-Py (embedded in Torflix)",
        version="1.0.1",
        description="Vendored from https://github.com/Ryuk-me/Torrent-Api-py",
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health_route(req: Request) -> JSONResponse:
        return JSONResponse(
            {
                "app": "Torrent-Api-Py-embedded",
                "version": "v1.0.1",
                "ip": req.client.host if req.client else None,
                "uptime": ceil(getUptime(start_time)),
            }
        )

    deps = [Depends(authenticate_request)]
    app.include_router(search_router, prefix="/api/v1/search", dependencies=deps)
    app.include_router(trending_router, prefix="/api/v1/trending", dependencies=deps)
    app.include_router(category_router, prefix="/api/v1/category", dependencies=deps)
    app.include_router(recent_router, prefix="/api/v1/recent", dependencies=deps)
    app.include_router(combo_router, prefix="/api/v1/all", dependencies=deps)
    app.include_router(site_list_router, prefix="/api/v1/sites", dependencies=deps)
    app.include_router(search_url_router, prefix="/api/v1/search_url", dependencies=deps)
    return app


def get_embedded_torrent_api_app() -> FastAPI:
    global _embedded_app
    if _embedded_app is None:
        _embedded_app = create_embedded_torrent_api_app()
    return _embedded_app
