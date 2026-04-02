"""Parse magnet URIs (BEP 9)."""

from __future__ import annotations

import base64
import binascii
import re
from dataclasses import dataclass, field
from urllib.parse import parse_qs, unquote, urlparse


@dataclass
class MagnetLink:
    info_hash: bytes
    display_name: str | None = None
    trackers: list[str] = field(default_factory=list)


def _xt_to_info_hash(xt: str) -> bytes:
    xt = xt.strip()
    if not xt.lower().startswith("urn:btih:"):
        raise ValueError("magnet xt must be urn:btih:…")
    h = xt.split(":", 2)[2]
    h = h.strip()
    if len(h) == 40 and re.fullmatch(r"[0-9a-fA-F]+", h):
        return binascii.unhexlify(h)
    if len(h) == 32:
        pad = "=" * ((8 - len(h) % 8) % 8)
        return base64.b32decode(h.upper() + pad, casefold=True)
    raise ValueError("unsupported btih encoding")


def parse_magnet(uri: str) -> MagnetLink:
    u = urlparse(uri.strip())
    if u.scheme != "magnet":
        raise ValueError("not a magnet: URI")
    qs = parse_qs(u.query, keep_blank_values=False)
    xt_list = qs.get("xt", [])
    if not xt_list:
        raise ValueError("magnet missing xt")
    info_hash = _xt_to_info_hash(xt_list[0])
    dn = qs.get("dn", [None])[0]
    display = unquote(dn) if dn else None
    tr = [unquote(t) for t in qs.get("tr", []) if t]
    return MagnetLink(info_hash=info_hash, display_name=display, trackers=list(dict.fromkeys(tr)))
