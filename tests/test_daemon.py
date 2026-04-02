from fastapi.testclient import TestClient

from pytorrentd.app import create_app


def test_health():
    app = create_app()
    with TestClient(app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


def test_root_returns_help_html_when_no_dist(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    app = create_app()
    with TestClient(app) as client:
        r = client.get("/")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert b"PyTorrent daemon" in r.content
