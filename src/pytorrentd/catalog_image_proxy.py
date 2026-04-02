"""GET /catalog/image — fetch remote posters with mirror Referer (not an open proxy)."""

from __future__ import annotations

import os
import time
from functools import lru_cache
from urllib.parse import urlparse

import aiohttp
from fastapi import HTTPException
from fastapi.responses import Response

# Hosts we allow to fetch (YTS mirrors and common asset CDNs from their HTML)
_ALLOWED_SUFFIXES: tuple[str, ...] = (
    "yts.mx",
    "yts-official.to",
    "yts.am",
    "yts.lt",
    "dyncdn.cc",
    "picturedent.org",
)

_CACHE: dict[str, tuple[float, bytes, str]] = {}
_CACHE_TTL = 300.0
_CACHE_MAX = 256


def _allowed_host(host: str) -> bool:
    h = host.lower().strip(".")
    if not h:
        return False
    for suf in _ALLOWED_SUFFIXES:
        if h == suf or h.endswith("." + suf):
            return True
    return False


def catalog_image_allowed_url(url: str) -> bool:
    try:
        p = urlparse(url)
    except Exception:
        return False
    if p.scheme not in ("http", "https"):
        return False
    return _allowed_host(p.hostname or "")


@lru_cache(maxsize=1)
def _yts_referer() -> str:
    return os.environ.get("YTS_BASE_URL", "https://www3.yts-official.to").strip().rstrip("/") + "/"


async def fetch_catalog_image(url: str) -> tuple[bytes, str]:
    if not catalog_image_allowed_url(url):
        raise HTTPException(400, "URL host not allowed for catalog image proxy") from None

    now = time.time()
    hit = _CACHE.get(url)
    if hit and now - hit[0] < _CACHE_TTL:
        return hit[1], hit[2]

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; PyTorrent/1.0; +catalog-image)",
        "Referer": _yts_referer(),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    try:
        async with aiohttp.ClientSession(trust_env=True) as sess:
            async with sess.get(
                url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=25),
                allow_redirects=True,
            ) as resp:
                if resp.status != 200:
                    raise HTTPException(502, f"upstream image HTTP {resp.status}") from None
                ct = resp.headers.get("Content-Type", "image/jpeg").split(";")[0].strip()
                if not ct.startswith("image/"):
                    raise HTTPException(502, "upstream did not return an image") from None
                body = await resp.read()
                if len(body) > 15 * 1024 * 1024:
                    raise HTTPException(502, "image too large") from None
    except HTTPException:
        raise
    except aiohttp.ClientError as e:
        raise HTTPException(502, f"image fetch failed: {e}") from e

    if len(_CACHE) >= _CACHE_MAX:
        _CACHE.clear()
    _CACHE[url] = (now, body, ct)
    return body, ct


