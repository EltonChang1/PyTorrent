"""Data directory resolution (Torflix / legacy PyTorrent env names)."""

from __future__ import annotations

import os


def resolve_data_dir() -> str:
    """TORFLIX_DATA_DIR, else PYTORRENT_DATA_DIR, else ~/.torflix or existing ~/.pytorrent."""
    v = os.environ.get("TORFLIX_DATA_DIR", "").strip() or os.environ.get("PYTORRENT_DATA_DIR", "").strip()
    if v:
        return os.path.expanduser(v)
    new_d = os.path.expanduser("~/.torflix")
    old_d = os.path.expanduser("~/.pytorrent")
    if os.path.isdir(new_d):
        return new_d
    if os.path.isdir(old_d):
        return old_d
    return new_d
