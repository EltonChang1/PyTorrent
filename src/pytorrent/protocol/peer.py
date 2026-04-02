"""Single-peer download loop (handshake + message stream)."""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable

from pytorrent.piece_picker import MAX_PIPELINE_PER_PEER
from pytorrent.piece_state import PieceState
from pytorrent.protocol.messages import (
    BitField,
    Choke,
    Handshake,
    Have,
    Interested,
    KeepAlive,
    Piece,
    Request,
    Unchoke,
)
from pytorrent.protocol.stream import PeerStreamIterator
from pytorrent.storage import DiskStorage
from pytorrent.tracker import TrackerPeer

log = logging.getLogger(__name__)

BLOCK_SIZE = 16 * 1024


def bitfield_to_haves(field: bytes, num_pieces: int) -> set[int]:
    out: set[int] = set()
    for i in range(num_pieces):
        byte = i // 8
        if byte >= len(field):
            break
        if field[byte] & (128 >> (i % 8)):
            out.add(i)
    return out


async def run_peer_download(
    peer: TrackerPeer,
    info_hash: bytes,
    my_peer_id: bytes,
    num_pieces: int,
    storage: DiskStorage,
    picker,
    piece_state: PieceState,
    stop_event: asyncio.Event,
    on_progress: Callable[[], Awaitable[None]] | None = None,
) -> None:
    """Connect to peer and download until stop_event or disconnect."""
    writer: asyncio.StreamWriter | None = None
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(peer.host, peer.port),
            timeout=10,
        )
    except Exception as e:
        log.debug("connect %s:%s failed: %s", peer.host, peer.port, e)
        return

    assert writer is not None
    buf = bytearray()
    remote_peer_id: bytes | None = None
    inflight: set[tuple[int, int, int]] = set()
    try:
        hs = Handshake(info_hash=info_hash, peer_id=my_peer_id)
        writer.write(hs.encode())
        await writer.drain()

        while len(buf) < 68:
            chunk = await reader.read(68 - len(buf))
            if not chunk:
                return
            buf.extend(chunk)

        remote_hs = Handshake.decode(bytes(buf[:68]))
        del buf[:68]
        if remote_hs.info_hash != info_hash:
            return
        remote_peer_id = remote_hs.peer_id

        stream = PeerStreamIterator(reader, buf)
        writer.write(Interested().encode())
        await writer.drain()

        choked = True
        peer_inflight_count = 0

        async def pump_requests() -> None:
            nonlocal peer_inflight_count
            rid = remote_peer_id
            assert rid is not None
            while (
                not choked
                and not stop_event.is_set()
                and peer_inflight_count < MAX_PIPELINE_PER_PEER
            ):
                req = picker.next_block(rid, peer_inflight_count, piece_state, BLOCK_SIZE)
                if req is None:
                    break
                pi, begin, ln = req
                if piece_state.is_block_done(pi, begin):
                    picker.release_block(rid, pi, begin, ln)
                    continue
                r = Request(index=pi, begin=begin, length=ln)
                writer.write(r.encode())
                inflight.add((pi, begin, ln))
                peer_inflight_count += 1
            await writer.drain()

        rid = remote_peer_id
        assert rid is not None
        async for msg in stream:
            if stop_event.is_set():
                break
            if isinstance(msg, (KeepAlive,)):
                continue
            if isinstance(msg, BitField):
                picker.peer_bitfield(rid, bitfield_to_haves(msg.field, num_pieces))
                await pump_requests()
            elif isinstance(msg, Have):
                if msg.index < num_pieces:
                    picker.peer_have(rid, msg.index)
                await pump_requests()
            elif isinstance(msg, Choke):
                choked = True
                for t in list(inflight):
                    picker.release_block(rid, t[0], t[1], t[2])
                inflight.clear()
                peer_inflight_count = 0
            elif isinstance(msg, Unchoke):
                choked = False
                await pump_requests()
            elif isinstance(msg, Piece):
                key = (msg.index, msg.begin, len(msg.block))
                if key not in inflight:
                    continue
                inflight.discard(key)
                peer_inflight_count = max(0, peer_inflight_count - 1)
                picker.release_block(rid, msg.index, msg.begin, len(msg.block))
                picker.block_done(msg.index, msg.begin, len(msg.block))

                offset = msg.index * piece_state.meta_piece_length + msg.begin
                await storage.write_at(offset, msg.block)
                piece_state.mark_block(msg.index, msg.begin, len(msg.block))

                if piece_state.is_piece_complete(msg.index):
                    ok = await storage.verify_piece(msg.index)
                    if ok:
                        picker.mark_complete(msg.index)
                    else:
                        piece_state.done_blocks.pop(msg.index, None)
                if on_progress:
                    await on_progress()
                await pump_requests()
    except Exception as e:
        log.debug("peer %s:%s error: %s", peer.host, peer.port, e)
    finally:
        if remote_peer_id is not None:
            picker.peer_disconnected(remote_peer_id)
            for t in list(inflight):
                picker.release_block(remote_peer_id, t[0], t[1], t[2])
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


async def run_peer_seed(
    peer: TrackerPeer,
    info_hash: bytes,
    my_peer_id: bytes,
    have: set[int],
    num_pieces: int,
    storage: DiskStorage,
    piece_state: PieceState,
    stop_event: asyncio.Event,
) -> None:
    """Seed to a single peer (simplified: respond to requests)."""
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(peer.host, peer.port),
            timeout=10,
        )
    except Exception:
        return

    buf = bytearray()
    try:
        hs = Handshake(info_hash=info_hash, peer_id=my_peer_id)
        writer.write(hs.encode())
        await writer.drain()

        while len(buf) < 68:
            chunk = await reader.read(68 - len(buf))
            if not chunk:
                return
            buf.extend(chunk)

        remote_hs = Handshake.decode(bytes(buf[:68]))
        del buf[:68]
        if remote_hs.info_hash != info_hash:
            return

        field = bytearray((num_pieces + 7) // 8)
        for i in have:
            if i < num_pieces:
                field[i // 8] |= 128 >> (i % 8)
        writer.write(BitField(field=bytes(field)).encode())
        await writer.drain()

        stream = PeerStreamIterator(reader, buf)
        async for msg in stream:
            if stop_event.is_set():
                break
            if isinstance(msg, Request):
                if msg.index not in have:
                    continue
                plen = storage.piece_length(msg.index)
                if msg.begin + msg.length > plen:
                    continue
                off = msg.index * piece_state.meta_piece_length + msg.begin
                data = await storage.read_at(off, msg.length)
                p = Piece(index=msg.index, begin=msg.begin, block=data)
                writer.write(p.encode())
                await writer.drain()
    except Exception:
        pass
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
