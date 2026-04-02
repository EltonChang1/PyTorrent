from fastapi.testclient import TestClient

from pytorrentd.app import create_app


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


def test_root_returns_help_html_when_no_dist(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    app = create_app()
    with TestClient(app) as client:
        r = client.get("/")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert b"PyTorrent daemon" in r.content
