"""UDP tracker announce (BEP 15) — compact IPv4 peer list."""

from __future__ import annotations

import asyncio
import logging
import random
import socket
import struct
from urllib.parse import urlparse

from pytorrent.tracker import TrackerPeer, TrackerResponse

log = logging.getLogger(__name__)

PROTOCOL_ID = 0x41727101980


class _OneShotUDP(asyncio.DatagramProtocol):
    def __init__(self, fut: asyncio.Future[bytes]) -> None:
        self._fut = fut
        self._transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self._transport = transport  # type: ignore[assignment]

    def datagram_received(self, data: bytes, addr: tuple) -> None:
        if not self._fut.done():
            self._fut.set_result(data)

    def error_received(self, exc: Exception) -> None:
        if not self._fut.done():
            self._fut.set_exception(exc)


async def _udp_send_recv(addr: tuple[str, int], packet: bytes, timeout: float = 8.0) -> bytes:
    loop = asyncio.get_running_loop()
    fut: asyncio.Future[bytes] = loop.create_future()
    transport, _ = await loop.create_datagram_endpoint(
        lambda: _OneShotUDP(fut),
        remote_addr=addr,
    )
    try:
        transport.sendto(packet)
        return await asyncio.wait_for(fut, timeout=timeout)
    finally:
        transport.close()


def _parse_udp_tracker(url: str) -> tuple[str, int] | None:
    try:
        p = urlparse(url)
        if p.scheme.lower() != "udp":
            return None
        host = p.hostname
        if not host:
            return None
        port = p.port if p.port is not None else 6969
        return (host, port)
    except Exception:
        return None


async def _resolve_host(host: str, port: int) -> tuple[str, int]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port, type=socket.SOCK_DGRAM)
    # prefer first IPv4
    for fam, _, _, _, sockaddr in infos:
        if fam == socket.AF_INET:
            return (sockaddr[0], int(sockaddr[1]))
    if infos:
        sa = infos[0][4]
        return (sa[0], int(sa[1]))
    raise OSError(f"no address for {host}")


def _parse_compact_peers(blob: bytes) -> list[TrackerPeer]:
    if len(blob) % 6 != 0:
        return []
    out: list[TrackerPeer] = []
    for i in range(0, len(blob), 6):
        ip = ".".join(str(b) for b in blob[i : i + 4])
        (prt,) = struct.unpack(">H", blob[i + 4 : i + 6])
        out.append(TrackerPeer(host=ip, port=prt))
    return out


async def udp_announce(
    tracker_url: str,
    info_hash: bytes,
    peer_id: bytes,
    port: int,
    uploaded: int,
    downloaded: int,
    left: int,
    *,
    event: int = 0,
) -> TrackerResponse | None:
    """
    event: 0 none, 1 completed, 2 started, 3 stopped (BEP 15).
    """
    parsed = _parse_udp_tracker(tracker_url)
    if not parsed:
        return None
    host, prt = parsed
    try:
        addr = await _resolve_host(host, prt)
    except OSError as e:
        log.debug("udp resolve %s: %s", tracker_url, e)
        return None

    trans = random.randint(1, 0xFFFFFFFF)
    conn_req = struct.pack(">QII", PROTOCOL_ID, 0, trans)
    try:
        conn_resp = await _udp_send_recv(addr, conn_req, timeout=6.0)
    except Exception as e:
        log.debug("udp connect %s: %s", tracker_url, e)
        return None
    if len(conn_resp) < 16:
        return None
    action, tid = struct.unpack(">II", conn_resp[0:8])
    if action != 0 or tid != trans:
        return None
    (connection_id,) = struct.unpack(">Q", conn_resp[8:16])

    trans2 = random.randint(1, 0xFFFFFFFF)
    key = random.randint(0, 0xFFFFFFFF)
    num_want = -1
    pkt = (
        struct.pack(">QII", connection_id, 1, trans2)
        + info_hash
        + peer_id
        + struct.pack(">QQQI", downloaded, left, uploaded, event)
        + struct.pack(">IIiH", 0, key, num_want, port)
    )
    try:
        ann_resp = await _udp_send_recv(addr, pkt, timeout=8.0)
    except Exception as e:
        log.debug("udp announce %s: %s", tracker_url, e)
        return None
    if len(ann_resp) < 20:
        return None
    a2, t2 = struct.unpack(">II", ann_resp[0:8])
    if a2 != 1 or t2 != trans2:
        return None
    interval = struct.unpack(">I", ann_resp[8:12])[0]
    peers_blob = ann_resp[20:]
    peers = _parse_compact_peers(peers_blob)
    return TrackerResponse(interval=int(interval), peers=peers, failure_reason=None)
