# PyTorrent

Production-oriented BitTorrent stack: a Python **engine** (`pytorrent`), a local **daemon** (`pytorrentd`) exposing HTTP + WebSocket, a **web UI**, and a **Tauri** desktop shell.

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

The web UI is a **Netflix-style** home (hero + horizontal rows from Torrent-Api-py), **Search** at `/find` (API stays `GET /search` on the daemon), and **My downloads** at `/downloads`. Playback stays in your own video app after files finish downloading locally.

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

HTTP(S) tracker requests use `aiohttp` with **`trust_env=True`**, so standard proxy variables (**`HTTP_PROXY`**, **`HTTPS_PROXY`**, **`NO_PROXY`**) apply when set in the daemon’s environment.

### Magnet links and search

- **Magnets:** `POST /torrents/magnet` with JSON `{"magnet":"magnet:?xt=…&tr=…"}`. The magnet must include at least one `tr=` tracker; the daemon fetches metadata over the peer wire (**ut_metadata**) and then runs like a normal job. UDP and HTTP(S) trackers are used for announces and peer discovery.
- **Search / browse:** By default the daemon includes a **vendored** Torrent-Api-py tree under `src/pytorrentd/vendor_torrent_api/` (see `VENDOR_README.md` there). `/search`, `/browse/*`, and the web UI work **without** running a separate API server. Set `PYTORRENT_SEARCH_API_BASE` only if you want to offload scraping to another host. Only index content you are allowed to access.
- **Browse routes:** `GET /browse/sites`, `GET /browse/trending`, `GET /browse/recent`, `GET /browse/category` — same as before; they hit the embedded app in-process or your external base.

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

## Current limitations

- **DHT:** No mainline DHT yet; magnets need `tr=` trackers for peer discovery.
- **Seeding:** Inbound peers are accepted on **`PYTORRENT_BT_BIND`:` `PYTORRENT_BT_PORT`** (same port announced to the tracker). You must be reachable on that port for remote peers to connect. Outbound seeding to known peers after download completes is still minimal.
- **Production hardening:** Rate limits, optional auth for non-localhost API, richer PyInstaller/Tauri integration. **Done:** `event=stopped` to HTTP(S) and UDP trackers when you stop/remove a job or shut down the daemon; HTTP(S) proxy env vars for tracker announces; UDP tracker announces; magnet + ut_metadata; optional search proxy to Torrent-Api-py.

## License

MIT
