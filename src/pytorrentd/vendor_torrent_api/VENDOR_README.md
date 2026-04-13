# Vendored Torrent-Api-py

This tree is derived from **[Torrent-Api-py](https://github.com/Ryuk-me/Torrent-Api-py)** (MIT license).

It is embedded inside Torflix so **`torflixd`** can serve catalog/search APIs **in-process** when `TORFLIX_SEARCH_API_BASE` (or legacy `PYTORRENT_SEARCH_API_BASE`) is not set, without running a separate server.

Upstream changes can be merged periodically (e.g. `rsync` or manual diff from the GitHub repo).
