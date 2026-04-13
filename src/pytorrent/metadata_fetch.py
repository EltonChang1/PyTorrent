"""Fetch info-dict bytes from a peer via ut_metadata (BEP 10 extension)."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import struct
from collections import OrderedDict

import aiohttp

from pytorrent.bencoding import BencodeError, Decoder, Encoder, bdecode_first
from pytorrent.protocol.messages import Handshake
from pytorrent.tracker import TrackerPeer, announce

log = logging.getLogger(__name__)

MSG_EXTENDED = 20
EXT_HANDSHAKE = 0
PIECE_LEN = 16 * 1024
MAX_FRAME = 2 * 1024 * 1024


def _build_msg(msg_id: int, payload: bytes) -> bytes:
    body = bytes([msg_id]) + payload
    return struct.pack(">I", len(body)) + body


def _ltep_handshake_out() -> bytes:
    d: OrderedDict[bytes, object] = OrderedDict()
    md: OrderedDict[bytes, int] = OrderedDict()
    md[b"ut_metadata"] = 3
    d[b"m"] = md
    d[b"v"] = b"Torflix 0.1"
    pl = Encoder(d).encode()
    return _build_msg(MSG_EXTENDED, bytes([EXT_HANDSHAKE]) + pl)


def _ut_request(ut_id: int, piece: int) -> bytes:
    d = OrderedDict([(b"msg_type", 0), (b"piece", piece)])
    pl = Encoder(d).encode()
    return _build_msg(MSG_EXTENDED, bytes([ut_id]) + pl)


async def fetch_info_bytes_from_peer(
    peer: TrackerPeer,
    info_hash: bytes,
    my_peer_id: bytes,
    *,
    timeout: float = 45.0,
) -> bytes | None:
    """
    Connect to peer, perform extension handshake, download metadata via ut_metadata.
    Returns raw bencoded *info* dictionary bytes (SHA1 must match info_hash).
    """
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(peer.host, peer.port),
            timeout=10,
        )
    except Exception as e:
        log.debug("metadata connect %s:%s %s", peer.host, peer.port, e)
        return None

    buf = bytearray()
    try:
        hs = Handshake(info_hash=info_hash, peer_id=my_peer_id)
        writer.write(hs.encode(extended=True))
        await writer.drain()

        while len(buf) < 68:
            chunk = await asyncio.wait_for(reader.read(68 - len(buf)), timeout=10)
            if not chunk:
                return None
            buf.extend(chunk)

        rh = Handshake.decode(bytes(buf[:68]))
        del buf[:68]
        if rh.info_hash != info_hash:
            return None

        writer.write(_build_msg(2, b""))
        await writer.drain()
        writer.write(_ltep_handshake_out())
        await writer.drain()

        ut_id: int | None = None
        metadata_size: int | None = None
        pieces: dict[int, bytes] = {}
        deadline = asyncio.get_running_loop().time() + timeout

        def time_left() -> float:
            return max(0.1, deadline - asyncio.get_running_loop().time())

        async def read_more(need: int) -> bool:
            while len(buf) < need:
                chunk = await asyncio.wait_for(reader.read(max(4096, need - len(buf))), timeout=min(15.0, time_left()))
                if not chunk:
                    return False
                buf.extend(chunk)
            return True

        requested: set[int] = set()

        while asyncio.get_running_loop().time() < deadline:
            if not await read_more(4):
                break
            (length,) = struct.unpack(">I", buf[:4])
            if length == 0:
                del buf[:4]
                continue
            if length > MAX_FRAME:
                log.debug("metadata frame too large")
                return None
            need = 4 + length
            if not await read_more(need):
                return None
            frame = bytes(buf[4:need])
            del buf[:need]
            if not frame:
                continue
            msg_id = frame[0]
            payload = frame[1:]

            if msg_id == MSG_EXTENDED:
                if not payload:
                    continue
                ext_id = payload[0]
                ext_pl = payload[1:]
                if ext_id == EXT_HANDSHAKE:
                    try:
                        d, _ = bdecode_first(ext_pl)
                    except BencodeError:
                        continue
                    if not isinstance(d, dict):
                        continue
                    m = d.get(b"m")
                    if isinstance(m, dict):
                        uid = m.get(b"ut_metadata")
                        if isinstance(uid, int):
                            ut_id = uid
                    ms = d.get(b"metadata_size")
                    if isinstance(ms, int):
                        metadata_size = ms
                    if ut_id is not None and metadata_size is not None:
                        for i in range((metadata_size + PIECE_LEN - 1) // PIECE_LEN):
                            if i not in requested:
                                requested.add(i)
                                writer.write(_ut_request(ut_id, i))
                        await writer.drain()
                elif ut_id is not None and ext_id == ut_id and ext_pl:
                    try:
                        meta, off = bdecode_first(ext_pl)
                    except BencodeError:
                        continue
                    if not isinstance(meta, dict):
                        continue
                    mt = meta.get(b"msg_type")
                    if mt == 1:
                        piece_idx = meta.get(b"piece")
                        if not isinstance(piece_idx, int):
                            continue
                        data = ext_pl[off:]
                        pieces[piece_idx] = data
                        if metadata_size is not None:
                            n = (metadata_size + PIECE_LEN - 1) // PIECE_LEN
                            if len(pieces) >= n and all(i in pieces for i in range(n)):
                                blob = b"".join(pieces[i] for i in range(n))
                                if len(blob) >= metadata_size:
                                    blob = blob[:metadata_size]
                                if hashlib.sha1(blob).digest() != info_hash:
                                    return None
                                try:
                                    Decoder(blob).decode()
                                except BencodeError:
                                    return None
                                return blob
            elif msg_id == 1:
                pass

        return None
    except Exception as e:
        log.debug("metadata peer error: %s", e)
        return None
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


async def fetch_metadata_via_trackers(
    trackers: list[str],
    info_hash: bytes,
    my_peer_id: bytes,
    listen_port: int,
) -> bytes | None:
    """Gather peers from HTTP + UDP trackers, then try peers for ut_metadata."""
    from pytorrent.udp_tracker import udp_announce

    peers: list[TrackerPeer] = []

    async with aiohttp.ClientSession(trust_env=True) as sess:
        for tr in trackers:
            if tr.lower().startswith("udp://"):
                r = await udp_announce(
                    tr,
                    info_hash,
                    my_peer_id,
                    listen_port,
                    0,
                    0,
                    2**20,
                    event=2,
                )
                if r and r.peers:
                    peers.extend(r.peers)
            elif tr.lower().startswith("http://") or tr.lower().startswith("https://"):
                r = await announce(
                    sess,
                    tr,
                    info_hash,
                    my_peer_id,
                    listen_port,
                    0,
                    0,
                    2**20,
                    event="started",
                )
                if r and r.peers:
                    peers.extend(r.peers)

    seen: set[tuple[str, int]] = set()
    uniq: list[TrackerPeer] = []
    for p in peers:
        k = (p.host, p.port)
        if k not in seen:
            seen.add(k)
            uniq.append(p)

    for p in uniq[:40]:
        data = await fetch_info_bytes_from_peer(p, info_hash, my_peer_id)
        if data:
            if hashlib.sha1(data).digest() == info_hash:
                return data
    return None
