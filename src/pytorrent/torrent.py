"""Parse .torrent meta-info, info_hash, and safe multi-file layout."""

from __future__ import annotations

import hashlib
import os
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any

from pytorrent.bencoding import BencodeError, Decoder, Encoder


@dataclass(frozen=True)
class FileEntry:
    """One file in a multi-file torrent (relative path under download root)."""

    relative_path: tuple[str, ...]
    length: int


@dataclass
class TorrentMeta:
    """Decoded torrent with computed info_hash and piece layout."""

    raw: bytes
    root: OrderedDict[bytes, Any]
    info: OrderedDict[bytes, Any]
    info_hash: bytes
    name: str
    piece_length: int
    piece_hashes: list[bytes]
    total_length: int
    files: list[FileEntry] = field(default_factory=list)
    announce: bytes | None = None
    announce_list: list[list[bytes]] | None = None

    @classmethod
    def from_bytes(cls, data: bytes) -> TorrentMeta:
        root = Decoder(data).decode()
        if not isinstance(root, OrderedDict):
            raise BencodeError("torrent root must be a dict")
        info = root.get(b"info")
        if not isinstance(info, OrderedDict):
            raise BencodeError("missing info dict")

        info_hash = hashlib.sha1(Encoder(info).encode()).digest()

        piece_length = int(info[b"piece length"])
        pieces_blob = info[b"pieces"]
        if len(pieces_blob) % 20 != 0:
            raise BencodeError("invalid pieces length")
        piece_hashes = [pieces_blob[i : i + 20] for i in range(0, len(pieces_blob), 20)]

        announce = root.get(b"announce")
        if announce is not None and not isinstance(announce, bytes):
            raise BencodeError("announce must be bytes")

        al = root.get(b"announce-list")
        announce_list: list[list[bytes]] | None = None
        if al is not None:
            if not isinstance(al, list):
                raise BencodeError("announce-list must be a list")
            announce_list = []
            for tier in al:
                if not isinstance(tier, list):
                    raise BencodeError("announce-list tier must be a list")
                announce_list.append([u for u in tier if isinstance(u, bytes)])

        if b"length" in info:
            total_length = int(info[b"length"])
            name = _decode_name(info[b"name"])
            _validate_single_name(name)
            files: list[FileEntry] = []
        else:
            fl = info.get(b"files")
            if not isinstance(fl, list) or not fl:
                raise BencodeError("multi-file torrent missing files list")
            name = _decode_name(info[b"name"])
            _validate_single_name(name)
            files = []
            total_length = 0
            for ent in fl:
                if not isinstance(ent, OrderedDict):
                    raise BencodeError("file entry must be dict")
                plen = int(ent[b"length"])
                parts = ent[b"path"]
                if not isinstance(parts, list):
                    raise BencodeError("path must be list")
                rel = tuple(_decode_name(p) for p in parts if isinstance(p, bytes))
                _validate_relative_path(rel)
                files.append(FileEntry(relative_path=rel, length=plen))
                total_length += plen

        return cls(
            raw=data,
            root=root,
            info=info,
            info_hash=info_hash,
            name=name,
            piece_length=piece_length,
            piece_hashes=piece_hashes,
            total_length=total_length,
            files=files,
            announce=announce if isinstance(announce, bytes) else None,
            announce_list=announce_list,
        )

    @classmethod
    def from_resolved_magnet(cls, info_bencoded: bytes, trackers: list[str]) -> TorrentMeta:
        """
        Build a TorrentMeta after ut_metadata (or similar) delivered the raw *info* dict bytes.
        ``info_bencoded`` must be the exact blob whose SHA1 is the info hash.
        """
        info = Decoder(info_bencoded).decode()
        if not isinstance(info, OrderedDict):
            raise BencodeError("info must be a dict")
        roundtrip = Encoder(info).encode()
        if roundtrip != info_bencoded:
            raise BencodeError("info dict does not round-trip; cannot build stable .torrent")
        root: OrderedDict[bytes, Any] = OrderedDict()
        root[b"info"] = info
        if trackers:
            tb = [t.encode("utf-8") for t in trackers]
            root[b"announce"] = tb[0]
            if len(tb) > 1:
                root[b"announce-list"] = [tb]
        raw = Encoder(root).encode()
        meta = cls.from_bytes(raw)
        if meta.info_hash != hashlib.sha1(info_bencoded).digest():
            raise BencodeError("info_hash mismatch")
        return meta

    @property
    def num_pieces(self) -> int:
        return len(self.piece_hashes)

    def iter_announce_urls(self) -> list[bytes]:
        urls: list[bytes] = []
        if self.announce:
            urls.append(self.announce)
        if self.announce_list:
            for tier in self.announce_list:
                urls.extend(tier)
        return list(dict.fromkeys(urls))


_VIDEO_EXTS = (".mp4", ".mkv", ".avi", ".webm", ".m4v", ".mov")


def primary_playback_span(meta: TorrentMeta) -> tuple[int, int]:
    """Torrent-byte offset and length of the main video file (largest video extension, else first file)."""
    if not meta.files:
        return (0, meta.total_length)
    offset = 0
    best_off = 0
    best_len = meta.files[0].length
    best_size = 0
    for fe in meta.files:
        name = "/".join(fe.relative_path).lower()
        if name.endswith(_VIDEO_EXTS) and fe.length >= best_size:
            best_off = offset
            best_len = fe.length
            best_size = fe.length
        offset += fe.length
    if best_size > 0:
        return (best_off, best_len)
    return (0, meta.files[0].length)


def playback_content_type(meta: TorrentMeta, torrent_offset: int) -> str:
    """Guess Content-Type for the file containing torrent_offset."""
    if not meta.files:
        return _mime_from_filename(meta.name)
    pos = 0
    for fe in meta.files:
        if pos <= torrent_offset < pos + fe.length:
            return _mime_from_filename(fe.relative_path[-1])
        pos += fe.length
    return "application/octet-stream"


def _mime_from_filename(name: str) -> str:
    lower = name.lower()
    if lower.endswith(".mp4") or lower.endswith(".m4v"):
        return "video/mp4"
    if lower.endswith(".webm"):
        return "video/webm"
    if lower.endswith(".mkv"):
        return "video/x-matroska"
    if lower.endswith(".avi"):
        return "video/x-msvideo"
    if lower.endswith(".mov"):
        return "video/quicktime"
    return "application/octet-stream"


def _decode_name(b: bytes) -> str:
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return b.decode("latin-1", errors="replace")


def _validate_single_name(name: str) -> None:
    if not name or name in (".", ".."):
        raise BencodeError("invalid single-file name")
    if "/" in name or "\\" in name or "\x00" in name or name.startswith(".."):
        raise BencodeError("unsafe single-file name")


def _validate_relative_path(parts: tuple[str, ...]) -> None:
    for p in parts:
        if p in ("", ".", "..") or p.startswith("/") or "\\" in p or "\x00" in p:
            raise BencodeError(f"unsafe path component: {parts!r}")
        if PurePosixPath(p).is_absolute():
            raise BencodeError("absolute path in torrent")


def safe_join_download_dir(download_dir: str, relative_parts: tuple[str, ...]) -> str:
    """Resolve a torrent-relative path under download_dir; raise if traversal."""
    base = os.path.realpath(download_dir)
    target = os.path.realpath(os.path.join(base, *relative_parts))
    if target != base and not target.startswith(base + os.sep):
        raise ValueError("path escapes download directory")
    return target
