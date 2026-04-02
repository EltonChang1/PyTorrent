# PyTorrent

Production-oriented BitTorrent stack: a Python **engine** (`pytorrent`), a local **daemon** (`pytorrentd`) exposing HTTP + WebSocket, a **web UI**, and a **Tauri** desktop shell.

**Why it stands out:** it is **local-first**—the Python engine owns the swarm; the browser is only a client to **your** daemon. You get magnets, **in-app** catalog browse/search (embedded API), **full download** or **watch while downloading** (HTTP range streaming from partial data), and **YTS HTML-first** listings plus a **same-origin poster proxy** so cover art works from localhost and strict CDNs.

## Important

- The **browser cannot speak classic BitTorrent** (raw TCP to peers). This product runs a **local daemon** on `127.0.0.1` by default; the web UI talks to that API.
- Use only content you have the right to download and share.

## Quick start

```bash
cd PyTorrent
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Terminal 1 — daemon
pytorrentd

# Terminal 2 — web (dev)
cd apps/web && npm install && npm run dev
```

Open the URL Vite prints (e.g. `http://localhost:5173`). The dev server proxies `/api` and `/ws` to `http://127.0.0.1:8765`.

The web UI is a **Netflix-style** home (YTS-first catalog with backup rows if YTS fails), **Search** at `/find`, **My downloads** at `/downloads`, and **Watch while downloading** at `/watch?id=<info_hash>`. Choose **Full download** (rarest-first) or **Watch while downloading** (sequential pieces + local HTTP stream for the browser player).

**Or** use the UI on the daemon port: `cd apps/web && npm run build`, then open `http://127.0.0.1:8765` (run `pytorrentd` from the repo root so it finds `apps/web/dist`, or set `PYTORRENT_WEB_DIST` to that folder).

### Restart daemon and verify the BitTorrent listener

After pulling code or changing `PYTORRENT_BT_*`, **stop** `pytorrentd` (Ctrl+C) and start it again. The HTTP API and the **peer TCP listener** start together.

- **Check listener:** `curl -s http://127.0.0.1:8765/health | python -m json.tool` — look at `bt_listen.ok`, `sockets`, and `announced_to_trackers_port`.
- **Local firewall (macOS):** if peers cannot connect, allow incoming TCP on **`PYTORRENT_BT_PORT`** (default **6881**) for Python/`pytorrentd` in **System Settings → Network → Firewall**.
- **Router / remote peers:** forward the **same TCP port** you announce (default **6881**) to this machine’s LAN IP. NAT and closed firewalls prevent inbound handshakes even if the tracker lists you.

The web UI (dev or built) polls `/health` and shows a short BitTorrent listener status line.

## Configuration (environment)

