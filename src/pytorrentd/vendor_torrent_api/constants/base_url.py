import os

X1337 = "https://1337x.to"
TGX = "https://torrentgalaxy.to"
TORLOCK = "https://www.torlock.com"
PIRATEBAY = "https://thepiratebay10.org"
NYAASI = "https://nyaa.si"
ZOOQLE = "https://zooqle.com"
KICKASS = "https://kickasstorrents.to"
BITSEARCH = "https://bitsearch.to"
MAGNETDL = "https://www.magnetdl.com"
LIBGEN = "https://libgen.is"
_YTS_DEFAULT = "https://yts.bz"
YTS = os.environ.get("YTS_BASE_URL", _YTS_DEFAULT).strip().rstrip("/")
# JSON API v2 — origin only; code appends /api/v2/...
# Recommended base per https://yts.bz/api (movies-api.accel.li); override with YTS_API_BASE.
_YTS_API_DEFAULT = "https://movies-api.accel.li"
YTS_API_BASE = os.environ.get("YTS_API_BASE", _YTS_API_DEFAULT).strip().rstrip("/")
LIMETORRENT = "https://www.limetorrents.pro"
TORRENTFUNK = "https://www.torrentfunk.com"
GLODLS = "https://glodls.to"
TORRENTPROJECT = "https://torrentproject2.com"
YOURBITTORRENT = "https://yourbittorrent.com"
