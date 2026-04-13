"""
YTS public JSON API v2 (same contract as https://github.com/rnestler/yts-api-rs).

Base URL from YTS_API_BASE (default https://movies-api.accel.li per https://yts.bz/api).
Must be origin only — paths use /api/v2/.... Legacy: YTS_API_BASE=https://yts.bz
"""

from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import quote, urlencode

import aiohttp

from constants.base_url import YTS, YTS_API_BASE
from helper.poster_proxy import rewrite_browse_result_posters

log = logging.getLogger(__name__)

# Trackers commonly bundled with YTS magnets (UDP + HTTP for broader client support).
YTS_MAGNET_TRACKERS: tuple[str, ...] = (
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.tracker.cl:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "https://tracker.nanoha.org:443/announce",
)

_QUALITY_PREF = ("2160p", "1080p", "720p", "3D")


def _torrent_tiebreak_key(t: dict[str, Any]) -> tuple[int, int]:
    seeds = int(t.get("seeds") or 0)
    size_b = int(t.get("size_bytes") or 0)
    return (seeds, size_b)


def pick_preferred_yts_torrent(torrents: list[Any]) -> dict[str, Any] | None:
    """Prefer 2160p → 1080p → 720p → 3D; tie-break seeds then size_bytes (JSON); HTML omits those."""
    candidates = [t for t in torrents if isinstance(t, dict)]
    if not candidates:
        return None
    for q in _QUALITY_PREF:
        matches = [t for t in candidates if str(t.get("quality", "")).strip() == q]
        if matches:
            return max(matches, key=_torrent_tiebreak_key)
    return max(candidates, key=_torrent_tiebreak_key)


def _pick_torrent(torrents: list[dict[str, Any]]) -> dict[str, Any] | None:
    return pick_preferred_yts_torrent(torrents)


def normalized_yts_torrent_options(display_name: str, torrents: list[Any]) -> list[dict[str, Any]]:
    """UI/API: each option has quality, type, size, seeders, leechers, magnet."""
    out: list[dict[str, Any]] = []
    for t in torrents:
        if not isinstance(t, dict):
            continue
        mag = t.get("magnet")
        if isinstance(mag, str) and mag.startswith("magnet:"):
            m = mag
        else:
            h = t.get("hash")
            if not isinstance(h, str) or not h.strip():
                continue
            m = build_yts_magnet(display_name, h)
        seeds = t.get("seeds")
        peers = t.get("peers")
        out.append(
            {
                "quality": t.get("quality"),
                "type": t.get("type"),
                "size": t.get("size"),
                "seeders": str(seeds) if seeds is not None else "",
                "leechers": str(peers) if peers is not None else "",
                "magnet": m,
            }
        )
    return out


def build_yts_magnet(display_name: str, hash_hex: str) -> str:
    ih = hash_hex.strip().lower()
    if len(ih) == 32:
        pass
    dn = quote(display_name or "YTS", safe="")
    parts = [f"magnet:?xt=urn:btih:{ih}", f"dn={dn}"]
    for tr in YTS_MAGNET_TRACKERS:
        parts.append("tr=" + quote(tr, safe=""))
    return "&".join(parts)


