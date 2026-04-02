from collections import OrderedDict

import pytest

from pytorrent.bencoding import BencodeError, Encoder
from pytorrent.magnet import parse_magnet
from pytorrent.torrent import TorrentMeta


def test_parse_magnet_hex():
    m = parse_magnet(
        "magnet:?xt=urn:btih:aabbccddeeff00112233445566778899aabbccdd"
        "&dn=Hello&tr=udp%3A%2F%2Ftracker.example%3A6969%2Fannounce"
    )
    assert m.info_hash.hex() == "aabbccddeeff00112233445566778899aabbccdd"
    assert m.display_name == "Hello"
    assert m.trackers == ["udp://tracker.example:6969/announce"]


def test_from_resolved_magnet_roundtrip():
    info = OrderedDict()
    info[b"piece length"] = 262144
    info[b"name"] = b"demo.bin"
    info[b"length"] = 1
    info[b"pieces"] = b"x" * 20
    raw_info = Encoder(info).encode()
    meta = TorrentMeta.from_resolved_magnet(
        raw_info,
        ["udp://tracker.opentrackr.org:1337/announce", "https://example.com/a"],
    )
    assert meta.name == "demo.bin"
    assert meta.total_length == 1
    assert meta.num_pieces == 1
    assert meta.iter_announce_urls()


def test_from_resolved_magnet_rejects_invalid_pieces():
    info = OrderedDict()
    info[b"piece length"] = 262144
    info[b"name"] = b"t"
    info[b"length"] = 1
    info[b"pieces"] = b"x" * 19
    raw = Encoder(info).encode()
    with pytest.raises(BencodeError):
        TorrentMeta.from_resolved_magnet(raw, [])
