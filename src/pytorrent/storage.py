"""Disk-backed storage: single- and multi-file layout with safe paths."""

from __future__ import annotations

import asyncio
import hashlib
import os
from dataclasses import dataclass

from pytorrent.torrent import TorrentMeta, safe_join_download_dir


@dataclass
class _Span:
    torrent_offset: int
    path: str
    file_offset: int
    length: int


class DiskStorage:
    """Linear torrent byte space mapped to files on disk."""

    def __init__(self, meta: TorrentMeta, download_dir: str):
        self._meta = meta
        self._download_dir = download_dir
        self._lock = asyncio.Lock()
        self._spans: list[_Span] = []
        os.makedirs(download_dir, exist_ok=True)

        if meta.files:
            offset = 0
            for fe in meta.files:
                path = safe_join_download_dir(download_dir, fe.relative_path)
                os.makedirs(os.path.dirname(path), exist_ok=True)
                self._spans.append(
                    _Span(torrent_offset=offset, path=path, file_offset=0, length=fe.length)
                )
                offset += fe.length
        else:
            path = safe_join_download_dir(download_dir, (meta.name,))
            self._spans.append(
                _Span(torrent_offset=0, path=path, file_offset=0, length=meta.total_length)
            )

    def _locate(self, torrent_offset: int, length: int) -> list[tuple[str, int, int]]:
        """Return list of (path, file_start, len) for a byte range in torrent space."""
        out: list[tuple[str, int, int]] = []
        end = torrent_offset + length
        pos = torrent_offset
        for sp in self._spans:
            sp_end = sp.torrent_offset + sp.length
            if pos >= sp_end:
                continue
            if pos >= sp.torrent_offset:
                local_start = pos - sp.torrent_offset + sp.file_offset
                take = min(sp_end, end) - pos
                out.append((sp.path, local_start, take))
                pos += take
            if pos >= end:
                break
        if pos != end:
            raise ValueError("write/read past torrent length")
        return out

    async def write_at(self, torrent_offset: int, data: memoryview | bytes) -> None:
        mv = memoryview(data) if isinstance(data, bytes) else data
        async with self._lock:
            off = 0
            for path, file_start, ln in self._locate(torrent_offset, len(mv)):
                chunk = mv[off : off + ln]
                _ensure_file_size(path, file_start + ln)
                with open(path, "r+b") as f:
                    f.seek(file_start)
                    f.write(chunk)
                off += ln

    async def read_at(self, torrent_offset: int, length: int) -> bytes:
        async with self._lock:
            parts: list[bytes] = []
            for path, file_start, ln in self._locate(torrent_offset, length):
                with open(path, "rb") as f:
                    f.seek(file_start)
                    parts.append(f.read(ln))
            return b"".join(parts)

    def piece_length(self, piece_index: int) -> int:
        m = self._meta
        if piece_index == m.num_pieces - 1:
            rem = m.total_length % m.piece_length
            return m.piece_length if rem == 0 else rem
        return m.piece_length

    async def verify_piece(self, piece_index: int) -> bool:
        plen = self.piece_length(piece_index)
        offset = piece_index * self._meta.piece_length
        data = await self.read_at(offset, plen)
        return hashlib.sha1(data).digest() == self._meta.piece_hashes[piece_index]


def _ensure_file_size(path: str, min_size: int) -> None:
    if not os.path.exists(path):
        open(path, "wb").close()
    cur = os.path.getsize(path)
    if cur < min_size:
        with open(path, "r+b") as f:
            f.seek(min_size - 1)
            f.write(b"\0")


def torrent_file_paths(meta: TorrentMeta, download_dir: str) -> list[str]:
    """All output file paths for preflight."""
    if meta.files:
        return [safe_join_download_dir(download_dir, fe.relative_path) for fe in meta.files]
    return [safe_join_download_dir(download_dir, (meta.name,))]
