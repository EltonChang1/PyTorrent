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

- **Trackers:** HTTP(S) announce only (no UDP tracker, DHT, or magnet links yet).
- **Seeding:** Inbound peers are accepted on **`PYTORRENT_BT_BIND`:` `PYTORRENT_BT_PORT`** (same port announced to the tracker). You must be reachable on that port for remote peers to connect. Outbound `run_peer_seed` remains optional/experimental.
- **Production hardening:** Rate limits, proxies, `event=stopped` on shutdown, optional auth for non-localhost API, and richer PyInstaller/Tauri integration are not implemented.

## License

MIT
