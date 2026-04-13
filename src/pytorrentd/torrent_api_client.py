"""Call Torrent-Api-py either via embedded ASGI app or external HTTP base."""

from __future__ import annotations

import json
from typing import Any

import aiohttp
import httpx
import structlog
import urllib.parse
from fastapi import HTTPException
from fastapi.responses import JSONResponse

from pytorrentd.torflix_env import tenv_strip
from pytorrentd.torrent_api_app import get_embedded_torrent_api_app, vendor_torrent_api_installed

log = structlog.get_logger()


def torrent_api_configured() -> bool:
    """True if external base is set or vendored API is present."""
    if tenv_strip("SEARCH_API_BASE"):
        return True
    return vendor_torrent_api_installed()


async def torrent_api_get_json(
    path: str,
    params: dict[str, Any],
    *,
    timeout: float = 90.0,
) -> JSONResponse:
    if not path.startswith("/"):
        path = "/" + path
    filtered = {k: v for k, v in params.items() if v is not None}
    ext = tenv_strip("SEARCH_API_BASE").rstrip("/")

    headers: dict[str, str] = {}
    key = tenv_strip("SEARCH_API_KEY")
    if key:
        headers["X-API-Key"] = key

    if ext:
        qs = urllib.parse.urlencode(filtered)
        url = f"{ext}{path}?{qs}" if qs else f"{ext}{path}"
        try:
            async with aiohttp.ClientSession(trust_env=True) as sess:
                async with sess.get(
                    url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                ) as resp:
                    status = resp.status
                    body = await resp.read()
        except Exception as e:
            log.warning("torrent_api_http_failed", path=path, err=str(e))
            raise HTTPException(502, f"upstream request failed: {e}") from e
    else:
        if not vendor_torrent_api_installed():
            raise HTTPException(
                503,
                "Torrent catalog API unavailable: vendored Torrent-Api-py is missing from the install.",
            )
        try:
            app = get_embedded_torrent_api_app()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://torrent-api.embedded",
                timeout=timeout,
            ) as client:
                resp = await client.get(path, params=filtered, headers=headers)
                status = resp.status_code
                body = resp.content
        except Exception as e:
            log.warning("torrent_api_embedded_failed", path=path, err=str(e))
            raise HTTPException(502, f"embedded catalog request failed: {e}") from e

    try:
        data = json.loads(body) if body.strip() else {}
    except json.JSONDecodeError:
        raise HTTPException(
            502,
            body.decode("utf-8", errors="replace")[:500] or "non-JSON catalog response",
        ) from None
    return JSONResponse(content=data, status_code=status)


async def torrent_api_search_json(
    *,
    q: str,
    site: str | None,
    limit: int,
    timeout: float = 60.0,
) -> JSONResponse:
    ext = tenv_strip("SEARCH_API_BASE").rstrip("/")
    headers: dict[str, str] = {}
    key = tenv_strip("SEARCH_API_KEY")
    if key:
        headers["X-API-Key"] = key

    if ext:
        if site:
            path = "/api/v1/search"
            url = (
                f"{ext}{path}?site={urllib.parse.quote(site)}"
                f"&query={urllib.parse.quote(q)}&limit={limit}"
            )
        else:
            path = tenv_strip("SEARCH_PATH", "/api/v1/all/search")
            if not path.startswith("/"):
                path = "/" + path
            url = f"{ext}{path}?query={urllib.parse.quote(q)}&limit={limit}"
        try:
            async with aiohttp.ClientSession(trust_env=True) as sess:
                async with sess.get(
                    url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                ) as resp:
                    status = resp.status
                    body = await resp.read()
        except Exception as e:
            log.warning("search_proxy_failed", err=str(e))
            raise HTTPException(502, f"search upstream failed: {e}") from e
    else:
        if not vendor_torrent_api_installed():
            raise HTTPException(
                503,
                "Torrent catalog API unavailable: vendored Torrent-Api-py is missing.",
            )
        path = "/api/v1/search" if site else tenv_strip("SEARCH_PATH", "/api/v1/all/search")
        if not path.startswith("/"):
            path = "/" + path
        params: dict[str, Any] = {"query": q, "limit": limit}
        if site:
            params["site"] = site
        try:
            app = get_embedded_torrent_api_app()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://torrent-api.embedded",
                timeout=timeout,
            ) as client:
                resp = await client.get(path, params=params, headers=headers)
                status = resp.status_code
                body = resp.content
        except Exception as e:
            log.warning("search_embedded_failed", err=str(e))
            raise HTTPException(502, f"embedded search failed: {e}") from e

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(502, "search returned non-JSON") from None
    if status != 200:
        raise HTTPException(
            status,
            body.decode("utf-8", errors="replace")[:800],
        )
    return JSONResponse(content=data)
