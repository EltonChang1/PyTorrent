"""Handle inbound TCP connections (remote peer initiated handshake first)."""

from __future__ import annotations

import asyncio
import logging
from typing import Callable, Awaitable

from pytorrent.protocol.messages import (
    BitField,
    Handshake,
    Interested,
    NotInterested,
    Piece,
    Request,
    Unchoke,
)
from pytorrent.protocol.stream import PeerStreamIterator
from pytorrent.session import TorrentSession

log = logging.getLogger(__name__)

ResolveSession = Callable[[bytes], TorrentSession | None]


async def run_incoming_peer(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    resolve_session: ResolveSession,
    *,
    on_uploaded: Callable[[TorrentSession, int], Awaitable[None]] | None = None,
) -> None:
    """
    Remote peer connected to us: they send handshake first, then we reply and seed.
    We unchoke after they send Interested; we serve Request with Piece from disk.
    """
    addr = writer.get_extra_info("peername")
    buf = bytearray()
    try:
        while len(buf) < 68:
            chunk = await reader.read(68 - len(buf))
            if not chunk:
                return
            buf.extend(chunk)

        remote_hs = Handshake.decode(bytes(buf[:68]))
        del buf[:68]
        ih = remote_hs.info_hash

        session = resolve_session(ih)
        if session is None:
            log.debug("incoming unknown info_hash from %s", addr)
            return

        if session.stop_event.is_set():
            return

        have = session.haves()
        if not have:
            log.debug("incoming peer but we have no pieces yet %s", addr)
            return

        reply = Handshake(info_hash=ih, peer_id=session.peer_id)
        writer.write(reply.encode())
        await writer.drain()

        num = session.meta.num_pieces
        field = bytearray((num + 7) // 8)
        for i in have:
            if i < num:
                field[i // 8] |= 128 >> (i % 8)
        writer.write(BitField(field=bytes(field)).encode())
        await writer.drain()

        stream = PeerStreamIterator(reader, buf)
        peer_choked_by_us = True

        async for msg in stream:
            if session.stop_event.is_set():
                break
            if isinstance(msg, Interested):
                if peer_choked_by_us:
                    writer.write(Unchoke().encode())
                    await writer.drain()
                    peer_choked_by_us = False
            elif isinstance(msg, NotInterested):
                pass
            elif isinstance(msg, Request):
                if peer_choked_by_us:
                    continue
                if msg.index not in have:
                    continue
                plen = session.storage.piece_length(msg.index)
                if msg.begin + msg.length > plen or msg.length <= 0:
                    continue
                off = msg.index * session.meta.piece_length + msg.begin
                try:
                    data = await session.storage.read_at(off, msg.length)
                except Exception as e:
                    log.debug("read_at failed: %s", e)
                    continue
                if len(data) != msg.length:
                    continue
                writer.write(Piece(index=msg.index, begin=msg.begin, block=data).encode())
                await writer.drain()
                await session.record_upload(len(data))
                if on_uploaded:
                    await on_uploaded(session, len(data))
            else:
                pass
    except Exception as e:
        log.debug("incoming peer %s error: %s", addr, e)
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