def _poster_urls(movie: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for key in ("large_cover_image", "medium_cover_image", "small_cover_image"):
        u = movie.get(key)
        if isinstance(u, str) and u.startswith("http"):
            if u not in out:
                out.append(u)
    return out


def movie_to_catalog_row(movie: dict[str, Any]) -> dict[str, Any] | None:
    torrents = movie.get("torrents") or []
    if not isinstance(torrents, list):
        torrents = []
    raw_list = [x for x in torrents if isinstance(x, dict)]
    picked = pick_preferred_yts_torrent(raw_list)
    if picked is None:
        return None
    name = movie.get("title_long") or movie.get("title_english") or movie.get("title") or "Unknown"
    mag_html = picked.get("magnet")
    if isinstance(mag_html, str) and mag_html.startswith("magnet:"):
        magnet = mag_html
    else:
        h = picked.get("hash")
        if not h or not isinstance(h, str):
            return None
        magnet = build_yts_magnet(name, h)
    posters = _poster_urls(movie)
    torrents_ui = normalized_yts_torrent_options(name, raw_list)
    return {
        "name": name,
        "url": movie.get("url"),
        "magnet": magnet,
        "poster": posters,
        "size": picked.get("size"),
        "seeders": str(picked.get("seeds", "")),
        "leechers": str(picked.get("peers", "")),
        "category": "movies",
        "imdb_code": movie.get("imdb_code"),
        "rating": str(movie.get("rating", "")),
        "description": movie.get("description_full") or movie.get("summary") or "",
        "torrents": torrents_ui,
    }


def movies_to_catalog_rows(movies: list[Any], *, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for m in movies:
        if not isinstance(m, dict):
            continue
        row = movie_to_catalog_row(m)
        if row:
            rows.append(row)
        if len(rows) >= limit:
            break
    return rows


def wrap_list_response(
    api_payload: dict[str, Any],
    *,
    limit: int,
    elapsed: float,
) -> dict[str, Any]:
    data = api_payload.get("data")
    if not isinstance(data, dict):
        return {"data": [], "time": elapsed, "total": 0}
    movies = data.get("movies") or []
    if not isinstance(movies, list):
        movies = []
    rows = movies_to_catalog_rows(movies, limit=limit)
    movie_count = int(data.get("movie_count") or 0)
    page_number = int(data.get("page_number") or 1)
    lim = int(data.get("limit") or limit)
    total_pages = max(1, (movie_count + lim - 1) // lim) if lim else 1
    out = {
        "data": rows,
        "time": elapsed,
        "total": len(rows),
        "current_page": page_number,
        "total_pages": total_pages,
    }
    rewrite_browse_result_posters(out, YTS)
    return out


async def fetch_list_movies_json(
    session: aiohttp.ClientSession,
    *,
    page: int = 1,
    limit: int = 20,
    query_term: str | None = None,
    sort_by: str | None = None,
    order_by: str = "desc",
    genre: str | None = None,
    minimum_rating: int | None = None,
    quality: str | None = None,
) -> dict[str, Any] | None:
    """GET list_movies.json; return parsed JSON dict or None on failure."""
    base = YTS_API_BASE.rstrip("/")
    params: dict[str, Any] = {
        "page": max(1, page),
        "limit": max(1, min(50, limit)),
    }
    if query_term:
        params["query_term"] = query_term
    if sort_by:
        params["sort_by"] = sort_by
    if order_by:
        params["order_by"] = order_by
    if genre:
        params["genre"] = genre
    if minimum_rating is not None:
        params["minimum_rating"] = minimum_rating
    if quality:
        params["quality"] = quality
    url = f"{base}/api/v2/list_movies.json?{urlencode(params)}"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as res:
            text = await res.text()
            if res.status != 200:
                log.debug("yts api list_movies http %s", res.status)
                return None
            body = json.loads(text)
    except (aiohttp.ClientError, json.JSONDecodeError, UnicodeDecodeError) as e:
        log.debug("yts api list_movies error: %s", e)
        return None
    if not isinstance(body, dict):
        return None
    if body.get("status") != "ok":
        log.debug("yts api list_movies status=%s", body.get("status"))
        return None
    return body


async def fetch_movie_details_json(
    session: aiohttp.ClientSession,
    movie_id: int,
    *,
    with_images: bool = True,
    with_cast: bool = False,
) -> dict[str, Any] | None:
    base = YTS_API_BASE.rstrip("/")
    params: dict[str, Any] = {"movie_id": movie_id}
    if with_images:
        params["with_images"] = "true"
    if with_cast:
        params["with_cast"] = "true"
    url = f"{base}/api/v2/movie_details.json?{urlencode(params)}"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as res:
            text = await res.text()
            if res.status != 200:
                return None
            body = json.loads(text)
    except (aiohttp.ClientError, json.JSONDecodeError, UnicodeDecodeError) as e:
        log.debug("yts api movie_details error: %s", e)
        return None
    if not isinstance(body, dict) or body.get("status") != "ok":
        return None
    return body


def movie_details_to_catalog_row(body: dict[str, Any]) -> dict[str, Any] | None:
    data = body.get("data")
    if not isinstance(data, dict):
        return None
    movie = data.get("movie")
    if not isinstance(movie, dict):
        return None
    return movie_to_catalog_row(movie)
