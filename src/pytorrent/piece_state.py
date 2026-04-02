"""Track per-piece block completion and SHA1 verification coordination."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PieceState:
    meta_piece_length: int
    total_length: int
    num_pieces: int
    block_size: int
    done_blocks: dict[int, set[int]] = field(default_factory=dict)
    """piece_index -> set of block start offsets completed."""

    def piece_len(self, piece_index: int) -> int:
        if piece_index == self.num_pieces - 1:
            rem = self.total_length % self.meta_piece_length
            return self.meta_piece_length if rem == 0 else rem
        return self.meta_piece_length

    def block_starts(self, piece_index: int) -> list[int]:
        pl = self.piece_len(piece_index)
        return list(range(0, pl, self.block_size))

    def is_block_done(self, piece: int, begin: int) -> bool:
        return begin in self.done_blocks.get(piece, set())

    def mark_block(self, piece: int, begin: int, length: int) -> None:
        self.done_blocks.setdefault(piece, set()).add(begin)

    def is_piece_complete(self, piece: int) -> bool:
        needed = set(self.block_starts(piece))
        have = self.done_blocks.get(piece, set())
        return needed <= have

    def missing_pieces(self) -> set[int]:
        return {i for i in range(self.num_pieces) if not self.is_piece_complete(i)}

    def mark_piece_finished(self, piece: int) -> None:
        """Mark all blocks in a piece done (e.g. after resume verify)."""
        for begin in self.block_starts(piece):
            blen = min(self.block_size, self.piece_len(piece) - begin)
            self.mark_block(piece, begin, blen)
