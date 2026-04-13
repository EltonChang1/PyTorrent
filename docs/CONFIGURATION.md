# Torflix configuration

## Restart after changes

After pulling code or changing `TORFLIX_BT_*` / `PYTORRENT_BT_*`, stop **`torflixd`** (Ctrl+C) and start it again. The HTTP API and BitTorrent listener start together.

## Health and firewall

```bash
curl -s http://127.0.0.1:8765/health | python -m json.tool
```

Check `bt_listen.ok`, `sockets`, and `announced_to_trackers_port`.

- **macOS firewall:** allow incoming TCP on **`TORFLIX_BT_PORT`** (default **6881**) for Python / `torflixd`.
- **Router / remote peers:** forward that TCP port to this machine. NAT or closed firewalls block inbound handshakes even if the tracker lists you.

The web UI polls `/health` and shows a short listener status line.

## Environment variables

Use **`TORFLIX_*`** names. The daemon still accepts **`PYTORRENT_*`** for the same settings (backward compatibility).

| Variable | Default | Meaning |
|----------|---------|---------|
| `TORFLIX_HOST` | `127.0.0.1` | HTTP bind address |
| `TORFLIX_PORT` | `8765` | HTTP port |
| `TORFLIX_DATA_DIR` | `~/.torflix` or existing `~/.pytorrent` | Downloads + state (see README) |
| `TORFLIX_BT_PORT` | `6881` | BitTorrent TCP listen port (announced to trackers) |
| `TORFLIX_BT_BIND` | `0.0.0.0` | Bind address for incoming peers |
| `TORFLIX_WEB_DIST` | _(auto)_ | Path to built web `dist/` |
| `TORFLIX_CORS` | `http://localhost:5173` | Comma-separated allowed browser origins (cookies + fetch) |
| `TORFLIX_SEARCH_API_BASE` | _(empty)_ | External Torrent-Api-py base; if unset, a **vendored** API runs inside `torflixd` |
| `TORFLIX_SEARCH_PATH` | `/api/v1/all/search` | Search path when using an external base |
| `TORFLIX_SEARCH_API_KEY` | _(empty)_ | Optional `X-API-Key` for catalog (also sets vendored API key) |
| `TORFLIX_API_KEY` | _(empty)_ | Vendored API auth (prefer `TORFLIX_SEARCH_API_KEY`) |
| `YTS_BASE_URL` | `https://yts.bz` | HTML mirror (no trailing slash); Referer for poster proxy |
| `YTS_CATALOG_MODE` | `html` | `html` / `json` / `auto` for listings |
| `YTS_API_BASE` | `https://movies-api.accel.li` | JSON API **origin** only (no `/api` path); daemon calls `{YTS_API_BASE}/api/v2/...` |
| `YTS_USE_HTML_ONLY` | _(empty)_ | If `1` or `true`, same as `YTS_CATALOG_MODE=html` |
| `TMDB_API_KEY` | _(empty)_ | Optional poster lookup via The Movie Database |
| `OMDB_API_KEY` | _(empty)_ | Optional poster lookup via OMDb |

HTTP(S) tracker requests use `aiohttp` with **`trust_env=True`** (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`). Peer TCP is not proxied that way—use a **system VPN** if you need to change the IP peers see.

## Magnets and streaming

- **Add magnet:** `POST /torrents/magnet` with `{"magnet":"…","sequential":false}`. Use **`sequential`: true** for watch-while-downloading (pieces from the start first). Magnet should include `tr=` trackers; metadata uses **ut_metadata** over peers.
- **Stream (local):** `GET /torrents/{info_hash}/stream` — largest video file, `Accept-Ranges` / `206 Partial Content`. Web UI: `/watch?id=<info_hash>`. MKV often needs a desktop player.

## Search and catalog

Default: vendored Torrent-Api-py under `src/pytorrentd/vendor_torrent_api/`. Routes: `/search`, `/browse/*`, curated list `/browse/yts/list`. Set `TORFLIX_SEARCH_API_BASE` only to offload scraping.

**Poster proxy:** `GET /catalog/image?url=…` (allowlisted hosts only). `GET /catalog/poster?imdb_code=tt…` if TMDb/OMDB keys are set.

## Accounts (optional)

SQLite under your data directory: **`torflix_users.db`** (new installs) or **`pytorrent_users.db`** if that file already exists there. Register, login (`pt_session` cookie), dashboard settings, watch progress sync. Guests use **localStorage** for preferences. Jobs and files stay on the daemon host.

## Publishing the API

Local-first by default. If you reverse-proxy the daemon, set **`TORFLIX_CORS`**, use **HTTPS**, and protect the API if it is not on localhost.

## Auth rate limit

Login and register are rate-limited per IP (see `app.py`). Disable with **`TORFLIX_DISABLE_AUTH_RL=1`** (or `PYTORRENT_DISABLE_AUTH_RL=1`) if needed (e.g. dev).
