# PyTorrent configuration

## Restart after changes

After pulling code or changing `PYTORRENT_BT_*`, stop `pytorrentd` (Ctrl+C) and start it again. The HTTP API and BitTorrent listener start together.

## Health and firewall

```bash
curl -s http://127.0.0.1:8765/health | python -m json.tool
```

Check `bt_listen.ok`, `sockets`, and `announced_to_trackers_port`.

- **macOS firewall:** allow incoming TCP on **`PYTORRENT_BT_PORT`** (default **6881**) for Python / `pytorrentd`.
- **Router / remote peers:** forward that TCP port to this machine. NAT or closed firewalls block inbound handshakes even if the tracker lists you.

The web UI polls `/health` and shows a short listener status line.

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `PYTORRENT_HOST` | `127.0.0.1` | HTTP bind address |
| `PYTORRENT_PORT` | `8765` | HTTP port |
| `PYTORRENT_DATA_DIR` | `~/.pytorrent` | Downloads + state |
| `PYTORRENT_BT_PORT` | `6881` | BitTorrent TCP listen port (announced to trackers) |
| `PYTORRENT_BT_BIND` | `0.0.0.0` | Bind address for incoming peers |
| `PYTORRENT_WEB_DIST` | _(auto)_ | Path to built web `dist/` |
| `PYTORRENT_CORS` | `http://localhost:5173` | Comma-separated allowed browser origins (cookies + fetch) |
| `PYTORRENT_SEARCH_API_BASE` | _(empty)_ | External Torrent-Api-py base; if unset, a **vendored** API runs inside `pytorrentd` |
| `PYTORRENT_SEARCH_PATH` | `/api/v1/all/search` | Search path when using an external base |
| `PYTORRENT_SEARCH_API_KEY` | _(empty)_ | Optional `X-API-Key` for catalog (also sets vendored API key) |
| `PYTORRENT_API_KEY` | _(empty)_ | Vendored API auth (prefer `PYTORRENT_SEARCH_API_KEY`) |
| `YTS_BASE_URL` | `https://www3.yts-official.to` | YTS HTML mirror (no trailing slash); Referer for poster proxy |
| `YTS_CATALOG_MODE` | `html` | `html` / `json` / `auto` for YTS listings |
| `YTS_API_BASE` | `https://yts.mx` | YTS JSON API host when using `json` or `auto` |
| `YTS_USE_HTML_ONLY` | _(empty)_ | If `1` or `true`, same as `YTS_CATALOG_MODE=html` |
| `TMDB_API_KEY` | _(empty)_ | Optional poster lookup via The Movie Database |
| `OMDB_API_KEY` | _(empty)_ | Optional poster lookup via OMDb |

HTTP(S) tracker requests use `aiohttp` with **`trust_env=True`** (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`). Peer TCP is not proxied that way—use a **system VPN** if you need to change the IP peers see.

## Magnets and streaming

- **Add magnet:** `POST /torrents/magnet` with `{"magnet":"…","sequential":false}`. Use **`sequential`: true** for watch-while-downloading (pieces from the start first). Magnet should include `tr=` trackers; metadata uses **ut_metadata** over peers.
- **Stream (local):** `GET /torrents/{info_hash}/stream` — largest video file, `Accept-Ranges` / `206 Partial Content`. Web UI: `/watch?id=<info_hash>`. MKV often needs a desktop player.

## Search and catalog

Default: vendored Torrent-Api-py under `src/pytorrentd/vendor_torrent_api/`. Routes: `/search`, `/browse/*`, YTS list `/browse/yts/list`. Set `PYTORRENT_SEARCH_API_BASE` only to offload scraping.

**Poster proxy:** `GET /catalog/image?url=…` (allowlisted hosts only). `GET /catalog/poster?imdb_code=tt…` if TMDb/OMDB keys are set.

## Accounts (optional)

SQLite at `$PYTORRENT_DATA_DIR/pytorrent_users.db`: register, login (`pt_session` cookie), dashboard settings, watch progress sync. Guests use **localStorage** for preferences. Jobs and files stay on the daemon host.

## Publishing the API

Local-first by default. If you reverse-proxy the daemon, set **`PYTORRENT_CORS`**, use **HTTPS**, and protect the API if it is not on localhost.

## Auth rate limit

Login and register are rate-limited per IP (see `app.py`). Disable with `PYTORRENT_DISABLE_AUTH_RL=1` if needed (e.g. dev).
