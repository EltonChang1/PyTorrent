"""HTTP(S) tracker announce (compact peer list)."""

from __future__ import annotations

import logging
import random
import struct
from dataclasses import dataclass
import aiohttp

from pytorrent.bencoding import Decoder

log = logging.getLogger(__name__)


def make_peer_id(prefix: str = "-PY0001-") -> bytes:
    suffix = "".join(str(random.randint(0, 9)) for _ in range(12))
    return (prefix + suffix).encode("ascii")[:20].ljust(20, b"0")[:20]


@dataclass
class TrackerPeer:
    host: str
    port: int


@dataclass
class TrackerResponse:
    interval: int
    peers: list[TrackerPeer]
    failure_reason: str | None = None


def _parse_compact_peers(blob: bytes) -> list[TrackerPeer]:
    if len(blob) % 6 != 0:
        raise ValueError("compact peers length not multiple of 6")
    out: list[TrackerPeer] = []
    for i in range(0, len(blob), 6):
        ip = ".".join(str(b) for b in blob[i : i + 4])
        (port,) = struct.unpack(">H", blob[i + 4 : i + 6])
        out.append(TrackerPeer(host=ip, port=port))
    return out


def _pct(b: bytes) -> str:
    return "".join(f"%{c:02x}" for c in b)


def _build_announce_url(
    announce_url: str,
    info_hash: bytes,
    peer_id: bytes,
    port: int,
    uploaded: int,
    downloaded: int,
    left: int,
    event: str | None,
) -> str:
    parts = [
        f"info_hash={_pct(info_hash)}",
        f"peer_id={_pct(peer_id)}",
        f"port={port}",
        f"uploaded={uploaded}",
        f"downloaded={downloaded}",
        f"left={left}",
        "compact=1",
    ]
    if event:
        parts.append(f"event={event}")
    q = "&".join(parts)
    sep = "&" if "?" in announce_url else "?"
    return announce_url + sep + q


async def announce(
    session: aiohttp.ClientSession,
    announce_url: str,
    info_hash: bytes,
    peer_id: bytes,
    port: int,
    uploaded: int,
    downloaded: int,
    left: int,
    *,
    event: str | None = None,
) -> TrackerResponse | None:
    url = _build_announce_url(
        announce_url, info_hash, peer_id, port, uploaded, downloaded, left, event
    )

    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            body = await resp.read()
    except Exception as e:
        log.warning("tracker request failed: %s", e)
        return None

    if resp.status != 200:
        log.warning("tracker HTTP %s", resp.status)
        return None

    try:
        dec = Decoder(body).decode()
    except Exception as e:
        log.warning("tracker bdecode failed: %s", e)
        return None

    if not isinstance(dec, dict):
        return None

    fr = dec.get(b"failure reason")
    if fr is not None:
        reason = fr.decode("utf-8", errors="replace") if isinstance(fr, bytes) else str(fr)
        return TrackerResponse(interval=1800, peers=[], failure_reason=reason)

    interval = int(dec.get(b"interval", 1800))
    peers_raw = dec.get(b"peers", b"")
    if isinstance(peers_raw, list):
        peers: list[TrackerPeer] = []
        for p in peers_raw:
            if not isinstance(p, dict):
                continue
            ip = p.get(b"ip")
            pr = p.get(b"port")
            if isinstance(ip, bytes) and isinstance(pr, int):
                peers.append(TrackerPeer(host=ip.decode("utf-8", errors="replace"), port=pr))
    else:
        peers = _parse_compact_peers(peers_raw) if isinstance(peers_raw, bytes) else []

    return TrackerResponse(interval=interval, peers=peers)
