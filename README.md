# PyTorrent

Local-first BitTorrent: a Python engine and **`pytorrentd`** daemon (HTTP + WebSocket) plus a **Netflix-style web UI**. Your machine runs the swarm; the browser only talks to **your** daemon—browse a catalog, add magnets, **download** normally, or **watch while downloading** in the browser (best with MP4/WebM).

**Use only content you are allowed to download and share.** The browser cannot speak classic BitTorrent; you must run the daemon (default `http://127.0.0.1:8765`).

## Quick start

```bash
cd PyTorrent
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Terminal 1
pytorrentd

# Terminal 2 — web UI (development)
cd apps/web && npm install && npm run dev
```

Open the URL Vite prints (e.g. `http://localhost:5173`). The dev server proxies `/api` and `/ws` to the daemon.

**Built UI on the daemon:** `cd apps/web && npm run build`, then open `http://127.0.0.1:8765` with `pytorrentd` run from the repo root (or set `PYTORRENT_WEB_DIST` to `apps/web/dist`).

## Using the app

- **[User guide](docs/USER_GUIDE.md)** — step-by-step for people new to the interface (with screenshots).
- **[Configuration & environment](docs/CONFIGURATION.md)** — ports, catalog/search, YTS, optional TMDb/OMDB, CORS, firewall tips.

## Desktop (Tauri)

```bash
cd apps/web && npm run build
cd ../desktop/src-tauri && cargo tauri build
```

Packaging the daemon is described in [`packaging/README.md`](packaging/README.md).

## More

- [UX roadmap](docs/UX_ROADMAP.md) · [MCP / agents](contrib/mcp/README.md)
- References: [BitTorrent spec (Theory.org)](https://wiki.theory.org/BitTorrentSpecification) · [YTS API v2](https://yts.mx/api)

**Limits (short):** in-browser playback depends on format; magnets need `tr=` trackers (no DHT yet); inbound peers need `PYTORRENT_BT_PORT` reachable if you want remote peers.

## License

MIT
