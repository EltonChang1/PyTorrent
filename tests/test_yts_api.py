"""YTS JSON API mapping tests (fixtures only, no network)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "yts_list_movies_sample.json"
_VENDOR = Path(__file__).resolve().parent.parent / "src" / "pytorrentd" / "vendor_torrent_api"


@pytest.fixture(scope="session", autouse=True)
def _vendor_on_path():
    root = str(_VENDOR)
    if root not in sys.path:
        sys.path.insert(0, root)


def test_wrap_list_response_maps_row_and_magnet():
    from torrents import yts_api

    raw = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    out = yts_api.wrap_list_response(raw, limit=20, elapsed=0.01)
    assert "data" in out
    assert len(out["data"]) == 1
    row = out["data"][0]
    assert row["name"] == "Test (2013)"
    assert row["imdb_code"] == "tt2407380"
    assert row["magnet"].startswith("magnet:?xt=urn:btih:")
    assert "a26030da37cf83b2fa21fd7e50174da12c405e5d" in row["magnet"].lower()
    assert isinstance(row["poster"], list)
    assert len(row["poster"]) == 3
    assert row["poster"][0].startswith("/catalog/image?url=")
    assert "large-cover.jpg" in row["poster"][0]
    assert row["size"] == "1.43 GB"
    assert row["seeders"] == "11"


def test_pick_torrent_prefers_1080p():
    from torrents import yts_api

    raw = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    movie = raw["data"]["movies"][0]
    row = yts_api.movie_to_catalog_row(movie)
    assert row is not None
    assert row["size"] == "1.43 GB"
    assert "a26030da37cf83b2fa21fd7e50174da12c405e5d" in row["magnet"].lower()


def test_wrap_list_response_includes_torrent_options_with_magnets():
    from torrents import yts_api

    raw = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    out = yts_api.wrap_list_response(raw, limit=20, elapsed=0.01)
    row = out["data"][0]
    assert isinstance(row.get("torrents"), list)
    assert len(row["torrents"]) == 2
    for t in row["torrents"]:
        assert t["magnet"].startswith("magnet:?xt=urn:btih:")
        assert t.get("quality")


def test_pick_preferred_tiebreaks_by_seeds_same_quality():
    from torrents import yts_api

    ts = [
        {"quality": "1080p", "hash": "A" * 40, "seeds": 5, "size_bytes": 999},
        {"quality": "1080p", "hash": "B" * 40, "seeds": 99, "size_bytes": 1},
    ]
    p = yts_api.pick_preferred_yts_torrent(ts)
    assert p is not None
    assert p["hash"] == "B" * 40


def test_normalized_yts_torrent_options_from_hashes():
    from torrents import yts_api

    name = "Test (2013)"
    ts = [
        {
            "quality": "720p",
            "type": "web",
            "size": "786.3 MB",
            "hash": "221A3DEC53BA607BFC89FFAE313563ECFA4EF1B2",
            "seeds": 10,
            "peers": 3,
        }
    ]
    out = yts_api.normalized_yts_torrent_options(name, ts)
    assert len(out) == 1
    assert out[0]["magnet"].startswith("magnet:?xt=urn:btih:")
    assert "221a3dec53ba607bfc89ffae313563ecfa4ef1b2" in out[0]["magnet"].lower()
    assert out[0]["quality"] == "720p"
