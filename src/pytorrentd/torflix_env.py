"""Environment variables: TORFLIX_* preferred, PYTORRENT_* accepted for compatibility."""

from __future__ import annotations

import os


def tenv(key: str, default: str | None = None) -> str | None:
    """Read TORFLIX_{key}, then PYTORRENT_{key}, then default."""
    v = os.environ.get(f"TORFLIX_{key}")
    if v is not None and str(v).strip() != "":
        return v
    v = os.environ.get(f"PYTORRENT_{key}")
    if v is not None and str(v).strip() != "":
        return v
    return default


def tenv_strip(key: str, default: str = "") -> str:
    raw = tenv(key)
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip()
