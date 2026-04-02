"""Rewrite remote poster URLs to same-origin /catalog/image proxy paths."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote, urljoin, urlparse


def normalize_poster_url(url: str, base: str) -> str:
    u = (url or "").strip()
    if not u:
        return u
    if u.startswith("//"):
        return "https:" + u
    if u.startswith("/"):
        return urljoin(base.rstrip("/") + "/", u.lstrip("/"))
    return u


def poster_proxy_path(absolute_url: str) -> str:
    if absolute_url.startswith("/catalog/image"):
        return absolute_url
    if not absolute_url.startswith(("http://", "https://")):
        return absolute_url
    return "/catalog/image?url=" + quote(absolute_url, safe="")


def rewrite_catalog_row_posters(row: dict[str, Any], html_base: str) -> None:
    """In-place: poster string or list -> proxied paths for browser same-origin load."""
    p = row.get("poster")
    if p is None:
        return
    if isinstance(p, str):
        urls = [p] if p else []
    elif isinstance(p, list):
        urls = [x for x in p if isinstance(x, str) and x]
    else:
        return
    out: list[str] = []
    for u in urls:
        if u.startswith("/catalog/image"):
            out.append(u)
            continue
        absu = normalize_poster_url(u, html_base)
        if absu.startswith(("http://", "https://")):
            out.append(poster_proxy_path(absu))
        elif absu:
            out.append(absu)
    if not out:
        return
    if isinstance(p, str) and len(out) == 1:
        row["poster"] = out[0]
    else:
        row["poster"] = out


def rewrite_browse_result_posters(result: dict[str, Any] | None, html_base: str) -> dict[str, Any] | None:
    if not result or not isinstance(result, dict):
        return result
    data = result.get("data")
    if not isinstance(data, list):
        return result
    for row in data:
        if isinstance(row, dict):
            rewrite_catalog_row_posters(row, html_base)
    return result
