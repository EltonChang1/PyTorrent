from fastapi.testclient import TestClient

from pytorrentd.app import create_app
from pytorrentd.torrent_api_client import torrent_api_configured


def test_health(monkeypatch):
    monkeypatch.setenv("PYTORRENT_BT_PORT", "58881")
    app = create_app()
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        j = r.json()
        assert j["status"] == "ok"
        assert "bt_listen" in j
        assert "ok" in j["bt_listen"]
        assert "search" in j
        assert "configured" in j["search"]
        if torrent_api_configured():
            assert j["search"]["configured"] is True


def test_root_returns_help_html_when_no_dist(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    app = create_app()
    with TestClient(app) as client:
        r = client.get("/")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert b"PyTorrent daemon" in r.content


def test_browse_sites_embedded_when_no_external_base(monkeypatch):
    """Vendored Torrent-Api-py serves /api/v1/sites in-process when PYTORRENT_SEARCH_API_BASE is unset."""
    monkeypatch.delenv("PYTORRENT_SEARCH_API_BASE", raising=False)
    monkeypatch.setenv("PYTORRENT_BT_PORT", "58882")
    if not torrent_api_configured():
        return
    app = create_app()
    with TestClient(app) as client:
        r = client.get("/browse/sites")
        assert r.status_code == 200
        body = r.json()
        assert "supported_sites" in body


def test_external_search_base_still_used(monkeypatch):
    """When PYTORRENT_SEARCH_API_BASE is set, browse uses HTTP (may fail if URL is invalid)."""
    monkeypatch.setenv("PYTORRENT_SEARCH_API_BASE", "http://127.0.0.1:59998")
    monkeypatch.setenv("PYTORRENT_BT_PORT", "58885")
    app = create_app()
    with TestClient(app) as client:
        r = client.get("/browse/sites")
        assert r.status_code in (502, 503, 504)