| Variable | Default | Meaning |
|----------|---------|---------|
| `PYTORRENT_HOST` | `127.0.0.1` | Bind address |
| `PYTORRENT_PORT` | `8765` | HTTP port |
| `PYTORRENT_DATA_DIR` | `~/.pytorrent` | Downloads + resume state |
| `PYTORRENT_BT_PORT` | `6881` | BitTorrent TCP listen port (announced to trackers) |
| `PYTORRENT_BT_BIND` | `0.0.0.0` | Bind address for incoming peer connections |
| `PYTORRENT_WEB_DIST` | _(auto)_ | Path to built web `dist/` (optional) |
| `PYTORRENT_SEARCH_API_BASE` | _(empty)_ | If set, catalog/search use this HTTP base ([Torrent-Api-py](https://github.com/Ryuk-me/Torrent-Api-py)-compatible). If **unset**, PyTorrent runs a **vendored** copy of that API **inside `pytorrentd`** (no separate process). |
| `PYTORRENT_SEARCH_PATH` | `/api/v1/all/search` | Multi-site search path when using an **external** base (embedded app uses the same default). |
| `PYTORRENT_SEARCH_API_KEY` | _(empty)_ | Optional `X-API-Key` for catalog requests (embedded or external). Also sets `PYTORRENT_API_KEY` for the vendored API’s auth. |
| `PYTORRENT_API_KEY` | _(empty)_ | Optional; vendored Torrent-Api-py checks this (see upstream README). Prefer `PYTORRENT_SEARCH_API_KEY` for one knob. |
| `YTS_BASE_URL` | `https://www3.yts-official.to` | HTML mirror for YTS scraping (no trailing slash). **Referer** for `GET /catalog/image` poster fetches. |
| `YTS_CATALOG_MODE` | `html` | `html` — listings from HTML on `YTS_BASE_URL` only. `json` — `list_movies.json` on `YTS_API_BASE` only. `auto` — try JSON first, fall back to HTML if empty or failed. |
| `YTS_API_BASE` | `https://yts.mx` | Host for YTS **JSON API v2** when mode is `json` or `auto` (`/api/v2/list_movies.json`, `movie_details.json`) — same contract as [yts-api-rs](https://github.com/rnestler/yts-api-rs) / [yts.mx/api](https://yts.mx/api). |
| `YTS_USE_HTML_ONLY` | _(empty)_ | If `1` or `true`, same as `YTS_CATALOG_MODE=html` (alias for older setups). |
| `TMDB_API_KEY` | _(empty)_ | Optional; enables `GET /catalog/poster?imdb_code=tt…` poster lookup via The Movie Database. |
| `OMDB_API_KEY` | _(empty)_ | Optional; alternative poster source for `/catalog/poster` when TMDb is unset or fails. |

HTTP(S) tracker requests use `aiohttp` with **`trust_env=True`**, so standard proxy variables (**`HTTP_PROXY`**, **`HTTPS_PROXY`**, **`NO_PROXY`**) apply when set in the daemon’s environment. That affects **tracker HTTP(S)** traffic only; **peer TCP** is not tunneled through those vars. To change the IP peers see, use a **system-wide VPN** (or router VPN)—PyTorrent does not start or manage a VPN for you.

### Magnet links and search

- **Magnets:** `POST /torrents/magnet` with JSON `{"magnet":"magnet:?xt=…&tr=…","sequential":false}`. Set **`sequential`: true** to download pieces from the start first (for **watch while downloading**). The magnet must include at least one `tr=` tracker; the daemon fetches metadata over the peer wire (**ut_metadata**) and then runs like a normal job. UDP and HTTP(S) trackers are used for announces and peer discovery.
- **Stream (local only):** `GET /torrents/{info_hash}/stream` serves the largest video file in the torrent (by extension) with **`Accept-Ranges`** and **`206 Partial Content`** while data is still arriving. `HEAD` is supported. Open `http://127.0.0.1:8765/torrents/…/stream` or use the web UI `/watch` page (dev: proxied as `/api/torrents/…/stream`). In-browser playback works best for **MP4/WebM**; **MKV** often needs an external player on the file on disk.
- **Search / browse:** By default the daemon includes a **vendored** Torrent-Api-py tree under `src/pytorrentd/vendor_torrent_api/` (see `VENDOR_README.md` there). `/search`, `/browse/*`, and the web UI work **without** running a separate API server. Set `PYTORRENT_SEARCH_API_BASE` only if you want to offload scraping to another host. Only index content you are allowed to access.
- **Browse routes:** `GET /browse/sites`, `GET /browse/trending`, `GET /browse/recent`, `GET /browse/category` — same as before; they hit the embedded app in-process or your external base.
- **YTS data source:** For `site=yts`, **`YTS_CATALOG_MODE`** (default **`html`**) chooses HTML on `YTS_BASE_URL` vs JSON on `YTS_API_BASE`; **`auto`** tries JSON then HTML. Browse rows use **`/catalog/image?url=…`** for YTS poster URLs so the browser loads them **same-origin** with a server-side **Referer** (fixes localhost / hotlink blocks). This endpoint is **not** an open proxy: only allowlisted YTS-related hosts (for example `yts.mx`, `yts-official.to`, common asset CDNs) are fetched.
- **Web UI (YTS detail):** When a row includes **`torrents`**, the title modal offers a **quality/version** selector before **Full download** or **Watch while downloading** (sequential download + `/watch`). The hero banner opens that modal when more than one option exists. **Watch while downloading** is already supported via `POST /torrents/magnet` with **`sequential`: true** and the `/watch` player.
- **Catalog helpers:** `GET /catalog/image?url=<encoded https URL>` streams a proxied image (allowlist only). `GET /catalog/poster?imdb_code=tt1234567` returns `{"url":"https://…"}` if `TMDB_API_KEY` or `OMDB_API_KEY` is set. `GET /catalog/yts/movie?movie_id=12345` returns a single catalog-shaped row from **`movie_details.json`** (for agents or richer UI). Use artwork only where you have rights to display it; the proxy addresses **referrer/hotlink** behavior, not copyright.
- **MCP / agents:** Example tool descriptions for wrapping this daemon’s HTTP API are in [`contrib/mcp/README.md`](contrib/mcp/README.md) (usable with harnesses such as [claw-code](https://github.com/ultraworkers/claw-code)).

## Desktop (Tauri)

Requires [Rust](https://rustup.rs/) and npm. Build web first, then Tauri:

```bash
cd apps/web && npm run build
cd ../desktop/src-tauri && cargo tauri build
```

Release packaging of the Python daemon (PyInstaller) is described in `packaging/README.md`.

## References

- [BitTorrent in Python (Markus Eliasson)](https://markuseliasson.se/article/bittorrent-in-python/)
- [Unofficial BitTorrent Specification](https://wiki.theory.org/BitTorrentSpecification)
- [YTS API v2](https://yts.mx/api) (JSON; Python client logic aligned with [yts-api-rs](https://github.com/rnestler/yts-api-rs))

## Current limitations

- **In-browser video:** Container/codec support depends on the browser; sequential download improves startup but does not replace a desktop player for all formats.
- **DHT:** No mainline DHT yet; magnets need `tr=` trackers for peer discovery.
- **Seeding:** Inbound peers are accepted on **`PYTORRENT_BT_BIND`:` `PYTORRENT_BT_PORT`** (same port announced to the tracker). You must be reachable on that port for remote peers to connect. Outbound seeding to known peers after download completes is still minimal.
- **Production hardening:** Rate limits, optional auth for non-localhost API, richer PyInstaller/Tauri integration. **Done:** `event=stopped` to HTTP(S) and UDP trackers when you stop/remove a job or shut down the daemon; HTTP(S) proxy env vars for tracker announces; UDP tracker announces; magnet + ut_metadata; optional search proxy to Torrent-Api-py.

## License

MIT
