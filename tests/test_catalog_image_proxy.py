"""Catalog image proxy allowlist (no network)."""

from __future__ import annotations

from pytorrentd.catalog_image_proxy import catalog_image_allowed_url


def test_allowed_yts_hosts():
    assert catalog_image_allowed_url("https://yts.mx/assets/foo.jpg")
    assert catalog_image_allowed_url("https://img.yts.mx/x.jpg")
    assert catalog_image_allowed_url("https://www3.yts-official.to/poster.jpg")


def test_rejects_open_proxy_targets():
    assert not catalog_image_allowed_url("https://evil.example.com/steal")
    assert not catalog_image_allowed_url("file:///etc/passwd")
    assert not catalog_image_allowed_url("")
