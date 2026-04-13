# Torflix

Local-first BitTorrent: a Python engine and **`torflixd`** daemon (HTTP + WebSocket) plus a **Torflix web UI**. Your machine runs the swarm; the browser only talks to **your** daemon—browse a catalog, add magnets, **download** normally, or **watch while downloading** in the browser (best with MP4/WebM).

**Use only content you are allowed to download and share.** The browser cannot speak classic BitTorrent; you must run the daemon (default `http://127.0.0.1:8765`).

## Quick start

```bash
cd torflix   # or your clone directory
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Terminal 1
torflixd

# Terminal 2 — web UI (development)
cd apps/web && npm install && npm run dev
```

The command **`pytorrentd`** is still installed as an alias for the same daemon (backward compatibility).

Open the URL Vite prints (e.g. `http://localhost:5173`). The dev server proxies `/api` and `/ws` to the daemon.

**Built UI on the daemon:** `cd apps/web && npm run build`, then open `http://127.0.0.1:8765` with `torflixd` run from the repo root (or set `TORFLIX_WEB_DIST` to `apps/web/dist`).

## Using the app

- **[User guide](docs/USER_GUIDE.md)** — step-by-step for people new to the interface (with screenshots).
- **[Configuration & environment](docs/CONFIGURATION.md)** — ports, catalog/search, optional TMDb/OMDB, CORS, firewall tips.

## Desktop (Tauri)

```bash
cd apps/web && npm run build
cd ../desktop/src-tauri && cargo tauri build
```

Packaging the daemon is described in [`packaging/README.md`](packaging/README.md).

## More

- [UX roadmap](docs/UX_ROADMAP.md) · [MCP / agents](contrib/mcp/README.md)
- References: [BitTorrent spec (Theory.org)](https://wiki.theory.org/BitTorrentSpecification)

**Limits (short):** in-browser playback depends on format; magnets need `tr=` trackers (no DHT yet); inbound peers need **`TORFLIX_BT_PORT`** (or legacy `PYTORRENT_BT_PORT`) reachable if you want remote peers.

## Data directory

By default the daemon uses **`~/.torflix`** for downloads and state if that folder exists, otherwise **`~/.pytorrent`** if you are upgrading from an older install. Override with **`TORFLIX_DATA_DIR`** or **`PYTORRENT_DATA_DIR`**.

## License

MIT
