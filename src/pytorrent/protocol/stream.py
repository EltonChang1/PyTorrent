"""Async iterator over framed peer messages after handshake."""

from __future__ import annotations

import struct
from typing import TYPE_CHECKING

from pytorrent.protocol.messages import parse_message

if TYPE_CHECKING:
    from asyncio import StreamReader


class PeerStreamIterator:
    def __init__(self, reader: StreamReader, buffer: bytearray | None = None):
        self._reader = reader
        self._buf = buffer if buffer is not None else bytearray()

    def __aiter__(self):
        return self

    async def __anext__(self):
        while True:
            if len(self._buf) >= 4:
                (length,) = struct.unpack(">I", self._buf[:4])
                if length == 0:
                    del self._buf[:4]
                    continue
                if len(self._buf) >= 4 + length:
                    del self._buf[:4]
                    msg_id = self._buf[0]
                    payload = bytes(self._buf[1:length])
                    del self._buf[: length]
                    parsed = parse_message(msg_id, payload)
                    if parsed is not None:
                        return parsed
                    continue
            chunk = await self._reader.read(4096)
            if not chunk:
                raise StopAsyncIteration
            self._buf.extend(chunk)
