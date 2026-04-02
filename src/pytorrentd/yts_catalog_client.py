"""Optional catalog helpers (YTS JSON movie details, poster lookup via TMDb/OMDb)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import aiohttp

_VENDOR_ROOT = Path(__file__).resolve().parent / "vendor_torrent_api"


def ensure_vendor_path() -> None:
    root = str(_VENDOR_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


async def lookup_poster_url(imdb_code: str) -> str | None:
    """Resolve a poster HTTPS URL using TMDB_API_KEY or OMDB_API_KEY (optional)."""
    code = imdb_code.strip()
    if not code.startswith("tt"):
        return None

    tmdb_key = os.environ.get("TMDB_API_KEY", "").strip()
    if tmdb_key:
        url = (
            f"https://api.themoviedb.org/3/find/{code}"
            f"?external_source=imdb_id&api_key={tmdb_key}"
        )
        try:
            async with aiohttp.ClientSession(trust_env=True) as s:
                async with s.get(url, timeout=aiohttp.ClientTimeout(total=12)) as r:
                    if r.status != 200:
                        return None
                    j = await r.json()
        except (aiohttp.ClientError, TimeoutError):
            return None
        for key in ("movie_results", "tv_results"):
            arr = j.get(key)
            if isinstance(arr, list) and arr:
                p = arr[0].get("poster_path")
                if isinstance(p, str) and p.startswith("/"):
                    return f"https://image.tmdb.org/t/p/w500{p}"

    omdb_key = os.environ.get("OMDB_API_KEY", "").strip()
    if omdb_key:
        url = f"https://www.omdbapi.com/?i={code}&apikey={omdb_key}"
        try:
            async with aiohttp.ClientSession(trust_env=True) as s:
                async with s.get(url, timeout=aiohttp.ClientTimeout(total=12)) as r:
                    if r.status != 200:
                        return None
                    j = await r.json()
        except (aiohttp.ClientError, TimeoutError):
            return None
        poster = j.get("Poster")
        if isinstance(poster, str) and poster.startswith("http"):
            return poster

    return None


async def get_yts_movie_row(movie_id: int) -> dict | None:
    ensure_vendor_path()
    from constants.base_url import YTS
    from helper.poster_proxy import rewrite_catalog_row_posters
    from torrents import yts_api

    async with aiohttp.ClientSession(trust_env=True) as s:
        raw = await yts_api.fetch_movie_details_json(s, movie_id)
    if not raw:
        return None
    row = yts_api.movie_details_to_catalog_row(raw)
    if row:
        rewrite_catalog_row_posters(row, YTS)
    return row
