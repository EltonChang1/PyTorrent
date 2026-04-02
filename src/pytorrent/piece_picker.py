"""Rarest-first piece selection with endgame duplication."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from pytorrent.piece_state import PieceState

ENDGAME_MISSING_THRESHOLD = 4
MAX_PIPELINE_PER_PEER = 5


@dataclass
class PiecePicker:
    num_pieces: int
    sequential: bool = False
    """If True, prefer lowest missing piece index (for watch-while-downloading)."""
    peer_has: dict[bytes, set[int]] = field(default_factory=dict)
    """peer_id -> set of piece indices we believe they have."""
    completed: set[int] = field(default_factory=set)
    in_flight: dict[tuple[int, int, int], set[bytes]] = field(default_factory=dict)
    """(piece, block_begin, block_len) -> peers that requested it (endgame)."""
    rarity: list[int] = field(default_factory=list)
    """Count of peers claiming to have each piece."""

    def __post_init__(self) -> None:
        if not self.rarity:
            self.rarity = [0] * self.num_pieces

    def mark_complete(self, piece: int) -> None:
        self.completed.add(piece)

    def peer_bitfield(self, peer_id: bytes, have: set[int]) -> None:
        old = self.peer_has.get(peer_id, set())
        for p in old - have:
            if p < self.num_pieces:
                self.rarity[p] = max(0, self.rarity[p] - 1)
        for p in have - old:
            if p < self.num_pieces:
                self.rarity[p] += 1
        self.peer_has[peer_id] = set(have)

    def peer_have(self, peer_id: bytes, piece: int) -> None:
        s = self.peer_has.setdefault(peer_id, set())
        if piece not in s and piece < self.num_pieces:
            s.add(piece)
            self.rarity[piece] += 1

    def peer_disconnected(self, peer_id: bytes) -> None:
        old = self.peer_has.pop(peer_id, set())
        for p in old:
            if p < self.num_pieces:
                self.rarity[p] = max(0, self.rarity[p] - 1)

    def missing_count(self) -> int:
        return self.num_pieces - len(self.completed)

    def endgame(self) -> bool:
        return self.missing_count() <= ENDGAME_MISSING_THRESHOLD and self.missing_count() > 0

    def next_block(
        self,
        peer_id: bytes,
        peer_inflight: int,
        piece_state: PieceState,
        block_size: int,
    ) -> tuple[int, int, int] | None:
        """Return (piece_index, begin, length) or None."""
        if peer_inflight >= MAX_PIPELINE_PER_PEER:
            return None
        has = self.peer_has.get(peer_id)
        if not has:
            return None

        missing = [i for i in range(self.num_pieces) if i not in self.completed]
        if not missing:
            return None

        candidates = [p for p in missing if p in has]
        if not candidates:
            return None

        if self.endgame():
            piece = random.choice(candidates)
        elif self.sequential:
            piece = min(candidates)
        else:
            piece = min(candidates, key=lambda p: (self.rarity[p], p))

        plen = piece_state.piece_len(piece)
        for begin in piece_state.block_starts(piece):
            if piece_state.is_block_done(piece, begin):
                continue
            blen = min(block_size, plen - begin)
            key = (piece, begin, blen)
            if self.endgame():
                peers = self.in_flight.setdefault(key, set())
                if peer_id not in peers and len(peers) < 3:
                    peers.add(peer_id)
                    return (piece, begin, blen)
            else:
                peers = self.in_flight.setdefault(key, set())
                if not peers:
                    peers.add(peer_id)
                    return (piece, begin, blen)
        return None

    def release_block(self, peer_id: bytes, piece: int, begin: int, length: int) -> None:
        key = (piece, begin, length)
        s = self.in_flight.get(key)
        if s and peer_id in s:
            s.discard(peer_id)
            if not s:
                del self.in_flight[key]

    def block_done(self, piece: int, begin: int, length: int) -> None:
        key = (piece, begin, length)
        self.in_flight.pop(key, None)
