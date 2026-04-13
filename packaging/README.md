# Packaging the daemon

Build a standalone **`torflixd`** binary for bundling inside the Tauri desktop app:

```bash
cd torflix   # or your clone directory
pip install -e ".[dev]"
pyinstaller packaging/torflixd.spec
```

The artifact appears under `dist/torflixd` (directory mode) or `dist/torflixd.exe` on Windows.

Point the Tauri app at this binary and spawn it with `TORFLIX_HOST=127.0.0.1` and a free port (legacy `PYTORRENT_HOST` is also accepted).

**Code signing:** macOS requires notarization for Gatekeeper; Windows uses Authenticode. Configure in your CI (e.g. `codesign`, `signtool`).
