"""Bencode encode/decode (BitTorrent meta-info). Keys and many strings are bytes."""

from __future__ import annotations

from collections import OrderedDict
from typing import Union

Bencodable = Union[int, bytes, list, OrderedDict]


class BencodeError(ValueError):
    pass


class Decoder:
    def __init__(self, data: bytes):
        self._data = data
        self._i = 0

    def decode(self) -> Bencodable:
        v = self._decode_next()
        if self._i != len(self._data):
            raise BencodeError("trailing data after bencode value")
        return v

    def _decode_next(self) -> Bencodable:
        if self._i >= len(self._data):
            raise BencodeError("unexpected end of data")
        c = self._data[self._i : self._i + 1]
        if c == b"d":
            return self._decode_dict()
        if c == b"l":
            return self._decode_list()
        if c == b"i":
            return self._decode_int()
        if c in b"0123456789":
            return self._decode_str()
        raise BencodeError(f"invalid prefix {c!r}")

    def _decode_int(self) -> int:
        if self._data[self._i : self._i + 1] != b"i":
            raise BencodeError("expected i")
        self._i += 1
        end = self._data.index(b"e", self._i)
        raw = self._data[self._i : end].decode("ascii")
        self._i = end + 1
        if raw == "-0":
            raise BencodeError("negative zero")
        if raw.startswith("-0") and len(raw) > 2:
            raise BencodeError("negative with leading zeros")
        if len(raw) > 1 and raw[0] != "-" and raw.startswith("0"):
            raise BencodeError("integer with leading zeros")
        return int(raw)

    def _decode_str(self) -> bytes:
        colon = self._data.index(b":", self._i)
        n = int(self._data[self._i : colon].decode("ascii"))
        if n < 0:
            raise BencodeError("negative string length")
        self._i = colon + 1
        end = self._i + n
        if end > len(self._data):
            raise BencodeError("string length past end")
        s = self._data[self._i : end]
        self._i = end
        return s

    def _decode_list(self) -> list:
        if self._data[self._i : self._i + 1] != b"l":
            raise BencodeError("expected l")
        self._i += 1
        out: list = []
        while self._data[self._i : self._i + 1] != b"e":
            out.append(self._decode_next())
        self._i += 1
        return out

    def _decode_dict(self) -> OrderedDict[bytes, Bencodable]:
        if self._data[self._i : self._i + 1] != b"d":
            raise BencodeError("expected d")
        self._i += 1
        d: OrderedDict[bytes, Bencodable] = OrderedDict()
        while self._data[self._i : self._i + 1] != b"e":
            key = self._decode_next()
            if not isinstance(key, bytes):
                raise BencodeError("dict key must be bytes string")
            d[key] = self._decode_next()
        self._i += 1
        return d


class Encoder:
    def __init__(self, value: Bencodable):
        self._value = value

    def encode(self) -> bytes:
        return bytes(self._encode(self._value))

    def _encode(self, value: Bencodable) -> bytearray:
        buf = bytearray()
        if isinstance(value, int):
            buf.extend(f"i{value}e".encode("ascii"))
        elif isinstance(value, bytes):
            buf.extend(str(len(value)).encode("ascii"))
            buf.extend(b":")
            buf.extend(value)
        elif isinstance(value, list):
            buf.append(ord("l"))
            for x in value:
                buf.extend(self._encode(x))
            buf.append(ord("e"))
        elif isinstance(value, OrderedDict):
            buf.append(ord("d"))
            for k, v in value.items():
                if not isinstance(k, bytes):
                    raise BencodeError("dict keys must be bytes")
                buf.extend(self._encode(k))
                buf.extend(self._encode(v))
            buf.append(ord("e"))
        else:
            raise BencodeError(f"unsupported type {type(value)}")
        return buf
