"""BitTorrent peer messages (big-endian length prefix)."""

from __future__ import annotations

import struct
from dataclasses import dataclass
from typing import ClassVar


@dataclass
class Handshake:
    info_hash: bytes
    peer_id: bytes
    pstr: bytes = b"BitTorrent protocol"

    def encode(self, *, extended: bool = False) -> bytes:
        reserved = bytes([0, 0, 0, 0, 0, 0x10, 0, 1]) if extended else b"\x00" * 8
        return (
            bytes([len(self.pstr)])
            + self.pstr
            + reserved
            + self.info_hash
            + self.peer_id
        )

    @classmethod
    def decode(cls, data: bytes) -> Handshake:
        if len(data) < 68:
            raise ValueError("handshake too short")
        pstrlen = data[0]
        if len(data) < 49 + pstrlen:
            raise ValueError("handshake length mismatch")
        pstr = data[1 : 1 + pstrlen]
        off = 1 + pstrlen + 8
        info_hash = data[off : off + 20]
        peer_id = data[off + 20 : off + 40]
        return cls(info_hash=info_hash, peer_id=peer_id, pstr=pstr)


@dataclass
class KeepAlive:
    def encode(self) -> bytes:
        return b"\x00\x00\x00\x00"


@dataclass
class Choke:
    id: ClassVar[int] = 0

    def encode(self) -> bytes:
        return struct.pack(">IB", 1, self.id)


@dataclass
class Unchoke:
    id: ClassVar[int] = 1

    def encode(self) -> bytes:
        return struct.pack(">IB", 1, self.id)


@dataclass
class Interested:
    id: ClassVar[int] = 2

    def encode(self) -> bytes:
        return struct.pack(">IB", 1, self.id)


@dataclass
class NotInterested:
    id: ClassVar[int] = 3

    def encode(self) -> bytes:
        return struct.pack(">IB", 1, self.id)


@dataclass
class Have:
    id: ClassVar[int] = 4
    index: int

    def encode(self) -> bytes:
        return struct.pack(">IBI", 5, self.id, self.index)

    @classmethod
    def decode(cls, payload: bytes) -> Have:
        (idx,) = struct.unpack(">I", payload)
        return cls(index=idx)


@dataclass
class BitField:
    id: ClassVar[int] = 5
    field: bytes

    def encode(self) -> bytes:
        return struct.pack(">IB", 1 + len(self.field), self.id) + self.field

    @classmethod
    def decode(cls, payload: bytes) -> BitField:
        return cls(field=payload)


@dataclass
class Request:
    id: ClassVar[int] = 6
    index: int
    begin: int
    length: int

    def encode(self) -> bytes:
        return struct.pack(">IBIII", 13, self.id, self.index, self.begin, self.length)


@dataclass
class Piece:
    id: ClassVar[int] = 7
    index: int
    begin: int
    block: bytes

    def encode(self) -> bytes:
        header = struct.pack(">IBII", 9 + len(self.block), self.id, self.index, self.begin)
        return header + self.block

    @classmethod
    def decode(cls, payload: bytes) -> Piece:
        idx, begin = struct.unpack(">II", payload[:8])
        return cls(index=idx, begin=begin, block=payload[8:])


@dataclass
class Cancel:
    id: ClassVar[int] = 8
    index: int
    begin: int
    length: int

    def encode(self) -> bytes:
        return struct.pack(">IBIII", 13, self.id, self.index, self.begin, self.length)


def parse_message(msg_id: int, payload: bytes):
    if msg_id == 0:
        return Choke()
    if msg_id == 1:
        return Unchoke()
    if msg_id == 2:
        return Interested()
    if msg_id == 3:
        return NotInterested()
    if msg_id == 4:
        return Have.decode(payload)
    if msg_id == 5:
        return BitField.decode(payload)
    if msg_id == 6:
        idx, begin, ln = struct.unpack(">III", payload)
        return Request(index=idx, begin=begin, length=ln)
    if msg_id == 7:
        return Piece.decode(payload)
    if msg_id == 8:
        idx, begin, ln = struct.unpack(">III", payload)
        return Cancel(index=idx, begin=begin, length=ln)
    return None
