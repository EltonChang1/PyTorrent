# Torflix

**A movie library on your hardware, aimed at a century of film in the wild, not this month's licensed row.**

**torflixd** is a Python BitTorrent engine behind a FastAPI HTTP + WebSocket API; it serves the **Torflix web UI** on your machine. The browser never talks to the swarm—only your daemon does. Browse the catalog, add magnets, download full files, or **watch while downloading** (MP4/WebM work best).

**Use only content you are allowed to download and share.** Run the daemon locally (default **`http://127.0.0.1:8765`**); the UI alone cannot join swarms.

![Torflix home — featured title and catalog rows](docs/img/1.entrance_page.png)

---

## Features

- **Catalog home** — Hero spotlight plus scrollable rows (trending, genres, recommendations, lists).
- **Search** — Keyword search when the catalog API is enabled.
- **My downloads** — Progress, files, and links to the in-browser **Watch** flow.
- **Dashboard** — Favorite genres, row visibility, order, and optional account sync.
- **Optional sign-in** — Syncs preferences and continue-watching on this Torflix server.

Step-by-step help with labeled screenshots: **[User guide](docs/USER_GUIDE.md)** · operator reference: **[Configuration](docs/CONFIGURATION.md)**.

---

## Quick start

```bash
cd torflix   # or your clone directory
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"

# Terminal 1 — daemon (API + BitTorrent + optional static UI)
torflixd

# Terminal 2 — web UI (development)
cd apps/web && npm install && npm run dev
```

The **`pytorrentd`** command is the same daemon (backward compatibility).

Open the URL Vite prints (typically **`http://localhost:5173`**). The dev server proxies **`/api`** and **`/ws`** to the daemon on **8765**.

**Production-style UI from the daemon:** build the web app, then open the daemon URL:

```bash
cd apps/web && npm run build
# From repo root, with torflixd running:
# open http://127.0.0.1:8765
```

Set **`TORFLIX_WEB_DIST`** to your `dist/` path if the UI is not next to the repo layout the daemon expects.

---

## Documentation

| Doc | Purpose |
|-----|---------|
| **[User guide](docs/USER_GUIDE.md)** | First-time flow, navigation, Home rows, downloads, Dashboard, troubleshooting — **with screenshots** under `docs/img/`. |
| **[Configuration](docs/CONFIGURATION.md)** | Environment variables, catalog/search API, CORS, BitTorrent port, health checks. |
| **[UX roadmap](docs/UX_ROADMAP.md)** | Planned UI work. |
| **[MCP / agents](contrib/mcp/README.md)** | Hooking automation to the local HTTP API. |
| **[Packaging `torflixd`](packaging/README.md)** | PyInstaller binary for desktop bundles. |

---

## Desktop (Tauri)

```bash
cd apps/web && npm run build
cd ../desktop/src-tauri && cargo tauri build
```

---

## Limits (short)

- **In-browser playback** depends on codec/container; not every torrent is playable in the browser.
- **Magnets** need **`tr=`** trackers (no DHT yet in this stack).
- **Inbound peers** need **`TORFLIX_BT_PORT`** (default **6881**, or legacy **`PYTORRENT_BT_PORT`**) reachable if you want remote peers.

---

## Data directory

By default the daemon uses **`~/.torflix`** when that folder exists, otherwise **`~/.pytorrent`** for upgrades from older installs. Override with **`TORFLIX_DATA_DIR`** or **`PYTORRENT_DATA_DIR`**.

---

## License

MIT

---

## Reference

- [BitTorrent specification (Theory.org)](https://wiki.theory.org/BitTorrentSpecification)
